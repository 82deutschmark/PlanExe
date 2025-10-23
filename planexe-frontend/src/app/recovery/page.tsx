/**
 * Author: Claude (Sonnet 4.5)
 * Date: 2025-10-23
 * PURPOSE: Focused Stage Recovery UI with asymmetric 15-70-15 layout maximizing
 *          streaming visibility and real-time feedback for Luigi pipeline execution.
 * SRP and DRY check: Pass - orchestrates layout composition using dedicated components
 *          and the useRecoveryPlan hook for state management.
 */
'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Home } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { AssembledDocumentSection } from '@/lib/api/fastapi-client';
import { RecoveryHeader } from './components/RecoveryHeader';
import { VerticalTimeline, TimelineTask } from './components/VerticalTimeline';
import { ActiveTaskStage } from './components/ActiveTaskStage';
import { LivePlanDocument, PlanSection } from './components/LivePlanDocument';
import { SystemLogDrawer, LogEntry } from './components/SystemLogDrawer';
import { useRecoveryPlan } from './useRecoveryPlan';

const TOTAL_PIPELINE_TASKS = 61;

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
  const searchParams = useSearchParams();
  const rawPlanId = searchParams?.get('planId') ?? '';
  const planId = useMemo(() => rawPlanId.replace(/\s+/g, '').trim(), [rawPlanId]);

  const recovery = useRecoveryPlan(planId);
  const { plan, llmStreams, connection, artefacts, document } = recovery;

  // Convert artefacts to timeline tasks (simplified for now)
  const timelineTasks: TimelineTask[] = useMemo(() => {
    return artefacts.items.map((artefact, index) => ({
      id: `task-${index}`,
      name: artefact.taskName || artefact.filename,
      stage: artefact.stage || 'unknown',
      status: 'completed' as const,
      order: artefact.order || index,
    }));
  }, [artefacts.items]);

  // Use real assembled document data from backend
  const planSections: PlanSection[] = useMemo(() => {
    if (!document.data || !document.data.sections) {
      return [];
    }
    return document.data.sections.map((section: AssembledDocumentSection) => ({
      id: section.id,
      taskName: section.task_name,
      stage: section.stage,
      content: section.content,
      createdAt: section.created_at,
      isFinal: section.is_final,
    }));
  }, [document.data]);

  // Mock logs for now
  const logs: LogEntry[] = useMemo(() => {
    const entries: LogEntry[] = [];

    if (connection.status === 'connected') {
      entries.push({
        timestamp: new Date().toLocaleTimeString(),
        text: 'WebSocket connection established',
        level: 'info',
      });
    }

    if (connection.error) {
      entries.push({
        timestamp: new Date().toLocaleTimeString(),
        text: connection.error,
        level: 'error',
      });
    }

    return entries;
  }, [connection]);

  const hasErrors = logs.some((log) => log.level === 'error');

  const completedTasksCount = timelineTasks.filter((t) => t.status === 'completed').length;

  // Calculate total tokens from all llmStreams
  const totalTokens = useMemo(() => {
    return Object.values(llmStreams.all).reduce((sum, stream) => {
      return sum + (stream.usage?.totalTokens ?? 0);
    }, 0);
  }, [llmStreams.all]);

  if (!planId) {
    return <MissingPlanMessage />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header: 5vh */}
      <RecoveryHeader
        planId={planId}
        plan={plan.data}
        planError={plan.error}
        planLoading={plan.loading}
        statusDisplay={plan.statusDisplay}
        connection={connection}
        lastWriteAt={recovery.lastWriteAt}
        onRefreshPlan={plan.refresh}
        onRelaunch={async () => {
          // Simplified relaunch handler
          alert('Relaunch feature coming soon!');
        }}
      />

      {/* Main Grid: 15-70-15 asymmetric */}
      <div className="flex-1 grid grid-cols-[15vw_70vw_15vw] gap-2 p-2 overflow-hidden">
        {/* Left Rail: Vertical Timeline */}
        <aside className="overflow-y-auto">
          <VerticalTimeline
            tasks={timelineTasks}
            activeTaskId={llmStreams.active?.interactionId.toString()}
            onTaskClick={(taskId) => {
              // Jump to task in stream history by finding the corresponding llm stream
              const taskNum = parseInt(taskId.replace('task-', ''), 10);
              if (!isNaN(taskNum) && timelineTasks[taskNum]) {
                const targetArtefact = artefacts.items[taskNum];
                if (targetArtefact && llmStreams.history.length > 0) {
                  // Find the stream that corresponds to this task's stage
                  const matchingStream = llmStreams.history.find(
                    (stream) => stream.stage === targetArtefact.stage
                  );
                  if (matchingStream) {
                    // Scroll to active task (would scroll in ActiveTaskStage)
                    // For now, we're tracking by displaying the matching stream info
                  }
                }
              }
            }}
            totalTasks={TOTAL_PIPELINE_TASKS}
            completedTasks={completedTasksCount}
            totalTokens={totalTokens}
          />
        </aside>

        {/* Center Stage: Active Task Theater */}
        <main className="flex flex-col overflow-hidden">
          <ActiveTaskStage stream={llmStreams.active} />
        </main>

        {/* Right Rail: Live Plan Document */}
        <aside className="overflow-y-auto">
          <LivePlanDocument
            sections={planSections}
            markdown={document.data?.markdown || ''}
            wordCount={document.data?.word_count || 0}
            isLoading={document.loading}
            isUpdating={llmStreams.active !== null && llmStreams.active.status === 'running'}
          />
        </aside>
      </div>

      {/* Bottom Drawer: System Logs (collapsed by default) */}
      <SystemLogDrawer
        logs={logs}
        connection={connection}
        hasErrors={hasErrors}
      />
    </div>
  );
};

const RecoveryPage: React.FC = () => (
  <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Loading plan workspace...</div>}>
    <RecoveryPageContent />
  </Suspense>
);

export default RecoveryPage;


