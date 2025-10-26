/**
 * Author: Cascade AI
 * Date: 2025-10-26T00:00:00Z
 * PURPOSE: Plan report viewer using query parameters (compatible with output: 'export').
 *          Replaces /plan/[planId] dynamic route which doesn't work with static export.
 * SRP and DRY check: Pass - dedicated to viewing a single plan's report using query params.
 */
'use client';

import React, { Suspense } from 'react';
import ReportPageClient from './[planId]/ReportPageClient';

function PlanPageContent() {
  return <ReportPageClient />;
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-amber-50 text-amber-900">Loading plan report...</div>}>
      <PlanPageContent />
    </Suspense>
  );
}
