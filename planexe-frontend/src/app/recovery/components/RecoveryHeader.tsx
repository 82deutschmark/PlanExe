/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Present the recovery workspace header, status bar, and plan summary card
 *          so users immediately see live connectivity and progress signals.
 * SRP and DRY check: Pass - focuses on layout/formatting only, relying on the
 *          recovery hook for data and actions.
 */
'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Home, Radio, RefreshCw, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PlanResponse } from '@/lib/api/fastapi-client';
import { parseBackendDate } from '@/lib/utils/date';

import { RecoveryConnectionState, StatusDisplay } from '../useRecoveryPlan';

interface RecoveryHeaderProps {
  planId: string;
  plan: PlanResponse | null;
  planError: string | null;
  planLoading: boolean;
  statusDisplay: StatusDisplay | null;
  connection: RecoveryConnectionState;
  lastWriteAt: Date | null;
  onRefreshPlan: () => Promise<void>;
  onRelaunch: () => void | Promise<void>;
}

const describeConnection = (connection: RecoveryConnectionState): { label: string; tone: 'good' | 'warn' | 'idle'; detail: string } => {
  if (connection.status === 'error') {
    return {
      label: 'Polling',
      tone: 'warn',
      detail: connection.error ?? 'Live stream unavailable; refreshing via polling.',
    };
  }

  if (connection.status === 'connected' && connection.mode === 'websocket') {
    const last = connection.lastEventAt || connection.lastHeartbeatAt;
    const detail = last ? `Live · last event ${formatDistanceToNow(last, { addSuffix: true })}` : 'Live updates active';
    return {
      label: 'Live',
      tone: 'good',
      detail,
    };
  }

  if (connection.status === 'closed') {
    return {
      label: 'Complete',
      tone: 'idle',
      detail: 'Pipeline finished streaming.',
    };
  }

  return {
    label: 'Polling',
    tone: 'idle',
    detail: 'Refreshing every few seconds.',
  };
};

export const RecoveryHeader: React.FC<RecoveryHeaderProps> = ({
  planId,
  plan,
  planError,
  planLoading,
  statusDisplay,
  connection,
  lastWriteAt,
  onRefreshPlan,
  onRelaunch,
}) => {
  const connectionMeta = useMemo(() => describeConnection(connection), [connection]);
  const lastWriteDescription = useMemo(() => {
    if (!lastWriteAt) {
      return 'No artefacts yet';
    }
    return `Last artefact ${formatDistanceToNow(lastWriteAt, { addSuffix: true })}`;
  }, [lastWriteAt]);
  const planCreatedAt = useMemo(() => parseBackendDate(plan?.created_at ?? null), [plan?.created_at]);

  return (
    <>
      <header className="border-b border-amber-300 bg-white/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-amber-900">Plan Assembly Workspace</h1>
            <p className="text-sm text-amber-700">
              Watch your plan being built in real-time with live streaming and progress monitoring.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to Dashboard
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void onRefreshPlan();
              }}
              disabled={planLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {planLoading ? 'Refreshing...' : 'Refresh Plan'}
            </Button>
            <Button variant="default" size="sm" onClick={() => void onRelaunch()} disabled={!plan || planLoading}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Resume Missing Sections
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <Card className="border-amber-300">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4 pb-3">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="font-mono text-base text-amber-900">{planId}</span>
                {statusDisplay && (
                  <Badge className={`${statusDisplay.badgeClass} flex items-center gap-1`}>
                    {statusDisplay.icon}
                    {statusDisplay.label}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-3 text-xs text-amber-700">
                <span className={connectionMeta.tone === 'good' ? 'text-emerald-600' : connectionMeta.tone === 'warn' ? 'text-orange-600' : 'text-amber-700'}>
                  <Radio className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {connectionMeta.detail}
                </span>
                <span>{lastWriteDescription}</span>
              </div>
            </div>
            <div className="flex flex-col items-end text-sm text-amber-900">
              {plan ? (
                <>
                  <span className="font-semibold">Progress: {Math.round(plan.progress_percentage ?? 0)}%</span>
                  {plan.progress_message && (
                    <span className="mt-1 max-w-sm text-xs text-amber-700">{plan.progress_message}</span>
                  )}
                  <span className="mt-1 text-xs text-amber-700">
                    Created {planCreatedAt ? planCreatedAt.toLocaleString() : 'Unknown'}
                  </span>
                </>
              ) : planError ? (
                <span className="text-xs text-red-600">{planError}</span>
              ) : (
                <span className="text-xs text-amber-700">Waiting for plan metadata...</span>
              )}
            </div>
          </CardHeader>
          {plan?.error_message && (
            <CardContent>
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {plan.error_message}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
};
