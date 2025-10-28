/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: Extract and display actionable insights from streaming pipeline data including
 *          performance metrics, stage timeline, token usage, and recent activity.
 * SRP and DRY check: Pass - Focuses on parsing and presenting pipeline insights only.
 */
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Zap, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle,
  Activity,
  BarChart3
} from 'lucide-react';
import type { LLMStreamState, StageSummary } from '../useRecoveryPlan';

interface PipelineInsightsProps {
  llmStreams: {
    active: LLMStreamState | null;
    history: LLMStreamState[];
  };
  stageSummary: StageSummary[]; // Available for future enhancements
  planCreatedAt: Date | null;
}

interface StageMetrics {
  stage: string;
  count: number;
  totalTokens: number;
  avgDuration: number;
  status: 'completed' | 'active' | 'pending';
}

interface RecentActivity {
  timestamp: Date;
  type: 'start' | 'complete' | 'fail' | 'warning';
  stage: string;
  message: string;
  interactionId?: number;
}

export const PipelineInsights: React.FC<PipelineInsightsProps> = ({
  llmStreams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  stageSummary,
  planCreatedAt,
}) => {
  // Calculate stage-level metrics
  const stageMetrics = useMemo(() => {
    const metrics = new Map<string, StageMetrics>();
    
    const allStreams = [...llmStreams.history, ...(llmStreams.active ? [llmStreams.active] : [])];
    
    allStreams.forEach(stream => {
      const stage = stream.stage || 'unknown';
      const existing = metrics.get(stage) || {
        stage,
        count: 0,
        totalTokens: 0,
        avgDuration: 0,
        status: 'pending' as const,
      };
      
      existing.count += 1;
      
      // Extract token usage
      if (stream.usage && typeof stream.usage === 'object') {
        const usage = stream.usage as Record<string, unknown>;
        if (typeof usage.total_tokens === 'number') {
          existing.totalTokens += usage.total_tokens;
        }
        
        // Calculate duration
        if (typeof usage.duration_seconds === 'number') {
          existing.avgDuration = (existing.avgDuration * (existing.count - 1) + usage.duration_seconds) / existing.count;
        }
      }
      
      // Update status
      if (stream.status === 'running') {
        existing.status = 'active';
      } else if (stream.status === 'completed' && existing.status !== 'active') {
        existing.status = 'completed';
      }
      
      metrics.set(stage, existing);
    });
    
    return Array.from(metrics.values()).sort((a, b) => b.totalTokens - a.totalTokens);
  }, [llmStreams]);

  // Extract recent activity timeline
  const recentActivity = useMemo(() => {
    const activities: RecentActivity[] = [];
    
    const allStreams = [...llmStreams.history, ...(llmStreams.active ? [llmStreams.active] : [])];
    
    allStreams.forEach(stream => {
      // Add completion events
      if (stream.status === 'completed') {
        activities.push({
          timestamp: new Date(stream.lastUpdated),
          type: 'complete',
          stage: stream.stage,
          message: `Completed ${stream.stage}`,
          interactionId: stream.interactionId,
        });
      }
      
      // Add failure events
      if (stream.status === 'failed') {
        activities.push({
          timestamp: new Date(stream.lastUpdated),
          type: 'fail',
          stage: stream.stage,
          message: stream.error || 'Task failed',
          interactionId: stream.interactionId,
        });
      }
      
      // Extract warnings from reasoning or text
      if (stream.reasoningBuffer || stream.textBuffer) {
        const content = (stream.reasoningBuffer || '') + (stream.textBuffer || '');
        const lowerContent = content.toLowerCase();
        
        if (lowerContent.includes('warning') || lowerContent.includes('caution')) {
          const warningMatch = content.match(/(warning|caution):?\s*([^\n.]{10,100})/i);
          if (warningMatch) {
            activities.push({
              timestamp: new Date(stream.lastUpdated),
              type: 'warning',
              stage: stream.stage,
              message: warningMatch[2].trim(),
              interactionId: stream.interactionId,
            });
          }
        }
      }
    });
    
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
  }, [llmStreams]);

  // Calculate overall performance metrics
  const performanceMetrics = useMemo(() => {
    const completedStreams = llmStreams.history.filter(s => s.status === 'completed');
    
    const totalTokens = completedStreams.reduce((sum, stream) => {
      if (stream.usage && typeof stream.usage === 'object') {
        const usage = stream.usage as Record<string, unknown>;
        return sum + (typeof usage.total_tokens === 'number' ? usage.total_tokens : 0);
      }
      return sum;
    }, 0);
    
    const durations = completedStreams
      .map(stream => {
        if (stream.usage && typeof stream.usage === 'object') {
          const usage = stream.usage as Record<string, unknown>;
          return typeof usage.duration_seconds === 'number' ? usage.duration_seconds : 0;
        }
        return 0;
      })
      .filter(d => d > 0);
    
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;
    
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
    
    // Calculate throughput
    let throughput = 0;
    if (planCreatedAt) {
      const elapsedMinutes = (Date.now() - planCreatedAt.getTime()) / (1000 * 60);
      throughput = elapsedMinutes > 0 ? completedStreams.length / elapsedMinutes : 0;
    }
    
    return {
      totalTokens,
      avgDuration: Math.round(avgDuration * 100) / 100,
      maxDuration: Math.round(maxDuration * 100) / 100,
      minDuration: Math.round(minDuration * 100) / 100,
      throughput: Math.round(throughput * 10) / 10,
    };
  }, [llmStreams.history, planCreatedAt]);

  const getActivityIcon = (type: RecentActivity['type']) => {
    switch (type) {
      case 'complete':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'fail':
        return <AlertTriangle className="h-3 w-3 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-3 w-3 text-orange-500" />;
      default:
        return <Activity className="h-3 w-3 text-blue-600" />;
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          Pipeline Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Performance Overview */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-700">Performance Metrics</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-blue-50 rounded p-2 border border-blue-200">
              <div className="text-[10px] text-gray-600">Total Tokens</div>
              <div className="text-sm font-semibold text-blue-900">
                {performanceMetrics.totalTokens.toLocaleString()}
              </div>
            </div>
            <div className="bg-green-50 rounded p-2 border border-green-200">
              <div className="text-[10px] text-gray-600">Avg Duration</div>
              <div className="text-sm font-semibold text-green-900">
                {formatDuration(performanceMetrics.avgDuration)}
              </div>
            </div>
            <div className="bg-purple-50 rounded p-2 border border-purple-200">
              <div className="text-[10px] text-gray-600">Throughput</div>
              <div className="text-sm font-semibold text-purple-900">
                {performanceMetrics.throughput} tasks/min
              </div>
            </div>
            <div className="bg-orange-50 rounded p-2 border border-orange-200">
              <div className="text-[10px] text-gray-600">Peak Duration</div>
              <div className="text-sm font-semibold text-orange-900">
                {formatDuration(performanceMetrics.maxDuration)}
              </div>
            </div>
          </div>
        </div>

        {/* Stage Performance Breakdown */}
        {stageMetrics.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-700 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Top Stages by Token Usage
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {stageMetrics.slice(0, 8).map((metric, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200 text-xs"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge 
                      variant={metric.status === 'completed' ? 'default' : metric.status === 'active' ? 'secondary' : 'outline'}
                      className="text-[10px] px-1 py-0"
                    >
                      {metric.count}×
                    </Badge>
                    <span className="font-medium truncate">{metric.stage}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-600">
                    <div className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {metric.totalTokens.toLocaleString()}
                    </div>
                    {metric.avgDuration > 0 && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(metric.avgDuration)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity Timeline */}
        {recentActivity.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-700 flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Recent Activity
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recentActivity.map((activity, index) => (
                <div 
                  key={index}
                  className={`flex items-start gap-2 p-2 rounded border text-xs ${
                    activity.type === 'fail' 
                      ? 'bg-red-50 border-red-200' 
                      : activity.type === 'warning'
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="pt-0.5">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{activity.stage}</span>
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">
                        {activity.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-gray-700 break-words mt-0.5">
                      {activity.message}
                    </div>
                    {activity.interactionId && (
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        ID: #{activity.interactionId}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
