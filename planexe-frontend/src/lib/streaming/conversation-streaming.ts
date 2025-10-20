/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-30
 * PURPOSE: React hook encapsulating the Conversations API streaming handshake,
 *          EventSource lifecycle, and throttled delta aggregation for the intake modal.
 * SRP and DRY check: Pass - keeps streaming orchestration isolated from UI components
 *          while reusing the central FastAPI client.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConversationSession,
  ConversationStreamServerEvent,
  ConversationTurnRequestPayload,
  fastApiClient,
} from '@/lib/api/fastapi-client';

export type ConversationStreamingStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'error';

export interface ConversationStreamHandlers {
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onJsonDelta?: (chunk: Record<string, unknown>) => void;
  onFinal?: (response: Record<string, unknown>) => void;
  onError?: (message: string) => void;
}

export interface ConversationStreamingState {
  status: ConversationStreamingStatus;
  session: ConversationSession | null;
  responseId: string | null;
  remoteConversationId: string | null;
  textBuffer: string;
  reasoningBuffer: string;
  jsonChunks: Array<Record<string, unknown>>;
  finalResponse: Record<string, unknown> | null;
  error: string | null;
  lastEventAt: string | null;
}

const INITIAL_STATE: ConversationStreamingState = {
  status: 'idle',
  session: null,
  responseId: null,
  remoteConversationId: null,
  textBuffer: '',
  reasoningBuffer: '',
  jsonChunks: [],
  finalResponse: null,
  error: null,
  lastEventAt: null,
};

function coerceTextValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(coerceTextValue).join('');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'value', 'content', 'message', 'summary']) {
      if (record[key] !== undefined) {
        const nested = coerceTextValue(record[key]);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return '';
}

function extractDeltaText(data: Record<string, unknown>): string {
  const delta = data.delta;
  if (typeof delta === 'string') {
    return delta;
  }
  if (delta && typeof delta === 'object') {
    return coerceTextValue(delta);
  }
  return '';
}

function extractJsonDelta(data: Record<string, unknown>): Record<string, unknown> | null {
  const delta = data.delta;
  if (delta && typeof delta === 'object' && !Array.isArray(delta)) {
    return delta as Record<string, unknown>;
  }
  return null;
}

function extractErrorMessage(data: Record<string, unknown>): string | null {
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }
  if (typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail;
  }
  return null;
}

export function useConversationStreaming() {
  const [state, setState] = useState<ConversationStreamingState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const eventSourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef<ConversationStreamHandlers>({});
  const rafRef = useRef<number | null>(null);
  const pendingBuffersRef = useRef<{ text?: string; reasoning?: string }>({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const closeStream = useCallback((reset = false) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      pendingBuffersRef.current = {};
    }
    handlersRef.current = {};
    setState((prev) => {
      if (reset) {
        return { ...INITIAL_STATE };
      }
      return { ...prev, status: 'idle' };
    });
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  const flushBuffers = useCallback(() => {
    const { text, reasoning } = pendingBuffersRef.current;
    pendingBuffersRef.current = {};
    rafRef.current = null;
    if (typeof text === 'undefined' && typeof reasoning === 'undefined') {
      return;
    }
    setState((prev) => ({
      ...prev,
      textBuffer: typeof text === 'string' ? text : prev.textBuffer,
      reasoningBuffer: typeof reasoning === 'string' ? reasoning : prev.reasoningBuffer,
    }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = requestAnimationFrame(flushBuffers);
  }, [flushBuffers]);

  const startStream = useCallback(
    async (
      conversationId: string,
      payload: ConversationTurnRequestPayload,
      handlers?: ConversationStreamHandlers,
    ): Promise<ConversationSession> => {
      closeStream(true);
      setState({ ...INITIAL_STATE, status: 'connecting' });
      handlersRef.current = handlers ?? {};

      const session = await fastApiClient.createConversationRequest(conversationId, payload);
      setState((prev) => ({
        ...prev,
        status: 'connecting',
        session,
      }));

      const source = fastApiClient.startConversationStream(conversationId, session.token);
      eventSourceRef.current = source;

      const processEvent = (event: ConversationStreamServerEvent) => {
        const nowIso = new Date().toISOString();
        if (event.event === 'response.created') {
          const response = event.data.response as Record<string, unknown> | undefined;
          const responseId =
            response && typeof response.id === 'string' ? (response.id as string) : undefined;
          const remoteId =
            response && typeof response.conversation_id === 'string'
              ? (response.conversation_id as string)
              : undefined;
          setState((prev) => ({
            ...prev,
            status: 'running',
            responseId: responseId ?? prev.responseId,
            remoteConversationId: remoteId ?? prev.remoteConversationId,
            lastEventAt: nowIso,
          }));
        } else if (event.event === 'response.output_text.delta') {
          const deltaText = extractDeltaText(event.data);
          if (deltaText) {
            const next = `${pendingBuffersRef.current.text ?? stateRef.current.textBuffer}${deltaText}`;
            pendingBuffersRef.current.text = next;
            scheduleFlush();
            handlersRef.current.onTextDelta?.(deltaText);
            setState((prev) => ({ ...prev, lastEventAt: nowIso }));
          }
        } else if (event.event === 'response.reasoning_summary_text.delta') {
          const deltaText = extractDeltaText(event.data);
          if (deltaText) {
            const next = `${pendingBuffersRef.current.reasoning ?? stateRef.current.reasoningBuffer}${deltaText}`;
            pendingBuffersRef.current.reasoning = next;
            scheduleFlush();
            handlersRef.current.onReasoningDelta?.(deltaText);
            setState((prev) => ({ ...prev, lastEventAt: nowIso }));
          }
        } else if (event.event === 'response.output_json.delta') {
          const chunk = extractJsonDelta(event.data);
          if (chunk) {
            setState((prev) => ({
              ...prev,
              jsonChunks: [...prev.jsonChunks, chunk],
              lastEventAt: nowIso,
            }));
            handlersRef.current.onJsonDelta?.(chunk);
          }
        } else if (event.event === 'response.completed') {
          const response = event.data.response as Record<string, unknown> | undefined;
          const responseId =
            response && typeof response.id === 'string' ? (response.id as string) : undefined;
          setState((prev) => ({
            ...prev,
            status: 'completed',
            responseId: responseId ?? prev.responseId,
            lastEventAt: nowIso,
          }));
        } else if (event.event === 'response.error' || event.event === 'response.failed') {
          const message = extractErrorMessage(event.data) ?? 'Conversation stream failed';
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: message,
            lastEventAt: nowIso,
          }));
          handlersRef.current.onError?.(message);
          source.close();
          eventSourceRef.current = null;
        } else if (event.event === 'final') {
          const response = (event.data.response as Record<string, unknown>) ?? {};
          const responseId =
            typeof response.id === 'string' ? (response.id as string) : stateRef.current.responseId;
          setState((prev) => ({
            ...prev,
            finalResponse: response,
            responseId: responseId ?? prev.responseId,
            lastEventAt: nowIso,
          }));
          handlersRef.current.onFinal?.(response as Record<string, unknown>);
          source.close();
          eventSourceRef.current = null;
        }
      };

      const handleEvent = (event: MessageEvent) => {
        const parsed: ConversationStreamServerEvent = {
          event: event.type as ConversationStreamServerEvent['event'],
          data: JSON.parse(event.data) as Record<string, unknown>,
        };
        processEvent(parsed);
      };

      const STREAM_EVENTS: ConversationStreamServerEvent['event'][] = [
        'response.created',
        'response.output_text.delta',
        'response.reasoning_summary_text.delta',
        'response.output_json.delta',
        'response.completed',
        'response.error',
        'response.failed',
        'final',
      ];

      for (const eventName of STREAM_EVENTS) {
        source.addEventListener(eventName, handleEvent);
      }

      source.onerror = () => {
        const message = 'Conversation streaming connection lost.';
        setState((prev) => ({ ...prev, status: 'error', error: message }));
        handlersRef.current.onError?.(message);
        source.close();
        eventSourceRef.current = null;
      };

      return session;
    },
    [closeStream, scheduleFlush],
  );

  return {
    state,
    startStream,
    closeStream,
  };
}
