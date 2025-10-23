/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Present canonical vs fallback report views with refresh controls so
 *          recovery users can compare outputs without leaving the workspace.
 * SRP and DRY check: Pass - handles tabbed rendering and leaves data fetching to
 *          the recovery hook.
 */
'use client';

import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const canonicalAvailable = Boolean(canonicalHtml);
  const [activeTab, setActiveTab] = useState<'canonical' | 'fallback'>(canonicalAvailable ? 'canonical' : 'fallback');

  useEffect(() => {
    if (!canonicalAvailable) {
      setActiveTab('fallback');
    }
  }, [canonicalAvailable]);

  const lastUpdatedLabel = lastUpdated ? `Last refreshed ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : 'Awaiting first artefacts.';

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Plan Report</CardTitle>
          <CardDescription className="text-sm">
            Toggle between canonical HTML output and the database-assembled fallback.
          </CardDescription>
          <p className="mt-2 text-xs text-slate-500">{lastUpdatedLabel}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Refresh Reports'}
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'canonical' | 'fallback')} className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="canonical" disabled={!canonicalAvailable}>
              Canonical HTML
            </TabsTrigger>
            <TabsTrigger value="fallback">Fallback (DB-first)</TabsTrigger>
          </TabsList>
          <TabsContent value="canonical">
            {canonicalHtml ? (
              <section
                aria-label="Canonical plan report"
                className="rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div
                  className="prose max-w-none px-6 py-6 text-slate-700"
                  dangerouslySetInnerHTML={{ __html: canonicalHtml }}
                />
              </section>
            ) : (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="py-6 text-sm text-amber-700">
                  {canonicalError ?? 'Canonical report is not yet available for this plan.'}
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="fallback">
            <ReportTaskFallback planId={fallbackPlanId} variant="embedded" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};


