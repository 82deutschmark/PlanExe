/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-26T00:00:00Z
 * PURPOSE: Minimal plan report viewer page. If the final report exists, renders it inline; otherwise
 *          embeds the fallback assembly with actionable info about missing sections.
 * SRP and DRY check: Pass - dedicated to viewing a single plan’s report using existing client helpers
 *          and fallback component without duplicating recovery workspace logic.
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Home, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fastApiClient } from '@/lib/api/fastapi-client';
import { ReportTaskFallback } from '@/components/files/ReportTaskFallback';

const ReportPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const planId = useMemo(() => String(params?.planId ?? '').trim(), [params]);
  const search = useSearchParams();
  const fromRecovery = (search?.get('from') ?? '') === 'recovery';
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!planId) return;
      setLoading(true);
      setError(null);
      setHtml(null);
      try {
        const blob = await fastApiClient.downloadReport(planId);
        if (cancelled) return;
        const text = await blob.text();
        if (!cancelled) setHtml(text);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (!planId) {
    return (
      <div className="min-h-screen bg-amber-50">
        <header className="border-b border-amber-200 bg-white/90 backdrop-blur px-4 py-3">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <h1 className="text-2xl font-semibold text-amber-900">Plan Report</h1>
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Card className="border-orange-300 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-amber-900">Missing planId</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-900">This page needs a valid planId.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <header className="border-b border-amber-300 bg-white/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-2xl font-semibold text-amber-900">Plan Report</h1>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/recovery?planId=${encodeURIComponent(planId)}`}>
                Back to Recovery
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                Dashboard
              </Link>
            </Button>
            {html && (
              <Button
                variant="default"
                size="sm"
                onClick={async () => {
                  const blob = new Blob([html], { type: 'text/html' });
                  fastApiClient.downloadBlob(blob, `${planId}-report.html`);
                }}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Download
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4">
        {fromRecovery && (
          <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Pipeline completed. Redirected here to the final report.
          </div>
        )}
        {loading && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Loading report…</div>
        )}
        {!loading && html && (
          <Card className="border-amber-300">
            <CardContent>
              <div className="prose max-w-none p-3 text-gray-900 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
            </CardContent>
          </Card>
        )}
        {!loading && (!html || error) && (
          <ReportTaskFallback planId={planId} variant="standalone" />
        )}
      </main>
    </div>
  );
};

export default ReportPage;
