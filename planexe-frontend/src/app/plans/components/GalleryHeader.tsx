/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-11-13
 * PURPOSE: Gallery page header with stats and navigation
 * SRP and DRY check: Pass - dedicated to gallery header presentation
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GalleryHeaderProps {
  totalCount: number;
  filteredCount: number;
  completedCount: number;
  runningCount: number;
  failedCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function GalleryHeader({
  totalCount,
  filteredCount,
  completedCount,
  runningCount,
  failedCount,
  onRefresh,
  isRefreshing,
}: GalleryHeaderProps) {
  return (
    <div className="border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-cyan-900/20 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-100">Plans Gallery</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="text-slate-400 hover:text-slate-200"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-slate-400">Browse and manage all your strategic plans</p>

            {/* Stats row */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Total:</span>
                <span className="font-medium text-slate-200">{totalCount}</span>
              </div>
              {filteredCount !== totalCount && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Showing:</span>
                  <span className="font-medium text-cyan-300">{filteredCount}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="text-slate-400">Completed:</span>
                <span className="font-medium text-emerald-300">{completedCount}</span>
              </div>
              {runningCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="text-slate-400">Running:</span>
                  <span className="font-medium text-amber-300">{runningCount}</span>
                </div>
              )}
              {failedCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                  <span className="text-slate-400">Failed:</span>
                  <span className="font-medium text-rose-300">{failedCount}</span>
                </div>
              )}
            </div>
          </div>

          <Button asChild variant="outline" className="border-white/20 text-slate-200">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
