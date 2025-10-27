/**
 * Author: Cascade
 * Date: 2025-10-27
 * PURPOSE: Display live task activity feed showing currently executing tasks, duration, and queued tasks.
 * SRP and DRY check: Pass - Focuses on displaying live task activity only.
 */
'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, Clock, Play, Pause, CheckCircle, Loader, Cpu } from 'lucide-react';

interface TaskInfo {
  id: string;
  name: string;
  stage: string;
  status: 'running' | 'completed' | 'queued' | 'failed';
  startTime: Date | null;
  duration: number | null; // in seconds
  estimatedDuration: number | null; // in seconds
}

interface LiveTaskTickerProps {
  currentTask: TaskInfo | null;
  queuedTasks: TaskInfo[];
  workerStatus: 'active' | 'idle' | 'error';
  subprocessPid?: number | null;
}

export const LiveTaskTicker: React.FC<LiveTaskTickerProps> = ({
  currentTask,
  queuedTasks,
  workerStatus,
  subprocessPid,
}) => {
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getTaskIcon = (status: TaskInfo['status']) => {
    switch (status) {
      case 'running':
        return <Loader className="h-3 w-3 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'queued':
        return <Pause className="h-3 w-3 text-gray-400" />;
      case 'failed':
        return <Activity className="h-3 w-3 text-red-500" />;
      default:
        return <Play className="h-3 w-3" />;
    }
  };

  const getStatusColor = (status: TaskInfo['status']) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 bg-blue-50';
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'queued':
        return 'text-gray-600 bg-gray-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getWorkerStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'idle':
        return 'text-gray-500';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  const taskProgress = useMemo(() => {
    if (!currentTask || currentTask.status !== 'running' || !currentTask.estimatedDuration) {
      return 0;
    }
    if (!currentTask.duration) return 0;
    return Math.min((currentTask.duration / currentTask.estimatedDuration) * 100, 95);
  }, [currentTask]);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200 space-y-3">
      {/* Header with worker status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 ${getWorkerStatusColor(workerStatus)}`}>
            <Cpu className="h-4 w-4" />
            <span className="text-sm font-medium">Live Task Activity</span>
          </div>
          <Badge variant="outline" className={`text-xs ${getWorkerStatusColor(workerStatus)}`}>
            {workerStatus}
          </Badge>
        </div>
        {subprocessPid && (
          <div className="text-xs text-gray-500">
            PID: <span className="font-mono">{subprocessPid}</span>
          </div>
        )}
      </div>

      {/* Current task */}
      {currentTask ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getTaskIcon(currentTask.status)}
              <span className="text-sm font-medium truncate">{currentTask.name}</span>
            </div>
            <Badge className={`text-xs ${getStatusColor(currentTask.status)}`}>
              {currentTask.stage}
            </Badge>
          </div>
          
          {/* Task progress and duration */}
          <div className="space-y-1">
            {currentTask.status === 'running' && taskProgress > 0 && (
              <Progress value={taskProgress} className="h-2" />
            )}
            <div className="flex items-center gap-3 text-xs text-gray-600">
              {currentTask.startTime && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    Started {currentTask.startTime.toLocaleTimeString()}
                  </span>
                </div>
              )}
              {currentTask.duration !== null && (
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  <span>Duration: {formatDuration(currentTask.duration)}</span>
                </div>
              )}
              {currentTask.estimatedDuration && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>ETA: {formatDuration(currentTask.estimatedDuration)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">
          No task currently executing
        </div>
      )}

      {/* Queued tasks */}
      {queuedTasks.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-700">
            Queue ({queuedTasks.length} tasks)
          </div>
          <div className="space-y-1 max-h-20 overflow-y-auto">
            {queuedTasks.slice(0, 5).map((task, index) => (
              <div key={task.id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-4">{index + 1}.</span>
                {getTaskIcon(task.status)}
                <span className="truncate flex-1">{task.name}</span>
                <Badge variant="outline" className="text-xs">
                  {task.stage}
                </Badge>
              </div>
            ))}
            {queuedTasks.length > 5 && (
              <div className="text-xs text-gray-500 italic">
                ... and {queuedTasks.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Worker status details */}
      <div className="flex items-center gap-3 text-xs text-gray-600 pt-2 border-t border-blue-200">
        <div className="flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          <span>Luigi Worker: {workerStatus}</span>
        </div>
        {currentTask?.status === 'running' && (
          <div className="flex items-center gap-1">
            <Play className="h-3 w-3" />
            <span>Task Active</span>
          </div>
        )}
        {queuedTasks.length > 0 && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{queuedTasks.length} queued</span>
          </div>
        )}
      </div>
    </div>
  );
};
