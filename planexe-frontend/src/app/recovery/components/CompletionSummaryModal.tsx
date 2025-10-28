/**
 * Author: Claude (Sonnet 4.5)
 * Date: 2025-10-28
 * PURPOSE: Interactive completion review - show actual generated artefacts and failures, let users review/download
 * SRP and DRY check: Pass - Focuses on completion review and artefact interaction
 */
'use client';

import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, FileText, Download, ExternalLink, AlertCircle } from 'lucide-react';
import type { PlanResponse } from '@/lib/api/fastapi-client';
import type { PlanFile } from '@/lib/types/pipeline';
import type { LLMStreamState } from '../useRecoveryPlan';
import { PIPELINE_TASKS } from '../constants/pipeline-tasks';

interface CompletionSummaryModalProps {
  open: boolean;
  onClose: () => void;
  plan: PlanResponse | null;
  artefacts: PlanFile[];
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
  artefacts,
  llmStreams,
  onViewReport,
}) => {
  const [selectedTab, setSelectedTab] = useState<'artefacts' | 'failures'>('artefacts');

  const failures = useMemo(() => {
    return llmStreams.history.filter(s => s.status === 'failed');
  }, [llmStreams.history]);

  const artefactsByStage = useMemo(() => {
    const grouped = new Map<string, PlanFile[]>();
    artefacts.forEach(file => {
      const stage = file.stage || 'Other';
      if (!grouped.has(stage)) {
        grouped.set(stage, []);
      }
      grouped.get(stage)!.push(file);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [artefacts]);

  const completedTasksCount = llmStreams.history.filter(s => s.status === 'completed').length;
  const totalTasks = PIPELINE_TASKS.length;
  const hasFailures = failures.length > 0;

  const downloadArtefact = (filename: string) => {
    if (!plan?.plan_id) return;
    const url = `/api/plans/${plan.plan_id}/files/${filename}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!hasFailures ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <span className="text-green-900">Pipeline Completed</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-6 w-6 text-amber-600" />
                <span className="text-amber-900">Pipeline Completed with {failures.length} Failure{failures.length > 1 ? 's' : ''}</span>
              </>
            )}
          </DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            <Badge variant="outline" className="text-xs">
              {completedTasksCount} / {totalTasks} tasks completed
            </Badge>
            {artefacts.length > 0 && (
              <Badge variant="outline" className="text-xs bg-blue-50">
                {artefacts.length} artefact{artefacts.length !== 1 ? 's' : ''} generated
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="artefacts" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generated Artefacts ({artefacts.length})
            </TabsTrigger>
            <TabsTrigger value="failures" className="flex items-center gap-2" disabled={failures.length === 0}>
              <XCircle className="h-4 w-4" />
              Failures ({failures.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="artefacts" className="flex-1 overflow-y-auto mt-4">
            {artefacts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No artefacts generated yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {artefactsByStage.map(([stage, files]) => (
                  <div key={stage} className="border rounded-lg p-3 bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">{stage}</h3>
                    <div className="space-y-1.5">
                      {files.map((file) => (
                        <div
                          key={file.filename}
                          className="flex items-center justify-between gap-2 bg-white rounded p-2 border hover:border-blue-300 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {file.taskName || file.filename}
                            </div>
                            {file.description && (
                              <div className="text-xs text-gray-600 truncate">{file.description}</div>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-500">{file.filename}</span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {file.contentType}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => downloadArtefact(file.filename)}
                            className="shrink-0"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="failures" className="flex-1 overflow-y-auto mt-4">
            <div className="space-y-3">
              {failures.map((failure) => (
                <div key={failure.interactionId} className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <div className="flex items-start gap-2 mb-2">
                    <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-red-900">{failure.stage}</div>
                      <div className="text-xs text-red-700">Interaction #{failure.interactionId}</div>
                    </div>
                  </div>
                  {failure.error && (
                    <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-900 font-mono whitespace-pre-wrap break-words">
                      {failure.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-3 pt-4 border-t mt-4">
          <div className="text-xs text-gray-600">
            {hasFailures ? (
              <span>Review failures and retry if needed</span>
            ) : (
              <span>All tasks completed successfully</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Continue Working
            </Button>
            <Button size="sm" onClick={onViewReport} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              View Full Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
