/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-11-13
 * PURPOSE: Individual plan card component for gallery display
 * SRP and DRY check: Pass - focused on rendering a single plan's information
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PlanResponse } from '@/lib/api/fastapi-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Play, Trash2, Download, Clock, Cpu } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PlanCardProps {
  plan: PlanResponse;
  onDelete: (planId: string) => void;
}

export function PlanCard({ plan, onDelete }: PlanCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete this plan?\n\n"${plan.prompt.slice(0, 100)}..."\n\nThis action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(plan.plan_id);
    } catch (err) {
      alert(`Failed to delete plan: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsDeleting(false);
    }
  };

  const getStatusBadge = () => {
    switch (plan.status) {
      case 'completed':
        return (
          <Badge className="bg-emerald-400/20 text-emerald-300 border-emerald-400/30">
            Completed
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/30 animate-pulse">
            Running
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-rose-400/20 text-rose-300 border-rose-400/30">
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-slate-400/20 text-slate-300 border-slate-400/30">
            Pending
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-gray-400/20 text-gray-300 border-gray-400/30">
            Cancelled
          </Badge>
        );
    }
  };

  const truncatePrompt = (text: string, maxLength: number = 120) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const timeAgo = formatDistanceToNow(new Date(plan.created_at), { addSuffix: true });

  return (
    <Card className="group relative bg-white/5 border-white/10 backdrop-blur hover:bg-white/10 hover:border-cyan-400/30 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium text-slate-100 line-clamp-2">
            {truncatePrompt(plan.prompt, 100)}
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar for running/pending plans */}
        {(plan.status === 'running' || plan.status === 'pending') && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{plan.progress_message || 'Processing...'}</span>
              <span>{plan.progress_percentage}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-500"
                style={{ width: `${plan.progress_percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{timeAgo}</span>
          </div>
          {plan.llm_model && (
            <div className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{plan.llm_model}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          {plan.status === 'completed' && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="flex-1 border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10"
            >
              <Link href={`/plan?planId=${encodeURIComponent(plan.plan_id)}`}>
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Report
              </Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            size="sm"
            className={plan.status === 'completed' ? 'flex-1' : 'flex-[2]' + ' border-purple-400/30 text-purple-300 hover:bg-purple-400/10'}
          >
            <Link href={`/recovery?planId=${encodeURIComponent(plan.plan_id)}`}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {plan.status === 'running' ? 'Monitor' : 'View'}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="border-rose-400/30 text-rose-300 hover:bg-rose-400/10"
          >
            {isDeleting ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-300 border-t-transparent" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
