/**
 * Author: Cascade (gpt-5-codex)
 * Date: 2025-10-24T00:05:00Z
 * PURPOSE: Summarise prior LLM interactions on the recovery workspace so operators
 *          can review recent outputs and reasoning without opening the terminal.
 * SRP and DRY check: Pass - purely presentational; consumes state prepared by
 *          useRecoveryPlan and mirrors Terminal styling for consistency.
 */

'use client';

import React from 'react';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { LLMStreamState } from '../useRecoveryPlan';

interface StreamHistoryPanelProps {
  streams: LLMStreamState[];
  activeStreamId?: number | null;
}

const EMPTY_MESSAGE = "No completed interactions yet. Once Luigi finishes a call it will appear here.";

export const StreamHistoryPanel: React.FC<StreamHistoryPanelProps> = ({ streams, activeStreamId }) => {
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set());

  const toggle = React.useCallback((id: number) => {
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
    <Card className="border-slate-800 bg-slate-950/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
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
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">{EMPTY_MESSAGE}</div>
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
                  isActive ? 'border-emerald-400 bg-emerald-50/10' : 'border-slate-800 bg-slate-950/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(stream.interactionId)}
                  className="flex w-full items-center justify-between text-left text-sm text-slate-200"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-100">{stream.stage}</span>
                    <span className="text-[11px] text-slate-500">
                      Interaction #{stream.interactionId} · {stream.status}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                {isExpanded && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase text-slate-500 tracking-wide">Model Output</p>
                      <div className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {assembledText || '—'}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-slate-500 tracking-wide">Reasoning</p>
                      <div className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {assembledReasoning || '—'}
                      </div>
                    </div>
                    {stream.error && (
                      <div className="md:col-span-2 text-[11px] text-red-400">Error: {stream.error}</div>
                    )}
                    {stream.usage && (
                      <div className="md:col-span-2">
                        <p className="text-[11px] uppercase text-slate-500 tracking-wide">Usage</p>
                        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                          {Object.entries(stream.usage).map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-2">
                              <span className="font-semibold text-slate-400">{key}</span>
                              <span className="text-slate-200">{String(value)}</span>
                            </div>
                          ))}
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
