/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Centralises recovery workspace data fetching, streaming integration, and
 *          derived view state so the page and presentational components remain lean.
 * SRP and DRY check: Pass - consolidates API/WebSocket orchestration without duplicating
 *          logic across UI widgets, complementing existing FastAPI client helpers.
 */
'use client';

import type { ReactElement } from 'react';
import { createElement, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  fastApiClient,
  PlanArtefactListResponse,
  PlanResponse,
  WebSocketMessage,
  WebSocketLLMStreamMessage,
} from '@/lib/api/fastapi-client';
import { Activity, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { PlanFile } from '@/lib/types/pipeline';

export interface StatusDisplay {
  label: string;
  badgeClass: string;
  icon: ReactElement;
}

export interface StageSummary {
  key: string;
  label: string;
  count: number;
}

export interface PreviewData {
  mode: 'text' | 'html';
  content: string;
}

export interface RecoveryConnectionState {
  mode: 'websocket' | 'polling';
  status: 'connecting' | 'connected' | 'error' | 'closed';
  lastEventAt: Date | null;
  lastHeartbeatAt: Date | null;
  error?: string | null;
}

type StreamStatus = 'running' | 'completed' | 'failed';

interface StreamEventRecord {
  sequence: number;
  event: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface LLMStreamState {
  interactionId: number;
  planId: string;
  stage: string;
  taskName?: string;
  textDeltas: string[];
  reasoningDeltas: string[];
  textBuffer: string;
  reasoningBuffer: string;
  finalText?: string;
  finalReasoning?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
  rawPayload?: Record<string, unknown> | null;
  status: StreamStatus;
  error?: string;
  lastUpdated: number;
  promptPreview?: string | null;
  events: StreamEventRecord[];
}

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
  | { type: 'plan:update'; payload: Partial<Pick<PlanResponse, 'status' | 'progress_percentage' | 'progress_message'>> }
  | { type: 'artefacts:start' }
  | { type: 'artefacts:success'; payload: { artefacts: PlanFile[]; timestamp: Date } }
  | { type: 'artefacts:error'; error: string }
  | { type: 'report:start' }
  | { type: 'report:success'; payload: string }
  | { type: 'report:error'; error: string | null }
  | { type: 'preview:select'; file: PlanFile | null }
  | { type: 'preview:start' }
  | { type: 'preview:success'; payload: PreviewData }
  | { type: 'preview:error'; error: string }
  | { type: 'preview:clear' }
  | { type: 'llm_stream:start'; payload: { interactionId: number; planId: string; stage: string; taskName?: string; promptPreview?: string } }
  | { type: 'llm_stream:update'; payload: { interactionId: number; updates: Partial<LLMStreamState> } }
  | { type: 'llm_stream:complete'; payload: { interactionId: number; status: StreamStatus; error?: string } };

const KNOWN_STAGE_ORDER: string[] = [
  'setup',
  'initial_analysis',
  'strategic_planning',
  'scenario_planning',
  'contextual_analysis',
  'assumption_management',
  'project_planning',
  'governance',
  'resource_planning',
  'documentation',
  'work_breakdown',
  'scheduling',
  'reporting',
  'completion',
];

const STAGE_LABELS: Record<string, string> = {
  setup: 'Setup',
  initial_analysis: 'Initial Analysis',
  strategic_planning: 'Strategic Planning',
  scenario_planning: 'Scenario Planning',
  contextual_analysis: 'Contextual Analysis',
  assumption_management: 'Assumption Management',
  project_planning: 'Project Planning',
  governance: 'Governance',
  resource_planning: 'Resource Planning',
  documentation: 'Documentation',
  work_breakdown: 'Work Breakdown',
  scheduling: 'Scheduling',
  reporting: 'Reporting',
  completion: 'Completion',
  unknown: 'Unclassified Stage',
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
  previewFile: null,
  previewLoading: false,
  previewError: null,
  previewData: null,
  llmStreams: {},
  activeStreamId: null,
};

const initialConnectionState: RecoveryConnectionState = {
  mode: 'polling',
  status: 'closed',
  lastEventAt: null,
  lastHeartbeatAt: null,
  error: null,
};

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
          progress_percentage:
            action.payload.progress_percentage ?? state.plan.progress_percentage,
          progress_message:
            action.payload.progress_message ?? state.plan.progress_message,
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
      return {
        ...state,
        reportLoading: false,
        canonicalHtml: action.payload,
        canonicalError: null,
      };
    case 'report:error':
      return {
        ...state,
        reportLoading: false,
        canonicalHtml: null,
        canonicalError: action.error,
      };
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
            events: [],
          },
        },
        activeStreamId: action.payload.interactionId,
      };
    case 'llm_stream:update': {
      const existing = state.llmStreams[action.payload.interactionId];
      if (!existing) return state;

      return {
        ...state,
        llmStreams: {
          ...state.llmStreams,
          [action.payload.interactionId]: {
            ...existing,
            ...action.payload.updates,
            lastUpdated: Date.now(),
          },
        },
      };
    }
    case 'llm_stream:complete': {
      const existing = state.llmStreams[action.payload.interactionId];
      if (!existing) return state;

      return {
        ...state,
        llmStreams: {
          ...state.llmStreams,
          [action.payload.interactionId]: {
            ...existing,
            status: action.payload.status,
            error: action.payload.error,
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

const normaliseStageKey = (stage?: string | null): string => {
  if (!stage || typeof stage !== 'string' || stage.trim() === '') {
    return 'unknown';
  }
  return stage.trim().toLowerCase();
};

const normaliseStageLabel = (stage?: string | null): string => {
  const key = normaliseStageKey(stage);
  if (STAGE_LABELS[key]) {
    return STAGE_LABELS[key];
  }
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normaliseIsoString = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/(?:[zZ]|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}Z`;
};

export const parseRecoveryTimestamp = (value?: string | null): Date | null => {
  const normalised = normaliseIsoString(value);
  if (!normalised) {
    return null;
  }
  const result = new Date(normalised);
  if (Number.isNaN(result.getTime())) {
    return null;
  }
  return result;
};

const isWebSocketMessage = (data: WebSocketMessage | CloseEvent): data is WebSocketMessage => {
  return (
    typeof (data as WebSocketMessage)?.type === 'string' &&
    'timestamp' in data &&
    typeof (data as WebSocketMessage).timestamp === 'string'
  );
};

const getStatusDisplay = (status: PlanResponse['status']): StatusDisplay => {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        icon: createElement(CheckCircle2, {
          className: 'h-4 w-4 text-emerald-600',
          'aria-hidden': 'true',
        }),
      };
    case 'running':
      return {
        label: 'Running',
        badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
        icon: createElement(Activity, {
          className: 'h-4 w-4 text-blue-600',
          'aria-hidden': 'true',
        }),
      };
    case 'failed':
      return {
        label: 'Failed',
        badgeClass: 'border-red-200 bg-red-50 text-red-700',
        icon: createElement(XCircle, {
          className: 'h-4 w-4 text-red-600',
          'aria-hidden': 'true',
        }),
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
        icon: createElement(AlertCircle, {
          className: 'h-4 w-4 text-slate-600',
          'aria-hidden': 'true',
        }),
      };
    default:
      return {
        label: 'Pending',
        badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
        icon: createElement(Clock, {
          className: 'h-4 w-4 text-amber-600',
          'aria-hidden': 'true',
        }),
      };
  }
};

const mapArtefacts = (response: PlanArtefactListResponse): PlanFile[] => {
  const entries = (response.artefacts ?? []).filter((entry) => entry && entry.filename);
  const mapped = entries.map<PlanFile>((entry) => {
    const normalizedStage = normaliseStageKey(entry.stage);
    const createdAt = normaliseIsoString(entry.created_at) ?? new Date().toISOString();
    return {
      filename: entry.filename,
      stage: normalizedStage,
      contentType: entry.content_type ?? 'unknown',
      sizeBytes: entry.size_bytes ?? 0,
      createdAt,
      description: entry.description ?? entry.filename,
      taskName: entry.task_name ?? normalizedStage ?? entry.filename,
      order: entry.order ?? Number.MAX_SAFE_INTEGER,
    };
  });

  mapped.sort((a, b) => {
    const orderDiff = (a.order ?? 9999) - (b.order ?? 9999);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return a.filename.localeCompare(b.filename);
  });

  return mapped;
};

const isTextRenderable = (file: PlanFile): boolean => {
  const contentType = file.contentType.toLowerCase();
  if (contentType.startsWith('text/')) {
    return true;
  }
  if (
    contentType.includes('json') ||
    contentType.includes('csv') ||
    contentType.includes('xml') ||
    contentType.includes('html')
  ) {
    return true;
  }
  return /\.(md|txt|json|csv|html?)$/i.test(file.filename);
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

const MAX_STREAM_DELTAS = 200;

function sanitizeStreamPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  return data as Record<string, unknown>;
}

function appendReasoningChunk(buffer: { text: string; reasoning: string }, delta: string): void {
  if (buffer.reasoning) {
    buffer.reasoning = `${buffer.reasoning}\n${delta}`;
  } else {
    buffer.reasoning = delta;
  }
}

export const useRecoveryPlan = (planId: string): UseRecoveryPlanReturn => {
  const [state, dispatch] = useReducer(recoveryReducer, INITIAL_STATE);
  const [connection, setConnection] = useState<RecoveryConnectionState>(initialConnectionState);
  const wsClientRef = useRef<ReturnType<typeof fastApiClient.streamProgress> | null>(null);
  const streamBuffersRef = useRef<Map<number, { text: string; reasoning: string }>>(new Map());

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

  const selectPreview = useCallback((file: PlanFile | null) => {
    dispatch({ type: 'preview:select', file });
  }, []);

  const clearPreview = useCallback(() => {
    dispatch({ type: 'preview:clear' });
  }, []);

  const handleLlmStreamMessage = useCallback((message: WebSocketLLMStreamMessage) => {
    const sanitizedData = sanitizeStreamPayload(message.data);
    const buffer = streamBuffersRef.current.get(message.interaction_id) ?? { text: '', reasoning: '' };

    const promptPreview = typeof sanitizedData.prompt_preview === 'string' ? sanitizedData.prompt_preview : undefined;

    switch (message.event) {
      case 'start':
        dispatch({
          type: 'llm_stream:start',
          payload: {
            interactionId: message.interaction_id,
            planId: message.plan_id,
            stage: message.stage,
            taskName: message.task_name,
            promptPreview,
          },
        });
        break;

      case 'text_delta': {
        const delta = typeof sanitizedData.delta === 'string' ? sanitizedData.delta : '';
        if (delta) {
          buffer.text = `${buffer.text}${delta}`;
          streamBuffersRef.current.set(message.interaction_id, buffer);

          const existing = state.llmStreams[message.interaction_id];
          if (existing) {
            const nextDeltas = [...existing.textDeltas, delta];
            if (nextDeltas.length > MAX_STREAM_DELTAS) {
              nextDeltas.splice(0, nextDeltas.length - MAX_STREAM_DELTAS);
            }

            dispatch({
              type: 'llm_stream:update',
              payload: {
                interactionId: message.interaction_id,
                updates: {
                  textDeltas: nextDeltas,
                  textBuffer: buffer.text,
                },
              },
            });
          }
        }
        break;
      }

      case 'reasoning_delta': {
        const delta = typeof sanitizedData.delta === 'string' ? sanitizedData.delta : '';
        if (delta) {
          appendReasoningChunk(buffer, delta);
          streamBuffersRef.current.set(message.interaction_id, buffer);

          const existing = state.llmStreams[message.interaction_id];
          if (existing) {
            const nextDeltas = [...existing.reasoningDeltas, delta];
            if (nextDeltas.length > MAX_STREAM_DELTAS) {
              nextDeltas.splice(0, nextDeltas.length - MAX_STREAM_DELTAS);
            }

            dispatch({
              type: 'llm_stream:update',
              payload: {
                interactionId: message.interaction_id,
                updates: {
                  reasoningDeltas: nextDeltas,
                  reasoningBuffer: buffer.reasoning,
                },
              },
            });
          }
        }
        break;
      }

      case 'final': {
        const updates: Partial<LLMStreamState> = {};

        if (typeof sanitizedData.text === 'string') {
          updates.finalText = sanitizedData.text;
          buffer.text = sanitizedData.text;
        }
        if (typeof sanitizedData.reasoning === 'string') {
          updates.finalReasoning = sanitizedData.reasoning;
          buffer.reasoning = sanitizedData.reasoning;
        }
        if (sanitizedData.usage && typeof sanitizedData.usage === 'object' && !Array.isArray(sanitizedData.usage)) {
          const usage = sanitizedData.usage as Record<string, unknown>;
          updates.usage = {
            inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
            outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
            reasoningTokens: typeof usage.reasoning_tokens === 'number' ? usage.reasoning_tokens : undefined,
            totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
          };
        }

        const rawPayload = sanitizeStreamPayload((sanitizedData as Record<string, unknown>).raw_payload);
        if (Object.keys(rawPayload).length > 0) {
          updates.rawPayload = rawPayload;
        }

        streamBuffersRef.current.set(message.interaction_id, buffer);

        dispatch({
          type: 'llm_stream:update',
          payload: {
            interactionId: message.interaction_id,
            updates: {
              ...updates,
              textBuffer: buffer.text,
              reasoningBuffer: buffer.reasoning,
            },
          },
        });
        break;
      }

      case 'end': {
        const status = typeof sanitizedData.status === 'string' ? sanitizedData.status.toLowerCase() : 'completed';
        const error = typeof sanitizedData.error === 'string' ? sanitizedData.error : undefined;

        dispatch({
          type: 'llm_stream:complete',
          payload: {
            interactionId: message.interaction_id,
            status: status === 'failed' ? 'failed' : 'completed',
            error,
          },
        });

        streamBuffersRef.current.delete(message.interaction_id);
        break;
      }

      default:
        break;
    }
  }, [state.llmStreams]);

  // Reset state when planId changes
  useEffect(() => {
    dispatch({ type: 'reset' });
    clearPreview();
    setConnection(() => ({
      ...initialConnectionState,
      status: planId ? 'connecting' : 'closed',
      mode: planId ? 'websocket' : 'polling',
    }));
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }
  }, [planId, clearPreview]);

  // Initial fetches
  useEffect(() => {
    if (!planId) {
      return;
    }
    void refreshPlan();
    void refreshArtefacts();
    void refreshReport();
  }, [planId, refreshPlan, refreshArtefacts, refreshReport]);

  // Artefact polling
  useEffect(() => {
    if (!planId) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshArtefacts();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [planId, refreshArtefacts]);

  // WebSocket connection for live updates
  useEffect(() => {
    if (!planId) {
      return;
    }

    let cancelled = false;
    const client = fastApiClient.streamProgress(planId);
    wsClientRef.current = client;

    setConnection({ mode: 'websocket', status: 'connecting', lastEventAt: null, lastHeartbeatAt: null, error: null });

    const handleMessage = (payload: WebSocketMessage | CloseEvent) => {
      if (cancelled || !isWebSocketMessage(payload)) {
        return;
      }
      const message = payload;
      const timestamp = parseRecoveryTimestamp(message.timestamp) ?? new Date();
      switch (message.type) {
        case 'status':
          setConnection((prev) => ({
            ...prev,
            mode: 'websocket',
            status: 'connected',
            lastEventAt: timestamp,
            error: null,
          }));
          dispatch({
            type: 'plan:update',
            payload: {
              status: message.status as PlanResponse['status'],
              progress_percentage: message.progress_percentage,
              progress_message: message.message,
            },
          });
          break;
        case 'heartbeat':
          setConnection((prev) => ({
            ...prev,
            mode: 'websocket',
            status: 'connected',
            lastHeartbeatAt: timestamp,
            lastEventAt: timestamp,
            error: null,
          }));
          break;
        case 'stream_end':
          setConnection((prev) => ({
            ...prev,
            mode: 'websocket',
            status: 'closed',
            lastEventAt: timestamp,
          }));
          break;
        case 'error':
          setConnection((prev) => ({
            ...prev,
            mode: 'websocket',
            status: 'error',
            lastEventAt: timestamp,
            error: message.message,
          }));
          break;
        case 'llm_stream':
          handleLlmStreamMessage(message as WebSocketLLMStreamMessage);
          setConnection((prev) => ({
            ...prev,
            lastEventAt: timestamp,
          }));
          break;
        case 'log':
          setConnection((prev) => ({
            ...prev,
            lastEventAt: timestamp,
          }));
          break;
        default:
          break;
      }
    };

    const handleClose = () => {
      if (cancelled) {
        return;
      }
      setConnection((prev) => ({
        ...prev,
        mode: 'polling',
        status: 'error',
        error: prev.error ?? 'Live connection lost. Falling back to polling.',
      }));
    };

    client.on('message', handleMessage);
    client.on('close', handleClose);
    client.on('error', handleClose);

    client
      .connect()
      .then(() => {
        if (cancelled) {
          return;
        }
        setConnection((prev) => ({ ...prev, status: 'connected', mode: 'websocket', error: null }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setConnection({
          mode: 'polling',
          status: 'error',
          lastEventAt: null,
          lastHeartbeatAt: null,
          error: 'Unable to establish live connection. Using polling updates.',
        });
      });

    return () => {
      cancelled = true;
      client.off('message', handleMessage);
      client.off('close', handleClose);
      client.off('error', handleClose);
      client.disconnect();
      wsClientRef.current = null;
    };
  }, [planId, handleLlmStreamMessage]);

  // Preview loader
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
        const maxPreviewSize = 2 * 1024 * 1024; // 2 MB
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

    const orderedKeys = KNOWN_STAGE_ORDER.concat([...counts.keys()].filter((key) => !KNOWN_STAGE_ORDER.includes(key)).sort());
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
    const history = Object.values(state.llmStreams).filter(s => s.status !== 'running').sort((a, b) => b.lastUpdated - a.lastUpdated);

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
