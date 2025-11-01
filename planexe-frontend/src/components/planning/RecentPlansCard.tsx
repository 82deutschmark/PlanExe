/**
 * Author: gpt-5-codex
 * Date: 2025-10-31
 * PURPOSE: Compact card showing recent completed plans with links to recovery/report
 * SRP and DRY check: Pass - Isolates recent plans display logic
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ExternalLink } from 'lucide-react';
import { useRecentPlans } from '@/lib/hooks/useRecentPlans';
import type { PlanResponse } from '@/lib/api/fastapi-client';

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const truncatePrompt = (prompt: string, maxLength = 50): string => {
  return prompt.length > maxLength ? prompt.slice(0, maxLength) + '…' : prompt;
};

export const RecentPlansCard: React.FC = () => {
  const { plans, error, loading } = useRecentPlans(6);

  return (
    <Card className="border-white/10 bg-white/10 shadow-2xl shadow-cyan-500/10 backdrop-blur">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white">Recent Plans</CardTitle>
          {loading && (
            <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-rose-300">Failed to load plans: {error}</p>
        )}
        {!loading && !error && plans?.length === 0 && (
          <p className="text-sm text-slate-400">No completed plans yet.</p>
        )}
        {plans?.map((plan: PlanResponse) => (
          <div key={plan.plan_id} className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-3 transition hover:bg-white/10">
            <Link
              href={`/recovery?planId=${encodeURIComponent(plan.plan_id)}`}
              className="flex-1 hover:underline"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-100">
                  {truncatePrompt(plan.prompt)}
                </span>
              </div>
              <span className="block text-xs text-slate-400 mt-1">
                {formatRelativeTime(plan.created_at)} • {plan.llm_model ?? 'model'}
              </span>
            </Link>
            <Link
              href={`/plan?planId=${encodeURIComponent(plan.plan_id)}`}
              className="text-cyan-300/80 hover:text-cyan-200 transition-colors"
              aria-label="Open report"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </CardContent>
      {plans && plans.length > 0 && (
        <div className="border-t border-white/10 px-4 py-2 text-right">
          <Link 
            href="/plans" 
            className="text-xs text-cyan-300/80 hover:text-cyan-200 transition-colors"
          >
            View all →
          </Link>
        </div>
      )}
    </Card>
  );
};
