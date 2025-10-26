/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Display plan report (canonical HTML or database-assembled fallback)
 * SRP and DRY check: Pass - simplified to show whichever report is available
 */
'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ReportTaskFallback } from '@/components/files/ReportTaskFallback';

interface RecoveryReportPanelProps {
  canonicalHtml: string | null;
  canonicalError: string | null;
  fallbackPlanId: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
}

export const RecoveryReportPanel: React.FC<RecoveryReportPanelProps> = ({
  canonicalHtml,
  canonicalError,
  fallbackPlanId,
  isRefreshing,
  onRefresh,
  lastUpdated,
}) => {
  const lastUpdatedLabel = lastUpdated ? formatDistanceToNow(lastUpdated, { addSuffix: true }) : 'Waiting';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 pt-3 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Plan Report</CardTitle>
          <span className="text-[10px] text-slate-500">{lastUpdatedLabel}</span>
        </div>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {canonicalHtml ? (
          <section
            aria-label="Plan report"
            className="rounded border border-slate-200 bg-white shadow-sm"
          >
            <div
              className="prose max-w-none p-3 text-slate-700 text-sm"
              dangerouslySetInnerHTML={{ __html: canonicalHtml }}
            />
          </section>
        ) : (
          <ReportTaskFallback planId={fallbackPlanId} variant="embedded" />
        )}
      </CardContent>
    </Card>
  );
};


