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

export const StageTimeline: React.FC<StageTimelineProps> = ({ stages, isLoading, connection }) => {
  const connectionMeta = resolveConnectionLabel(connection);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stage Progress</CardTitle>
        <CardDescription className="text-sm">
          Stages light up as soon as artefacts land in <span className="font-mono text-xs">plan_content</span>.
        </CardDescription>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
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
          <span>{connectionMeta.detail}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && stages.length === 0 ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-9 w-full animate-pulse rounded-md border border-slate-200 bg-slate-100"
            />
          ))
        ) : (
          stages.map((stage) => {
            const isComplete = stage.count > 0;
            return (
              <div
                key={stage.key}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-slate-700">{stage.label}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {stage.count} artefact{stage.count === 1 ? '' : 's'}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
