/**
 * Author: Claude (Sonnet 4.5)
 * Date: 2025-10-23
 * PURPOSE: Live plan document viewer showing the deliverable being assembled in real-time
 *          from completed Luigi pipeline tasks in the Focused Stage Recovery UI.
 * SRP/DRY: Pass - focused on document assembly and display only
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Copy, Download, Maximize2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export interface PlanSection {
  id: string;
  taskName: string;
  stage: string;
  content: string;
  createdAt: string;
  isFinal: boolean;
}

export interface LivePlanDocumentProps {
  sections?: PlanSection[];
  markdown?: string;
  wordCount?: number;
  isLoading?: boolean;
  isUpdating?: boolean;
  className?: string;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch((err) => {
    console.error('Failed to copy to clipboard:', err);
  });
}

function downloadMarkdown(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const LivePlanDocument: React.FC<LivePlanDocumentProps> = ({
  sections = [],
  markdown = '',
  wordCount = 0,
  isLoading = false,
  isUpdating = false,
  className,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (autoScroll && contentRef.current && isUpdating) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [markdown, autoScroll, isUpdating]);

  const handleScroll = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const hasContent = sections.length > 0 || markdown.trim().length > 0;

  return (
    <Card className={cn('flex flex-col h-full bg-card overflow-hidden', className)}>
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Plan Document</h2>
            {hasContent && (
              <p className="text-xs text-muted-foreground mt-1">
                {sections.length} sections • {wordCount.toLocaleString()} words
                {isUpdating && <span className="ml-2 text-blue-600 dark:text-blue-400 animate-pulse">• Live</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => copyToClipboard(markdown)}
              disabled={!hasContent}
              title="Copy markdown"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => downloadMarkdown(markdown, 'plan-document.md')}
              disabled={!hasContent}
              title="Download markdown"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                // TODO: Implement fullscreen modal
                alert('Fullscreen view coming soon!');
              }}
              disabled={!hasContent}
              title="View fullscreen"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-4"
      >
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-6 w-3/4 mt-6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : !hasContent ? (
          <div className="text-center py-12">
            <div className="text-4xl text-muted-foreground mb-3">📄</div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">No Plan Content Yet</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              The plan document will appear here as Luigi pipeline tasks complete and generate content.
            </p>
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {sections.map((section, index) => {
              const isNew = index === sections.length - 1 && isUpdating;

              return (
                <div
                  key={section.id}
                  className={cn(
                    'mb-6 transition-all duration-300',
                    isNew && 'bg-blue-50/50 dark:bg-blue-950/20 -mx-2 px-2 py-2 rounded-lg animate-fadeIn'
                  )}
                >
                  <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                    {section.taskName}
                    {isNew && (
                      <span className="text-xs font-normal text-blue-600 dark:text-blue-400 animate-pulse">
                        New
                      </span>
                    )}
                  </h3>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {section.content}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Stage: {section.stage} • {new Date(section.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}

            {isUpdating && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
                Document is being updated...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scroll to bottom hint */}
      {!autoScroll && hasContent && (
        <div className="shrink-0 border-t border-border px-4 py-2 bg-blue-50 dark:bg-blue-950/30">
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setAutoScroll(true);
              if (contentRef.current) {
                contentRef.current.scrollTop = contentRef.current.scrollHeight;
              }
            }}
            className="h-auto p-0 text-xs text-blue-600 dark:text-blue-400"
          >
            New content available - click to scroll to bottom
          </Button>
        </div>
      )}
    </Card>
  );
};
