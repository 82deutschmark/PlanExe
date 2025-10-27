/**
 * Author: Cascade
 * Date: 2025-10-27
 * PURPOSE: Display real-time API call telemetry including call counters, response times, and provider status.
 * SRP and DRY check: Pass - Focuses on displaying API telemetry data only.
 */
'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Wifi, WifiOff, Zap, Clock, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface APICallMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  currentModel: string;
  lastResponseTime: number | null;
  averageResponseTime: number | null;
  providerStatus: 'connected' | 'error' | 'unknown';
  recentResponseTimes: number[];
  lastError?: string | null;
}

interface APITelemetryStripProps {
  metrics: APICallMetrics;
  activeTimeoutCountdown?: number | null;
}

export const APITelemetryStrip: React.FC<APITelemetryStripProps> = ({
  metrics,
  activeTimeoutCountdown,
}) => {
  // Calculate derived metrics
  const successRate = useMemo(() => {
    if (metrics.totalCalls === 0) return 0;
    return Math.round((metrics.successfulCalls / metrics.totalCalls) * 100);
  }, [metrics.successfulCalls, metrics.totalCalls]);

  const responseTrend = useMemo(() => {
    if (metrics.recentResponseTimes.length < 2) return 'stable';
    const recent = metrics.recentResponseTimes.slice(-3);
    const older = metrics.recentResponseTimes.slice(-6, -3);
    if (recent.length === 0 || older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    if (recentAvg < olderAvg * 0.9) return 'improving';
    if (recentAvg > olderAvg * 1.1) return 'degrading';
    return 'stable';
  }, [metrics.recentResponseTimes]);

  const miniSparkline = useMemo(() => {
    if (metrics.recentResponseTimes.length === 0) return null;
    
    const max = Math.max(...metrics.recentResponseTimes);
    const min = Math.min(...metrics.recentResponseTimes);
    const range = max - min || 1;
    
    return (
      <div className="flex items-end gap-0.5 h-4">
        {metrics.recentResponseTimes.slice(-10).map((time, index) => {
          const height = ((time - min) / range) * 100;
          return (
            <div
              key={index}
              className="w-1 bg-amber-400 rounded-sm"
              style={{ height: `${Math.max(height, 10)}%` }}
            />
          );
        })}
      </div>
    );
  }, [metrics.recentResponseTimes]);

  const statusColor = metrics.providerStatus === 'connected' ? 'text-green-600' : 
                     metrics.providerStatus === 'error' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg p-3 border border-slate-200 space-y-3">
      {/* Header with provider status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 ${statusColor}`}>
            {metrics.providerStatus === 'connected' ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">API Telemetry</span>
          </div>
          {activeTimeoutCountdown !== undefined && activeTimeoutCountdown !== null && activeTimeoutCountdown > 0 && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {activeTimeoutCountdown}s
            </Badge>
          )}
        </div>
        <div className="text-xs text-gray-500">
          Model: <span className="font-mono">{metrics.currentModel || 'Unknown'}</span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Call counters */}
        <div className="space-y-1">
          <div className="text-xs text-gray-600">API Calls</div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold">{metrics.totalCalls}</span>
            <div className="flex gap-1">
              <Badge variant="secondary" className="text-xs px-1 py-0">
                ✓{metrics.successfulCalls}
              </Badge>
              {metrics.failedCalls > 0 && (
                <Badge variant="destructive" className="text-xs px-1 py-0">
                  ✗{metrics.failedCalls}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Success rate */}
        <div className="space-y-1">
          <div className="text-xs text-gray-600">Success Rate</div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{successRate}%</span>
            <Progress value={successRate} className="h-2 flex-1" />
          </div>
        </div>

        {/* Response time */}
        <div className="space-y-1">
          <div className="text-xs text-gray-600">Last Response</div>
          <div className="flex items-center gap-1">
            {metrics.lastResponseTime !== null ? (
              <>
                <span className="text-sm font-semibold">{metrics.lastResponseTime}ms</span>
                {responseTrend === 'improving' && <TrendingUp className="h-3 w-3 text-green-500" />}
                {responseTrend === 'degrading' && <TrendingDown className="h-3 w-3 text-red-500" />}
              </>
            ) : (
              <span className="text-sm text-gray-400">--</span>
            )}
          </div>
        </div>

        {/* Average response time */}
        <div className="space-y-1">
          <div className="text-xs text-gray-600">Average</div>
          <div className="flex items-center gap-1">
            {metrics.averageResponseTime !== null ? (
              <span className="text-sm font-semibold">{metrics.averageResponseTime}ms</span>
            ) : (
              <span className="text-sm text-gray-400">--</span>
            )}
          </div>
        </div>
      </div>

      {/* Response time sparkline */}
      {miniSparkline && (
        <div className="space-y-1">
          <div className="text-xs text-gray-600">Response Times (Last 10)</div>
          {miniSparkline}
        </div>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-3 text-xs">
        <div className={`flex items-center gap-1 ${statusColor}`}>
          <Zap className="h-3 w-3" />
          <span>Provider: {metrics.providerStatus}</span>
        </div>
        {metrics.failedCalls > 0 && (
          <div className="flex items-center gap-1 text-orange-600">
            <AlertCircle className="h-3 w-3" />
            <span>{metrics.failedCalls} failed calls</span>
            {metrics.lastError && (
              <span className="text-xs text-gray-500 ml-1 truncate max-w-32" title={metrics.lastError}>
                ({metrics.lastError})
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
