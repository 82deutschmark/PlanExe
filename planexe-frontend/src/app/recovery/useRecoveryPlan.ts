'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  fastApiClient,
  PlanArtefactListResponse,
  PlanResponse,
  WebSocketHeartbeatMessage,
  WebSocketLLMStreamMessage,
  WebSocketStatusMessage,
} from '@/lib/api/fastapi-client';
import {
  getStatusDisplay,
  isTextRenderable,
  KNOWN_STAGE_ORDER,
  mapArtefacts,
  normaliseStageKey,
  normaliseStageLabel,
  parseRecoveryTimestamp,
  sanitizeStreamPayload,
} from '@/lib/utils/recovery';
import {
  createRecoveryStreaming,
  type RecoveryLLMStreamContext,
  type RecoveryStreamHandlers,
  type RecoveryStreamingController,
  type RecoveryStreamingStatus,
} from '@/lib/streaming/recovery-streaming';
import type {
  LLMStreamState,
  PreviewData,
  RecoveryConnectionState,
  StageSummary,
  StatusDisplay,
  StreamEventRecord,
  StreamStatus,
} from '@/lib/types/recovery';
import type { PlanFile } from '@/lib/types/pipeline';

interface RecoveryState {
  plan: PlanResponse | null;
  planLoading: boolean;
  planError: string | null;
  artefacts: PlanFile[];
  artefactLoading: boolean;
  artefactError: string | null;
  artefactLastUpdated: Date | null;
  canonicalHtml: string | null;
  canonicalError: string | null;
  reportLoading: boolean;
  assembledDocument: AssembledDocumentResponse | null;
  assembledDocumentLoading: boolean;
  assembledDocumentError: string | null;
  previewFile: PlanFile | null;
  previewLoading: boolean;
  previewError: string | null;
  previewData: PreviewData | null;
  llmStreams: Record<number, LLMStreamState>;
  activeStreamId: number | null;
}

type RecoveryAction =
  | { type: 'reset' }
  | { type: 'plan:start' }
  | { type: 'plan:success'; payload: PlanResponse }
  | { type: 'plan:error'; error: string }
  | {
      type: 'plan:update';
      payload: Partial<Pick<PlanResponse, 'status' | 'progress_percentage' | 'progress_message'>>;
    }
  | { type: 'artefacts:start' }
  | { type: 'artefacts:success'; payload: { artefacts: PlanFile[]; timestamp: Date } }
  | { type: 'artefacts:error'; error: string }
  | { type: 'report:start' }
  | { type: 'report:success'; payload: string }
  | { type: 'report:error'; error: string | null }
  | { type: 'document:start' }
  | { type: 'document:success'; payload: AssembledDocumentResponse }
  | { type: 'document:error'; error: string }
  | { type: 'preview:select'; file: PlanFile | null }
  | { type: 'preview:start' }
  | { type: 'preview:success'; payload: PreviewData }
  | { type: 'preview:error'; error: string }
  | { type: 'preview:clear' }
  | {
      type: 'llm_stream:start';
      payload: {
        interactionId: number;
        planId: string;
        stage: string;
        taskName?: string;
        promptPreview?: string;
        event: StreamEventRecord;
      };
    }
  | {
      type: 'llm_stream:update';
      payload: { interactionId: number; updates: Partial<LLMStreamState>; event?: StreamEventRecord };
    }
  | {
      type: 'llm_stream:complete';
      payload: { interactionId: number; status: StreamStatus; error?: string; event?: StreamEventRecord };
    };

const INITIAL_STATE: RecoveryState = {
  plan: null,
  planLoading: false,
  planError: null,
  artefacts: [],
  artefactLoading: false,
  artefactError: null,
  artefactLastUpdated: null,
  canonicalHtml: null,
  canonicalError: null,
  reportLoading: false,
  assembledDocument: null,
  assembledDocumentLoading: false,
  assembledDocumentError: null,
  previewFile: null,
  previewLoading: false,
  previewError: null,
  previewData: null,
  llmStreams: {},
  activeStreamId: null,
};

const initialConnectionState: RecoveryConnectionState = {
  mode: 'polling',
  status: 'idle',
  lastEventAt: null,
  lastHeartbeatAt: null,
  error: null,
};

const MAX_STREAM_DELTAS = 200;

const recoveryReducer = (state: RecoveryState, action: RecoveryAction): RecoveryState => {
  switch (action.type) {
    case 'reset':
      return { ...INITIAL_STATE };
    case 'plan:start':
      return { ...state, planLoading: true, planError: null };
    case 'plan:success':
      return { ...state, plan: action.payload, planLoading: false, planError: null };
    case 'plan:error':
      return { ...state, planError: action.error, planLoading: false, plan: null };
    case 'plan:update':
      if (!state.plan) {
        return state;
      }
      return {
        ...state,
        plan: {
          ...state.plan,
          ...action.payload,
          progress_percentage: action.payload.progress_percentage ?? state.plan.progress_percentage,
          progress_message: action.payload.progress_message ?? state.plan.progress_message,
        },
      };
    case 'artefacts:start':
      return { ...state, artefactLoading: true, artefactError: null };
    case 'artefacts:success':
      return {
        ...state,
        artefacts: action.payload.artefacts,
        artefactLastUpdated: action.payload.timestamp,
        artefactLoading: false,
        artefactError: null,
      };
    case 'artefacts:error':
      return {
        ...state,
        artefacts: [],
        artefactLoading: false,
        artefactError: action.error,
      };
    case 'report:start':
      return { ...state, reportLoading: true, canonicalError: null };
    case 'report:success':
      return { ...state, reportLoading: false, canonicalHtml: action.payload, canonicalError: null };
    case 'report:error':
      return { ...state, reportLoading: false, canonicalHtml: null, canonicalError: action.error };
    case 'document:start':
      return { ...state, assembledDocumentLoading: true, assembledDocumentError: null };
    case 'document:success':
      return { ...state, assembledDocumentLoading: false, assembledDocument: action.payload, assembledDocumentError: null };
    case 'document:error':
      return { ...state, assembledDocumentLoading: false, assembledDocument: null, assembledDocumentError: action.error };
    case 'preview:select':
      return {
        ...state,
        previewFile: action.file,
        previewLoading: action.file ? state.previewLoading : false,
        previewError: action.file ? state.previewError : null,
        previewData: action.file ? state.previewData : null,
      };
    case 'preview:start':
      return { ...state, previewLoading: true, previewError: null, previewData: null };
    case 'preview:success':
      return { ...state, previewLoading: false, previewError: null, previewData: action.payload };
    case 'preview:error':
      return { ...state, previewLoading: false, previewError: action.error, previewData: null };
    case 'preview:clear':
      return {
        ...state,
        previewFile: null,
        previewLoading: false,
        previewError: null,
        previewData: null,
      };
    case 'llm_stream:start':
      return {
        ...state,
        llmStreams: {
          ...state.llmStreams,
          [action.payload.interactionId]: {
            interactionId: action.payload.interactionId,
            planId: action.payload.planId,
            stage: action.payload.stage,
            taskName: action.payload.taskName,
            textDeltas: [],
            reasoningDeltas: [],
            textBuffer: '',
            reasoningBuffer: '',
            status: 'running',
            lastUpdated: Date.now(),
            promptPreview: action.payload.promptPreview ?? null,
            rawPayload: null,
            finalText: undefined,
            finalReasoning: undefined,
            usage: undefined,
            error: undefined,
            events: [action.payload.event],
          },
        },
        activeStreamId: action.payload.interactionId,
      };
    case 'llm_stream:update': {
      const existing = state.llmStreams[action.payload.interactionId];
      if (!existing) return state;

      const updatedEvents = action.payload.event
        ? [...existing.events, action.payload.event]
        : existing.events;

      return {
        ...state,
        llmStreams: {
          ...state.llmStreams,
          [action.payload.interactionId]: {
            ...existing,
            ...action.payload.updates,
            events: updatedEvents,
            lastUpdated: Date.now(),
          },
        },
      };
    }
    case 'llm_stream:complete': {
      const existing = state.llmStreams[action.payload.interactionId];
      if (!existing) return state;

      const updatedEvents = action.payload.event
        ? [...existing.events, action.payload.event]
        : existing.events;

      return {
        ...state,
        llmStreams: {
          ...state.llmStreams,
          [action.payload.interactionId]: {
            ...existing,
            status: action.payload.status,
            error: action.payload.error,
            events: updatedEvents,
            lastUpdated: Date.now(),
          },
        },
        activeStreamId: state.activeStreamId === action.payload.interactionId ? null : state.activeStreamId,
      };
    }
    default:
      return state;
  }
};

export interface UseRecoveryPlanReturn {
  plan: {
    data: PlanResponse | null;
    loading: boolean;
    error: string | null;
    statusDisplay: StatusDisplay | null;
    refresh: () => Promise<void>;
  };
  reports: {
    canonicalHtml: string | null;
    canonicalError: string | null;
    loading: boolean;
    refresh: () => Promise<void>;
  };
  document: {
    data: AssembledDocumentResponse | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  };
  artefacts: {
    items: PlanFile[];
    loading: boolean;
    error: string | null;
    lastUpdated: Date | null;
    refresh: () => Promise<void>;
  };
  preview: {
    file: PlanFile | null;
    data: PreviewData | null;
    loading: boolean;
    error: string | null;
    select: (file: PlanFile | null) => void;
    clear: () => void;
  };
  llmStreams: {
    active: LLMStreamState | null;
    history: LLMStreamState[];
    all: Record<number, LLMStreamState>;
  };
  stageSummary: StageSummary[];
  connection: RecoveryConnectionState;
  lastWriteAt: Date | null;
}

const mapStreamingStatusToConnection = (
  status: RecoveryStreamingStatus,
): RecoveryConnectionState['status'] => {
  switch (status) {
    case 'idle':
      return 'idle';
    case 'connecting':
      return 'connecting';
    case 'running':
      return 'connected';
    case 'completed':
      return 'closed';
    case 'error':
    default:
      return 'error';
  }
};

const createStreamEventRecord = (
  message: WebSocketLLMStreamMessage,
  payload: Record<string, unknown>,
): StreamEventRecord => ({
  sequence: typeof message.sequence === 'number' ? message.sequence : Date.now(),
  event: message.event,
  timestamp: message.timestamp,
  payload,
});

export const useRecoveryPlan = (planId: string): UseRecoveryPlanReturn => {
  const [state, dispatch] = useReducer(recoveryReducer, INITIAL_STATE);
  const [connection, setConnection] = useState<RecoveryConnectionState>(initialConnectionState);
  const streamingRef = useRef<RecoveryStreamingController | null>(null);
  const llmStreamsRef = useRef<Record<number, LLMStreamState>>({});
  const planIdRef = useRef(planId);

  useEffect(() => {
    llmStreamsRef.current = state.llmStreams;
  }, [state.llmStreams]);

  useEffect(() => {
    planIdRef.current = planId;
  }, [planId]);

  useEffect(() => {
    const streaming = createRecoveryStreaming();
    streamingRef.current = streaming;

    const unsubscribe = streaming.subscribe((snapshot) => {
      setConnection({
        mode: planIdRef.current ? 'websocket' : 'polling',
        status: mapStreamingStatusToConnection(snapshot.status),
        lastEventAt: snapshot.lastEventAt,
        lastHeartbeatAt: snapshot.lastHeartbeatAt,
        error: snapshot.error,
      });
    });

    return () => {
      unsubscribe();
      streaming.close();
      streamingRef.current = null;
    };
  }, []);

  const refreshPlan = useCallback(async () => {
    if (!planId) {
      dispatch({ type: 'plan:error', error: 'Missing plan identifier.' });
      return;
    }
    dispatch({ type: 'plan:start' });
    try {
      const plan = await fastApiClient.getPlan(planId);
      dispatch({ type: 'plan:success', payload: plan });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load plan metadata.';
      dispatch({ type: 'plan:error', error: message });
    }
  }, [planId]);

  const refreshArtefacts = useCallback(async () => {
    if (!planId) {
      dispatch({ type: 'artefacts:error', error: 'Missing plan identifier.' });
      return;
    }
    dispatch({ type: 'artefacts:start' });
    try {
      const response: PlanArtefactListResponse = await fastApiClient.getPlanArtefacts(planId);
      const artefacts = mapArtefacts(response);
      dispatch({
        type: 'artefacts:success',
        payload: { artefacts, timestamp: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load artefacts.';
      dispatch({ type: 'artefacts:error', error: message });
    }
  }, [planId]);

  const refreshReport = useCallback(async () => {
    if (!planId) {
      dispatch({ type: 'report:error', error: 'Missing plan identifier.' });
      return;
    }
    dispatch({ type: 'report:start' });
    try {
      const blob = await fastApiClient.downloadReport(planId);
      const text = await blob.text();
      dispatch({ type: 'report:success', payload: text });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Canonical report unavailable.';
      const normalized = message.toLowerCase();
      const is404 = normalized.includes('404') || normalized.includes('not found');
      dispatch({
        type: 'report:error',
        error: is404
          ? 'Report not generated yet. The Luigi pipeline may still be running.'
          : message,
      });
    }
  }, [planId]);

  const refreshAssembledDocument = useCallback(async () => {
    if (!planId) {
      dispatch({ type: 'document:error', error: 'Missing plan identifier.' });
      return;
    }
    dispatch({ type: 'document:start' });
    try {
      const doc = await fastApiClient.getAssembledDocument(planId);
      dispatch({ type: 'document:success', payload: doc });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to assemble plan document.';
      dispatch({ type: 'document:error', error: message });
    }
  }, [planId]);

  const selectPreview = useCallback((file: PlanFile | null) => {
    dispatch({ type: 'preview:select', file });
  }, []);

  const clearPreview = useCallback(() => {
    dispatch({ type: 'preview:clear' });
  }, []);

  const handleStreamStart = useCallback(
    (context: RecoveryLLMStreamContext) => {
      const promptPreview = typeof context.data.prompt_preview === 'string' ? context.data.prompt_preview : undefined;
      const eventRecord = createStreamEventRecord(context.message, context.data);

      // CRITICAL: Prime the ref immediately to avoid race condition where
      // subsequent text_delta/reasoning_delta/final messages arrive before
      // the reducer commits and the useEffect syncs the ref. Without this,
      // fast streams (start→final in <16ms) lose all data.
      const initialStream: LLMStreamState = {
        interactionId: context.message.interaction_id,
        planId: context.message.plan_id,
        stage: context.message.stage,
        taskName: context.message.stage,
        textDeltas: [],
        reasoningDeltas: [],
        textBuffer: '',
        reasoningBuffer: '',
        status: 'running',
        lastUpdated: Date.now(),
        promptPreview: promptPreview ?? null,
        rawPayload: null,
        events: [eventRecord],
      };
      llmStreamsRef.current[context.message.interaction_id] = initialStream;

      dispatch({
        type: 'llm_stream:start',
        payload: {
          interactionId: context.message.interaction_id,
          planId: context.message.plan_id,
          stage: context.message.stage,
          taskName: context.message.stage,
          promptPreview,
          event: eventRecord,
        },
      });
    },
    [dispatch],
  );

  const handleStreamTextDelta = useCallback(
    (context: RecoveryLLMStreamContext) => {
      if (!context.delta) {
        return;
      }
      let existing = llmStreamsRef.current[context.message.interaction_id];
      if (!existing) {
        // Fallback: if start message was missed, create a placeholder
        // This should rarely happen with the ref priming above
        existing = {
          interactionId: context.message.interaction_id,
          planId: context.message.plan_id,
          stage: context.message.stage,
          taskName: context.message.stage,
          textDeltas: [],
          reasoningDeltas: [],
          textBuffer: '',
          reasoningBuffer: '',
          status: 'running',
          lastUpdated: Date.now(),
          promptPreview: null,
          rawPayload: null,
          events: [],
        };
        llmStreamsRef.current[context.message.interaction_id] = existing;
      }
      const nextDeltas = [...existing.textDeltas, context.delta];
      if (nextDeltas.length > MAX_STREAM_DELTAS) {
        nextDeltas.splice(0, nextDeltas.length - MAX_STREAM_DELTAS);
      }
      const eventRecord = createStreamEventRecord(context.message, context.data);
      dispatch({
        type: 'llm_stream:update',
        payload: {
          interactionId: context.message.interaction_id,
          updates: {
            textDeltas: nextDeltas,
            textBuffer: context.buffer.text,
          },
          event: eventRecord,
        },
      });
    },
    [dispatch],
  );

  const handleStreamReasoningDelta = useCallback(
    (context: RecoveryLLMStreamContext) => {
      if (!context.delta) {
        return;
      }
      let existing = llmStreamsRef.current[context.message.interaction_id];
      if (!existing) {
        // Fallback: if start message was missed, create a placeholder
        existing = {
          interactionId: context.message.interaction_id,
          planId: context.message.plan_id,
          stage: context.message.stage,
          taskName: context.message.stage,
          textDeltas: [],
          reasoningDeltas: [],
          textBuffer: '',
          reasoningBuffer: '',
          status: 'running',
          lastUpdated: Date.now(),
          promptPreview: null,
          rawPayload: null,
          events: [],
        };
        llmStreamsRef.current[context.message.interaction_id] = existing;
      }
      const nextDeltas = [...existing.reasoningDeltas, context.delta];
      if (nextDeltas.length > MAX_STREAM_DELTAS) {
        nextDeltas.splice(0, nextDeltas.length - MAX_STREAM_DELTAS);
      }
      const eventRecord = createStreamEventRecord(context.message, context.data);
      dispatch({
        type: 'llm_stream:update',
        payload: {
          interactionId: context.message.interaction_id,
          updates: {
            reasoningDeltas: nextDeltas,
            reasoningBuffer: context.buffer.reasoning,
          },
          event: eventRecord,
        },
      });
    },
    [dispatch],
  );

  const handleStreamFinal = useCallback(
    (context: RecoveryLLMStreamContext) => {
      let existing = llmStreamsRef.current[context.message.interaction_id];
      if (!existing) {
        // Fallback: if start message was missed, create a placeholder
        existing = {
          interactionId: context.message.interaction_id,
          planId: context.message.plan_id,
          stage: context.message.stage,
          taskName: context.message.stage,
          textDeltas: [],
          reasoningDeltas: [],
          textBuffer: '',
          reasoningBuffer: '',
          status: 'running',
          lastUpdated: Date.now(),
          promptPreview: null,
          rawPayload: null,
          events: [],
        };
        llmStreamsRef.current[context.message.interaction_id] = existing;
      }

      const updates: Partial<LLMStreamState> = {
        textBuffer: context.buffer.text,
        reasoningBuffer: context.buffer.reasoning,
      };

      if (typeof context.data.text === 'string') {
        updates.finalText = context.data.text;
      }
      if (typeof context.data.reasoning === 'string') {
        updates.finalReasoning = context.data.reasoning;
      }
      if (context.data.usage && typeof context.data.usage === 'object' && !Array.isArray(context.data.usage)) {
        const usage = context.data.usage as Record<string, unknown>;
        updates.usage = {
          inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
          outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
          reasoningTokens: typeof usage.reasoning_tokens === 'number' ? usage.reasoning_tokens : undefined,
          totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
        };
      }

      const rawPayload = sanitizeStreamPayload((context.data as Record<string, unknown>).raw_payload);
      if (Object.keys(rawPayload).length > 0) {
        updates.rawPayload = rawPayload;
      }

      const eventRecord = createStreamEventRecord(context.message, context.data);
      dispatch({
        type: 'llm_stream:update',
        payload: {
          interactionId: context.message.interaction_id,
          updates,
          event: eventRecord,
        },
      });
    },
    [dispatch],
  );

  const handleStreamEnd = useCallback(
    (context: RecoveryLLMStreamContext) => {
      const status = typeof context.data.status === 'string' ? context.data.status.toLowerCase() : 'completed';
      const error = typeof context.data.error === 'string' ? context.data.error : undefined;
      const eventRecord = createStreamEventRecord(context.message, context.data);
      dispatch({
        type: 'llm_stream:complete',
        payload: {
          interactionId: context.message.interaction_id,
          status: status === 'failed' ? 'failed' : 'completed',
          error,
          event: eventRecord,
        },
      });
    },
    [dispatch],
  );

  const handleStatusMessage = useCallback(
    (message: WebSocketStatusMessage) => {
      dispatch({
        type: 'plan:update',
        payload: {
          status: message.status as PlanResponse['status'],
          progress_percentage: message.progress_percentage,
          progress_message: message.message,
        },
      });
    },
    [dispatch],
  );

  const handleHeartbeatMessage = useCallback((message: WebSocketHeartbeatMessage) => {
    const timestamp = parseRecoveryTimestamp(message.timestamp) ?? new Date();
    setConnection((prev) => ({
      ...prev,
      lastHeartbeatAt: timestamp,
      lastEventAt: timestamp,
    }));
  }, []);

  const handleStreamError = useCallback((message: string) => {
    setConnection((prev) => ({
      ...prev,
      mode: 'polling',
      status: 'error',
      error: message || 'Live connection lost. Falling back to polling.',
    }));
  }, []);

  useEffect(() => {
    dispatch({ type: 'reset' });
    clearPreview();

    if (!planId) {
      setConnection(initialConnectionState);
      streamingRef.current?.close();
      return;
    }

    const streaming = streamingRef.current;
    if (!streaming) {
      return;
    }

    const handlers: RecoveryStreamHandlers = {
      onStart: handleStreamStart,
      onTextDelta: handleStreamTextDelta,
      onReasoningDelta: handleStreamReasoningDelta,
      onFinal: handleStreamFinal,
      onEnd: handleStreamEnd,
      onStatus: handleStatusMessage,
      onHeartbeat: handleHeartbeatMessage,
      onError: handleStreamError,
    };

    setConnection({ mode: 'websocket', status: 'connecting', lastEventAt: null, lastHeartbeatAt: null, error: null });

    streaming
      .start(planId, handlers)
      .catch(() => {
        setConnection({
          mode: 'polling',
          status: 'error',
          lastEventAt: null,
          lastHeartbeatAt: null,
          error: 'Unable to establish live connection. Using polling updates.',
        });
      });

    return () => {
      streaming.close();
    };
  }, [planId, clearPreview, handleStreamStart, handleStreamTextDelta, handleStreamReasoningDelta, handleStreamFinal, handleStreamEnd, handleStatusMessage, handleHeartbeatMessage, handleStreamError]);

  useEffect(() => {
    if (!planId) {
      return;
    }
    void refreshPlan();
    void refreshArtefacts();
    void refreshReport();
    void refreshAssembledDocument();
  }, [planId, refreshPlan, refreshArtefacts, refreshReport, refreshAssembledDocument]);

  useEffect(() => {
    if (!planId) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshArtefacts();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [planId, refreshArtefacts]);

  useEffect(() => {
    if (!planId) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshAssembledDocument();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [planId, refreshAssembledDocument]);

  useEffect(() => {
    if (!planId || !state.previewFile) {
      dispatch({ type: 'preview:clear' });
      return;
    }

    let cancelled = false;
    const loadPreview = async () => {
      if (!state.previewFile) {
        return;
      }
      if (!isTextRenderable(state.previewFile)) {
        dispatch({ type: 'preview:error', error: 'This file type cannot be previewed. Use download instead.' });
        return;
      }

      dispatch({ type: 'preview:start' });
      try {
        const blob = await fastApiClient.downloadFile(planId, state.previewFile.filename);
        if (cancelled) {
          return;
        }
        const maxPreviewSize = 2 * 1024 * 1024;
        if (blob.size > maxPreviewSize) {
          dispatch({ type: 'preview:error', error: 'File is too large to preview inline. Download it instead.' });
          return;
        }
        const rawContent = await blob.text();
        if (cancelled) {
          return;
        }
        const contentType = state.previewFile.contentType.toLowerCase();
        if (contentType.includes('json') || state.previewFile.filename.toLowerCase().endsWith('.json')) {
          try {
            const parsed = JSON.parse(rawContent);
            if (!cancelled) {
              dispatch({
                type: 'preview:success',
                payload: { mode: 'text', content: JSON.stringify(parsed, null, 2) },
              });
              return;
            }
          } catch (jsonError) {
            console.warn('Failed to format JSON preview', jsonError);
          }
        }
        if (contentType.includes('html') || /\.html?$/i.test(state.previewFile.filename)) {
          dispatch({ type: 'preview:success', payload: { mode: 'html', content: rawContent } });
          return;
        }
        dispatch({ type: 'preview:success', payload: { mode: 'text', content: rawContent } });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to preview file.';
        dispatch({ type: 'preview:error', error: message });
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [planId, state.previewFile]);

  const stageSummary: StageSummary[] = useMemo(() => {
    const counts = new Map<string, number>();
    state.artefacts.forEach((file) => {
      const key = normaliseStageKey(file.stage);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const orderedKeys = KNOWN_STAGE_ORDER.concat(
      [...counts.keys()].filter((key) => !KNOWN_STAGE_ORDER.includes(key)).sort(),
    );
    const uniqueKeys = Array.from(new Set(orderedKeys));

    return uniqueKeys.map((key) => ({
      key,
      label: normaliseStageLabel(key),
      count: counts.get(key) ?? 0,
    }));
  }, [state.artefacts]);

  const statusDisplay = useMemo(() => (state.plan ? getStatusDisplay(state.plan.status) : null), [state.plan]);

  const llmStreams = useMemo(() => {
    const activeStream = state.activeStreamId !== null ? state.llmStreams[state.activeStreamId] ?? null : null;
    const history = Object.values(state.llmStreams)
      .filter((s) => s.status !== 'running')
      .sort((a, b) => b.lastUpdated - a.lastUpdated);

    return {
      active: activeStream,
      history,
      all: state.llmStreams,
    };
  }, [state.llmStreams, state.activeStreamId]);

  return {
    plan: {
      data: state.plan,
      loading: state.planLoading,
      error: state.planError,
      statusDisplay,
      refresh: refreshPlan,
    },
    reports: {
      canonicalHtml: state.canonicalHtml,
      canonicalError: state.canonicalError,
      loading: state.reportLoading,
      refresh: refreshReport,
    },
    document: {
      data: state.assembledDocument,
      loading: state.assembledDocumentLoading,
      error: state.assembledDocumentError,
      refresh: refreshAssembledDocument,
    },
    artefacts: {
      items: state.artefacts,
      loading: state.artefactLoading,
      error: state.artefactError,
      lastUpdated: state.artefactLastUpdated,
      refresh: refreshArtefacts,
    },
    preview: {
      file: state.previewFile,
      data: state.previewData,
      loading: state.previewLoading,
      error: state.previewError,
      select: selectPreview,
      clear: clearPreview,
    },
    llmStreams,
    stageSummary,
    connection,
    lastWriteAt: state.artefactLastUpdated,
  };
};
