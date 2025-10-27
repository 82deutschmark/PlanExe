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
import { 
  Home, Download, FileText, Search, Filter, Copy, Check, 
  ChevronDown, ChevronRight, Eye, EyeOff, Code
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fastApiClient, StructuredReportResponse, ReportSection } from '@/lib/api/fastapi-client';
import { ReportTaskFallback } from '@/components/files/ReportTaskFallback';

const ReportPageClient: React.FC = () => {
  const search = useSearchParams();
  const planId = useMemo(() => (search?.get('planId') ?? '').trim(), [search]);
  const fromRecovery = (search?.get('from') ?? '') === 'recovery';
  const [reportData, setReportData] = useState<StructuredReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showRawContent, setShowRawContent] = useState<Record<string, boolean>>({});

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

  // Extract unique stages for filter dropdown
  const stages = useMemo(() => {
    if (!reportData) return [];
    const uniqueStages = new Set<string>();
    reportData.sections.forEach(section => {
      if (section.stage) uniqueStages.add(section.stage);
    });
    return Array.from(uniqueStages).sort();
  }, [reportData]);

  // Filter sections based on search and stage
  const filteredSections = useMemo(() => {
    if (!reportData) return [];
    return reportData.sections.filter(section => {
      const matchesSearch = searchTerm === '' || 
        section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        section.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        section.filename.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStage = selectedStage === 'all' || section.stage === selectedStage;
      
      return matchesSearch && matchesStage;
    });
  }, [reportData, searchTerm, selectedStage]);

  const renderSection = (section: ReportSection) => {
    let content = section.content;
    let isJson = false;
    
    // Try to parse JSON content for better formatting
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object') {
        content = JSON.stringify(parsed, null, 2);
        isJson = true;
      }
    } catch {
      // Keep as-is if not JSON
    }

    const isCollapsed = collapsedSections.has(section.id);
    const showRaw = showRawContent[section.id] || false;

    return (
      <Card key={section.id} className="mb-4 border shadow-sm">
        <CardHeader 
          className="hover:bg-gray-50 transition-colors cursor-pointer"
          onClick={() => {
            setCollapsedSections(prev => {
              const newSet = new Set(prev);
              if (newSet.has(section.id)) {
                newSet.delete(section.id);
              } else {
                newSet.add(section.id);
              }
              return newSet;
            });
          }}
        >
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <FileText className="h-5 w-5" />
              {section.title}
            </div>
            <div className="flex items-center gap-2">
              {isJson && (
                <Badge variant="secondary" className="text-xs">
                  <Code className="h-3 w-3 mr-1" />
                  JSON
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {section.stage || 'Unknown'}
              </Badge>
            </div>
          </CardTitle>
          {section.stage && (
            <div className="text-sm text-gray-500 ml-7">
              Stage: {section.stage} • File: {section.filename}
            </div>
          )}
        </CardHeader>
        {!isCollapsed && (
          <CardContent className="pt-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(content);
                      setCopiedSection(section.id);
                      setTimeout(() => setCopiedSection(null), 2000);
                    }}
                  >
                    {copiedSection === section.id ? (
                      <Check className="h-4 w-4 mr-1" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    Copy
                  </Button>
                  {isJson && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowRawContent(prev => ({
                          ...prev,
                          [section.id]: !prev[section.id]
                        }));
                      }}
                    >
                      {showRaw ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                      {showRaw ? 'Formatted' : 'Raw'}
                    </Button>
                  )}
                </div>
              </div>
              {isJson && !showRaw ? (
                <pre className="text-sm bg-gray-900 text-gray-100 p-4 rounded overflow-auto">
                  {content}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded overflow-auto max-h-96">
                  {content}
                </pre>
              )}
            </CardContent>
        )}
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
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {filteredSections.length} of {reportData.sections.length} sections from {reportData.source}
                  {reportData.generated_at && (
                    <span> • Generated {new Date(reportData.generated_at).toLocaleString()}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCollapsedSections(new Set(reportData.sections.map(s => s.id)));
                    }}
                  >
                    Collapse All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCollapsedSections(new Set());
                    }}
                  >
                    Expand All
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search sections..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <select
                    value={selectedStage}
                    onChange={(e) => setSelectedStage(e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm bg-white"
                  >
                    <option value="all">All Stages</option>
                    {stages.map(stage => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {filteredSections.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-gray-500">No sections match your filters.</p>
                </CardContent>
              </Card>
            ) : (
              filteredSections.map(renderSection)
            )}
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
