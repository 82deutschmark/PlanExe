/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-11-13
 * PURPOSE: Main plans gallery client component with grid layout and filtering
 * SRP and DRY check: Pass - orchestrates gallery UI with filters, grid, and state management
 */

'use client';

import React, { useMemo } from 'react';
import { useGalleryPlans } from '@/lib/hooks/useGalleryPlans';
import { GalleryHeader } from './components/GalleryHeader';
import { GalleryFilters } from './components/GalleryFilters';
import { PlanCard } from './components/PlanCard';
import { EmptyState } from './components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';

export default function PlansGalleryClient() {
  const {
    plans,
    loading,
    error,
    totalCount,
    filteredCount,
    statusFilter,
    searchQuery,
    sortOption,
    setStatusFilter,
    setSearchQuery,
    setSortOption,
    refresh,
    deletePlan,
  } = useGalleryPlans();

  // Calculate stats for header
  const stats = useMemo(() => {
    const allPlans = plans.length > 0 ? plans : [];
    return {
      completed: allPlans.filter((p) => p.status === 'completed').length,
      running: allPlans.filter((p) => p.status === 'running').length,
      failed: allPlans.filter((p) => p.status === 'failed').length,
    };
  }, [plans]);

  const handleDeletePlan = async (planId: string) => {
    try {
      await deletePlan(planId);
    } catch (err) {
      throw err; // Let PlanCard handle the error display
    }
  };

  const hasFilters = statusFilter !== 'all' || searchQuery.trim() !== '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950">
      <GalleryHeader
        totalCount={totalCount}
        filteredCount={filteredCount}
        completedCount={stats.completed}
        runningCount={stats.running}
        failedCount={stats.failed}
        onRefresh={refresh}
        isRefreshing={loading}
      />

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Filters section */}
        <div className="mb-6">
          <GalleryFilters
            statusFilter={statusFilter}
            searchQuery={searchQuery}
            sortOption={sortOption}
            onStatusFilterChange={setStatusFilter}
            onSearchQueryChange={setSearchQuery}
            onSortOptionChange={setSortOption}
          />
        </div>

        {/* Error state */}
        {error && !loading && (
          <Card className="bg-rose-400/10 border-rose-400/30 backdrop-blur mb-6">
            <CardContent className="py-4">
              <p className="text-rose-300 text-center">
                {error}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {loading && totalCount === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="bg-white/5 border-white/10 backdrop-blur animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-white/10 rounded mb-2"></div>
                  <div className="h-3 bg-white/10 rounded w-3/4 mb-4"></div>
                  <div className="h-8 bg-white/10 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && plans.length === 0 && (
          <EmptyState hasFilters={hasFilters} />
        )}

        {/* Plans grid */}
        {!loading && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.plan_id}
                plan={plan}
                onDelete={handleDeletePlan}
              />
            ))}
          </div>
        )}

        {/* Results count */}
        {!loading && plans.length > 0 && (
          <div className="mt-6 text-center text-sm text-slate-400">
            Showing {filteredCount} of {totalCount} {totalCount === 1 ? 'plan' : 'plans'}
          </div>
        )}
      </div>
    </div>
  );
}
