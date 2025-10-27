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
  WebSocketLLMStreamMessage,
  WebSocketMessage,
} from '@/lib/api/fastapi-client';
import { Activity, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { PlanFile } from '@/lib/types/pipeline';
import { parseBackendDate, toIsoStringOrFallback } from '@/lib/utils/date';

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

export interface LLMStreamState {
  interactionId: number;
  planId: string;
  stage: string;
  status: StreamStatus;
  textDeltas: string[];
  reasoningDeltas: string[];
  textBuffer: string;
  reasoningBuffer: string;
  finalText?: string;
  finalReasoning?: string;
  usage?: Record<string, unknown>;
  rawPayload?: Record<string, unknown> | null;
  error?: string;
  lastUpdated: number;
  promptPreview?: string | null;
  events: Array<{
    sequence: number;
    event: string;
    timestamp: string;
    payload: Record<string, unknown>;
  }>;
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
  | { type: 'preview:clear' };

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
};

const initialConnectionState: RecoveryConnectionState = {
  mode: 'polling',
  status: 'closed',
  lastEventAt: null,
  lastHeartbeatAt: null,
  error: null,
};

const MAX_STREAM_DELTAS = 200;
const MAX_STREAM_EVENTS = 100;

const sanitizeStreamPayload = (data: unknown): Record<string, unknown> => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  return data as Record<string, unknown>;
};

const cloneEventPayload = (data: Record<string, unknown>): Record<string, unknown> => {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return {};
  }
};

const appendReasoningChunk = (buffer: { text: string; reasoning: string }, delta: string): void => {
  if (buffer.reasoning) {
    buffer.reasoning = `${buffer.reasoning}\n${delta}`;
  } else {
    buffer.reasoning = delta;
  }
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
    const createdAt = toIsoStringOrFallback(entry.created_at);
    return {
      filename: entry.filename,
      stage: normalizedStage,
      contentType: entry.content_type ?? 'unknown',
      sizeBytes: entry.size_bytes ?? 0,
      createdAt: createdAt ?? new Date().toISOString(),
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
  stageSummary: StageSummary[];
  connection: RecoveryConnectionState;
  lastWriteAt: Date | null;
  llmStreams: {
    active: LLMStreamState | null;
    history: LLMStreamState[];
    all: LLMStreamState[];
  };
  activeStageKey: string | null;
}

export const useRecoveryPlan = (planId: string): UseRecoveryPlanReturn => {
  const [state, dispatch] = useReducer(recoveryReducer, INITIAL_STATE);
  const [connection, setConnection] = useState<RecoveryConnectionState>(initialConnectionState);
  const wsClientRef = useRef<ReturnType<typeof fastApiClient.streamProgress> | null>(null);
  const streamBuffersRef = useRef<Map<number, { text: string; reasoning: string }>>(new Map());
  const [llmStreams, setLlmStreams] = useState<Record<number, LLMStreamState>>({});
  const [activeStreamId, setActiveStreamId] = useState<number | null>(null);

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
      const latestArtefactAt = artefacts.reduce<Date | null>((latest, file) => {
        const created = parseBackendDate(file.createdAt);
        if (!created) {
          return latest;
        }
        if (!latest || created > latest) {
          return created;
        }
        return latest;
      }, null);
      dispatch({
        type: 'artefacts:success',
        payload: { artefacts, timestamp: latestArtefactAt ?? new Date() },
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

  // Reset state when planId changes
  useEffect(() => {
    dispatch({ type: 'reset' });
    clearPreview();
    setConnection({
      ...initialConnectionState,
      status: planId ? 'connecting' : 'closed',
      mode: planId ? 'websocket' : 'polling',
    });
    setLlmStreams({});
    setActiveStreamId(null);
    streamBuffersRef.current.clear();
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

  // Plan progress polling (ensures progress updates even if WebSocket fails)
  useEffect(() => {
    if (!planId) {
      return;
    }
    // Only poll when plan is running
    if (state.plan?.status !== 'running') {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshPlan();
    }, 3000); // Poll every 3 seconds for responsive progress updates
    return () => window.clearInterval(interval);
  }, [planId, refreshPlan, state.plan?.status]);

  const handleLlmStreamMessage = useCallback(
    (message: WebSocketLLMStreamMessage) => {
      const sanitizedData = sanitizeStreamPayload(message.data);
      const buffer = streamBuffersRef.current.get(message.interaction_id) ?? { text: '', reasoning: '' };

      setLlmStreams((prev) => {
        const existing = prev[message.interaction_id];
        const promptPreview = typeof sanitizedData.prompt_preview === 'string' ? sanitizedData.prompt_preview : undefined;
        const baseState: LLMStreamState = existing ?? {
          interactionId: message.interaction_id,
          planId: message.plan_id,
          stage: message.stage,
          status: 'running',
          textDeltas: [],
          reasoningDeltas: [],
          textBuffer: buffer.text,
          reasoningBuffer: buffer.reasoning,
          lastUpdated: Date.now(),
          promptPreview: promptPreview ?? null,
          rawPayload: null,
          events: [],
        };

        const updated: LLMStreamState = {
          ...baseState,
          lastUpdated: Date.now(),
          promptPreview: baseState.promptPreview ?? promptPreview ?? null,
          textBuffer: buffer.text,
          reasoningBuffer: buffer.reasoning,
          rawPayload: baseState.rawPayload ?? null,
        };

        switch (message.event) {
          case 'start':
            updated.status = 'running';
            break;
          case 'text_delta': {
            const delta = typeof sanitizedData.delta === 'string' ? sanitizedData.delta : '';
            if (delta) {
              const next = [...updated.textDeltas, delta];
              if (next.length > MAX_STREAM_DELTAS) {
                next.splice(0, next.length - MAX_STREAM_DELTAS);
              }
              updated.textDeltas = next;
              buffer.text = `${buffer.text}${delta}`;
            }
            break;
          }
          case 'reasoning_delta': {
            const delta = typeof sanitizedData.delta === 'string' ? sanitizedData.delta : '';
            if (delta) {
              const next = [...updated.reasoningDeltas, delta];
              if (next.length > MAX_STREAM_DELTAS) {
                next.splice(0, next.length - MAX_STREAM_DELTAS);
              }
              updated.reasoningDeltas = next;
              appendReasoningChunk(buffer, delta);
            }
            break;
          }
          case 'final': {
            if (typeof sanitizedData.text === 'string') {
              updated.finalText = sanitizedData.text;
              buffer.text = sanitizedData.text;
            }
            if (typeof sanitizedData.reasoning === 'string') {
              updated.finalReasoning = sanitizedData.reasoning;
              buffer.reasoning = sanitizedData.reasoning;
            }
            if (sanitizedData.usage && typeof sanitizedData.usage === 'object' && !Array.isArray(sanitizedData.usage)) {
              updated.usage = sanitizedData.usage as Record<string, unknown>;
            }
            const rawPayload = sanitizeStreamPayload((sanitizedData as Record<string, unknown>).raw_payload);
            if (Object.keys(rawPayload).length > 0) {
              updated.rawPayload = rawPayload;
            }
            break;
          }
          case 'end': {
            const status = typeof sanitizedData.status === 'string' ? sanitizedData.status.toLowerCase() : 'completed';
            updated.status = status === 'failed' ? 'failed' : 'completed';
            updated.error = typeof sanitizedData.error === 'string' ? sanitizedData.error : undefined;
            break;
          }
          default:
            break;
        }

        streamBuffersRef.current.set(message.interaction_id, {
          text: buffer.text,
          reasoning: buffer.reasoning,
        });

        updated.textBuffer = buffer.text;
        updated.reasoningBuffer = buffer.reasoning;

        const eventRecord = {
          sequence: typeof message.sequence === 'number' ? message.sequence : Date.now(),
          event: message.event,
          timestamp: message.timestamp,
          payload: cloneEventPayload(sanitizedData),
        };

        const nextEvents = [...baseState.events, eventRecord];
        if (nextEvents.length > MAX_STREAM_EVENTS) {
          nextEvents.splice(0, nextEvents.length - MAX_STREAM_EVENTS);
        }
        updated.events = nextEvents;

        return { ...prev, [message.interaction_id]: updated };
      });

      if (message.event === 'start') {
        setActiveStreamId(message.interaction_id);
      }

      if (message.event === 'end') {
        setActiveStreamId((current) => (current === message.interaction_id ? null : current));
      }
    },
    [],
  );

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
      const timestamp = message.timestamp ? parseBackendDate(message.timestamp) ?? new Date() : new Date();
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

  const orderedStreams = useMemo(() => Object.values(llmStreams).sort((a, b) => b.lastUpdated - a.lastUpdated), [llmStreams]);
  const derivedActiveStream = useMemo(() => {
    if (activeStreamId !== null && llmStreams[activeStreamId]) {
      return llmStreams[activeStreamId];
    }
    return orderedStreams.find((stream) => stream.status === 'running') ?? null;
  }, [activeStreamId, llmStreams, orderedStreams]);

  const streamHistory = useMemo(
    () => orderedStreams.filter((stream) => !derivedActiveStream || stream.interactionId !== derivedActiveStream.interactionId),
    [orderedStreams, derivedActiveStream],
  );

  const activeStageKey = useMemo(() => (derivedActiveStream ? normaliseStageKey(derivedActiveStream.stage) : null), [derivedActiveStream]);

  const stageSummaryWithActive = useMemo(() => {
    if (!activeStageKey) {
      return stageSummary;
    }
    if (stageSummary.some((stage) => stage.key === activeStageKey)) {
      return stageSummary;
    }
    return [
      { key: activeStageKey, label: normaliseStageLabel(activeStageKey), count: 0 },
      ...stageSummary,
    ];
  }, [stageSummary, activeStageKey]);

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
    stageSummary: stageSummaryWithActive,
    connection,
    lastWriteAt: state.artefactLastUpdated,
    llmStreams: {
      active: derivedActiveStream,
      history: streamHistory,
      all: orderedStreams,
    },
    activeStageKey,
  };
};
