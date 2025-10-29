/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: Real-time visual DAG showing all 61 Luigi tasks being assembled and completed
 * SRP and DRY check: Pass - Focuses only on pipeline visualization
 */
'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Loader2, Zap, ArrowRight, Eye, FileText, Brain, Activity, Database } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PIPELINE_TASKS, STAGE_GROUPS, getTaskByStage, type PipelineTask } from '../constants/pipeline-tasks';
import type { LLMStreamState } from '../useRecoveryPlan';
import { StreamDetailModal } from './StreamDetailModal';

interface LivePipelineDAGProps {
  llmStreams: {
    active: LLMStreamState | null;
    history: LLMStreamState[];
  };
}

export const LivePipelineDAG: React.FC<LivePipelineDAGProps> = ({ llmStreams }) => {
  const [selectedStream, setSelectedStream] = useState<LLMStreamState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Build task status map from streams
  const taskStatusMap = useMemo(() => {
    const map = new Map<number, { status: 'completed' | 'failed' | 'running'; stream?: LLMStreamState }>();
    
    // Process history
    llmStreams.history.forEach(stream => {
      const task = getTaskByStage(stream.stage);
      if (task && stream.status !== 'running') {
        map.set(task.id, { 
          status: stream.status as 'completed' | 'failed',
          stream 
        });
      }
    });
    
    // Process active
    if (llmStreams.active) {
      const task = getTaskByStage(llmStreams.active.stage);
      if (task) {
        map.set(task.id, { 
          status: 'running',
          stream: llmStreams.active 
        });
      }
    }
    
    return map;
  }, [llmStreams]);
  
  // Group tasks by stage
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, PipelineTask[]>();
    PIPELINE_TASKS.forEach(task => {
      const existing = groups.get(task.stageGroup) || [];
      existing.push(task);
      groups.set(task.stageGroup, existing);
    });
    return groups;
  }, []);
  
  const handleTaskClick = (taskId: number) => {
    const status = taskStatusMap.get(taskId);
    if (status?.stream) {
      setSelectedStream(status.stream);
      setModalOpen(true);
    }
  };
  
  const getTaskIcon = (taskId: number) => {
    const status = taskStatusMap.get(taskId);
    if (!status) {
      return <Clock className="h-3 w-3 text-gray-400" />;
    }
    
    switch (status.status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-600" />;
      case 'running':
        return <Loader2 className="h-3 w-3 text-blue-600 animate-spin" />;
    }
  };
  
  const getTaskStyle = (taskId: number) => {
    const status = taskStatusMap.get(taskId);
    if (!status) {
      return 'border-gray-200 bg-gray-50 text-gray-600 cursor-default';
    }
    
    switch (status.status) {
      case 'completed':
        return 'border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 text-green-900 cursor-pointer hover:from-green-100 hover:to-emerald-100 hover:border-green-500 hover:shadow-md transition-all duration-200';
      case 'failed':
        return 'border-red-400 bg-gradient-to-r from-red-50 to-rose-50 text-red-900 cursor-pointer hover:from-red-100 hover:to-rose-100 hover:border-red-500 hover:shadow-md transition-all duration-200';
      case 'running':
        return 'border-blue-500 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-900 cursor-pointer hover:from-blue-200 hover:to-cyan-200 hover:border-blue-600 hover:shadow-lg ring-2 ring-blue-400 ring-opacity-60 animate-pulse transition-all duration-200';
    }
  };
  
  const completedCount = Array.from(taskStatusMap.values()).filter(s => s.status === 'completed').length;
  const failedCount = Array.from(taskStatusMap.values()).filter(s => s.status === 'failed').length;
  const runningCount = Array.from(taskStatusMap.values()).filter(s => s.status === 'running').length;
  
  return (
    <>
      <Card className="border-indigo-300">
        <CardHeader className="pb-2 px-3 py-2 border-b bg-indigo-50">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-indigo-600" />
              Luigi Pipeline DAG
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-green-100 border-green-300">
                <CheckCircle className="h-3 w-3 mr-1" />
                {completedCount}
              </Badge>
              {runningCount > 0 && (
                <Badge variant="outline" className="text-xs bg-blue-100 border-blue-300">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {runningCount}
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="outline" className="text-xs bg-red-100 border-red-300">
                  <XCircle className="h-3 w-3 mr-1" />
                  {failedCount}
                </Badge>
              )}
              <span className="text-xs text-gray-500">
                {completedCount + failedCount}/{PIPELINE_TASKS.length}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-3">
            {STAGE_GROUPS.map(group => {
              const tasks = groupedTasks.get(group.name) || [];
              if (tasks.length === 0) return null;
              
              const groupCompleted = tasks.filter(t => taskStatusMap.get(t.id)?.status === 'completed').length;
              const groupRunning = tasks.filter(t => taskStatusMap.get(t.id)?.status === 'running').length > 0;
              
              return (
                <div key={group.name} className={`border rounded p-2 ${group.color} ${groupRunning ? 'ring-1 ring-blue-400' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold flex items-center gap-1">
                      {group.name}
                      {groupRunning && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                    </h3>
                    <span className="text-[10px] text-gray-600">
                      {groupCompleted}/{tasks.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {tasks.map(task => {
                      const status = taskStatusMap.get(task.id);
                      const isClickable = !!status?.stream;
                      
                      return (
                        <TooltipProvider key={task.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => isClickable && handleTaskClick(task.id)}
                                disabled={!isClickable}
                                className={`w-full text-left border rounded-lg p-3 transition-all ${getTaskStyle(task.id)} ${isClickable ? 'hover:scale-[1.02] active:scale-[0.98]' : ''}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    {getTaskIcon(task.id)}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-mono font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">#{task.id}</span>
                                        <span className="text-sm font-semibold text-gray-900">{task.name}</span>
                                        {isClickable && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-current bg-white/50">
                                            <Eye className="h-2.5 w-2.5 mr-1" />
                                            View Details
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-700 font-medium leading-relaxed mb-2">{task.description}</div>
                                      
                                      {/* Rich data preview indicators */}
                                      {isClickable && (
                                        <div className="flex items-center gap-3 text-[10px] text-gray-600 mb-2">
                                          <div className="flex items-center gap-1">
                                            <FileText className="h-3 w-3" />
                                            <span>Output</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <Brain className="h-3 w-3" />
                                            <span>Reasoning</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <Activity className="h-3 w-3" />
                                            <span>{status.stream?.events.length || 0} Events</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <Database className="h-3 w-3" />
                                            <span>Usage</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {status?.status === 'running' && (
                                    <div className="flex flex-col items-center gap-1">
                                      <ArrowRight className="h-4 w-4 text-blue-600 animate-pulse" />
                                      <span className="text-[9px] text-blue-700 font-medium animate-pulse">ACTIVE</span>
                                    </div>
                                  )}
                                </div>

                                {/* Show error message for failed tasks */}
                                {status?.status === 'failed' && status.stream?.error && (
                                  <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-md">
                                    <div className="flex items-center gap-1 mb-1">
                                      <XCircle className="h-3 w-3 text-red-600" />
                                      <span className="text-xs font-bold text-red-900">Error Details:</span>
                                    </div>
                                    <div className="text-xs text-red-800 break-words leading-tight font-mono bg-red-50 p-1.5 rounded">
                                      {status.stream.error}
                                    </div>
                                  </div>
                                )}

                                {/* Show dependencies as enhanced badges */}
                                {task.dependencies.length > 0 && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">Dependencies:</span>
                                    <div className="flex gap-1">
                                      {task.dependencies.slice(0, 4).map(depId => {
                                        const depStatus = taskStatusMap.get(depId);
                                        const depColor = depStatus?.status === 'completed' ? 'bg-green-100 text-green-700 border-green-300' : 
                                                        depStatus?.status === 'failed' ? 'bg-red-100 text-red-700 border-red-300' : 
                                                        'bg-gray-100 text-gray-600 border-gray-300';
                                        return (
                                          <span key={depId} className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-medium ${depColor}`}>
                                            #{depId}
                                          </span>
                                        );
                                      })}
                                      {task.dependencies.length > 4 && (
                                        <span className="text-[9px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                                          +{task.dependencies.length - 4} more
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-md p-4 bg-slate-900 border-slate-700">
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-slate-800 rounded">
                                    {getTaskIcon(task.id)}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-white text-sm">{task.name}</div>
                                    <div className="text-slate-400 text-xs">Task #{task.id} in {task.stageGroup}</div>
                                  </div>
                                </div>
                                
                                <div className="text-slate-300 text-xs leading-relaxed">
                                  {task.description}
                                </div>
                                
                                {isClickable ? (
                                  <div className="space-y-2 pt-2 border-t border-slate-700">
                                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Available Data:</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div className="flex items-center gap-2 text-slate-300">
                                        <FileText className="h-3 w-3 text-blue-400" />
                                        <span>Full LLM Output</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-300">
                                        <Brain className="h-3 w-3 text-purple-400" />
                                        <span>AI Reasoning</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-300">
                                        <Activity className="h-3 w-3 text-green-400" />
                                        <span>{status.stream?.events.length || 0} Timeline Events</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-300">
                                        <Database className="h-3 w-3 text-orange-400" />
                                        <span>Usage & Metrics</span>
                                      </div>
                                    </div>
                                    <div className="pt-2 text-center">
                                      <div className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold">
                                        <Eye className="h-3 w-3" />
                                        Click to explore detailed data
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="pt-2 border-t border-slate-700">
                                    <div className="text-slate-500 text-xs italic text-center">
                                      Task not yet executed - data will appear here when available
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      <StreamDetailModal
        stream={selectedStream}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};
