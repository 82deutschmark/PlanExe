/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-26T00:00:00Z
 * PURPOSE: Minimal plan report viewer page. If the final report exists, renders it inline; otherwise
 *          embeds the fallback assembly with actionable info about missing sections.
 * SRP and DRY check: Pass - dedicated to viewing a single plan's report using existing client helpers
 *          and fallback component without duplicating recovery workspace logic.
 */
import React from 'react';
import ReportPageClient from './ReportPageClient';

// Required for Next.js static export with dynamic routes
// Empty array means no paths are pre-rendered, page will be client-side only
export function generateStaticParams() {
  return [];
}

export default function ReportPage() {
  return <ReportPageClient />;
}
