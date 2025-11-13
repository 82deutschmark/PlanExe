/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-11-13
 * PURPOSE: Empty state component for when no plans match filters or exist
 * SRP and DRY check: Pass - dedicated to empty state presentation
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { FileQuestion, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  hasFilters: boolean;
}

export function EmptyState({ hasFilters }: EmptyStateProps) {
  if (hasFilters) {
    return (
      <Card className="bg-white/5 border-white/10 backdrop-blur">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileQuestion className="h-16 w-16 text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-slate-200 mb-2">No plans match your filters</h3>
          <p className="text-slate-400 mb-6 max-w-md">
            Try adjusting your search query or filters to find what you're looking for.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-purple-900/20 to-cyan-900/20 border-white/10 backdrop-blur">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-gradient-to-br from-cyan-400/20 to-purple-500/20 p-6 mb-6">
          <Plus className="h-12 w-12 text-cyan-300" />
        </div>
        <h3 className="text-2xl font-semibold text-slate-100 mb-3">No plans yet</h3>
        <p className="text-slate-400 mb-8 max-w-md">
          Get started by creating your first strategic plan. Our AI will guide you through an interactive conversation to bring your ideas to life.
        </p>
        <Button
          asChild
          size="lg"
          className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white border-0"
        >
          <Link href="/">
            <Plus className="h-5 w-5 mr-2" />
            Create Your First Plan
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
