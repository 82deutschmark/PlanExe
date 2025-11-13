/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-11-13
 * PURPOSE: Custom hook for managing gallery plans data with filtering, sorting, and auto-refresh
 * SRP and DRY check: Pass - dedicated hook for plans gallery data management
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fastApiClient, PlanResponse } from '@/lib/api/fastapi-client';

export type StatusFilter = 'all' | 'completed' | 'running' | 'failed' | 'pending';
export type SortOption = 'newest' | 'oldest' | 'status';

export interface UseGalleryPlansOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseGalleryPlansReturn {
  plans: PlanResponse[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  filteredCount: number;
  statusFilter: StatusFilter;
  searchQuery: string;
  sortOption: SortOption;
  setStatusFilter: (filter: StatusFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortOption: (option: SortOption) => void;
  refresh: () => Promise<void>;
  deletePlan: (planId: string) => Promise<void>;
}

export function useGalleryPlans(options: UseGalleryPlansOptions = {}): UseGalleryPlansReturn {
  const { autoRefresh = true, refreshInterval = 30000 } = options;

  const [allPlans, setAllPlans] = useState<PlanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  const fetchPlans = useCallback(async () => {
    try {
      setError(null);
      const plans = await fastApiClient.getPlans();
      setAllPlans(plans);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load plans';
      setError(message);
      console.error('[useGalleryPlans] Error fetching plans:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchPlans();
  }, [fetchPlans]);

  const deletePlan = useCallback(async (planId: string) => {
    try {
      await fastApiClient.cancelPlan(planId);
      // Remove from local state
      setAllPlans((prev) => prev.filter((p) => p.plan_id !== planId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete plan';
      throw new Error(message);
    }
  }, []);

  // Filter and sort plans
  const filteredAndSortedPlans = useMemo(() => {
    let filtered = allPlans;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((plan) => plan.status === statusFilter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((plan) =>
        plan.prompt.toLowerCase().includes(query) ||
        plan.plan_id.toLowerCase().includes(query) ||
        plan.llm_model?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered];
    switch (sortOption) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'status':
        // Order: running → pending → completed → failed
        const statusOrder = { running: 0, pending: 1, completed: 2, failed: 3, cancelled: 4 };
        sorted.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
        break;
    }

    return sorted;
  }, [allPlans, statusFilter, searchQuery, sortOption]);

  // Initial fetch
  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Auto-refresh for running plans
  useEffect(() => {
    if (!autoRefresh) return;

    const hasRunningPlans = allPlans.some((p) => p.status === 'running' || p.status === 'pending');
    if (!hasRunningPlans) return;

    const intervalId = setInterval(() => {
      fetchPlans();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, allPlans, fetchPlans]);

  return {
    plans: filteredAndSortedPlans,
    loading,
    error,
    totalCount: allPlans.length,
    filteredCount: filteredAndSortedPlans.length,
    statusFilter,
    searchQuery,
    sortOption,
    setStatusFilter,
    setSearchQuery,
    setSortOption,
    refresh,
    deletePlan,
  };
}
