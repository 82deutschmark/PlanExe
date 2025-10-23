/**
 * Author: gpt-5-codex
 * Date: 2025-10-23
 * PURPOSE: Shared type definitions for recovery workspace hooks and UI components.
 * SRP and DRY check: Pass - consolidates recovery-related types for reuse across hooks and components.
 */

import type { ReactElement } from 'react';

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
  status: 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
  lastEventAt: Date | null;
  lastHeartbeatAt: Date | null;
  error?: string | null;
}

export type StreamStatus = 'running' | 'completed' | 'failed';

export interface StreamEventRecord {
  sequence: number;
  event: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface LLMStreamUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
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
  usage?: LLMStreamUsage;
  rawPayload?: Record<string, unknown> | null;
  status: StreamStatus;
  error?: string;
  lastUpdated: number;
  promptPreview?: string | null;
  events: StreamEventRecord[];
}
