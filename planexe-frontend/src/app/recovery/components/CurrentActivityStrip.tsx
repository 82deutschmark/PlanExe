/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: MEGA INFO STRIP - Combines activity + header data into ONE ultra-dense bar
 * SRP and DRY check: Pass - Single unified status bar
 */
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Activity, Clock, Zap, Wifi, WifiOff, CheckCircle, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { LLMStreamState, RecoveryConnectionState } from '../useRecoveryPlan';
import type { PlanResponse } from '@/lib/api/fastapi-client';

interface CurrentActivityStripProps {
  activeStream: LLMStreamState | null;
  completedCount: number;
  totalTasks: number;
  plan: PlanResponse | null;
  connection: RecoveryConnectionState;
  llmStreams: {
    active: LLMStreamState | null;
    history: LLMStreamState[];
  };
}

export const CurrentActivityStrip: React.FC<CurrentActivityStripProps> = ({
  activeStream,
  completedCount,
  totalTasks,
  plan,
  connection,
  llmStreams,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  const startTime = activeStream?.lastUpdated 
    ? new Date(activeStream.lastUpdated).getTime() 
    : Date.now();
  
  useEffect(() => {
    if (!activeStream) {
      setElapsedSeconds(0);
      return;
    }
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setElapsedSeconds(elapsed);
    }, 100);
    
    return () => clearInterval(interval);
  }, [activeStream, startTime]);
  
  const currentTokens = activeStream?.usage && typeof activeStream.usage === 'object'
    ? (activeStream.usage as Record<string, unknown>).total_tokens as number || 0
    : 0;
  
  const tokensPerSecond = elapsedSeconds > 0 && currentTokens > 0
    ? (currentTokens / elapsedSeconds).toFixed(1)
    : '0';
  
  // Calculate API metrics from LLM streams
  const apiMetrics = useMemo(() => {
    const failed = llmStreams.history.filter(s => s.status === 'failed').length;
    const succeeded = llmStreams.history.filter(s => s.status === 'completed').length;
    const totalTokens = llmStreams.history.reduce((sum, s) => {
      const tokens = s.usage && typeof s.usage === 'object' 
        ? (s.usage as Record<string, unknown>).total_tokens as number || 0
        : 0;
      return sum + tokens;
    }, 0);
    return { failed, succeeded, totalTokens };
  }, [llmStreams]);
  
  const connectionIcon = connection.status === 'connected' && connection.mode === 'websocket'
    ? <Wifi className="h-4 w-4 text-green-400" />
    : <WifiOff className="h-4 w-4 text-yellow-400" />;
  
  const planStatus = plan?.status || 'unknown';
  const statusColor = planStatus === 'completed' ? 'text-green-400'
    : planStatus === 'failed' ? 'text-red-400'
    : planStatus === 'running' ? 'text-blue-400'
    : 'text-gray-400';
  
  const progressPercent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  
  return (
    <div className="bg-slate-900 text-white px-4 py-2 border-b border-slate-700">
      <div className="flex items-center justify-between gap-4">
        {/* LEFT: Current Activity */}
        <div className="flex items-center gap-3">
          {activeStream ? (
            <>
              <Activity className="h-5 w-5 text-blue-400 animate-pulse" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-300">RUNNING:</span>
                <span className="text-base font-mono font-semibold">{activeStream.stage}</span>
              </div>
              <div className="h-5 w-px bg-slate-600" />
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-mono tabular-nums font-semibold">{elapsedSeconds.toFixed(1)}s</span>
              </div>
              {currentTokens > 0 && (
                <>
                  <div className="h-5 w-px bg-slate-600" />
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    <span className="text-sm font-mono">{currentTokens.toLocaleString()}</span>
                    {parseFloat(tokensPerSecond) > 0 && (
                      <span className="text-xs text-slate-400">({tokensPerSecond}/s)</span>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-300">IDLE - Waiting for next task</span>
            </>
          )}
        </div>
        
        {/* CENTER: Progress */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">PROGRESS</span>
              <span className="text-lg font-bold font-mono tabular-nums">{completedCount}/{totalTasks}</span>
              <span className="text-sm text-slate-400">({progressPercent}%)</span>
            </div>
            <div className="w-48 h-1.5 bg-slate-700 rounded-full overflow-hidden mt-0.5">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* RIGHT: System Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {connectionIcon}
            <span className="text-xs text-slate-400">
              {connection.status === 'connected' ? 'LIVE' : connection.mode.toUpperCase()}
            </span>
          </div>
          
          <div className="h-5 w-px bg-slate-600" />
          
          <div className="flex items-center gap-1.5">
            <Database className="h-4 w-4 text-slate-400" />
            <span className="text-xs">
              {apiMetrics.succeeded}<span className="text-slate-500">/</span>
              <span className="text-red-400">{apiMetrics.failed}</span>
            </span>
          </div>
          
          <div className="h-5 w-px bg-slate-600" />
          
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span className="text-xs font-mono">{(apiMetrics.totalTokens / 1000).toFixed(1)}k</span>
          </div>
          
          <div className="h-5 w-px bg-slate-600" />
          
          <Badge variant="outline" className={`text-xs font-semibold ${statusColor} border-current`}>
            {planStatus.toUpperCase()}
          </Badge>
        </div>
      </div>
    </div>
  );
};
