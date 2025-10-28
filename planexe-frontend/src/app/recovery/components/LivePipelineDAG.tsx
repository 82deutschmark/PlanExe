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
import { CheckCircle, XCircle, Clock, Loader2, Zap, ArrowRight } from 'lucide-react';
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
        return 'border-green-300 bg-green-50 text-green-900 cursor-pointer hover:bg-green-100';
      case 'failed':
        return 'border-red-300 bg-red-50 text-red-900 cursor-pointer hover:bg-red-100';
      case 'running':
        return 'border-blue-400 bg-blue-100 text-blue-900 cursor-pointer hover:bg-blue-150 ring-2 ring-blue-400 animate-pulse';
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
        <CardContent className="p-2 max-h-[600px] overflow-y-auto">
          <div className="space-y-2">
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
                        <button
                          key={task.id}
                          onClick={() => isClickable && handleTaskClick(task.id)}
                          disabled={!isClickable}
                          className={`w-full text-left border rounded p-1.5 transition-all ${getTaskStyle(task.id)}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {getTaskIcon(task.id)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-mono text-gray-500">#{task.id}</span>
                                  <span className="text-[10px] font-medium truncate">{task.name}</span>
                                </div>
                                <div className="text-[9px] text-gray-600 truncate">{task.description}</div>
                              </div>
                            </div>
                            {status?.status === 'running' && (
                              <ArrowRight className="h-3 w-3 text-blue-600 animate-pulse" />
                            )}
                          </div>
                          
                          {/* Show dependencies as tiny badges */}
                          {task.dependencies.length > 0 && (
                            <div className="mt-1 flex items-center gap-1">
                              <span className="text-[8px] text-gray-500">Depends:</span>
                              {task.dependencies.slice(0, 3).map(depId => (
                                <span key={depId} className="text-[8px] px-1 rounded bg-gray-200 text-gray-600">
                                  #{depId}
                                </span>
                              ))}
                              {task.dependencies.length > 3 && (
                                <span className="text-[8px] text-gray-500">
                                  +{task.dependencies.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
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
