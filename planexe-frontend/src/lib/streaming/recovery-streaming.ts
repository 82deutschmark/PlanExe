/**
 * Author: gpt-5-codex
 * Date: 2025-10-23
 * PURPOSE: Encapsulates FastAPI recovery WebSocket streaming with buffered delta handling.
 * SRP and DRY check: Pass - centralizes recovery streaming orchestration for reuse across hooks.
 */

'use client';

import {
  fastApiClient,
  WebSocketHeartbeatMessage,
  WebSocketLLMStreamMessage,
  WebSocketLogMessage,
  WebSocketMessage,
  WebSocketStatusMessage,
  WebSocketStreamEndMessage,
  WebSocketErrorMessage,
} from '@/lib/api/fastapi-client';
import { appendReasoningChunk, parseRecoveryTimestamp, sanitizeStreamPayload } from '@/lib/utils/recovery';
import type { LLMStreamUsage } from '@/lib/types/recovery';

export type RecoveryStreamingStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'error';

export interface RecoveryStreamingState {
  status: RecoveryStreamingStatus;
  planId: string | null;
  activeInteractionId: number | null;
  textBuffer: string;
  reasoningBuffer: string;
  usage: LLMStreamUsage | undefined;
  lastEventAt: Date | null;
  lastHeartbeatAt: Date | null;
  error: string | null;
}

const INITIAL_STATE: RecoveryStreamingState = {
  status: 'idle',
  planId: null,
  activeInteractionId: null,
  textBuffer: '',
  reasoningBuffer: '',
  usage: undefined,
  lastEventAt: null,
  lastHeartbeatAt: null,
  error: null,
};

export interface RecoveryLLMStreamContext {
  message: WebSocketLLMStreamMessage;
  data: Record<string, unknown>;
  delta?: string;
  buffer: { text: string; reasoning: string };
}

export interface RecoveryStreamHandlers {
  onStart?: (context: RecoveryLLMStreamContext) => void;
  onTextDelta?: (context: RecoveryLLMStreamContext) => void;
  onReasoningDelta?: (context: RecoveryLLMStreamContext) => void;
  onFinal?: (context: RecoveryLLMStreamContext) => void;
  onEnd?: (context: RecoveryLLMStreamContext) => void;
  onStatus?: (message: WebSocketStatusMessage) => void;
  onHeartbeat?: (message: WebSocketHeartbeatMessage) => void;
  onLog?: (message: WebSocketLogMessage) => void;
  onStreamEnd?: (message: WebSocketStreamEndMessage) => void;
  onError?: (message: string) => void;
}

export interface RecoveryStreamingController {
  readonly state: RecoveryStreamingState;
  start(planId: string, handlers?: RecoveryStreamHandlers): Promise<void>;
  close(): void;
  subscribe(listener: (state: RecoveryStreamingState) => void): () => void;
}

const hasWindowRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';

class RecoveryStreaming implements RecoveryStreamingController {
  private stateInternal: RecoveryStreamingState = { ...INITIAL_STATE };
  private client: ReturnType<typeof fastApiClient.streamProgress> | null = null;
  private handlers: RecoveryStreamHandlers = {};
  private listeners = new Set<(state: RecoveryStreamingState) => void>();
  private buffers = new Map<number, { text: string; reasoning: string }>();
  private rafId: number | null = null;
  private planId: string | null = null;

  get state(): RecoveryStreamingState {
    return this.stateInternal;
  }

  async start(planId: string, handlers: RecoveryStreamHandlers = {}): Promise<void> {
    this.close();

    this.planId = planId;
    this.handlers = handlers;
    this.updateState({ ...INITIAL_STATE, status: 'connecting', planId });

    const client = fastApiClient.streamProgress(planId);
    this.client = client;

    const handleMessage = (payload: WebSocketMessage | CloseEvent) => {
      if (!isWebSocketMessage(payload)) {
        return;
      }
      this.handleWebSocketMessage(payload);
    };

    const handleClose = (data: WebSocketMessage | CloseEvent) => {
      if (this.client !== client || !this.isCloseEvent(data)) {
        return;
      }
      const event = data;
      this.updateState((prev) => ({
        ...prev,
        status: event.code === 1000 ? 'completed' : 'error',
        error: event.code === 1000 ? prev.error : event.reason || 'Recovery stream closed unexpectedly.',
        lastEventAt: prev.lastEventAt ?? new Date(),
      }));
      if (event.code !== 1000) {
        this.handlers.onError?.(event.reason || 'Recovery stream closed unexpectedly.');
      }
    };

    const handleError = (data: WebSocketMessage | CloseEvent) => {
      if (this.client !== client || !this.isCloseEvent(data)) {
        return;
      }
      const event = data;
      const message = event.reason || 'Recovery stream encountered an error.';
      this.updateState((prev) => ({ ...prev, status: 'error', error: message }));
      this.handlers.onError?.(message);
    };

    client.on('message', handleMessage);
    client.on('close', handleClose);
    client.on('error', handleError);

    try {
      await client.connect();
      this.updateState((prev) => ({ ...prev, status: 'running', error: null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open recovery stream.';
      this.updateState((prev) => ({ ...prev, status: 'error', error: message }));
      this.handlers.onError?.(message);
      throw error;
    }
  }

  close(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    if (this.rafId !== null && hasWindowRaf) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.buffers.clear();
    this.handlers = {};
    this.planId = null;
    this.updateState({ ...INITIAL_STATE });
  }

  subscribe(listener: (state: RecoveryStreamingState) => void): () => void {
    this.listeners.add(listener);
    listener(this.stateInternal);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(
    next: RecoveryStreamingState | ((prev: RecoveryStreamingState) => RecoveryStreamingState),
  ): void {
    const resolved = typeof next === 'function' ? next(this.stateInternal) : next;
    this.stateInternal = resolved;
    this.listeners.forEach((listener) => listener(this.stateInternal));
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    const eventTimestamp = parseRecoveryTimestamp(message.timestamp) ?? new Date();

    switch (message.type) {
      case 'status':
        this.updateState((prev) => ({
          ...prev,
          status: prev.status === 'connecting' ? 'running' : prev.status,
          planId: this.planId,
          lastEventAt: eventTimestamp,
          error: null,
        }));
        this.handlers.onStatus?.(message as WebSocketStatusMessage);
        break;
      case 'heartbeat':
        this.updateState((prev) => ({
          ...prev,
          lastHeartbeatAt: eventTimestamp,
          lastEventAt: eventTimestamp,
        }));
        this.handlers.onHeartbeat?.(message as WebSocketHeartbeatMessage);
        break;
      case 'stream_end':
        this.updateState((prev) => ({
          ...prev,
          status: 'completed',
          lastEventAt: eventTimestamp,
        }));
        this.handlers.onStreamEnd?.(message as WebSocketStreamEndMessage);
        break;
      case 'error': {
        const errorMessage = (message as WebSocketErrorMessage).message || 'Recovery stream error.';
        this.updateState((prev) => ({ ...prev, status: 'error', error: errorMessage, lastEventAt: eventTimestamp }));
        this.handlers.onError?.(errorMessage);
        break;
      }
      case 'log':
        this.handlers.onLog?.(message as WebSocketLogMessage);
        break;
      case 'llm_stream':
        this.handleLlmStream(message as WebSocketLLMStreamMessage, eventTimestamp);
        break;
      default:
        break;
    }
  }

  private handleLlmStream(message: WebSocketLLMStreamMessage, timestamp: Date): void {
    const data = sanitizeStreamPayload(message.data);
    const existing = this.buffers.get(message.interaction_id) ?? { text: '', reasoning: '' };
    this.buffers.set(message.interaction_id, existing);

    const contextBase = {
      message,
      data,
      buffer: { ...existing },
    } satisfies RecoveryLLMStreamContext;

    switch (message.event) {
      case 'start':
        existing.text = '';
        existing.reasoning = '';
        this.updateState((prev) => ({
          ...prev,
          status: 'running',
          activeInteractionId: message.interaction_id,
          textBuffer: '',
          reasoningBuffer: '',
          usage: undefined,
          lastEventAt: timestamp,
        }));
        this.handlers.onStart?.({ ...contextBase, buffer: { text: '', reasoning: '' } });
        break;
      case 'text_delta': {
        const delta = typeof data.delta === 'string' ? data.delta : '';
        if (delta) {
          existing.text = `${existing.text}${delta}`;
          this.scheduleFlush();
          this.handlers.onTextDelta?.({ ...contextBase, delta, buffer: { ...existing } });
        }
        break;
      }
      case 'reasoning_delta': {
        const delta = typeof data.delta === 'string' ? data.delta : '';
        if (delta) {
          appendReasoningChunk(existing, delta);
          this.scheduleFlush();
          this.handlers.onReasoningDelta?.({ ...contextBase, delta, buffer: { ...existing } });
        }
        break;
      }
      case 'final': {
        if (typeof data.text === 'string') {
          existing.text = data.text;
        }
        if (typeof data.reasoning === 'string') {
          existing.reasoning = data.reasoning;
        }
        this.scheduleFlush();

        let usage: LLMStreamUsage | undefined;
        if (data.usage && typeof data.usage === 'object' && !Array.isArray(data.usage)) {
          const raw = data.usage as Record<string, unknown>;
          usage = {
            inputTokens: typeof raw.input_tokens === 'number' ? raw.input_tokens : undefined,
            outputTokens: typeof raw.output_tokens === 'number' ? raw.output_tokens : undefined,
            reasoningTokens: typeof raw.reasoning_tokens === 'number' ? raw.reasoning_tokens : undefined,
            totalTokens: typeof raw.total_tokens === 'number' ? raw.total_tokens : undefined,
          };
        }

        this.updateState((prev) => ({
          ...prev,
          usage: usage ?? prev.usage,
          lastEventAt: timestamp,
        }));
        this.handlers.onFinal?.({ ...contextBase, buffer: { ...existing } });
        break;
      }
      case 'end': {
        const status = typeof data.status === 'string' ? data.status.toLowerCase() : 'completed';
        const error = typeof data.error === 'string' ? data.error : undefined;
        this.updateState((prev) => ({
          ...prev,
          status: status === 'failed' ? 'error' : prev.status,
          error: error ?? prev.error,
          lastEventAt: timestamp,
          activeInteractionId:
            prev.activeInteractionId === message.interaction_id ? null : prev.activeInteractionId,
        }));
        this.handlers.onEnd?.({ ...contextBase, buffer: { ...existing } });
        this.buffers.delete(message.interaction_id);
        break;
      }
      default:
        break;
    }
  }

  private isCloseEvent(data: WebSocketMessage | CloseEvent): data is CloseEvent {
    return (
      typeof (data as CloseEvent)?.code === 'number' &&
      typeof (data as CloseEvent)?.reason === 'string'
    );
  }

  private scheduleFlush(): void {
    if (!hasWindowRaf) {
      this.flushBuffers();
      return;
    }
    if (this.rafId !== null) {
      return;
    }
    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      this.flushBuffers();
    });
  }

  private flushBuffers(): void {
    const activeId = this.stateInternal.activeInteractionId;
    const buffer = activeId !== null ? this.buffers.get(activeId) : undefined;
    this.updateState((prev) => ({
      ...prev,
      textBuffer: buffer?.text ?? (activeId === null ? '' : prev.textBuffer),
      reasoningBuffer: buffer?.reasoning ?? (activeId === null ? '' : prev.reasoningBuffer),
    }));
  }
}

function isWebSocketMessage(payload: WebSocketMessage | CloseEvent): payload is WebSocketMessage {
  return typeof (payload as WebSocketMessage)?.type === 'string';
}

export function createRecoveryStreaming(): RecoveryStreamingController {
  return new RecoveryStreaming();
}

