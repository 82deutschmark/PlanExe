/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Render plan recovery stage progress with live connection cues so users
 *          can see artefacts landing in real time.
 * SRP and DRY check: Pass - purely presentational; consumes summaries from the
 *          useRecoveryPlan hook without duplicating data logic.
 */
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

import { RecoveryConnectionState, StageSummary } from '../useRecoveryPlan';

interface StageTimelineProps {
  stages: StageSummary[];
  isLoading: boolean;
  connection: RecoveryConnectionState;
  activeStageKey?: string | null;
}

const resolveConnectionLabel = (connection: RecoveryConnectionState): { label: string; tone: 'live' | 'polling' | 'error' | 'idle'; detail: string } => {
  if (connection.status === 'error') {
    return {
      label: 'Polling',
      tone: 'error',
      detail: connection.error ? connection.error : 'Live stream unavailable; falling back to polling.',
    };
  }

  if (connection.status === 'connected' && connection.mode === 'websocket') {
    const last = connection.lastEventAt || connection.lastHeartbeatAt;
    const detail = last ? `Live · last event ${formatDistanceToNow(last, { addSuffix: true })}` : 'Live connection established';
    return { label: 'Live', tone: 'live', detail };
  }

  if (connection.status === 'closed' && connection.mode === 'websocket') {
    return {
      label: 'Live (completed)',
      tone: 'idle',
      detail: 'Pipeline finished streaming updates.',
    };
  }

  return {
    label: 'Polling',
    tone: 'polling',
    detail: 'Refreshing artefacts every 5s.',
  };
};

export const StageTimeline: React.FC<StageTimelineProps> = ({ stages, isLoading, connection, activeStageKey = null }) => {
  const connectionMeta = resolveConnectionLabel(connection);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-1 px-3 pt-3">
        <CardTitle className="text-sm">Stage Progress</CardTitle>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span
            className={
              connectionMeta.tone === 'live'
                ? 'text-emerald-600'
                : connectionMeta.tone === 'error'
                ? 'text-amber-600'
                : 'text-slate-500'
            }
            aria-live="polite"
          >
            ● {connectionMeta.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3">
        {isLoading && stages.length === 0 ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-7 w-full animate-pulse rounded border border-slate-200 bg-slate-100"
            />
          ))
        ) : (
          stages.map((stage) => {
            const isComplete = stage.count > 0;
            const isActive = activeStageKey && stage.key === activeStageKey;
            return (
              <div
                key={stage.key}
                className={`flex items-center justify-between rounded border px-2 py-1 transition-colors ${
                  isActive
                    ? 'border-emerald-400 bg-emerald-50/60'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isActive ? 'bg-emerald-600 animate-pulse' : isComplete ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium text-slate-700">{stage.label}</span>
                </div>
                <span className="text-xs text-slate-500">{stage.count}</span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
