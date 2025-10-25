/**
 * Author: Cascade (gpt-5-codex)
 * Date: 2025-10-24T00:05:00Z
 * PURPOSE: Summarise prior LLM interactions on the recovery workspace so operators
 *          can review recent outputs and reasoning without opening the terminal.
 * SRP and DRY check: Pass - purely presentational; consumes state prepared by
 *          useRecoveryPlan and mirrors Terminal styling for consistency.
 */

'use client';

import type { FC, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { LLMStreamState } from '../useRecoveryPlan';

interface StreamHistoryPanelProps {
  streams: LLMStreamState[];
  activeStreamId?: number | null;
}

const EMPTY_MESSAGE = "No completed interactions yet. Once Luigi finishes a call it will appear here.";

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

export const StreamHistoryPanel: FC<StreamHistoryPanelProps> = ({ streams, activeStreamId }) => {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <Card className="border-slate-700 bg-slate-900/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-50">
            <History className="h-4 w-4" />
            Stream History
          </CardTitle>
          <span className="text-xs text-slate-500">{streams.length} interaction{streams.length === 1 ? '' : 's'}</span>
        </div>
        <p className="text-xs text-slate-400">
          Completed or failed interactions are listed below. Expand any card to inspect its final reply and reasoning.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {streams.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">{EMPTY_MESSAGE}</div>
        ) : (
          streams.map((stream) => {
            const isActive = activeStreamId != null && stream.interactionId === activeStreamId;
            const isExpanded = expandedIds.has(stream.interactionId);
            const assembledText = stream.finalText ?? stream.textBuffer ?? stream.textDeltas.join('');
            const assembledReasoning =
              stream.finalReasoning ?? stream.reasoningBuffer ?? stream.reasoningDeltas.join('\n');

            return (
              <div
                key={stream.interactionId}
                className={`rounded-lg border px-3 py-2 transition-colors ${
                  isActive
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : 'border-slate-700 bg-slate-950/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(stream.interactionId)}
                  className="flex w-full items-center justify-between text-left text-sm text-slate-100"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-50">{stream.stage}</span>
                    <span className="text-[11px] text-slate-400">
                      Interaction #{stream.interactionId} · {stream.status}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                {isExpanded && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-sky-200">Model Output</p>
                      <div className="bg-slate-950/80 border border-sky-800/70 rounded p-2 text-xs text-sky-100 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {assembledText || '—'}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-rose-200">Reasoning</p>
                      <div className="bg-slate-950/80 border border-rose-800/70 rounded p-2 text-xs text-rose-100 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {assembledReasoning || '—'}
                      </div>
                    </div>
                    {stream.error && (
                      <div className="md:col-span-2 text-[11px] text-rose-300">Error: {stream.error}</div>
                    )}
                    {stream.usage && (
                      <div className="md:col-span-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-300">Usage</p>
                        <div className="mt-1 space-y-2">
                          {(Object.entries(stream.usage) as Array<[string, unknown]>).map(([key, value]) => {
                            const usageContent = renderUsageValue(value);
                            return (
                              <div key={key} className="rounded border border-slate-700/70 bg-slate-900/60 p-2">
                                <p className="text-[11px] font-semibold text-slate-50 uppercase tracking-wide">{key}</p>
                                <div className="mt-1 text-slate-100">{usageContent}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
