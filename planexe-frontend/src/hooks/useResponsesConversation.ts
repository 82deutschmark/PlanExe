/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-31T00:00:00Z
 * PURPOSE: Hook orchestrating the conversation-first flow, managing SSE
 *          buffering, modal state, and advanced overrides for the landing page
 *          redesign. Updated to rely exclusively on FastAPI streaming without
 *          mock fallbacks.
 * SRP and DRY check: Pass - centralises Responses API orchestration while UI
 *          components remain purely presentational.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ConversationFinalizeRequest,
  ConversationFinalizeResponse,
  ConversationInitRequest,
  ConversationMessageRequest,
  ConversationSessionMetadata,
} from '@/lib/api/fastapi-client';
import {
  createConversationStream,
  ConversationStreamCallbacks,
  ConversationStreamController,
} from '@/lib/streaming/conversation-streaming';
import { fastApiClient } from '@/lib/api/fastapi-client';

type ConversationRole = 'user' | 'assistant';

type ConversationMessageStatus = 'pending' | 'streaming' | 'completed' | 'error';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  reasoning?: string;
  jsonChunks: string[];
  createdAt: string;
  status: ConversationMessageStatus;
}

export interface ConversationAdvancedOptions {
  modelOverride: string | null;
  speedVsDetail: ConversationFinalizeRequest['speedVsDetail'];
  openrouterApiKey: string;
}

export interface ConversationState {
  isOpen: boolean;
  isStreaming: boolean;
  isFinalizing: boolean;
  canFinalize: boolean;
  error: string | null;
  messages: ConversationMessage[];
  conversationId: string | null;
  responseId: string | null;
  advancedOptions: ConversationAdvancedOptions;
}

export interface LaunchConversationPayload {
  prompt: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UseResponsesConversationResult extends ConversationState {
  launchConversation: (payload: LaunchConversationPayload) => Promise<void>;
  sendFollowup: (message: string, metadata?: Record<string, unknown>) => Promise<void>;
  finalizeConversation: () => Promise<ConversationFinalizeResponse>;
  closeModal: () => void;
  setAdvancedOptions: (options: ConversationAdvancedOptions) => void;
  resetConversation: () => void;
}

interface StreamBuffers {
  text: string;
  reasoning: string;
  jsonChunks: string[];
}

const createUserMessage = (content: string): ConversationMessage => ({
  id: `user-${Date.now()}`,
  role: 'user',
  content,
  reasoning: undefined,
  jsonChunks: [],
  createdAt: new Date().toISOString(),
  status: 'completed',
});

const createAssistantMessage = (responseId: string): ConversationMessage => ({
  id: responseId,
  role: 'assistant',
  content: '',
  reasoning: undefined,
  jsonChunks: [],
  createdAt: new Date().toISOString(),
  status: 'streaming',
});

export const useResponsesConversation = (): UseResponsesConversationResult => {
  const [state, setState] = useState<ConversationState>({
    isOpen: false,
    isStreaming: false,
    isFinalizing: false,
    canFinalize: false,
    error: null,
    messages: [],
    conversationId: null,
    responseId: null,
    advancedOptions: {
      modelOverride: null,
      speedVsDetail: 'balanced_speed_and_detail',
      openrouterApiKey: '',
    },
  });

  const basePromptRef = useRef<string>('');
  const tagsRef = useRef<string[]>([]);
  const buffersRef = useRef<StreamBuffers>({ text: '', reasoning: '', jsonChunks: [] });
  const summaryRef = useRef<ConversationFinalizeRequest['conversationSummary'] | null>(null);
  const streamControllerRef = useRef<ConversationStreamController | null>(null);
  const rafRef = useRef<number | null>(null);

  const clearStream = useCallback(() => {
    streamControllerRef.current?.close();
    streamControllerRef.current = null;
    buffersRef.current = { text: '', reasoning: '', jsonChunks: [] };
    summaryRef.current = null;
  }, []);

  useEffect(() => () => {
    clearStream();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, [clearStream]);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      setState((prev) => {
        if (!prev.responseId) {
          return prev;
        }
        return {
          ...prev,
          messages: prev.messages.map((message) => {
            if (message.id !== prev.responseId) {
              return message;
            }
            return {
              ...message,
              content: buffersRef.current.text,
              reasoning: buffersRef.current.reasoning || undefined,
              jsonChunks: [...buffersRef.current.jsonChunks],
            };
          }),
        };
      });
    });
  }, []);

  const attachStreamHandlers = useCallback(
    (session: ConversationSessionMetadata) => {
      buffersRef.current = { text: '', reasoning: '', jsonChunks: [] };
      summaryRef.current = null;

      const callbacks: ConversationStreamCallbacks = {
        onInit: () => {
          setState((prev) => ({ ...prev, isStreaming: true, responseId: session.responseId }));
        },
        onChunk: (chunk) => {
          if (chunk.kind === 'text') {
            buffersRef.current.text += chunk.delta;
          }
          if (chunk.kind === 'reasoning') {
            buffersRef.current.reasoning = buffersRef.current.reasoning
              ? `${buffersRef.current.reasoning}\n${chunk.delta}`
              : chunk.delta;
          }
          if (chunk.kind === 'json') {
            buffersRef.current.jsonChunks.push(chunk.delta);
          }
          scheduleFlush();
        },
        onComplete: (payload) => {
          summaryRef.current = payload.summary;
          buffersRef.current.text = payload.summary.text ?? buffersRef.current.text;
          if (payload.summary.reasoning) {
            buffersRef.current.reasoning = payload.summary.reasoning;
          }
          if (payload.summary.jsonChunks?.length) {
            buffersRef.current.jsonChunks = payload.summary.jsonChunks;
          }
          scheduleFlush();
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            canFinalize: true,
            messages: prev.messages.map((message) =>
              message.id === session.responseId
                ? { ...message, status: 'completed' }
                : message,
            ),
          }));
        },
        onError: (payload) => {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            error:
              typeof payload.error === 'string'
                ? payload.error
                : JSON.stringify(payload.error ?? { message: 'Unknown streaming error' }),
            messages: prev.messages.map((message) =>
              message.id === session.responseId
                ? { ...message, status: 'error' }
                : message,
            ),
          }));
        },
        onConnectionError: (message) => {
          setState((prev) => ({ ...prev, isStreaming: false, error: message }));
        },
      };

      streamControllerRef.current = createConversationStream(session.conversationId, callbacks);
    },
    [scheduleFlush],
  );

  const pushAssistantMessage = useCallback((responseId: string) => {
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, createAssistantMessage(responseId)],
      responseId,
    }));
  }, []);

  const handleSessionStart = useCallback(
    (session: ConversationSessionMetadata) => {
      clearStream();
      pushAssistantMessage(session.responseId);
      attachStreamHandlers(session);
    },
    [attachStreamHandlers, clearStream, pushAssistantMessage],
  );

  const launchConversation = useCallback<UseResponsesConversationResult['launchConversation']>(
    async ({ prompt, tags, metadata }) => {
      basePromptRef.current = prompt;
      tagsRef.current = tags ?? [];
      setState((prev) => ({
        ...prev,
        isOpen: true,
        error: null,
        canFinalize: false,
        messages: [...prev.messages, createUserMessage(prompt)],
      }));

      const request: ConversationInitRequest = {
        prompt,
        tags,
        modelOverride: state.advancedOptions.modelOverride,
        speedVsDetail: state.advancedOptions.speedVsDetail,
        openrouterApiKey: state.advancedOptions.openrouterApiKey || undefined,
      };

      try {
        const session = await fastApiClient.createConversation(request);
        setState((prev) => ({
          ...prev,
          conversationId: session.conversationId,
          responseId: session.responseId,
        }));
        handleSessionStart(session);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start conversation.';
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: message,
        }));
      }
    },
    [handleSessionStart, state.advancedOptions],
  );

  const sendFollowup = useCallback<UseResponsesConversationResult['sendFollowup']>(
    async (message, metadata) => {
      if (!state.conversationId) {
        throw new Error('Conversation has not been initialised.');
      }
      setState((prev) => ({
        ...prev,
        error: null,
        canFinalize: false,
        messages: [...prev.messages, createUserMessage(message)],
      }));

      const request: ConversationMessageRequest = {
        message,
        metadata,
      };

      try {
        const session = await fastApiClient.sendConversationMessage(state.conversationId, request);
        setState((prev) => ({
          ...prev,
          responseId: session.responseId,
        }));
        handleSessionStart(session);
      } catch (error) {
        const description = error instanceof Error ? error.message : 'Unable to send follow-up message.';
        setState((prev) => ({ ...prev, error: description }));
      }
    },
    [handleSessionStart, state.conversationId],
  );

  const finalizeConversation = useCallback<UseResponsesConversationResult['finalizeConversation']>(
    async () => {
      if (!state.conversationId || !state.responseId) {
        throw new Error('Conversation is not ready to finalise.');
      }
      if (!summaryRef.current) {
        summaryRef.current = {
          text: buffersRef.current.text,
          reasoning: buffersRef.current.reasoning,
          jsonChunks: buffersRef.current.jsonChunks,
        };
      }

      const payload: ConversationFinalizeRequest = {
        responseId: state.responseId,
        prompt: basePromptRef.current,
        conversationSummary: summaryRef.current ?? {
          text: buffersRef.current.text,
          reasoning: buffersRef.current.reasoning,
          jsonChunks: buffersRef.current.jsonChunks,
        },
        tags: tagsRef.current,
        speedVsDetail: state.advancedOptions.speedVsDetail,
        openrouterApiKey: state.advancedOptions.openrouterApiKey || undefined,
        modelOverride: state.advancedOptions.modelOverride,
      };

      setState((prev) => ({ ...prev, isFinalizing: true }));
      try {
        const response = await fastApiClient.finalizeConversation(state.conversationId, payload);
        setState((prev) => ({
          ...prev,
          isFinalizing: false,
          isOpen: false,
        }));
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to finalise conversation.';
        setState((prev) => ({ ...prev, isFinalizing: false, error: message }));
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [state.advancedOptions, state.conversationId, state.responseId],
  );

  const closeModal = useCallback(() => {
    clearStream();
    setState((prev) => ({ ...prev, isOpen: false }));
  }, [clearStream]);

  const resetConversation = useCallback(() => {
    clearStream();
    setState((prev) => ({
      ...prev,
      isOpen: false,
      isStreaming: false,
      canFinalize: false,
      error: null,
      messages: [],
      conversationId: null,
      responseId: null,
    }));
  }, [clearStream]);

  const setAdvancedOptions = useCallback((advanced: ConversationAdvancedOptions) => {
    setState((prev) => ({ ...prev, advancedOptions: advanced }));
  }, []);

  return useMemo<UseResponsesConversationResult>(() => ({
    ...state,
    launchConversation,
    sendFollowup,
    finalizeConversation,
    closeModal,
    setAdvancedOptions,
    resetConversation,
  }), [
    state,
    launchConversation,
    sendFollowup,
    finalizeConversation,
    closeModal,
    setAdvancedOptions,
    resetConversation,
  ]);
};

export default useResponsesConversation;
