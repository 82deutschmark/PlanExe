/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Compose the recovery workspace layout using the decomposed data hook and
 *          presentational panels while handling routing concerns.
 * SRP and DRY check: Pass - isolates query/router glue in the page and defers data
 *          orchestration plus UI rendering to dedicated modules introduced by the refactor plan.
 */
'use client';

import React, { Suspense, useCallback, useMemo, useState } from 'react';
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
import { StreamHistoryGrid } from './components/StreamHistoryGrid';
import { CurrentActivityStrip } from './components/CurrentActivityStrip';
import { PipelineInsights } from './components/PipelineInsights';
import { useRecoveryPlan } from './useRecoveryPlan';
import { ResumeDialog } from './components/ResumeDialog';
import type { MissingSectionResponse } from '@/lib/api/fastapi-client';

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
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeMissing, setResumeMissing] = useState<MissingSectionResponse[]>([]);

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
      let missing: MissingSectionResponse[] = [];
      try {
        const fallback = await fastApiClient.getFallbackReport(planId);
        missing = fallback?.missing_sections ?? [];
      } catch (e) {
        // If fallback not available, proceed but inform via console; backend may still resume via DB-first logic.
        console.warn('Fallback report unavailable; proceeding with best-effort resume.', e);
      }

      if ((missing?.length ?? 0) === 0 && plan.data.status === 'completed') {
        // Nothing to resume; take user to the final report page instead of relaunching everything.
        router.replace(`/plan?planId=${encodeURIComponent(planId)}&from=recovery`);
        return;
      }

      // If we have missing items, open modal for per-task selection
      if ((missing?.length ?? 0) > 0) {
        setResumeMissing(missing);
        setResumeOpen(true);
        return;
      }

      // No missing list available (e.g., fallback 404). Proceed best-effort with defaults.
      const speed_vs_detail: CreatePlanRequest['speed_vs_detail'] = 'balanced_speed_and_detail';
      const newPlan = await fastApiClient.createPlan({
        prompt: plan.data.prompt,
        speed_vs_detail,
        reasoning_effort: plan.data.reasoning_effort,
        enriched_intake: {
          project_title: 'Plan Resume',
          refined_objective: 'Resume to complete the plan without explicit missing list.',
          original_prompt: plan.data.prompt,
          scale: 'personal',
          risk_tolerance: 'moderate',
          domain: 'general',
          budget: {},
          timeline: {},
          geography: { is_digital_only: true },
          conversation_summary: 'Resume request without explicit missing artefacts (fallback unavailable).',
          confidence_score: 0.7,
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
      router.replace(`/plan?planId=${encodeURIComponent(planId)}&from=recovery`);
    }
  }, [plan.data?.status, planId, router]);

  if (!planId) {
    return <MissingPlanMessage />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <ResumeDialog
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        missing={resumeMissing}
        defaultReasoningEffort={plan.data?.reasoning_effort}
        onConfirm={async ({ selectedFilenames, llmModel, speedVsDetail, reasoningEffort }) => {
          if (!plan.data) return;
          try {
            const newPlan = await fastApiClient.createPlan({
              prompt: plan.data.prompt,
              llm_model: llmModel ?? undefined,
              speed_vs_detail: speedVsDetail,
              reasoning_effort: reasoningEffort ?? plan.data.reasoning_effort,
              enriched_intake: {
                project_title: 'Plan Resume',
                refined_objective: 'Resume only selected missing sections to complete the plan.',
                original_prompt: plan.data.prompt,
                scale: 'personal',
                risk_tolerance: 'moderate',
                domain: 'general',
                budget: {},
                timeline: {},
                geography: { is_digital_only: true },
                conversation_summary: `Resume targeting ${selectedFilenames.length} artefacts`,
                confidence_score: 0.8,
                areas_needing_clarification: selectedFilenames,
              },
            });
            setResumeOpen(false);
            router.replace(`/recovery?planId=${encodeURIComponent(newPlan.plan_id)}`);
          } catch (e) {
            console.error('Targeted resume failed', e);
          }
        }}
      />
      <RecoveryHeader
        planId={planId}
        plan={plan.data}
        planLoading={plan.loading}
        statusDisplay={plan.statusDisplay}
        connection={connection}
        lastWriteAt={lastWriteAt}
        stageSummary={stageSummary}
        activeStageKey={activeStageKey}
        llmStreams={{
          active: llmStreams.active,
          history: llmStreams.history,
        }}
        onRefreshPlan={plan.refresh}
        onRelaunch={handleRelaunch}
      />
      
      {/* Ultra-dense current activity strip */}
      <CurrentActivityStrip
        activeStream={llmStreams.active}
        completedCount={llmStreams.history.filter(s => s.status === 'completed').length}
        totalTasks={61}
      />
      
      <main className="mx-auto flex max-w-7xl flex-col gap-2 px-2 py-2">
        {/* Pipeline Insights - Extracted metrics and activity */}
        <PipelineInsights
          llmStreams={llmStreams}
          stageSummary={stageSummary}
          planCreatedAt={plan.data?.created_at ? new Date(plan.data.created_at) : null}
        />
        
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
            <StreamHistoryGrid streams={llmStreams.history} />
            <RecoveryReportPanel
              canonicalHtml={reports.canonicalHtml}
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
