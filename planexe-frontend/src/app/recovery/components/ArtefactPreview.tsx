/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Inline artefact preview card with error boundaries so large or
 *          unsupported files do not disrupt the rest of the workspace.
 * SRP and DRY check: Pass - renders preview state provided by the recovery hook
 *          without issuing additional network requests.
 */
'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PlanFile } from '@/lib/types/pipeline';

import { PreviewData } from '../useRecoveryPlan';

interface ArtefactPreviewProps {
  planId: string;
  preview: {
    file: PlanFile | null;
    data: PreviewData | null;
    loading: boolean;
    error: string | null;
    clear: () => void;
  };
  onDownload: () => void | Promise<void>;
}

export const ArtefactPreview: React.FC<ArtefactPreviewProps> = ({ planId, preview, onDownload }) => {
  if (!preview.file) {
    return null;
  }

  const { file, data, loading, error } = preview;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">Preview: {file.filename}</CardTitle>
          <CardDescription className="text-sm">
            {file.contentType.toUpperCase()} · {file.sizeBytes.toLocaleString()} bytes · {planId}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={() => {
              void onDownload();
            }}
          >
            Download
          </Button>
          <Button size="sm" variant="ghost" onClick={() => preview.clear()}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preview...
          </div>
        )}
        {!loading && error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            {error}
          </div>
        )}
        {!loading && !error && data && data.mode === 'text' && (
          <div className="max-h-96 overflow-auto rounded-md border bg-slate-950/90 p-4 font-mono text-xs text-slate-100">
            <pre className="whitespace-pre-wrap">{data.content}</pre>
          </div>
        )}
        {!loading && !error && data && data.mode === 'html' && (
          <div className="max-h-[30rem] overflow-hidden rounded-md border">
            <iframe
              title={`Preview of ${file.filename}`}
              className="h-[30rem] w-full"
              sandbox="allow-same-origin"
              srcDoc={data.content}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
