/**
 * Author: Claude (Sonnet 4.5)
 * Date: 2025-10-23
 * PURPOSE: Center stage component displaying live LLM streaming output and reasoning
 *          for the active Luigi pipeline task in the Focused Stage Recovery UI.
 * SRP/DRY: Pass - focused on active task streaming display, reuses Terminal.tsx patterns
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, Copy, FileJson, Loader2, XCircle } from 'lucide-react';
import { LLMStreamState } from '../useRecoveryPlan';

export interface ActiveTaskStageProps {
  stream: LLMStreamState | null;
  className?: string;
}

function formatTokenCount(count: number | undefined): string {
  if (count === undefined || count === null) return '—';
  return count.toLocaleString();
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch((err) => {
    console.error('Failed to copy to clipboard:', err);
  });
}

export const ActiveTaskStage: React.FC<ActiveTaskStageProps> = ({ stream, className }) => {
  const outputRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    if (stream?.status === 'running' && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [stream?.textBuffer, stream?.status]);

  useEffect(() => {
    if (stream?.status === 'running' && reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [stream?.reasoningBuffer, stream?.status]);

  if (!stream) {
    return (
      <Card className={cn('flex flex-col items-center justify-center h-full bg-muted/20', className)}>
        <div className="text-center space-y-3 p-8">
          <div className="text-4xl text-muted-foreground">🎭</div>
          <h3 className="text-lg font-semibold text-muted-foreground">No Active Task</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Waiting for Luigi pipeline to start executing tasks. The active task will appear here when streaming begins.
          </p>
        </div>
      </Card>
    );
  }

  const statusStyles =
    stream.status === 'completed'
      ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700'
      : stream.status === 'failed'
        ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-700'
        : 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700 animate-pulse';

  const outputText = stream.finalText ?? stream.textBuffer ?? stream.textDeltas.join('');
  const reasoningText = stream.finalReasoning ?? stream.reasoningBuffer ?? stream.reasoningDeltas.join('\n');

  const hasOutput = outputText.trim().length > 0;
  const hasReasoning = reasoningText.trim().length > 0;

  return (
    <div className={cn('flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden', className)}>
      {/* Task Header */}
      <div className="shrink-0 border-b border-border px-6 py-4 bg-muted/30">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{stream.taskName || stream.stage}</h2>
            {stream.promptPreview && (
              <p className="mt-1 text-xs text-muted-foreground truncate" title={stream.promptPreview}>
                {stream.promptPreview}
              </p>
            )}
          </div>
          <Badge className={cn('shrink-0 border', statusStyles)}>
            {stream.status === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {stream.status === 'completed' && <Check className="mr-1 h-3 w-3" />}
            {stream.status === 'failed' && <XCircle className="mr-1 h-3 w-3" />}
            {stream.status}
          </Badge>
        </div>

        {/* Token Usage */}
        {stream.usage && (
          <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Input:</span>{' '}
              <span className="font-mono text-foreground">{formatTokenCount(stream.usage.inputTokens)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Output:</span>{' '}
              <span className="font-mono text-foreground">{formatTokenCount(stream.usage.outputTokens)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Reasoning:</span>{' '}
              <span className="font-mono text-foreground">{formatTokenCount(stream.usage.reasoningTokens)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total:</span>{' '}
              <span className="font-mono font-semibold text-foreground">{formatTokenCount(stream.usage.totalTokens)}</span>
            </div>
          </div>
        )}

        {stream.error && (
          <div className="mt-3 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            <strong>Error:</strong> {stream.error}
          </div>
        )}
      </div>

      {/* Streaming Panels */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 p-4">
        {/* Model Output Panel */}
        <div className="flex flex-col min-h-0 rounded-lg border border-border bg-background overflow-hidden">
          <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-2 bg-muted/50">
            <h3 className="text-sm font-semibold text-foreground">Model Output</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => copyToClipboard(outputText)}
              disabled={!hasOutput}
              title="Copy output to clipboard"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div
            ref={outputRef}
            className="flex-1 min-h-0 overflow-y-auto p-4 text-sm font-mono leading-relaxed"
          >
            {hasOutput ? (
              <pre className="whitespace-pre-wrap break-words text-foreground">{outputText}</pre>
            ) : (
              <p className="text-muted-foreground italic">
                {stream.status === 'running' ? 'Waiting for output...' : 'No output available'}
              </p>
            )}
            {stream.status === 'running' && hasOutput && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
            )}
          </div>
        </div>

        {/* Reasoning Trace Panel */}
        <div className="flex flex-col min-h-0 rounded-lg border border-border bg-background overflow-hidden">
          <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-2 bg-muted/50">
            <h3 className="text-sm font-semibold text-foreground">Reasoning Trace</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => copyToClipboard(reasoningText)}
              disabled={!hasReasoning}
              title="Copy reasoning to clipboard"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div
            ref={reasoningRef}
            className="flex-1 min-h-0 overflow-y-auto p-4 text-sm font-mono leading-relaxed"
          >
            {hasReasoning ? (
              <pre className="whitespace-pre-wrap break-words text-muted-foreground">{reasoningText}</pre>
            ) : (
              <p className="text-muted-foreground italic">
                {stream.status === 'running' ? 'Waiting for reasoning...' : 'No reasoning available'}
              </p>
            )}
            {stream.status === 'running' && hasReasoning && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 border-t border-border px-6 py-3 bg-muted/30 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Stage: <span className="font-mono text-foreground">{stream.stage}</span>
        </div>
        <div className="flex items-center gap-2">
          {stream.rawPayload && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('Raw Payload:', stream.rawPayload);
                alert('Raw payload logged to console. Open DevTools to inspect.');
              }}
              title="View raw payload in console"
            >
              <FileJson className="mr-2 h-3 w-3" />
              View Raw Data
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
