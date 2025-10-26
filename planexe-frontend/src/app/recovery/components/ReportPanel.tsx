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
  fallbackPlanId: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
}

export const RecoveryReportPanel: React.FC<RecoveryReportPanelProps> = ({
  canonicalHtml,
  fallbackPlanId,
  isRefreshing,
  onRefresh,
  lastUpdated,
}) => {
  const lastUpdatedLabel = lastUpdated ? formatDistanceToNow(lastUpdated, { addSuffix: true }) : 'Waiting';

  return (
    <Card className="border-amber-300">
      <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 pt-3 space-y-0 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm text-amber-900">Plan Report</CardTitle>
          <span className="text-[10px] text-amber-700">{lastUpdatedLabel}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs border-amber-500 text-amber-900 hover:bg-amber-500 hover:text-white"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {canonicalHtml ? (
          <section
            aria-label="Plan report"
            className="rounded border border-amber-200 bg-white shadow-sm"
          >
            <div
              className="prose max-w-none p-3 text-gray-900 text-sm"
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


