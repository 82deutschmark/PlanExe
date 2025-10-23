/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Compose the recovery workspace layout using the decomposed data hook and
 *          presentational panels while handling routing concerns.
 * SRP and DRY check: Pass - isolates query/router glue in the page and defers data
 *          orchestration plus UI rendering to dedicated modules introduced by the refactor plan.
 */
'use client';

import React, { Suspense, useCallback, useMemo } from 'react';
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
import { fastApiClient, CreatePlanRequest } from '@/lib/api/fastapi-client';

import { RecoveryHeader } from './components/RecoveryHeader';
import { StageTimeline } from './components/StageTimeline';
import { RecoveryReportPanel } from './components/ReportPanel';
import { RecoveryArtefactPanel } from './components/ArtefactList';
import { ArtefactPreview } from './components/ArtefactPreview';
import { useRecoveryPlan } from './useRecoveryPlan';

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
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <StageTimeline
              stages={stageSummary}
              isLoading={artefacts.loading && stageSummary.length === 0}
              connection={connection}
            />
            <PipelineDetails planId={planId} className="h-fit" />
          </div>
          <div className="flex flex-col gap-4">
            <PipelineLogsPanel planId={planId} className="h-fit" />
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
            <RecoveryArtefactPanel
              planId={planId}
              artefacts={artefacts.items}
              isLoading={artefacts.loading}
              error={artefacts.error}
              lastUpdated={artefacts.lastUpdated}
              onRefresh={artefacts.refresh}
              onPreview={selectPreview}
            />
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
      </main>
    </div>
  );
};

const RecoveryPage: React.FC = () => (
  <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Loading plan workspace...</div>}>
    <RecoveryPageContent />
  </Suspense>
);

export default RecoveryPage;


