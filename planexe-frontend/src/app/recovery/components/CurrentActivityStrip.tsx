/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: Ultra-dense real-time display of current pipeline activity with live timing
 * SRP and DRY check: Pass - Focuses only on current activity display
 */
'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Clock, Zap, TrendingUp } from 'lucide-react';
import type { LLMStreamState } from '../useRecoveryPlan';

interface CurrentActivityStripProps {
  activeStream: LLMStreamState | null;
  completedCount: number;
  totalTasks: number;
}

export const CurrentActivityStrip: React.FC<CurrentActivityStripProps> = ({
  activeStream,
  completedCount,
  totalTasks,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Calculate start time from lastUpdated
  const startTime = activeStream?.lastUpdated 
    ? new Date(activeStream.lastUpdated).getTime() 
    : Date.now();
  
  // Update elapsed time every 100ms for smooth updates
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
  
  // Extract token info from active stream
  const currentTokens = activeStream?.usage && typeof activeStream.usage === 'object'
    ? (activeStream.usage as Record<string, unknown>).total_tokens as number || 0
    : 0;
  
  const tokensPerSecond = elapsedSeconds > 0 && currentTokens > 0
    ? (currentTokens / elapsedSeconds).toFixed(1)
    : '0';
  
  if (!activeStream) {
    return (
      <div className="bg-slate-800 text-slate-300 px-2 py-1 text-[10px] flex items-center gap-2">
        <Activity className="h-3 w-3" />
        <span>IDLE • Waiting for next task</span>
        <span className="ml-auto">Progress: {completedCount}/{totalTasks}</span>
      </div>
    );
  }
  
  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-2 py-1 flex items-center gap-3 text-[10px] font-mono">
      <div className="flex items-center gap-1">
        <Activity className="h-3 w-3 animate-pulse" />
        <span className="font-bold">ACTIVE</span>
      </div>
      
      <div className="h-3 w-px bg-white/30" />
      
      <div className="flex items-center gap-1">
        <span className="text-blue-100">TASK:</span>
        <span className="font-bold">{activeStream.stage}</span>
      </div>
      
      <div className="h-3 w-px bg-white/30" />
      
      <div className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        <span className="font-bold tabular-nums">{elapsedSeconds.toFixed(1)}s</span>
      </div>
      
      <div className="h-3 w-px bg-white/30" />
      
      <div className="flex items-center gap-1">
        <Zap className="h-3 w-3" />
        <span>{currentTokens.toLocaleString()} tokens</span>
        {parseFloat(tokensPerSecond) > 0 && (
          <span className="text-blue-200">({tokensPerSecond}/s)</span>
        )}
      </div>
      
      <div className="h-3 w-px bg-white/30" />
      
      <div className="flex items-center gap-1">
        <TrendingUp className="h-3 w-3" />
        <span>#{activeStream.interactionId}</span>
      </div>
      
      <div className="ml-auto flex items-center gap-1">
        <span className="text-blue-100">Progress:</span>
        <span className="font-bold">{completedCount}/{totalTasks}</span>
        <span className="text-blue-200">({Math.round((completedCount / totalTasks) * 100)}%)</span>
      </div>
    </div>
  );
};
