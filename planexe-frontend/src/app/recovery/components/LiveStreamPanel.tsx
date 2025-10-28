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
  const assembledText = stream?.finalText ?? stream?.textBuffer ?? '';
  const assembledReasoning = stream?.finalReasoning ?? stream?.reasoningBuffer ?? '';

  return (
    <Card className="border-gray-300 bg-white shadow-sm">
      <CardHeader className="pb-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <CardTitle className="text-xs font-medium text-gray-700">Current Task Stream</CardTitle>
      </CardHeader>
      <CardContent className="px-3 py-2">
        {stream ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-900">{stream.stage}</span>
              <span
                className={`px-2 py-0.5 rounded-full uppercase tracking-wide text-[10px] font-medium ${STATUS_BADGE[stream.status]}`}
              >
                {stream.status}
              </span>
            </div>
            <div className="grid gap-2 grid-cols-2">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Output</p>
                <div className="bg-gray-50 border border-gray-200 rounded p-1.5 text-[10px] text-gray-800 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {assembledText || 'Awaiting tokens…'}
                </div>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Reasoning</p>
                <div className="bg-blue-50 border border-blue-200 rounded p-1.5 text-[10px] text-blue-900 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {assembledReasoning || 'Waiting…'}
                </div>
              </div>
            </div>
            {stream.error && (
              <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded">Error: {stream.error}</p>
            )}
            {stream.usage && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Usage</p>
                <div className="text-[10px] text-gray-600">
                  {renderUsageValue(stream.usage)}
                </div>
              </div>
            )}
            {stream.events.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">Recent Events</p>
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {stream.events.slice(-3).map((event, idx) => (
                    <div key={idx} className="text-[9px] text-gray-600 flex justify-between">
                      <span className="font-mono">{event.event}</span>
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-center">
            <Badge variant="outline" className="border-gray-300 text-gray-600 text-[10px]">
              Idle
            </Badge>
            <p className="text-[10px] text-gray-500">Waiting for next task</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
