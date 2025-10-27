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
import { Home, RefreshCw, RotateCcw, Activity, Clock, Zap, Database, Wifi, WifiOff } from 'lucide-react';

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

import { RecoveryConnectionState, StatusDisplay, StageSummary, LLMStreamState } from '../useRecoveryPlan';
import { APITelemetryStrip } from './APITelemetryStrip';
import { LiveTaskTicker } from './LiveTaskTicker';

interface RecoveryHeaderProps {
  planId: string;
  plan: PlanResponse | null;
  planLoading: boolean;
  statusDisplay: StatusDisplay | null;
  connection: RecoveryConnectionState;
  lastWriteAt: Date | null;
  stageSummary: StageSummary[];
  activeStageKey: string | null;
  llmStreams: {
    active: LLMStreamState | null;
    history: LLMStreamState[];
  };
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
  planLoading,
  statusDisplay,
  connection,
  lastWriteAt,
  stageSummary,
  activeStageKey,
  llmStreams,
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

  // Calculate enhanced telemetry - use actual task count from stage summary
  const totalTasks = stageSummary.reduce((sum, stage) => sum + stage.count, 0);
  const completedTasks = Math.round((plan?.progress_percentage ?? 0) * totalTasks / 100);
  const pipelineVelocity = useMemo(() => {
    if (!planCreatedAt || completedTasks === 0) return 0;
    const elapsedMinutes = (Date.now() - planCreatedAt.getTime()) / (1000 * 60);
    return elapsedMinutes > 0 ? Math.round(completedTasks / elapsedMinutes * 10) / 10 : 0;
  }, [planCreatedAt, completedTasks]);
  
  const estimatedRemainingMinutes = pipelineVelocity > 0 ? Math.round((totalTasks - completedTasks) / pipelineVelocity) : null;

  // Calculate real token usage from streams
  const totalTokenUsage = useMemo(() => {
    const allStreams = [llmStreams.active, ...llmStreams.history].filter(Boolean) as LLMStreamState[];
    let totalTokens = 0;
    
    allStreams.forEach(stream => {
      if (stream.usage && typeof stream.usage === 'object') {
        const usage = stream.usage as Record<string, unknown>;
        if (typeof usage.total_tokens === 'number') {
          totalTokens += usage.total_tokens;
        }
      }
    });
    
    return totalTokens;
  }, [llmStreams]);

  // Real telemetry data from WebSocket streams
  const apiMetrics = useMemo(() => {
    const allStreams = [llmStreams.active, ...llmStreams.history].filter(Boolean) as LLMStreamState[];
    const completedStreams = allStreams.filter(s => s.status === 'completed');
    const failedStreams = allStreams.filter(s => s.status === 'failed');
    
    // Extract real response times from usage data
    const responseTimes: number[] = [];
    completedStreams.forEach(stream => {
      if (stream.usage && typeof stream.usage === 'object') {
        const usage = stream.usage as Record<string, unknown>;
        if (typeof usage.duration_seconds === 'number') {
          responseTimes.push(Math.round(usage.duration_seconds * 1000));
        }
      }
    });
    
    const lastResponseTime = responseTimes.length > 0 ? responseTimes[responseTimes.length - 1] : null;
    const averageResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;
    
    // Get the most recent error message
    const lastFailedStream = failedStreams[failedStreams.length - 1];
    const lastError = lastFailedStream?.error || null;
    
    return {
      totalCalls: allStreams.length,
      successfulCalls: completedStreams.length,
      failedCalls: failedStreams.length,
      currentModel: plan?.llm_model || 'gpt-4o-mini',
      lastResponseTime,
      averageResponseTime,
      providerStatus: connection.status === 'connected' ? 'connected' as const : 'error' as const,
      recentResponseTimes: responseTimes.slice(-Math.min(10, responseTimes.length)),
      lastError,
    };
  }, [llmStreams, plan?.llm_model, connection.status]);

  const currentTask = useMemo(() => {
    if (llmStreams.active) {
      const stream = llmStreams.active;
      const duration = stream.lastUpdated ? Math.round((Date.now() - stream.lastUpdated) / 1000) : 0;
      return {
        id: `task-${stream.interactionId}`,
        name: stream.stage ? `Processing ${stream.stage}` : 'LLM Interaction',
        stage: stream.stage || 'LLM Call',
        status: stream.status === 'running' ? 'running' as const : 
                stream.status === 'failed' ? 'failed' as const : 'completed' as const,
        startTime: stream.lastUpdated ? new Date(stream.lastUpdated - duration * 1000) : new Date(),
        duration,
        estimatedDuration: stream.usage && typeof stream.usage === 'object' && 
          'duration_seconds' in stream.usage 
          ? Math.round(Number((stream.usage as { duration_seconds?: unknown }).duration_seconds) * 1000) || null : null,
      };
    }
    
    // Fallback to stage-based task if no active stream
    if (activeStageKey && stageSummary.length > 0) {
      const activeStage = stageSummary.find(s => s.key === activeStageKey);
      return {
        id: 'task-stage',
        name: `Processing ${activeStage?.label || 'Unknown Stage'}`,
        stage: activeStage?.label || 'Unknown',
        status: 'running' as const,
        startTime: planCreatedAt || new Date(),
        duration: planCreatedAt ? Math.round((Date.now() - planCreatedAt.getTime()) / 1000) : 0,
        estimatedDuration: null,
      };
    }
    return null;
  }, [llmStreams.active, activeStageKey, stageSummary, planCreatedAt]);

  const queuedTasks = useMemo(() => {
    // Show upcoming stages as queued tasks
    if (activeStageKey) {
      const currentIndex = stageSummary.findIndex(s => s.key === activeStageKey);
      return stageSummary.slice(currentIndex + 1, currentIndex + 1 + Math.min(4, stageSummary.length - currentIndex - 1)).map((stage, index) => ({
        id: `task-queued-${index}`,
        name: `Process ${stage.label}`,
        stage: stage.label,
        status: 'queued' as const,
        startTime: null,
        duration: null,
        estimatedDuration: null,
      }));
    }
    
    // If no active stage, show first few as queued
    return stageSummary.slice(0, Math.min(3, stageSummary.length)).map((stage, index) => ({
      id: `task-queued-${index}`,
      name: `Process ${stage.label}`,
      stage: stage.label,
      status: 'queued' as const,
      startTime: null,
      duration: null,
      estimatedDuration: null,
    }));
  }, [stageSummary, activeStageKey]);

  // Stage tracker component
  const StageTracker = ({ stages, activeKey }: { stages: StageSummary[], activeKey: string | null }) => {
    const maxStagesToShow = Math.min(stages.length, stages.length); // Show all available stages
    const displayStages = stages.slice(0, maxStagesToShow);
    const totalRemainingCount = stages.slice(maxStagesToShow).reduce((sum, stage) => sum + stage.count, 0);
    
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {displayStages.map((stage) => (
          <Badge
            key={stage.key}
            variant={activeKey === stage.key ? "default" : "secondary"}
            className="text-xs px-2 py-0.5"
          >
            {stage.label} ({stage.count})
          </Badge>
        ))}
        {totalRemainingCount > 0 && (
          <Badge variant="outline" className="text-xs px-2 py-0.5">
            +{totalRemainingCount} more
          </Badge>
        )}
      </div>
    );
  };

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
          <CardHeader className="pb-3">
            {/* Compact grid layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left column: Plan meta and stage tracker */}
              <div className="space-y-3">
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
                      {connectionMeta.tone === 'good' ? <Wifi className="mr-1 inline h-3.5 w-3.5" /> : <WifiOff className="mr-1 inline h-3.5 w-3.5" />}
                      {connectionMeta.detail}
                    </span>
                    <span>{lastWriteDescription}</span>
                  </div>
                </div>
                
                {/* Stage tracker */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-amber-800 flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Pipeline Stages
                  </div>
                  <StageTracker stages={stageSummary} activeKey={activeStageKey} />
                </div>
              </div>

              {/* Right column: Progress and telemetry */}
              <div className="space-y-3">
                {/* Main progress display */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-amber-900">Progress</span>
                    <span className="text-lg font-bold text-amber-900">{Math.round(plan?.progress_percentage ?? 0)}%</span>
                  </div>
                  
                  {/* Progress details */}
                  <div className="space-y-1 text-xs text-amber-700">
                    <div className="flex justify-between">
                      <span>Tasks completed:</span>
                      <span className="font-medium">{completedTasks}/{totalTasks}</span>
                    </div>
                    {pipelineVelocity > 0 && (
                      <div className="flex justify-between">
                        <span>Velocity:</span>
                        <span className="font-medium">{pipelineVelocity} tasks/min</span>
                      </div>
                    )}
                    {estimatedRemainingMinutes !== null && (
                      <div className="flex justify-between">
                        <span>ETA:</span>
                        <span className="font-medium">{estimatedRemainingMinutes} min</span>
                      </div>
                    )}
                    {plan?.progress_message && (
                      <div className="mt-2 pt-2 border-t border-amber-200">
                        <span className="italic">{plan.progress_message}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional telemetry */}
                <div className="flex items-center gap-4 text-xs text-amber-600">
                  <div className="flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    <span>DB: {connection.status === 'connected' ? 'Connected' : 'Disconnected'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    <span>LLM: {llmStreams.active ? 'Active' : 'Idle'} ({llmStreams.history.length + (llmStreams.active ? 1 : 0)} calls)</span>
                  </div>
                  {totalTokenUsage > 0 && (
                    <div className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      <span>Tokens: {totalTokenUsage.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Created {planCreatedAt ? planCreatedAt.toLocaleDateString() : 'Unknown'}</span>
                  </div>
                </div>
              </div>
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
        
        {/* Enhanced telemetry strips */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <APITelemetryStrip 
            metrics={apiMetrics}
            activeTimeoutCountdown={null}
          />
          <LiveTaskTicker 
            currentTask={currentTask}
            queuedTasks={queuedTasks}
            workerStatus={connection.status === 'connected' ? 'active' : 'idle'}
          />
        </div>
      </div>
    </>
  );
};
