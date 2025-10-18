/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-30
 * PURPOSE: Lightweight EventSource harness for conversation streaming, translating
 *          Responses API SSE events into typed callbacks for React hooks.
 * SRP and DRY check: Pass - encapsulates SSE lifecycle management without
 *          duplicating parsing logic across hooks or components.
 */

import {
  fastApiClient,
  ConversationStreamServerEvent,
  ConversationStreamInitPayload,
  ConversationStreamChunkPayload,
  ConversationStreamCompletePayload,
  ConversationStreamErrorPayload,
} from '@/lib/api/fastapi-client';

export interface ConversationStreamCallbacks {
  onInit?: (payload: ConversationStreamInitPayload) => void;
  onChunk?: (payload: ConversationStreamChunkPayload) => void;
  onComplete?: (payload: ConversationStreamCompletePayload) => void;
  onError?: (payload: ConversationStreamErrorPayload) => void;
  onConnectionError?: (message: string) => void;
}

export interface ConversationStreamController {
  close: () => void;
  source: EventSource;
}

const parseSsePayload = (event: MessageEvent): ConversationStreamServerEvent => {
  const data = JSON.parse(event.data);
  return {
    event: event.type as ConversationStreamServerEvent['event'],
    data,
  } as ConversationStreamServerEvent;
};

export const createConversationStream = (
  conversationId: string,
  callbacks: ConversationStreamCallbacks = {},
): ConversationStreamController => {
  const streamUrl = fastApiClient.getConversationStreamUrl(conversationId);
  const source = new EventSource(streamUrl);

  const close = () => {
    source.close();
  };

  source.addEventListener('stream.init', (raw) => {
    const parsed = parseSsePayload(raw as MessageEvent);
    callbacks.onInit?.(parsed.data as ConversationStreamInitPayload);
  });

  source.addEventListener('stream.chunk', (raw) => {
    const parsed = parseSsePayload(raw as MessageEvent);
    callbacks.onChunk?.(parsed.data as ConversationStreamChunkPayload);
  });

  source.addEventListener('stream.complete', (raw) => {
    const parsed = parseSsePayload(raw as MessageEvent);
    callbacks.onComplete?.(parsed.data as ConversationStreamCompletePayload);
    close();
  });

  source.addEventListener('stream.error', (raw) => {
    const parsed = parseSsePayload(raw as MessageEvent);
    callbacks.onError?.(parsed.data as ConversationStreamErrorPayload);
  });

  source.onerror = () => {
    callbacks.onConnectionError?.('Conversation stream connection lost.');
    close();
  };

  return { close, source };
};
