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
    <Card className="border-amber-600 bg-slate-900/90 shadow-lg">
      <CardHeader className="pb-1 px-3 pt-3 border-b border-amber-500/30">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5 text-xs text-amber-400">
            <History className="h-3.5 w-3.5" />
            Stream History
          </CardTitle>
          <span className="text-[10px] text-amber-300">{streams.length}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 px-3 pb-3">
        {streams.length === 0 ? (
          <div className="rounded border border-amber-500/30 bg-slate-950/60 p-2 text-xs text-amber-200">{EMPTY_MESSAGE}</div>
        ) : (
          streams.map((stream) => {
            const isActive = activeStreamId != null && stream.interactionId === activeStreamId;
            const isExpanded = expandedIds.has(stream.interactionId);
            const assembledText = stream.finalText ?? stream.textBuffer ?? '';
            const assembledReasoning = stream.finalReasoning ?? stream.reasoningBuffer ?? '';

            return (
              <div
                key={stream.interactionId}
                className={`rounded border px-2 py-1.5 transition-colors ${
                  isActive
                    ? 'border-green-400 bg-green-900/20'
                    : 'border-amber-500/40 bg-slate-950/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(stream.interactionId)}
                  className="flex w-full items-center justify-between text-left text-xs text-slate-100"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-amber-300">{stream.stage}</span>
                    <span className="text-[10px] text-amber-200/60">
                      #{stream.interactionId} · {stream.status}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-amber-400" /> : <ChevronDown className="h-3.5 w-3.5 text-amber-400" />}
                </button>

                {isExpanded && (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-amber-400">Output</p>
                      <div className="bg-slate-950/80 border border-amber-500/40 rounded p-1.5 text-[11px] text-amber-50 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {assembledText || '—'}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-orange-400">Reasoning</p>
                      <div className="bg-slate-950/80 border border-orange-500/40 rounded p-1.5 text-[11px] text-orange-50 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {assembledReasoning || '—'}
                      </div>
                    </div>
                    {stream.error && (
                      <div className="md:col-span-2 text-[10px] text-rose-300">Error: {stream.error}</div>
                    )}
                    {stream.usage && (
                      <div className="md:col-span-2">
                        <p className="text-[10px] uppercase tracking-wide text-amber-300">Usage</p>
                        <div className="mt-1 space-y-1">
                          {(Object.entries(stream.usage) as Array<[string, unknown]>).map(([key, value]) => {
                            const usageContent = renderUsageValue(value);
                            return (
                              <div key={key} className="rounded border border-amber-500/30 bg-slate-900/60 p-1.5">
                                <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide">{key}</p>
                                <div className="mt-0.5 text-amber-100">{usageContent}</div>
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
