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

import { PipelineLogsPanel } from '@/components/PipelineDetails';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fastApiClient, CreatePlanRequest } from '@/lib/api/fastapi-client';

import { RecoveryHeader } from './components/RecoveryHeader';
import { StageTimeline } from './components/StageTimeline';
import { RecoveryReportPanel } from './components/ReportPanel';
import { LiveStreamPanel } from './components/LiveStreamPanel';
import { StreamHistoryPanel } from './components/StreamHistoryPanel';
import { useRecoveryPlan } from './useRecoveryPlan';

const MissingPlanMessage: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
    <header className="border-b border-amber-200 bg-white/90 backdrop-blur px-4 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <h1 className="text-2xl font-semibold text-amber-900">Plan Recovery Workspace</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </header>
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <Card className="border-orange-300 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-900">
            Missing planId
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-900">
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
  const {
    plan,
    reports,
    artefacts,
    stageSummary,
    connection,
    lastWriteAt,
    llmStreams,
    activeStageKey,
  } = recovery;

  const handleRelaunch = useCallback(async () => {
    if (!plan.data) return;

    try {
      // 1) Inspect what’s missing to make relaunch targeted
      let missingFilenames: string[] = [];
      try {
        const fallback = await fastApiClient.getFallbackReport(planId);
        missingFilenames = (fallback?.missing_sections ?? []).map((m) => m.filename);
      } catch (e) {
        // If fallback not available, proceed but inform via console; backend may still resume via DB-first logic.
        console.warn('Fallback report unavailable; proceeding with best-effort resume.', e);
      }

      if (missingFilenames.length === 0 && plan.data.status === 'completed') {
        // Nothing to resume; take user to the final report page instead of relaunching everything.
        router.replace(`/plan/${encodeURIComponent(planId)}?from=recovery`);
        return;
      }

      // Offer a simple stage picker when we have missing artefacts
      let selectedMissing = missingFilenames;
      if (missingFilenames.length > 0) {
        const stageSet = new Set<string>();
        for (const fn of missingFilenames) {
          const match = fn.match(/^(\d{3})-([a-zA-Z0-9_\-]+)/);
          if (match) {
            stageSet.add(match[2]);
          }
        }
        const stages = Array.from(stageSet);
        if (stages.length > 0 && typeof window !== 'undefined') {
          const suggestion = stages.join(',');
          const input = window.prompt(
            `Select stages to resume (comma-separated).\nAvailable: ${stages.join(', ')}\nLeave blank to resume all listed.`,
            suggestion,
          );
          const chosen = (input ?? '').trim();
          if (chosen) {
            const chosenSet = new Set(
              chosen
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            );
            if (chosenSet.size > 0) {
              selectedMissing = missingFilenames.filter((fn) => {
                const m = fn.match(/^(\d{3})-([a-zA-Z0-9_\-]+)/);
                const stage = m ? m[2] : '';
                return chosenSet.has(stage);
              });
            }
          }
        }
      }

      const speedDefault: CreatePlanRequest['speed_vs_detail'] = 'balanced_speed_and_detail';
      const llmModel = typeof window !== 'undefined'
        ? window.prompt('Model for resume (leave blank for default):', '') ?? ''
        : '';
      const speedInput = typeof window !== 'undefined'
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

      // 2) Request a resume-only run by embedding intent in enriched_intake.
      //    Pipeline is DB-first; tasks should skip already-completed outputs.
      const newPlan = await fastApiClient.createPlan({
        prompt: plan.data.prompt,
        llm_model: llmModel.trim() || undefined,
        speed_vs_detail,
        enriched_intake: {
          project_title: 'Plan Resume',
          refined_objective: 'Resume only missing sections to complete the plan.',
          original_prompt: plan.data.prompt,
          scale: 'personal',
          risk_tolerance: 'moderate',
          domain: 'general',
          budget: {},
          timeline: {},
          geography: { is_digital_only: true },
          conversation_summary: selectedMissing.length > 0
            ? `Resume request targeting ${selectedMissing.length} missing artefacts.`
            : 'Resume request without explicit missing artefacts (fallback unavailable).',
          confidence_score: 0.75,
          // Surface target filenames so pipeline/components can pick up selective execution if supported
          areas_needing_clarification: selectedMissing,
        },
      });

      router.replace(`/recovery?planId=${encodeURIComponent(newPlan.plan_id)}`);
    } catch (error) {
      console.error('Failed to relaunch (resume) from recovery workspace', error);
    }
  }, [plan.data, planId, router]);

  // Redirect to a dedicated report page on completion to improve UX
  React.useEffect(() => {
    if (plan.data?.status === 'completed') {
      router.replace(`/plan/${encodeURIComponent(planId)}?from=recovery`);
    }
  }, [plan.data?.status, planId, router]);

  if (!planId) {
    return <MissingPlanMessage />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
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
      <main className="mx-auto flex max-w-7xl flex-col gap-2 px-2 py-2">
        <PipelineLogsPanel planId={planId} className="h-fit" />
        <div className="grid gap-2 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <StageTimeline
              stages={stageSummary}
              isLoading={artefacts.loading && stageSummary.length === 0}
              connection={connection}
              activeStageKey={activeStageKey}
            />
          </div>
          <div className="flex flex-col gap-2">
            <LiveStreamPanel stream={llmStreams.active} />
            <StreamHistoryPanel
              streams={llmStreams.history}
              activeStreamId={llmStreams.active?.interactionId ?? null}
            />
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
          </div>
        </div>
        {plan.data?.prompt && (
          <Card className="border-amber-200">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-amber-900">Initial Plan Request</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="whitespace-pre-wrap text-xs text-gray-900">{plan.data.prompt}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

const RecoveryPage: React.FC = () => (
  <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-amber-50 text-amber-900">Loading plan workspace...</div>}>
    <RecoveryPageContent />
  </Suspense>
);

export default RecoveryPage;
