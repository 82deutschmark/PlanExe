/**
 * Author: Claude (Sonnet 4.5)
 * Date: 2025-10-23
 * PURPOSE: Vertical timeline showing all Luigi pipeline tasks with status indicators
 *          and click-to-navigate functionality for the Focused Stage Recovery UI.
 * SRP/DRY: Pass - focused on task timeline display and navigation only
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Check, Circle, Loader2, XCircle } from 'lucide-react';

export interface TimelineTask {
  id: string;
  name: string;
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  order: number;
}

export interface TimelineStage {
  key: string;
  label: string;
  tasks: TimelineTask[];
  completedCount: number;
  totalCount: number;
}

export interface VerticalTimelineProps {
  tasks: TimelineTask[];
  activeTaskId?: string | null;
  onTaskClick?: (taskId: string) => void;
  totalTasks: number;
  completedTasks: number;
  totalTokens?: number;
  elapsedTime?: number;
  className?: string;
}

const STAGE_ORDER = [
  'setup',
  'initial_analysis',
  'strategic_planning',
  'scenario_planning',
  'contextual_analysis',
  'assumption_management',
  'project_planning',
  'governance',
  'resource_planning',
  'documentation',
  'work_breakdown',
  'scheduling',
  'reporting',
  'completion',
];

function groupTasksByStage(tasks: TimelineTask[]): TimelineStage[] {
  const stageMap = new Map<string, TimelineTask[]>();

  tasks.forEach((task) => {
    const normalizedStage = task.stage.toLowerCase().trim();
    if (!stageMap.has(normalizedStage)) {
      stageMap.set(normalizedStage, []);
    }
    stageMap.get(normalizedStage)!.push(task);
  });

  const orderedStages = STAGE_ORDER.filter((stage) => stageMap.has(stage));
  const unorderedStages = Array.from(stageMap.keys()).filter((stage) => !STAGE_ORDER.includes(stage)).sort();

  return [...orderedStages, ...unorderedStages].map((stageKey) => {
    const stageTasks = stageMap.get(stageKey) || [];
    const completedCount = stageTasks.filter((t) => t.status === 'completed').length;

    return {
      key: stageKey,
      label: stageKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      tasks: stageTasks.sort((a, b) => a.order - b.order),
      completedCount,
      totalCount: stageTasks.length,
    };
  });
}

function getTaskStatusIcon(status: TimelineTask['status']) {
  switch (status) {
    case 'completed':
      return <Check className="h-3 w-3" />;
    case 'running':
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case 'failed':
      return <XCircle className="h-3 w-3" />;
    default:
      return <Circle className="h-3 w-3" />;
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export const VerticalTimeline: React.FC<VerticalTimelineProps> = ({
  tasks,
  activeTaskId,
  onTaskClick,
  totalTasks,
  completedTasks,
  totalTokens,
  elapsedTime,
  className,
}) => {
  const activeTaskRef = useRef<HTMLDivElement>(null);
  const stages = groupTasksByStage(tasks);

  // Auto-scroll to active task
  useEffect(() => {
    if (activeTaskRef.current) {
      activeTaskRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeTaskId]);

  return (
    <div className={cn('flex flex-col h-full bg-card', className)}>
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Pipeline Timeline</h2>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Tasks:</span>
            <span className="font-mono text-foreground">
              {completedTasks}/{totalTasks}
            </span>
          </div>
          {elapsedTime !== undefined && (
            <div className="flex justify-between">
              <span>Time:</span>
              <span className="font-mono text-foreground">{formatDuration(elapsedTime)}</span>
            </div>
          )}
          {totalTokens !== undefined && (
            <div className="flex justify-between">
              <span>Tokens:</span>
              <span className="font-mono text-foreground">{totalTokens.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stage List */}
      <div className="flex-1 overflow-y-auto">
        {stages.map((stage) => (
          <div key={stage.key} className="border-b border-border/50">
            {/* Stage Header */}
            <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur px-4 py-2 border-b border-border/30">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{stage.label}</span>
                <span className="font-mono text-muted-foreground">
                  {stage.completedCount}/{stage.totalCount}
                </span>
              </div>
            </div>

            {/* Task List */}
            <div className="space-y-px">
              {stage.tasks.map((task) => {
                const isActive = task.id === activeTaskId;
                const isClickable = onTaskClick !== undefined;

                return (
                  <div
                    key={task.id}
                    ref={isActive ? activeTaskRef : undefined}
                    onClick={() => isClickable && onTaskClick?.(task.id)}
                    className={cn(
                      'relative flex items-center gap-2 px-4 py-2 text-xs transition-colors',
                      isClickable && 'cursor-pointer hover:bg-accent/50',
                      isActive && 'bg-primary/10 ring-1 ring-primary shadow-sm',
                      task.status === 'completed' && 'bg-green-50/30 dark:bg-green-950/20',
                      task.status === 'running' && 'bg-blue-50/30 dark:bg-blue-950/20',
                      task.status === 'failed' && 'bg-red-50/30 dark:bg-red-950/20',
                      task.status === 'pending' && 'bg-muted/20'
                    )}
                  >
                    {/* Status Icon */}
                    <div
                      className={cn(
                        'shrink-0',
                        task.status === 'completed' && 'text-green-600 dark:text-green-400',
                        task.status === 'running' && 'text-blue-600 dark:text-blue-400',
                        task.status === 'failed' && 'text-red-600 dark:text-red-400',
                        task.status === 'pending' && 'text-muted-foreground'
                      )}
                    >
                      {getTaskStatusIcon(task.status)}
                    </div>

                    {/* Task Name */}
                    <span
                      className={cn(
                        'flex-1 truncate',
                        task.status === 'pending' && 'text-muted-foreground',
                        task.status !== 'pending' && 'text-foreground',
                        isActive && 'font-semibold'
                      )}
                      title={task.name}
                    >
                      {task.name}
                    </span>

                    {/* Active Indicator */}
                    {isActive && (
                      <div className="shrink-0 h-2 w-2 rounded-full bg-primary animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
