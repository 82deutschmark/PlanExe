/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2024-11-23T00:00:00Z
 * PURPOSE: Central FastAPI client typings/helpers, now including plan relaunch utilities
 *          and resilient streaming support for recovery tooling.
 * SRP and DRY check: Pass - continues to encapsulate HTTP/WebSocket concerns without duplicating
 *          request logic across components.
 */

import { createWebSocketUrl, getApiBaseUrl } from '@/lib/utils/api-config';
import {
  getStreamingDefaults,
  getConversationDefaults,
} from '@/lib/config/responses';

// FastAPI Backend Types (EXACT match with backend)
export interface CreatePlanRequest {
  prompt: string;
  llm_model?: string;
  speed_vs_detail: 'fast_but_skip_details' | 'balanced_speed_and_detail' | 'all_details_but_slow';
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  enriched_intake?: EnrichedPlanIntake;
}

export interface RelaunchPlanOptions {
  llmModel?: string | null;
  speedVsDetail?: CreatePlanRequest['speed_vs_detail'];
  reasoningEffort?: CreatePlanRequest['reasoning_effort'];
}

export interface PlanResponse {
  plan_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  prompt: string;
  llm_model?: string | null;
  speed_vs_detail: 'fast_but_skip_details' | 'balanced_speed_and_detail' | 'all_details_but_slow';
  reasoning_effort: 'minimal' | 'low' | 'medium' | 'high';
  progress_percentage: number;
  progress_message: string;
  error_message?: string;
  output_dir?: string;
}

export interface EnrichedPlanIntake {
  project_title: string;
  refined_objective: string;
  original_prompt: string;
  scale: 'personal' | 'local' | 'regional' | 'national' | 'global';
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive' | 'experimental';
  domain: string;
  budget: {
    estimated_total?: string;
    funding_sources?: string[];
    currency?: string;
  };
  timeline: {
    target_completion?: string;
    key_milestones?: string[];
    urgency?: string;
  };
  team_size?: string;
  existing_resources?: string[];
  geography: {
    is_digital_only: boolean;
    physical_locations?: string[];
    notes?: string;
  };
  hard_constraints?: string[];
  success_criteria?: string[];
  key_stakeholders?: string[];
  regulatory_context?: string;
  conversation_summary: string;
  confidence_score: number;
  areas_needing_clarification?: string[];
}

export interface LLMModel {
  id: string;
  label: string;
  comment: string;
  priority: number;
  requires_api_key: boolean;
}

export interface PromptExample {
  uuid: string;
  prompt: string;
  title?: string;
}

export interface PlanFileEntry {
  filename: string;
  content_type: string;
  stage?: string | null;
  size_bytes: number;
  created_at: string | null;
  description?: string | null;
  task_name?: string | null;
  order?: number | null;
}

export interface PlanFilesResponse {
  plan_id: string;
  files: PlanFileEntry[];
  has_report: boolean;
}

export interface PlanArtefact {
  filename: string;
  content_type: string;
  stage?: string | null;
  size_bytes: number;
  created_at: string;
  description?: string | null;
  task_name?: string | null;
  order?: number | null;
}

export interface PlanArtefactListResponse {
  plan_id: string;
  artefacts: PlanArtefact[];
}

export interface ReportSectionResponse {
  filename: string;
  stage?: string | null;
  content_type: string;
  content: string;
}

export interface MissingSectionResponse {
  filename: string;
  stage?: string | null;
  reason: string;
}

export interface FallbackReportResponse {
  plan_id: string;
  generated_at: string;
  completion_percentage: number;
  sections: ReportSectionResponse[];
  missing_sections: MissingSectionResponse[];
  assembled_html: string;
}

export interface StructuredReportResponse {
  plan_id: string;
  generated_at: string;
  sections: ReportSection[];
  source: string;
}

export interface ReportSection {
  id: string;
  title: string;
  stage: string | null;
  content: string;
  content_type: string;
  filename: string;
}

export interface AssembledDocumentSection {
  id: string;
  task_name: string;
  stage: string;
  content: string;
  created_at: string;
  is_final: boolean;
}

export interface AssembledDocumentResponse {
  plan_id: string;
  sections: AssembledDocumentSection[];
  markdown: string;
  word_count: number;
  section_count: number;
  last_updated: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  planexe_version: string;
  available_models: number;
}

export type AnalysisStreamChunkKind = 'text' | 'reasoning' | 'json';

export interface AnalysisStreamRequestPayload {
  taskId: string;
  modelKey: string;
  prompt: string;
  context?: string;
  metadata?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  reasoningSummary?: string;
  textVerbosity?: string;
  schemaName?: string;
  schemaModel?: string;
  previousResponseId?: string;
  systemPrompt?: string;
  stage?: string;
}

export interface AnalysisStreamSession {
  sessionId: string;
  taskId: string;
  modelKey: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface AnalysisStreamInitPayload {
  sessionId: string;
  connectedAt: string;
  expiresAt: string;
  taskId: string;
  modelKey: string;
}

export interface AnalysisStreamStatusPayload {
  status: string;
  message?: string;
  startedAt?: string;
  interactionId?: number;
  taskId: string;
  modelKey: string;
}

export interface AnalysisStreamChunkPayload {
  kind: AnalysisStreamChunkKind;
  delta: string;
  timestamp: string;
  taskId: string;
  modelKey: string;
}

export interface AnalysisStreamSummary {
  analysis?: string | null;
  reasoning?: string | null;
  parsed?: unknown;
  tokenUsage?: Record<string, unknown>;
  responseId?: string | null;
  previousResponseId?: string | null;
}

export interface AnalysisStreamCompletePayload {
  sessionId: string;
  taskId: string;
  modelKey: string;
  responseSummary: AnalysisStreamSummary;
  deltas: Record<string, string[]>;
  metadata: Record<string, unknown>;
}

export interface AnalysisStreamErrorPayload {
  error: string | Record<string, unknown>;
  timestamp: string;
  taskId: string;
  modelKey: string;
}

export type AnalysisStreamServerEvent =
  | { event: 'stream.init'; data: AnalysisStreamInitPayload }
  | { event: 'stream.status'; data: AnalysisStreamStatusPayload }
  | { event: 'stream.chunk'; data: AnalysisStreamChunkPayload }
  | { event: 'stream.complete'; data: AnalysisStreamCompletePayload }
  | { event: 'stream.error'; data: AnalysisStreamErrorPayload };

export const STREAMING_ENABLED =
  (process.env.NEXT_PUBLIC_STREAMING_ENABLED ?? 'true').toLowerCase() === 'true';

export interface ConversationCreateRequestPayload {
  modelKey: string;
  conversationId?: string;
}

export interface ConversationCreateResponsePayload {
  conversation_id: string;
  model_key: string;
  created: boolean;
}

export interface ConversationTurnRequestPayload {
  modelKey: string;
  userMessage: string;
  previousResponseId?: string;
  instructions?: string;
  metadata?: Record<string, unknown>;
  reasoningEffort?: 'low' | 'medium' | 'high';
  reasoningSummary?: string;
  textVerbosity?: string;
  store?: boolean;
  schemaName?: string;
  schemaModel?: string;
}

export interface ConversationRequestSession {
  token: string;
  conversation_id: string;
  model_key: string;
  expires_at: string;
  ttl_seconds: number;
}

export interface ConversationResponseCreatedPayload {
  conversation_id: string;
  model_key: string;
  session_id: string;
  created_at: string;
  response_id?: string;
}

export interface ConversationResponseTextDeltaPayload {
  conversation_id: string;
  model_key: string;
  session_id: string;
  response_id?: string;
  delta?: string;
  aggregated?: string;
}

export interface ConversationResponseReasoningDeltaPayload {
  conversation_id: string;
  model_key: string;
  session_id: string;
  response_id?: string;
  delta?: string;
  aggregated?: string;
}

export interface ConversationResponseJsonDeltaPayload {
  conversation_id: string;
  model_key: string;
  session_id: string;
  response_id?: string;
  delta: Record<string, unknown>;
}

export interface ConversationResponseCompletedPayload {
  conversation_id: string;
  model_key: string;
  session_id: string;
  response_id?: string;
  completed_at?: string;
  usage?: Record<string, unknown>;
}

export interface ConversationResponseErrorPayload {
  conversation_id: string;
  model_key: string;
  session_id: string;
  response_id?: string;
  message: string;
}

export interface ConversationFinalPayload {
  conversation_id: string;
  model_key: string;
  session_id: string;
  response: Record<string, unknown>;
  summary: {
    response_id?: string;
    text: string;
    reasoning: string;
    json: Array<Record<string, unknown>>;
    usage: Record<string, unknown>;
  };
}

export type ConversationStreamServerEvent =
  | { event: 'response.created'; data: ConversationResponseCreatedPayload }
  | { event: 'response.output_text.delta'; data: ConversationResponseTextDeltaPayload }
  | { event: 'response.reasoning_summary_text.delta'; data: ConversationResponseReasoningDeltaPayload }
  | { event: 'response.output_json.delta'; data: ConversationResponseJsonDeltaPayload }
  | { event: 'response.completed'; data: ConversationResponseCompletedPayload }
  | { event: 'response.error'; data: ConversationResponseErrorPayload }
  | { event: 'final'; data: ConversationFinalPayload };

export interface ConversationFinalizeResponse {
  conversation_id: string;
  response_id?: string | null;
  model_key: string;
  aggregated_text: string;
  reasoning_text: string;
  json_chunks: Array<Record<string, unknown>>;
  usage: Record<string, unknown>;
  completed_at?: string | null;
}

// WebSocket Message Types
export interface WebSocketLogMessage {
  type: 'log';
  message: string;
  timestamp: string;
}

export interface WebSocketStatusMessage {
  type: 'status';
  status: string;
  message?: string;
  progress_percentage?: number;
  timestamp: string;
}

export interface WebSocketErrorMessage {
  type: 'error';
  message: string;
  timestamp: string;
}

export interface WebSocketStreamEndMessage {
  type: 'stream_end';
  message: string;
  timestamp: string;
}

export interface WebSocketHeartbeatMessage {
  type: 'heartbeat';
  timestamp: string;
}

export interface WebSocketRawMessage {
  type: 'raw';
  message: string;
  timestamp: string;
}

export interface WebSocketLLMStreamMessage {
  type: 'llm_stream';
  plan_id: string;
  stage: string;
  interaction_id: number;
  event: 'start' | 'text_delta' | 'reasoning_delta' | 'final' | 'end';
  sequence: number;
  timestamp: string;
  data: Record<string, unknown> & {
    delta?: string;
    text?: string;
    reasoning?: string;
    usage?: Record<string, unknown>;
    status?: string;
    error?: string;
    prompt_preview?: string;
  };
}

export type WebSocketMessage =
  | WebSocketLogMessage
  | WebSocketStatusMessage
  | WebSocketErrorMessage
  | WebSocketStreamEndMessage
  | WebSocketHeartbeatMessage
  | WebSocketLLMStreamMessage
  | WebSocketRawMessage;

// WebSocket Client for real-time progress (replaces unreliable SSE)
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Array<(data: WebSocketMessage | CloseEvent) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private planId: string;

  constructor(planId: string) {
    this.planId = planId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = createWebSocketUrl(this.planId);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            this.emit('message', data);
          } catch {
            // If not JSON, emit as raw message
            this.emit('message', { type: 'raw', message: event.data, timestamp: new Date().toISOString() });
          }
        };

        this.ws.onerror = (error: Event) => {
          this.emit('error', error as CloseEvent);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.emit('close', event);
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Exponential backoff, max 30s

    setTimeout(() => {
      this.connect().catch(() => {
        // Silent fail - let the UI handle reconnection status
      });
    }, this.reconnectDelay);
  }

  on(event: string, callback: (data: WebSocketMessage | CloseEvent) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: WebSocketMessage | CloseEvent) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: WebSocketMessage | CloseEvent) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Simple, Clean FastAPI Client
export class FastAPIClient {
  private baseURL: string;

  constructor(baseURL?: string) {
    const normalized = (baseURL ?? '').trim();
    this.baseURL = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  // Health Check
  async getHealth(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseURL}/health`);
    return this.handleResponse<HealthResponse>(response);
  }

  // Get available LLM models
  async getModels(): Promise<LLMModel[]> {
    const response = await fetch(`${this.baseURL}/api/models`);
    return this.handleResponse<LLMModel[]>(response);
  }

  // Get frontend configuration
  async getConfig(): Promise<{
    reasoning_effort_streaming_default: string;
    reasoning_effort_conversation_default: string;
    reasoning_summary_default: string;
    text_verbosity_default: string;
    max_output_tokens_default: number | null;
    streaming_enabled: boolean;
    version: string;
  }> {
    const response = await fetch(`${this.baseURL}/api/config`);
    return this.handleResponse(response);
  }

  // Create new plan
  async createPlan(request: CreatePlanRequest): Promise<PlanResponse> {
    const response = await fetch(`${this.baseURL}/api/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    return this.handleResponse<PlanResponse>(response);
  }

  async relaunchPlan(previousPlan: PlanResponse, options: RelaunchPlanOptions = {}): Promise<PlanResponse> {
    if (!previousPlan?.prompt) {
      throw new Error('Cannot relaunch plan without the original prompt text.');
    }

    // Get the default reasoning effort from backend
    const defaults = await getStreamingDefaults();
    const defaultReasoningEffort = defaults.reasoningEffort;

    const request: CreatePlanRequest = {
      prompt: previousPlan.prompt,
      speed_vs_detail: options.speedVsDetail ?? 'balanced_speed_and_detail',
      reasoning_effort: options.reasoningEffort ?? previousPlan.reasoning_effort ?? defaultReasoningEffort,
    };

    if (options.llmModel) {
      request.llm_model = options.llmModel;
    }

    return this.createPlan(request);
  }

  // Get plan status
  async getPlan(plan_id: string): Promise<PlanResponse> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}`);
    return this.handleResponse<PlanResponse>(response);
  }

  // Get plan files
  async getPlanFiles(plan_id: string): Promise<PlanFilesResponse> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}/files`);
    return this.handleResponse<PlanFilesResponse>(response);
  }

  async getPlanArtefacts(plan_id: string): Promise<PlanArtefactListResponse> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}/artefacts`);
    return this.handleResponse<PlanArtefactListResponse>(response);
  }

  async getFallbackReport(plan_id: string): Promise<FallbackReportResponse> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}/fallback-report`);
    return this.handleResponse<FallbackReportResponse>(response);
  }

  async getAssembledDocument(plan_id: string): Promise<AssembledDocumentResponse> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}/assembled-document`);
    return this.handleResponse<AssembledDocumentResponse>(response);
  }

  // Download specific file
  async downloadFile(plan_id: string, filename: string): Promise<Blob> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}/files/${filename}`);
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const detail = bodyText.trim() || response.statusText || 'Unknown error';
      throw new Error(`HTTP ${response.status} downloading file: ${detail}`);
    }
    return response.blob();
  }

  // Download HTML report
  async downloadReport(plan_id: string): Promise<Blob> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}/report`);
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const detail = bodyText.trim() || response.statusText || 'Unknown error';
      throw new Error(`HTTP ${response.status} downloading report: ${detail}`);
    }
    return response.blob();
  }

  // Get structured report data as JSON
  async getStructuredReport(plan_id: string): Promise<StructuredReportResponse> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}/report`, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const detail = bodyText.trim() || response.statusText || 'Unknown error';
      throw new Error(`HTTP ${response.status} getting structured report: ${detail}`);
    }
    return response.json();
  }

  // Cancel plan
  async cancelPlan(plan_id: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseURL}/api/plans/${plan_id}`, {
      method: 'DELETE',
    });
    return this.handleResponse<{ message: string }>(response);
  }

  // Get all plans
  async getPlans(): Promise<PlanResponse[]> {
    const response = await fetch(`${this.baseURL}/api/plans`);
    return this.handleResponse<PlanResponse[]>(response);
  }

  async ensureConversation(
    payload: ConversationCreateRequestPayload,
  ): Promise<ConversationCreateResponsePayload> {
    const body: Record<string, unknown> = {
      model_key: payload.modelKey,
    };
    if (payload.conversationId) {
      body.conversation_id = payload.conversationId;
    }

    const url = `${this.baseURL}/api/conversations`;
    console.log('[FastAPIClient] POST', url);
    console.log('[FastAPIClient] Request body:', body);
    console.log('[FastAPIClient] Base URL:', this.baseURL);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[FastAPIClient] Response status:', response.status, response.statusText);
    const result = await this.handleResponse<ConversationCreateResponsePayload>(response);
    console.log('[FastAPIClient] Response data:', result);
    return result;
  }

  async createConversationRequest(
    conversation_id: string,
    payload: ConversationTurnRequestPayload,
  ): Promise<ConversationRequestSession> {
    const defaults = await getConversationDefaults();
    const body: Record<string, unknown> = {
      model_key: payload.modelKey,
      user_message: payload.userMessage,
      reasoning_effort: payload.reasoningEffort ?? defaults.reasoningEffort,
      reasoning_summary: payload.reasoningSummary ?? defaults.reasoningSummary,
      text_verbosity: payload.textVerbosity ?? defaults.textVerbosity,
      store: payload.store ?? true,
    };
    if (payload.previousResponseId) body.previous_response_id = payload.previousResponseId;
    if (payload.instructions) body.instructions = payload.instructions;
    if (payload.metadata) body.metadata = payload.metadata;
    if (payload.schemaName) body.schema_name = payload.schemaName;
    if (payload.schemaModel) body.schema_model = payload.schemaModel;

    const response = await fetch(
      `${this.baseURL}/api/conversations/${encodeURIComponent(conversation_id)}/requests`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    return this.handleResponse<ConversationRequestSession>(response);
  }

  buildConversationStreamUrl(conversation_id: string, token: string, model_key: string): string {
    const params = new URLSearchParams({
      token,
      modelKey: model_key,
    });
    return `${this.baseURL}/api/conversations/${encodeURIComponent(conversation_id)}/stream?${params.toString()}`;
  }

  startConversationStream(conversation_id: string, token: string, model_key: string): EventSource {
    const url = this.buildConversationStreamUrl(conversation_id, token, model_key);
    return new EventSource(url);
  }

  async finalizeConversation(conversation_id: string): Promise<ConversationFinalizeResponse> {
    const response = await fetch(`${this.baseURL}/api/conversations/${encodeURIComponent(conversation_id)}/finalize`, {
      method: 'POST',
    });
    return this.handleResponse<ConversationFinalizeResponse>(response);
  }

  async followupConversation(
    conversation_id: string,
    payload: ConversationTurnRequestPayload,
  ): Promise<ConversationFinalizeResponse> {
    const defaults = await getConversationDefaults();
    const body: Record<string, unknown> = {
      model_key: payload.modelKey,
      user_message: payload.userMessage,
      reasoning_effort: payload.reasoningEffort ?? defaults.reasoningEffort,
      reasoning_summary: payload.reasoningSummary ?? defaults.reasoningSummary,
      text_verbosity: payload.textVerbosity ?? defaults.textVerbosity,
      store: payload.store ?? true,
    };
    if (payload.previousResponseId) body.previous_response_id = payload.previousResponseId;
    if (payload.instructions) body.instructions = payload.instructions;
    if (payload.metadata) body.metadata = payload.metadata;
    if (payload.schemaName) body.schema_name = payload.schemaName;
    if (payload.schemaModel) body.schema_model = payload.schemaModel;

    const response = await fetch(
      `${this.baseURL}/api/conversations/${encodeURIComponent(conversation_id)}/followups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    return this.handleResponse<ConversationFinalizeResponse>(response);
  }

  async createAnalysisStream(
    payload: AnalysisStreamRequestPayload,
  ): Promise<AnalysisStreamSession> {
    const defaults = await getStreamingDefaults();
    const body: Record<string, unknown> = {
      task_id: payload.taskId,
      model_key: payload.modelKey,
      prompt: payload.prompt,
      reasoning_effort: payload.reasoningEffort ?? defaults.reasoningEffort,
      reasoning_summary: payload.reasoningSummary ?? defaults.reasoningSummary,
      text_verbosity: payload.textVerbosity ?? defaults.textVerbosity,
    };

    if (payload.context) body.context = payload.context;
    if (payload.metadata) body.metadata = payload.metadata;
    if (typeof payload.temperature === 'number') body.temperature = payload.temperature;
    const maxOutputTokens =
      typeof payload.maxOutputTokens === 'number'
        ? payload.maxOutputTokens
        : defaults.maxOutputTokens;
    if (typeof maxOutputTokens === 'number') {
      body.max_output_tokens = maxOutputTokens;
    }
    if (payload.schemaName) body.schema_name = payload.schemaName;
    if (payload.schemaModel) body.schema_model = payload.schemaModel;
    if (payload.previousResponseId) {
      body.previous_response_id = payload.previousResponseId;
    }
    if (payload.systemPrompt) body.system_prompt = payload.systemPrompt;
    if (payload.stage) body.stage = payload.stage;

    const response = await fetch(`${this.baseURL}/api/stream/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return this.handleResponse<AnalysisStreamSession>(response);
  }

  // WebSocket for Real-time Progress (replaces unreliable SSE)
  streamProgress(plan_id: string): WebSocketClient {
    return new WebSocketClient(plan_id);
  }

  // Utility: Download blob as file
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Default client instance
const resolvedBaseUrl = getApiBaseUrl();
console.log('[FastAPIClient] Initializing with base URL:', resolvedBaseUrl);
export const fastApiClient = new FastAPIClient(resolvedBaseUrl);

// Types are already exported above with their interface declarations
