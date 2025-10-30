/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Compose the recovery workspace layout using the decomposed data hook and
 *          presentational panels while handling routing concerns.
 * SRP and DRY check: Pass - isolates query/router glue in the page and defers data
 *          orchestration plus UI rendering to dedicated modules introduced by the refactor plan.
 */
'use client';

import React, { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Home } from 'lucide-react';

import { PipelineLogsPanel } from '@/components/PipelineDetails';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fastApiClient } from '@/lib/api/fastapi-client';

import { RecoveryReportPanel } from './components/ReportPanel';
import { LiveStreamPanel } from './components/LiveStreamPanel';
import { StreamHistoryGrid } from './components/StreamHistoryGrid';
import { CurrentActivityStrip } from './components/CurrentActivityStrip';
import { LivePipelineDAG } from './components/LivePipelineDAG';
import { useRecoveryPlan } from './useRecoveryPlan';
import { ResumeDialog } from './components/ResumeDialog';
import { CompletionSummaryModal } from './components/CompletionSummaryModal';
import { PIPELINE_TASKS } from './constants/pipeline-tasks';
import type { MissingSectionResponse } from '@/lib/api/fastapi-client';
import { useConceptImage } from '@/lib/hooks/useConceptImage';
import { ConceptImageThumbnail } from '@/components/planning/ConceptImageThumbnail';

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
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const hasShownCompletionRef = useRef(false);

  const recovery = useRecoveryPlan(planId);
  const {
    plan,
    reports,
    artefacts,
    connection,
    lastWriteAt,
    llmStreams,
  } = recovery;

  // Retrieve concept image if available
  const conceptImage = useConceptImage(planId);

  // Compute missing targets for resume functionality
  const missingTargets = useMemo((): MissingSectionResponse[] => {
    const targets: MissingSectionResponse[] = [];
    
    // Get completed and failed stages from LLM streams
    const completedStages = new Set(llmStreams.history.filter(s => s.status === 'completed').map(s => s.stage));
    const failedStages = new Set(llmStreams.history.filter(s => s.status === 'failed').map(s => s.stage));
    
    // Get existing artefact filenames
    const existingFilenames = new Set(artefacts.items.map(a => a.filename));
    
    // Check each pipeline task for missing or failed outputs
    PIPELINE_TASKS.forEach(task => {
      const expectedFilename = `${task.id.toString().padStart(3, '0')}-${task.stage}.json`;
      const hasArtefact = existingFilenames.has(expectedFilename);
      const hasCompletedStream = completedStages.has(task.stage);
      const hasFailedStream = failedStages.has(task.stage);
      
      if (hasFailedStream) {
        targets.push({
          filename: expectedFilename,
          stage: task.stageGroup,
          reason: `Task failed during execution`
        });
      } else if (!hasArtefact && !hasCompletedStream) {
        targets.push({
          filename: expectedFilename,
          stage: task.stageGroup,
          reason: `Missing output file: ${expectedFilename}`
        });
      }
    });
    
    return targets;
  }, [artefacts.items, llmStreams.history]);

  // Detect pipeline completion and show summary modal
  useEffect(() => {
    if (plan.data?.status === 'completed' && !hasShownCompletionRef.current) {
      // Small delay to ensure all data is loaded
      const timer = setTimeout(() => {
        setCompletionModalOpen(true);
        hasShownCompletionRef.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [plan.data?.status]);

  // Reset the completion modal shown flag when planId changes
  useEffect(() => {
    hasShownCompletionRef.current = false;
  }, [planId]);

  const handleViewReport = () => {
    setCompletionModalOpen(false);
    // Navigate to the full-page rich HTML report
    router.push(`/plan?planId=${encodeURIComponent(planId)}&from=recovery`);
  };

  if (!planId) {
    return <MissingPlanMessage />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <ResumeDialog
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        missing={missingTargets}
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

      <CompletionSummaryModal
        open={completionModalOpen}
        onClose={() => setCompletionModalOpen(false)}
        plan={plan.data}
        artefacts={artefacts.items}
        llmStreams={llmStreams}
        onViewReport={handleViewReport}
      />

      {/* MEGA INFO STRIP - All status in one ultra-dense bar */}
      <CurrentActivityStrip
        activeStream={llmStreams.active}
        completedCount={llmStreams.history.filter(s => s.status === 'completed').length}
        totalTasks={PIPELINE_TASKS.length}
        plan={plan.data}
        connection={connection}
        llmStreams={llmStreams}
      />
      
      <main className="mx-auto flex max-w-7xl flex-col gap-2 px-2 py-2">
        {/* Stream History Grid at top - shows completed tasks */}
        <StreamHistoryGrid streams={llmStreams.history} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            {/* Live Pipeline DAG showing all pipeline tasks with real-time status */}
            <LivePipelineDAG llmStreams={llmStreams} />
          </div>
          <div className="flex flex-col gap-3">
            <LiveStreamPanel stream={llmStreams.active} />
            {/* Stream History Grid showing completed tasks */}
            <div data-report-section>
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
            {/* Pipeline Logs Panel */}
            <PipelineLogsPanel planId={planId} className="h-fit" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
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
          {conceptImage && (
            <ConceptImageThumbnail imageData={conceptImage} className="md:w-64" />
          )}
        </div>
        {/* Action strip with resume functionality moved to bottom */}
        <div className="mx-auto max-w-7xl px-2 pt-1">
          <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-amber-900">
                Recovery Actions
              </span>
              {missingTargets.length > 0 && (
                <span className="text-xs text-amber-700">
                  ({missingTargets.length} missing/failed sections)
                </span>
              )}
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setResumeOpen(true)}
              disabled={missingTargets.length === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Resume Failed/Missing Sections
            </Button>
          </div>
        </div>
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
