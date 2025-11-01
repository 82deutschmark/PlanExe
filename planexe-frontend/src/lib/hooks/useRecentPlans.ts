/**
 * Author: gpt-5-codex
 * Date: 2025-10-31
 * PURPOSE: Hook for fetching and caching recent completed plans from the API
 * SRP and DRY check: Pass - Isolates plan fetching logic with auto-refresh
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { fastApiClient, type PlanResponse } from '@/lib/api/fastapi-client';

interface UseRecentPlansReturn {
  plans: PlanResponse[] | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useRecentPlans = (limit = 6): UseRecentPlansReturn => {
  const [plans, setPlans] = useState<PlanResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const all = await fastApiClient.getPlans();
      const completed = all.filter(p => p.status === 'completed').slice(0, limit);
      setPlans(completed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000); // auto-refresh every 30 seconds
    return () => clearInterval(id);
  }, [load]);

  return { plans, error, loading, refresh: load };
};
