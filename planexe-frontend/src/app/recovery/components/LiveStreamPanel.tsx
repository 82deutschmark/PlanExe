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

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import type { LLMStreamState } from '../useRecoveryPlan';

interface LiveStreamPanelProps {
  stream: LLMStreamState | null;
}

const STATUS_BADGE: Record<LLMStreamState['status'], string> = {
  running: 'bg-blue-600/20 text-blue-300 border border-blue-500/40 animate-pulse',
  completed: 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40',
  failed: 'bg-red-600/20 text-red-300 border border-red-500/40',
};

const formatUsageValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

export const LiveStreamPanel: React.FC<LiveStreamPanelProps> = ({ stream }) => {
  const assembledText = stream?.finalText ?? stream?.textBuffer ?? stream?.textDeltas.join('');
  const assembledReasoning =
    stream?.finalReasoning ?? stream?.reasoningBuffer ?? stream?.reasoningDeltas.join('\n');

  return (
    <Card className="border-slate-800 bg-slate-950/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-100">Live LLM Stream</CardTitle>
        <p className="text-xs text-slate-400">
          Shows the current interaction&apos;s reply and reasoning trace in real time.
        </p>
      </CardHeader>
      <CardContent>
        {stream ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-100">{stream.stage}</span>
                <span
                  className={`px-2 py-0.5 rounded-full uppercase tracking-wide text-[10px] ${STATUS_BADGE[stream.status]}`}
                >
                  {stream.status}
                </span>
              </div>
              {stream.promptPreview && (
                <p className="mt-1 text-[11px] text-slate-500 truncate">Prompt: {stream.promptPreview}</p>
              )}
              <div className="mt-3 space-y-1">
                <p className="text-[11px] uppercase text-slate-500 tracking-wide">Model Output</p>
                <div className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {assembledText || 'Awaiting tokens…'}
                </div>
              </div>
            </div>
            <div className="space-y-2 md:border-l md:border-slate-800 md:pl-4">
              <div>
                <p className="text-[11px] uppercase text-slate-500 tracking-wide">Reasoning Trace</p>
                <div className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {assembledReasoning || 'Waiting for reasoning…'}
                </div>
              </div>
              {stream.error && <p className="text-[11px] text-red-400">Error: {stream.error}</p>}
              {stream.usage && (
                <div className="space-y-1 text-[11px] text-slate-500">
                  {Object.entries(stream.usage).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <span className="font-semibold text-slate-400">{key}</span>
                      <span className="text-slate-300">{formatUsageValue(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-800 bg-slate-950/80 p-6 text-center text-sm text-slate-400">
            <Badge variant="outline" className="border-slate-700 text-slate-300">
              Idle
            </Badge>
            <p>No active LLM stream. As soon as Luigi dispatches a new interaction it will appear here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
