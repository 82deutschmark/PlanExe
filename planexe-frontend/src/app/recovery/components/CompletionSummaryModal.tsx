/**
 * Author: Claude (Sonnet 4.5)
 * Date: 2025-10-28
 * PURPOSE: Display pipeline completion summary with metrics and link to report
 * SRP and DRY check: Pass - Focuses only on completion summary display
 */
'use client';

import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, Zap, FileText, TrendingUp } from 'lucide-react';
import type { PlanResponse } from '@/lib/api/fastapi-client';
import type { LLMStreamState } from '../useRecoveryPlan';

interface CompletionSummaryModalProps {
  open: boolean;
  onClose: () => void;
  plan: PlanResponse | null;
  llmStreams: {
    active: LLMStreamState | null;
    history: LLMStreamState[];
  };
  onViewReport: () => void;
}

export const CompletionSummaryModal: React.FC<CompletionSummaryModalProps> = ({
  open,
  onClose,
  plan,
  llmStreams,
  onViewReport,
}) => {
  const metrics = useMemo(() => {
    const completedTasks = llmStreams.history.filter(s => s.status === 'completed').length;
    const failedTasks = llmStreams.history.filter(s => s.status === 'failed').length;
    const totalTasks = completedTasks + failedTasks;

    // Calculate total tokens
    const totalTokens = llmStreams.history.reduce((sum, stream) => {
      if (stream.usage && typeof stream.usage === 'object') {
        const tokens = stream.usage.total_tokens as number || 0;
        return sum + tokens;
      }
      return sum;
    }, 0);

    // Calculate total API calls
    const totalApiCalls = llmStreams.history.length;

    // Calculate elapsed time
    const startTime = plan?.created_at ? new Date(plan.created_at) : null;
    const endTime = new Date();
    const elapsedMs = startTime ? endTime.getTime() - startTime.getTime() : 0;
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

    return {
      completedTasks,
      failedTasks,
      totalTasks,
      totalTokens,
      totalApiCalls,
      elapsedMinutes,
      elapsedSeconds,
      elapsedFormatted: `${elapsedMinutes}m ${elapsedSeconds}s`,
    };
  }, [llmStreams, plan]);

  const isSuccess = plan?.status === 'completed' && metrics.failedTasks === 0;
  const hasFailures = metrics.failedTasks > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuccess ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <span className="text-green-900">Pipeline Completed Successfully!</span>
              </>
            ) : hasFailures ? (
              <>
                <XCircle className="h-6 w-6 text-amber-600" />
                <span className="text-amber-900">Pipeline Completed with Issues</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
                <span className="text-blue-900">Pipeline Status Update</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-green-900">Completed Tasks</span>
              </div>
              <div className="text-2xl font-bold text-green-700">{metrics.completedTasks}</div>
              <div className="text-xs text-green-600">out of 61 total tasks</div>
            </div>

            {hasFailures && (
              <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-medium text-red-900">Failed Tasks</span>
                </div>
                <div className="text-2xl font-bold text-red-700">{metrics.failedTasks}</div>
                <div className="text-xs text-red-600">need attention</div>
              </div>
            )}

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">Total Time</span>
              </div>
              <div className="text-2xl font-bold text-blue-700">{metrics.elapsedFormatted}</div>
              <div className="text-xs text-blue-600">execution time</div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-900">API Calls</span>
              </div>
              <div className="text-2xl font-bold text-purple-700">{metrics.totalApiCalls}</div>
              <div className="text-xs text-purple-600">{metrics.totalTokens.toLocaleString()} tokens</div>
            </div>
          </div>

          {/* Status Message */}
          <div className={`rounded-lg p-4 border ${
            isSuccess
              ? 'bg-green-50 border-green-200'
              : hasFailures
              ? 'bg-amber-50 border-amber-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              <TrendingUp className={`h-5 w-5 mt-0.5 ${
                isSuccess ? 'text-green-600' : hasFailures ? 'text-amber-600' : 'text-blue-600'
              }`} />
              <div className="flex-1">
                <div className={`font-medium mb-1 ${
                  isSuccess ? 'text-green-900' : hasFailures ? 'text-amber-900' : 'text-blue-900'
                }`}>
                  {isSuccess
                    ? 'All pipeline tasks completed successfully!'
                    : hasFailures
                    ? `${metrics.completedTasks} tasks succeeded, but ${metrics.failedTasks} task${metrics.failedTasks > 1 ? 's' : ''} failed.`
                    : 'Pipeline execution complete.'
                  }
                </div>
                <div className={`text-sm ${
                  isSuccess ? 'text-green-700' : hasFailures ? 'text-amber-700' : 'text-blue-700'
                }`}>
                  {isSuccess
                    ? 'Your comprehensive business plan has been generated and is ready to view.'
                    : hasFailures
                    ? 'Review the failed tasks in the pipeline DAG for error details. You can retry or resume the plan.'
                    : 'Check the results and generated report below.'
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Progress Badge */}
          <div className="flex items-center justify-center gap-2 py-2">
            <Badge variant="outline" className="text-sm px-4 py-1">
              Progress: {plan?.progress_percentage || 0}%
            </Badge>
            {plan?.progress_message && (
              <span className="text-xs text-gray-600">• {plan.progress_message}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Continue Working
          </Button>
          <Button onClick={onViewReport} className="gap-2">
            <FileText className="h-4 w-4" />
            View Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
