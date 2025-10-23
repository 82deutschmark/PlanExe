/**
 * Author: Claude (Sonnet 4.5)
 * Date: 2025-10-23
 * PURPOSE: Collapsible system log drawer that auto-expands on errors, showing Luigi
 *          pipeline logs and connection status for the Focused Stage Recovery UI.
 * SRP/DRY: Pass - focused on log display and error visibility only
 */

'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Pin, PinOff } from 'lucide-react';
import type { RecoveryConnectionState } from '@/lib/types/recovery';

export interface LogEntry {
  timestamp: string;
  text: string;
  level?: 'info' | 'error' | 'warn' | 'debug';
}

export interface SystemLogDrawerProps {
  logs?: LogEntry[];
  connection: RecoveryConnectionState;
  hasErrors?: boolean;
  className?: string;
}

function getConnectionStatusColor(status: RecoveryConnectionState['status']): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
      return 'bg-yellow-500 animate-pulse';
    case 'error':
      return 'bg-red-500';
    case 'closed':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
}

function getLogLevelColor(level: LogEntry['level']): string {
  switch (level) {
    case 'error':
      return 'text-red-600 dark:text-red-400';
    case 'warn':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'debug':
      return 'text-gray-500 dark:text-gray-400';
    default:
      return 'text-foreground';
  }
}

export const SystemLogDrawer: React.FC<SystemLogDrawerProps> = ({
  logs = [],
  connection,
  hasErrors = false,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  // Auto-expand on errors (unless pinned closed)
  useEffect(() => {
    if (hasErrors && !isPinned) {
      setIsExpanded(true);
    }
  }, [hasErrors, isPinned]);

  const errorCount = logs.filter((log) => log.level === 'error').length;
  const warnCount = logs.filter((log) => log.level === 'warn').length;
  const lastLog = logs[logs.length - 1];

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
    if (isExpanded) {
      setIsPinned(false); // Unpin when manually collapsing
    }
  };

  const handlePin = () => {
    setIsPinned((prev) => !prev);
  };

  return (
    <div className={cn('flex flex-col bg-card border-t border-border', className)}>
      {/* Drawer Handle */}
      <button
        onClick={handleToggle}
        className="flex items-center justify-between px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
            <span className="text-sm font-semibold text-foreground">System Logs</span>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-2 text-xs">
            <div className={cn('w-2 h-2 rounded-full', getConnectionStatusColor(connection.status))} />
            <span className="text-muted-foreground">
              {connection.mode === 'websocket' ? 'WebSocket' : 'Polling'} •{' '}
              {connection.status}
            </span>
          </div>

          {/* Error/Warn Badges */}
          {errorCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {warnCount > 0 && (
            <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-700">
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </Badge>
          )}

          {/* Last Log Preview */}
          {!isExpanded && lastLog && (
            <span className="text-xs text-muted-foreground truncate max-w-md">
              {lastLog.text}
            </span>
          )}
        </div>

        {/* Pin Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={(e) => {
            e.stopPropagation();
            handlePin();
          }}
          title={isPinned ? 'Unpin drawer' : 'Pin drawer open'}
        >
          {isPinned ? (
            <PinOff className="h-3 w-3" />
          ) : (
            <Pin className="h-3 w-3" />
          )}
        </Button>
      </button>

      {/* Drawer Content */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/20">
          <div className="h-64 overflow-y-auto p-4 font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground italic py-8">
                No logs yet. Waiting for pipeline activity...
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0">[{log.timestamp}]</span>
                    <span className={cn('flex-1', getLogLevelColor(log.level))}>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connection Details (when expanded) */}
          {connection.error && (
            <div className="border-t border-border px-4 py-2 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              <strong>Connection Error:</strong> {connection.error}
            </div>
          )}

          <div className="border-t border-border px-4 py-2 bg-muted/50 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              {connection.lastEventAt && (
                <span>
                  Last event: {connection.lastEventAt.toLocaleTimeString()}
                </span>
              )}
              {connection.lastHeartbeatAt && (
                <span>
                  Last heartbeat: {connection.lastHeartbeatAt.toLocaleTimeString()}
                </span>
              )}
            </div>
            <span className="font-mono">
              {logs.length} log line{logs.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
