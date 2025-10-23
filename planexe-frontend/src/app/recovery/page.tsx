/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Compose the recovery workspace layout using the decomposed data hook and
 *          presentational panels while handling routing concerns.
 * SRP and DRY check: Pass - isolates query/router glue in the page and defers data
 *          orchestration plus UI rendering to dedicated modules introduced by the refactor plan.
 */
'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Home } from 'lucide-react';

import { PipelineDetails, PipelineLogsPanel } from '@/components/PipelineDetails';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { fastApiClient, CreatePlanRequest, PlanResponse } from '@/lib/api/fastapi-client';

import { describeConnection, RecoveryHeader } from './components/RecoveryHeader';
import { StageTimeline } from './components/StageTimeline';
import { RecoveryReportPanel } from './components/ReportPanel';
import { RecoveryArtefactPanel } from './components/ArtefactList';
import { ArtefactPreview } from './components/ArtefactPreview';
import { RecoveryConnectionState, StageSummary, StatusDisplay, useRecoveryPlan } from './useRecoveryPlan';

const TOTAL_PIPELINE_TASKS = 61;

type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface RecoveryToast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

const toastToneStyles: Record<ToastTone, string> = {
  info: 'border-slate-200 bg-white/95 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-700',
};

const ToastStack: React.FC<{ toasts: RecoveryToast[]; onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/80 ${toastToneStyles[toast.tone]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description && (
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 transition hover:text-slate-700"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

interface RecoveryMiniHudProps {
  planId: string;
  plan: PlanResponse | null;
  statusDisplay: StatusDisplay | null;
  connection: RecoveryConnectionState;
  lastWriteAt: Date | null;
  stageSummary: StageSummary[];
  onRefresh: () => Promise<void>;
}

const RecoveryMiniHud: React.FC<RecoveryMiniHudProps> = ({
  planId,
  plan,
  statusDisplay,
  connection,
  lastWriteAt,
  stageSummary,
  onRefresh,
}) => {
  const connectionMeta = useMemo(() => describeConnection(connection), [connection]);
  const tasksCompleted = useMemo(() => {
    if (plan?.progress_percentage === null || plan?.progress_percentage === undefined) {
      return null;
    }
    const computed = Math.round(((plan.progress_percentage ?? 0) / 100) * TOTAL_PIPELINE_TASKS);
    return Math.min(Math.max(computed, 0), TOTAL_PIPELINE_TASKS);
  }, [plan?.progress_percentage]);
  const totalArtefacts = useMemo(() => stageSummary.reduce((sum, stage) => sum + stage.count, 0), [stageSummary]);
  const activeStages = useMemo(() => stageSummary.filter((stage) => stage.count > 0).length, [stageSummary]);
  const totalStages = stageSummary.length;
  const lastArtefactTime = useMemo(() => {
    if (!lastWriteAt) {
      return '—';
    }
    return lastWriteAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastWriteAt]);

  return (
    <Card className="sticky top-4 z-30 border-blue-100 bg-white/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-800">
          <span>Live plan status</span>
          {statusDisplay && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusDisplay.badgeClass}`}
            >
              {statusDisplay.icon}
              {statusDisplay.label}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-xs text-slate-500">{connectionMeta.detail}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 text-xs text-slate-600">
          <div>
            <dt className="font-medium text-slate-500">Plan ID</dt>
            <dd className="font-mono text-[11px] text-slate-700">{planId}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Tasks complete</dt>
            <dd className="text-slate-700">
              {tasksCompleted ?? '—'}/{TOTAL_PIPELINE_TASKS}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Artefacts</dt>
            <dd className="text-slate-700">{totalArtefacts}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Active stages</dt>
            <dd className="text-slate-700">
              {activeStages}/{totalStages || '—'}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Last artefact</dt>
            <dd className="text-slate-700">{lastArtefactTime}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Connection</dt>
            <dd
              className={
                connectionMeta.tone === 'good'
                  ? 'text-emerald-600'
                  : connectionMeta.tone === 'warn'
                  ? 'text-amber-600'
                  : 'text-slate-700'
              }
            >
              {connectionMeta.label}
            </dd>
          </div>
        </dl>
        {plan?.progress_message && <p className="text-xs text-slate-500">{plan.progress_message}</p>}
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void onRefresh();
            }}
          >
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const MissingPlanMessage: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur px-4 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Plan Recovery Workspace</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </header>
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-800">
            Missing planId
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-900">
          <p>This workspace needs a valid `planId` query parameter.</p>
          <p>
            Append <span className="font-mono">?planId=YourPlanId</span> to the URL or relaunch a plan from
            the dashboard to jump straight into recovery mode.
          </p>
        </CardContent>
      </Card>
    </main>
  </div>
);

const RecoveryPageContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPlanId = searchParams?.get('planId') ?? '';
  const planId = useMemo(() => rawPlanId.replace(/\s+/g, '').trim(), [rawPlanId]);

  const recovery = useRecoveryPlan(planId);
  const { plan, reports, artefacts, preview, stageSummary, connection, lastWriteAt } = recovery;
  const { clear: clearPreview, select: selectPreview, file: previewFile } = preview;

  const [toasts, setToasts] = useState<RecoveryToast[]>([]);
  const toastTimeouts = useRef<Record<string, number>>({});
  const toastCounter = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
    const timeoutId = toastTimeouts.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete toastTimeouts.current[id];
    }
  }, []);

  const pushToast = useCallback(
    (toast: Omit<RecoveryToast, 'id'>) => {
      toastCounter.current += 1;
      const id = `toast-${toastCounter.current}`;
      setToasts((previous) => [...previous, { ...toast, id }]);
      const timeoutId = window.setTimeout(() => {
        dismissToast(id);
      }, 6000);
      toastTimeouts.current[id] = timeoutId;
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      Object.values(toastTimeouts.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeouts.current = {};
    };
  }, []);

  const artefactCount = artefacts.items.length;
  const previousArtefactCount = useRef(0);
  const canonicalNotified = useRef(false);
  const fallbackNotified = useRef(false);
  const planStatusRef = useRef<PlanResponse['status'] | null>(null);

  useEffect(() => {
    previousArtefactCount.current = 0;
    canonicalNotified.current = false;
    fallbackNotified.current = false;
    planStatusRef.current = null;
  }, [planId]);

  useEffect(() => {
    if (artefactCount > 0 && previousArtefactCount.current === 0) {
      pushToast({
        tone: 'success',
        title: 'Recovery artefacts streaming in',
        description: 'Fresh pipeline outputs are available in the artefact list.',
      });
    }
    previousArtefactCount.current = artefactCount;
  }, [artefactCount, pushToast]);

  const canonicalReady = Boolean(reports.canonicalHtml);
  useEffect(() => {
    if (canonicalReady && !canonicalNotified.current) {
      pushToast({
        tone: 'success',
        title: 'Canonical report ready',
        description: 'The primary HTML report has finished assembling.',
      });
      canonicalNotified.current = true;
    }
    if (!canonicalReady) {
      canonicalNotified.current = false;
    }
  }, [canonicalReady, pushToast]);

  const fallbackAvailable = useMemo(
    () =>
      artefacts.items.some((file) => {
        const filename = file.filename.toLowerCase();
        const taskName = file.taskName?.toLowerCase() ?? '';
        return filename.includes('fallback') || taskName.includes('fallback');
      }),
    [artefacts.items],
  );

  useEffect(() => {
    if (fallbackAvailable && !fallbackNotified.current) {
      pushToast({
        tone: 'info',
        title: 'Fallback report ready',
        description: 'Open the fallback tab to review the database-assembled report.',
      });
      fallbackNotified.current = true;
    }
    if (!fallbackAvailable) {
      fallbackNotified.current = false;
    }
  }, [fallbackAvailable, pushToast]);

  useEffect(() => {
    const status = plan.data?.status ?? null;
    if (status && planStatusRef.current !== status) {
      if (status === 'failed') {
        pushToast({
          tone: 'error',
          title: 'Plan execution failed',
          description: plan.data?.error_message ?? 'Check the pipeline logs for diagnostic details.',
        });
      } else if (status === 'completed') {
        pushToast({
          tone: 'success',
          title: 'Plan execution complete',
          description: 'All stages have finished. Reports and artefacts are current.',
        });
      }
    }
    planStatusRef.current = status;
  }, [plan.data?.status, plan.data?.error_message, pushToast]);

  const handleMiniRefresh = useCallback(async () => {
    await Promise.allSettled([plan.refresh(), reports.refresh(), artefacts.refresh()]);
  }, [plan, reports, artefacts]);

  const handleRelaunch = useCallback(async () => {
    if (!plan.data) {
      return;
    }

    try {
      const speedDefault: CreatePlanRequest['speed_vs_detail'] = 'balanced_speed_and_detail';
      const llmModel =
        typeof window !== 'undefined'
          ? window.prompt('Enter LLM model ID for relaunch (leave blank for default):', '') ?? ''
          : '';
      const speedInput =
        typeof window !== 'undefined'
          ? window.prompt(
              'Speed vs detail (fast_but_skip_details | balanced_speed_and_detail | all_details_but_slow):',
              speedDefault,
            ) ?? speedDefault
          : speedDefault;
      const allowedSpeeds: CreatePlanRequest['speed_vs_detail'][] = [
        'fast_but_skip_details',
        'balanced_speed_and_detail',
        'all_details_but_slow',
      ];
      const normalisedSpeed = (speedInput || speedDefault).trim() as CreatePlanRequest['speed_vs_detail'];
      const speed_vs_detail = allowedSpeeds.includes(normalisedSpeed) ? normalisedSpeed : speedDefault;

      const newPlan = await fastApiClient.relaunchPlan(plan.data, {
        llmModel: llmModel.trim() || undefined,
        speedVsDetail: speed_vs_detail,
      });

      clearPreview();
      router.replace(`/recovery?planId=${encodeURIComponent(newPlan.plan_id)}`);
    } catch (error) {
      console.error('Failed to relaunch plan from recovery workspace', error);
    }
  }, [plan.data, clearPreview, router]);

  if (!planId) {
    return <MissingPlanMessage />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <RecoveryHeader
        planId={planId}
        plan={plan.data}
        planError={plan.error}
        planLoading={plan.loading}
        statusDisplay={plan.statusDisplay}
        connection={connection}
        lastWriteAt={lastWriteAt}
        onRefreshPlan={plan.refresh}
        onRelaunch={handleRelaunch}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <div className="grid items-start gap-4 md:grid-cols-1 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(320px,1fr)]">
          <div className="flex flex-col gap-4">
            <RecoveryMiniHud
              planId={planId}
              plan={plan.data}
              statusDisplay={plan.statusDisplay}
              connection={connection}
              lastWriteAt={lastWriteAt}
              stageSummary={stageSummary}
              onRefresh={handleMiniRefresh}
            />
            <StageTimeline
              stages={stageSummary}
              isLoading={artefacts.loading && stageSummary.length === 0}
              connection={connection}
            />
            <PipelineDetails planId={planId} className="h-fit" />
          </div>
          <div className="flex flex-col gap-4">
            <RecoveryReportPanel
              canonicalHtml={reports.canonicalHtml}
              canonicalError={reports.canonicalError}
              fallbackPlanId={planId}
              isRefreshing={reports.loading || artefacts.loading}
              onRefresh={() => {
                void reports.refresh();
                void artefacts.refresh();
              }}
              lastUpdated={lastWriteAt}
            />
            <PipelineLogsPanel planId={planId} className="h-fit xl:max-h-[32rem]" />
          </div>
          <div className="grid gap-4 xl:max-h-[calc(100vh-12rem)] xl:grid-rows-[minmax(0,1fr)_auto]">
            <div className="min-h-0">
              <RecoveryArtefactPanel
                planId={planId}
                artefacts={artefacts.items}
                isLoading={artefacts.loading}
                error={artefacts.error}
                lastUpdated={artefacts.lastUpdated}
                onRefresh={artefacts.refresh}
                onPreview={selectPreview}
              />
            </div>
            <div className="min-h-0">
              <ArtefactPreview
                planId={planId}
                preview={{
                  file: previewFile,
                  data: preview.data,
                  loading: preview.loading,
                  error: preview.error,
                  clear: clearPreview,
                }}
                onDownload={async () => {
                  if (!previewFile) {
                    return;
                  }
                  try {
                    const blob = await fastApiClient.downloadFile(planId, previewFile.filename);
                    fastApiClient.downloadBlob(blob, previewFile.filename);
                  } catch (err) {
                    console.error('Download from preview failed', err);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </main>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

const RecoveryPage: React.FC = () => (
  <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Loading plan workspace...</div>}>
    <RecoveryPageContent />
  </Suspense>
);

export default RecoveryPage;


