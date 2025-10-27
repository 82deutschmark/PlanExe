/**
 * Author: Cascade
 * Date: 2025-10-27
 * PURPOSE: Client-side plan report viewer component. Loads and displays structured report data
 *          from the database or falls back to HTML assembly if needed.
 * SRP and DRY check: Pass - dedicated client component for report viewing logic.
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Home, Download, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fastApiClient, StructuredReportResponse, ReportSection } from '@/lib/api/fastapi-client';
import { ReportTaskFallback } from '@/components/files/ReportTaskFallback';

const ReportPageClient: React.FC = () => {
  const search = useSearchParams();
  const planId = useMemo(() => (search?.get('planId') ?? '').trim(), [search]);
  const fromRecovery = (search?.get('from') ?? '') === 'recovery';
  const [reportData, setReportData] = useState<StructuredReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!planId) return;
      setLoading(true);
      setError(null);
      setReportData(null);
      try {
        const data = await fastApiClient.getStructuredReport(planId);
        if (cancelled) return;
        setReportData(data);
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

  const renderSection = (section: ReportSection) => {
    let content = section.content;
    
    // Try to parse JSON content for better formatting
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object') {
        content = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // Keep as-is if not JSON
    }

    return (
      <Card key={section.id} className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            {section.title}
          </CardTitle>
          {section.stage && (
            <div className="text-sm text-gray-500">Stage: {section.stage}</div>
          )}
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded overflow-auto">
            {content}
          </pre>
        </CardContent>
      </Card>
    );
  };

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
            <Button
                variant="default"
                size="sm"
                onClick={async () => {
                  const blob = await fastApiClient.downloadReport(planId);
                  fastApiClient.downloadBlob(blob, `${planId}-report.html`);
                }}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Download HTML
              </Button>
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
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Loading report data…</div>
        )}
        {!loading && reportData && (
          <div>
            <div className="mb-4 text-sm text-gray-600">
              Showing {reportData.sections.length} sections from {reportData.source}
              {reportData.generated_at && (
                <span> • Generated {new Date(reportData.generated_at).toLocaleString()}</span>
              )}
            </div>
            {reportData.sections.map(renderSection)}
          </div>
        )}
        {!loading && (!reportData || error) && (
          <ReportTaskFallback planId={planId} variant="standalone" />
        )}
      </main>
    </div>
  );
};

export default ReportPageClient;
