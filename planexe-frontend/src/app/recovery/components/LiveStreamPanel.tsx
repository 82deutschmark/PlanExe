/**
 * Author: Cascade (gpt-5-codex)
 * Date: 2025-10-24T00:00:00Z
 * PURPOSE: Display the currently streaming LLM interaction on the recovery page,
 *          mirroring the Terminal layout so operators can see live output and
 *          reasoning without leaving the workspace.
 * SRP and DRY check: Pass - strictly presentational; consumes stream state from
 *          useRecoveryPlan and reuses terminal styling patterns instead of duplicating logic elsewhere.
 */

'use client';

import type { FC, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import type { LLMStreamState } from '../useRecoveryPlan';

interface LiveStreamPanelProps {
  stream: LLMStreamState | null;
}

const STATUS_BADGE: Record<LLMStreamState['status'], string> = {
  running: 'bg-blue-500/20 text-blue-100 border border-blue-400/70 animate-pulse',
  completed: 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/70',
  failed: 'bg-rose-500/25 text-rose-100 border border-rose-400/70',
};

const formatUsageScalar = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
};

const renderUsageValue = (value: unknown): ReactNode => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-400">(empty)</span>;
    }
    return (
      <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-200">
        {value.map((item, index) => (
          <li key={index}>{formatUsageScalar(item)}</li>
        ))}
      </ul>
    );
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-slate-400">(empty)</span>;
    }
    return (
      <div className="mt-1 space-y-1">
        {entries.map(([nestedKey, nestedValue]) => (
          <div key={nestedKey} className="flex justify-between gap-3 text-[11px]">
            <span className="text-slate-300">{nestedKey}</span>
            <span className="text-slate-100">{formatUsageScalar(nestedValue)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-slate-100">{formatUsageScalar(value)}</span>;
};

export const LiveStreamPanel: FC<LiveStreamPanelProps> = ({ stream }) => {
  const assembledText = stream?.finalText ?? stream?.textBuffer ?? stream?.textDeltas.join('');
  const assembledReasoning =
    stream?.finalReasoning ?? stream?.reasoningBuffer ?? stream?.reasoningDeltas.join('\n');

  return (
    <Card className="border-slate-600 bg-slate-900/95 text-slate-50 shadow-inner">
      <CardHeader className="pb-1 px-3 pt-3">
        <CardTitle className="text-sm text-slate-50">Live LLM Stream</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {stream ? (
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-200">
                <span className="font-semibold text-slate-50">{stream.stage}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full uppercase tracking-wide text-[10px] ${STATUS_BADGE[stream.status]}`}
                >
                  {stream.status}
                </span>
              </div>
              {stream.promptPreview && (
                <p className="mt-0.5 text-[10px] text-slate-300 truncate">Prompt: {stream.promptPreview}</p>
              )}
              <div className="mt-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-sky-200">Model Output</p>
                <div className="bg-slate-950/80 border border-sky-800/70 rounded p-1.5 text-[11px] text-sky-100 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {assembledText || 'Awaiting tokens…'}
                </div>
              </div>
            </div>
            <div className="space-y-1 md:border-l md:border-slate-700 md:pl-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-rose-200">Reasoning Trace</p>
                <div className="bg-slate-950/80 border border-rose-800/70 rounded p-1.5 text-[11px] text-rose-100 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {assembledReasoning || 'Waiting for reasoning…'}
                </div>
              </div>
              {stream.error && <p className="text-[10px] text-rose-300">Error: {stream.error}</p>}
              {stream.usage && (
                <div className="mt-2 space-y-1 text-[10px] text-slate-200">
                  {(Object.entries(stream.usage) as Array<[string, unknown]>).map(([key, value]) => {
                    const usageContent = renderUsageValue(value);
                    return (
                      <div key={key} className="rounded border border-slate-700/70 bg-slate-900/70 p-1.5">
                        <p className="text-[10px] font-semibold text-slate-50 uppercase tracking-wide">
                          {key}
                        </p>
                        <div className="mt-0.5 text-slate-100">{usageContent}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded border border-slate-800 bg-slate-950/80 p-4 text-center text-sm text-slate-400">
            <Badge variant="outline" className="border-slate-700 text-slate-300">
              Idle
            </Badge>
            <p className="text-xs">No active LLM stream. Waiting for Luigi to dispatch an interaction.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
