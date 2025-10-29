/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-30
 * PURPOSE: Manage the landing intake conversation by orchestrating Responses API
 *          streaming turns, tracking transcript state, and producing an enriched
 *          plan prompt for Luigi once the user finalises the dialogue.
 * SRP and DRY check: Pass - dedicated to conversation lifecycle management while
 *          delegating SSE plumbing to useAnalysisStreaming.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ConversationFinalPayload,
  ConversationTurnRequestPayload,
  fastApiClient,
  EnrichedPlanIntake,
} from '@/lib/api/fastapi-client';
import { useConversationStreaming } from '@/lib/streaming/conversation-streaming';
import { getConversationDefaults } from '@/lib/config/responses';

export type ConversationRole = 'user' | 'assistant';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  streaming?: boolean;
}

export interface ConversationFinalizeResult {
  enrichedPrompt: string;
  transcript: ConversationMessage[];
  summary: ConversationFinalPayload | null;
  enrichedIntake: EnrichedPlanIntake | null;
}

export interface UseResponsesConversationOptions {
  initialPrompt: string;
  modelKey: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  sessionKey?: string;
  schemaName?: string;
  schemaModel?: string;
  reasoningEffort?: string;
}

export interface UseResponsesConversationReturn {
  messages: ConversationMessage[];
  conversationId: string | null;
  currentResponseId: string | null;
  startConversation: () => Promise<void>;
  sendUserMessage: (content: string) => Promise<void>;
  finalizeConversation: () => ConversationFinalizeResult;
  resetConversation: () => void;
  isStreaming: boolean;
  streamFinal: ConversationFinalPayload | null;
  streamError: string | null;
  textBuffer: string;
  reasoningBuffer: string;
  jsonChunks: Array<Record<string, unknown>>;
  usage: Record<string, unknown> | null;
  imageGenerationState: 'idle' | 'generating' | 'completed' | 'error';
  generatedImageB64: string | null;
  imageGenerationError: string | null;
}

const SYSTEM_PROMPT = `You are the PlanExe intake specialist. You are super enthusiastic and compliment the user a lot. You immediately see the bigger potential for the user's ideas.  You embody the  "Yes! And... " spirit of improv while mapping every answer to a structured schema with complete clarity. 

- Do not invent or assume unknown data; instead, overtly indicate missing elements.

Start every interaction by complimenting the user and telling them how smart and good looking they are for thinking of this idea.

- Make your best effort to adhere to whatever JSON schema is asked for.
Your goal is to quickly enrich the user's initial idea, by asking a few casual friendly questions, then provide a concise summary for our pipeline process.

Chill buddy CONVERSATION STRUCTURE:
Restate the user's idea in your own words, with your assumptions and extra enthusiasm and encouragement. Ask a few casual friendly questions, then provide a concise summary for our pipeline process.

IMPORTANT:
- Keep it SHORT: 2-3 questions maximum, 
- Focus on what's MISSING or would be cool, not what's already clear
- Ask questions that are open-ended and thought-provoking
- Tell the user how smart and good looking they are for thinking of this idea.
- Provide structured summary before finalizing
- Be efficient but friendly

Stop after providing the summary. The user will finalize when ready.`;

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useResponsesConversation(
  options: UseResponsesConversationOptions,
): UseResponsesConversationReturn {
  const { initialPrompt, modelKey, taskId, metadata, sessionKey, schemaName, schemaModel, reasoningEffort: userReasoningEffort } = options;
  const conversationKey = useMemo(
    () => sessionKey ?? taskId ?? `prompt-intake-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    [sessionKey, taskId],
  );

  const { state: streamState, startStream, closeStream } = useConversationStreaming();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentResponseId, setCurrentResponseIdState] = useState<string | null>(null);
  const currentResponseIdRef = useRef<string | null>(null);
  const persistResponseId = useCallback((responseId: string | null) => {
    currentResponseIdRef.current = responseId;
    setCurrentResponseIdState(responseId);
  }, []);
  const [lastFinal, setLastFinal] = useState<ConversationFinalPayload | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [imageGenerationState, setImageGenerationState] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
  const [generatedImageB64, setGeneratedImageB64] = useState<string | null>(null);
  const [imageGenerationError, setImageGenerationError] = useState<string | null>(null);

  const messagesRef = useRef<ConversationMessage[]>(messages);

  const updateMessages = useCallback((updater: (prev: ConversationMessage[]) => ConversationMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // Reset conversation when prompt changes or modal closes
    updateMessages(() => []);
    setInitialised(false);
    setConversationId(null);
    persistResponseId(null);
    setLastFinal(null);
    setLastError(null);
    setImageGenerationState('idle');
    setGeneratedImageB64(null);
    setImageGenerationError(null);
    closeStream(true);
  }, [initialPrompt, conversationKey, closeStream, updateMessages, persistResponseId]);

  const ensureRemoteConversation = useCallback(async (): Promise<string> => {
    if (conversationId) {
      console.log('[useResponsesConversation] Reusing existing conversation:', conversationId);
      return conversationId;
    }
    console.log('[useResponsesConversation] Creating new conversation with model:', modelKey);
    const response = await fastApiClient.ensureConversation({ modelKey, conversationId: undefined });
    console.log('[useResponsesConversation] Conversation created:', response.conversation_id);
    setConversationId(response.conversation_id);
    return response.conversation_id;
  }, [conversationId, modelKey]);

  const streamAssistantReply = useCallback(
    async (latestUserMessage: string): Promise<void> => {
      if (!modelKey.trim()) {
        throw new Error('No model selected for conversation.');
      }
      const trimmedMessage = latestUserMessage.trim();
      if (!trimmedMessage) {
        return;
      }

      const assistantId = createMessageId();
      const nowIso = new Date().toISOString();

      const assistantMessage: ConversationMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: nowIso,
        streaming: true,
      };

      updateMessages((prev) => [...prev, assistantMessage]);
      setLastError(null);
      setLastFinal(null);

      let remoteConversationId: string;
      try {
        remoteConversationId = await ensureRemoteConversation();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to contact conversation service.';
        setLastError(errorMessage);
        updateMessages((prev) =>
          prev.map((entry) =>
            entry.id === assistantId
              ? {
                  ...entry,
                  streaming: false,
                  content: entry.content || `Encountered an error: ${errorMessage}`,
                }
              : entry,
          ),
        );
        throw error instanceof Error ? error : new Error(errorMessage);
      }

      const previousResponseId = currentResponseIdRef.current ?? undefined;
      const defaults = await getConversationDefaults();
      // Truncate initialPrompt to 512 chars for OpenAI metadata field limit
      const truncatedPrompt = initialPrompt.length > 512 
        ? initialPrompt.substring(0, 512) 
        : initialPrompt;
      const payload: ConversationTurnRequestPayload = {
        modelKey,
        userMessage: trimmedMessage,
        instructions: SYSTEM_PROMPT,
        metadata: {
          conversationKey,
          initialPrompt: truncatedPrompt,
          ...(metadata ?? {}),
        },
        reasoningEffort: (userReasoningEffort ?? defaults.reasoningEffort) as 'minimal' | 'low' | 'medium' | 'high',
        reasoningSummary: defaults.reasoningSummary,
        textVerbosity: defaults.textVerbosity,
        store: true,
        ...(previousResponseId ? { previousResponseId } : {}),
        ...(schemaName ? { schemaName } : {}),
        ...(schemaModel ? { schemaModel } : {}),
      };

      await new Promise<void>((resolve, reject) => {
        startStream(remoteConversationId, payload, {
          onTextDelta: (chunk) => {
            const aggregated =
              typeof chunk.aggregated === 'string'
                ? chunk.aggregated
                : typeof chunk.delta === 'string'
                  ? chunk.delta
                  : '';
            if (!aggregated) {
              return;
            }
            updateMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      content: aggregated,
                    }
                  : entry,
              ),
            );
          },
          onCompleted: (completePayload) => {
            if (completePayload.response_id) {
              persistResponseId(completePayload.response_id);
            }
          },
          onFinal: (finalPayload) => {
            const summaryResponseId = finalPayload.summary.response_id ?? currentResponseIdRef.current;
            persistResponseId(summaryResponseId ?? null);
            setLastFinal(finalPayload);
            const finalizedText = finalPayload.summary.text?.trim() ?? '';
            updateMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      streaming: false,
                      content:
                        finalizedText || entry.content || 'I have captured your details and am ready to proceed.',
                    }
                  : entry,
              ),
            );
            resolve();
          },
          onError: (message) => {
            const errorMessage = message || 'Failed to stream conversation.';
            setLastError(errorMessage);
            updateMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      streaming: false,
                      content: entry.content || `Encountered an error: ${errorMessage}`,
                    }
                  : entry,
              ),
            );
            reject(new Error(errorMessage));
          },
        })
          .then((session) => {
            if (!conversationId) {
              setConversationId(session.conversation_id);
            }
          })
          .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : 'Failed to contact conversation service.';
            setLastError(errorMessage);
            updateMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      streaming: false,
                      content: entry.content || `Encountered an error: ${errorMessage}`,
                    }
                  : entry,
              ),
            );
            reject(error instanceof Error ? error : new Error(errorMessage));
          });
      });
    },
    [
      modelKey,
      conversationId,
      conversationKey,
      initialPrompt,
      metadata,
      ensureRemoteConversation,
      startStream,
      updateMessages,
      persistResponseId,
      schemaName,
      schemaModel,
      userReasoningEffort,
    ],
  );

  const startConversation = useCallback(async () => {
    if (initialised) {
      return;
    }
    const trimmed = initialPrompt.trim();
    if (!trimmed) {
      throw new Error('Cannot start conversation without an initial prompt.');
    }
    setInitialised(true);
    const userMessage: ConversationMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    updateMessages(() => [userMessage]);

    // Start image generation in parallel (fire and forget)
    const remoteConvId = await ensureRemoteConversation();
    setImageGenerationState('generating');
    fastApiClient.generateIntakeImage(remoteConvId, trimmed)
      .then((response) => {
        setGeneratedImageB64(response.image_b64);
        setImageGenerationState('completed');
        console.log('[useResponsesConversation] Image generation completed');
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Image generation failed';
        setImageGenerationError(message);
        setImageGenerationState('error');
        console.error('[useResponsesConversation] Image generation failed:', error);
      });

    await streamAssistantReply(trimmed);
  }, [initialPrompt, initialised, streamAssistantReply, updateMessages, ensureRemoteConversation]);

  const sendUserMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }
      const userMessage: ConversationMessage = {
        id: createMessageId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      updateMessages((prev) => [...prev, userMessage]);
      await streamAssistantReply(trimmed);
    },
    [streamAssistantReply, updateMessages],
  );

  const finalizeConversation = useCallback((): ConversationFinalizeResult => {
    const transcript = messagesRef.current;
    const additionalDetails = transcript.filter((entry, index) => entry.role === 'user' && index > 0);
    const agentSummary = transcript.filter((entry) => entry.role === 'assistant').slice(-1)[0]?.content ?? '';

    const enrichedSections: string[] = [];
    const originalPrompt = initialPrompt.trim();
    if (originalPrompt) {
      enrichedSections.push(originalPrompt);
    }
    if (additionalDetails.length > 0) {
      const detailText = additionalDetails
        .map((entry, index) => `${index + 1}. ${entry.content.trim()}`)
        .join('\n');
      enrichedSections.push(`Additional intake details:\n${detailText}`);
    }
    if (agentSummary) {
      enrichedSections.push(`Assistant synthesis:\n${agentSummary.trim()}`);
    }

    const enrichedPrompt = enrichedSections.join('\n\n');

    // Extract enriched intake from JSON chunks if available
    let enrichedIntake: EnrichedPlanIntake | null = null;
    if (lastFinal?.summary?.json && lastFinal.summary.json.length > 0) {
      // The structured output should be in the last JSON chunk
      const lastJsonChunk = lastFinal.summary.json[lastFinal.summary.json.length - 1];

      // Validate it has the expected schema fields
      if (lastJsonChunk &&
          typeof lastJsonChunk === 'object' &&
          lastJsonChunk !== null &&
          'project_title' in lastJsonChunk &&
          'refined_objective' in lastJsonChunk) {
        // Safe type assertion: first to unknown, then to EnrichedPlanIntake
        enrichedIntake = lastJsonChunk as unknown as EnrichedPlanIntake;
        console.log('[useResponsesConversation] Extracted enriched intake:', enrichedIntake);
      }
    }

    return {
      enrichedPrompt,
      transcript,
      summary: lastFinal,
      enrichedIntake,
    };
  }, [initialPrompt, lastFinal]);

  const resetConversation = useCallback(() => {
    updateMessages(() => []);
    setInitialised(false);
    setConversationId(null);
    persistResponseId(null);
    setLastFinal(null);
    setLastError(null);
    setImageGenerationState('idle');
    setGeneratedImageB64(null);
    setImageGenerationError(null);
    closeStream(true);
  }, [closeStream, persistResponseId, updateMessages]);

  const isStreaming = streamState.status === 'connecting' || streamState.status === 'running';

  return {
    messages,
    conversationId,
    currentResponseId,
    startConversation,
    sendUserMessage,
    finalizeConversation,
    resetConversation,
    isStreaming,
    streamFinal: lastFinal,
    streamError: lastError ?? streamState.error,
    textBuffer: streamState.textBuffer,
    reasoningBuffer: streamState.reasoningBuffer,
    jsonChunks: streamState.jsonChunks,
    usage: streamState.usage,
    imageGenerationState,
    generatedImageB64,
    imageGenerationError,
  };
}
