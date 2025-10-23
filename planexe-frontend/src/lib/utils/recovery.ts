/**
 * Author: gpt-5-codex
 * Date: 2025-10-23
 * PURPOSE: Shared helper functions for recovery workspace data normalization and presentation.
 * SRP and DRY check: Pass - centralizes reusable helpers previously duplicated in hooks/components.
 */

import { createElement } from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';

import type { PlanArtefactListResponse, PlanResponse } from '@/lib/api/fastapi-client';
import type { PlanFile } from '@/lib/types/pipeline';
import type { StatusDisplay } from '@/lib/types/recovery';

export const KNOWN_STAGE_ORDER: string[] = [
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

export const STAGE_LABELS: Record<string, string> = {
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

export const normaliseStageKey = (stage?: string | null): string => {
  if (!stage || typeof stage !== 'string' || stage.trim() === '') {
    return 'unknown';
  }
  return stage.trim().toLowerCase();
};

export const normaliseStageLabel = (stage?: string | null): string => {
  const key = normaliseStageKey(stage);
  if (STAGE_LABELS[key]) {
    return STAGE_LABELS[key];
  }
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const normaliseIsoString = (value?: string | null): string | null => {
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

export const getStatusDisplay = (status: PlanResponse['status']): StatusDisplay => {
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

export const mapArtefacts = (response: PlanArtefactListResponse): PlanFile[] => {
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

export const isTextRenderable = (file: PlanFile): boolean => {
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

export function sanitizeStreamPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  return data as Record<string, unknown>;
}

export function appendReasoningChunk(buffer: { text: string; reasoning: string }, delta: string): void {
  if (buffer.reasoning) {
    buffer.reasoning = `${buffer.reasoning}\n${delta}`;
  } else {
    buffer.reasoning = delta;
  }
}

