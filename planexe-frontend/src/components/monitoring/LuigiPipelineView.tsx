/**
 * Author: Codex using GPT-5
 * Date: 2024-06-08
 * PURPOSE: Real-time Luigi pipeline visualization showing actual 61 tasks from LUIGI.md while
 *          reusing shared websocket URL construction across monitoring components.
 * SRP and DRY check: Pass - Single responsibility for Luigi pipeline display with shared helper
 *          usage to avoid duplicated connection logic.
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TaskPhase, TaskStatus } from '@/lib/types/pipeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CheckCircle, RefreshCw, XCircle, Clock, Activity, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { createLuigiTaskPhases } from '@/lib/luigi-tasks';
import { fastApiClient, WebSocketMessage } from '@/lib/api/fastapi-client';

// Status icons matching existing TaskList component
const statusIcons: Record<TaskStatus, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-gray-400" />,
  running: <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

interface LuigiPipelineViewProps {
  planId: string;
  className?: string;
}

export const LuigiPipelineView: React.FC<LuigiPipelineViewProps> = ({
  planId,
  className = ''
}) => {
  const [phases, setPhases] = useState<TaskPhase[]>(createLuigiTaskPhases());
  const [wsConnected, setWsConnected] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>('');

  const wsClientRef = useRef<ReturnType<typeof fastApiClient.streamProgress> | null>(null);

  const updateTaskStatus = useCallback((taskId: string, status: TaskStatus, error?: string) => {
    setPhases(prevPhases => {
      return prevPhases.map(phase => {
        const updatedTasks = phase.tasks.map(task => {
          if (task.id === taskId) {
            // Trigger completion animation
            if (status === 'completed' && task.status !== 'completed') {
              setTimeout(() => {
                const element = document.querySelector(`[data-task-id="${taskId}"]`);
                if (element) {
                  element.classList.add('animate-pulse', 'bg-green-100', 'scale-105', 'shadow-lg', 'transition-all', 'duration-500');
                  setTimeout(() => {
                    element.classList.remove('animate-pulse', 'scale-105', 'shadow-lg');
                                        element.classList.add('bg-green-50');
                  }, 800);
                }
              }, 100);
            }
            return { ...task, status, error };
          }
          return task;
        });

        const completedTasks = updatedTasks.filter(task => task.status === 'completed').length;

        return {
          ...phase,
          tasks: updatedTasks,
          completedTasks
        };
      });
    });

    if (status === 'running') {
      setCurrentTask(taskId);
    }
  }, []);

  // Luigi-specific log parsing
  const parseLuigiLogMessage = useCallback((message: string) => {
    // Look for Luigi task completion patterns
    if (message.includes('is complete') || message.includes('completed successfully')) {
      const taskMatch = message.match(/(\w+Task)/);
      if (taskMatch) {
        updateTaskStatus(taskMatch[1], 'completed');
      }
    }

    // Look for running task patterns
    if (message.includes('Running task') || message.includes('Starting') || message.includes('Executing')) {
      const taskMatch = message.match(/(\w+Task)/);
      if (taskMatch) {
        updateTaskStatus(taskMatch[1], 'running');
      }
    }

    // Look for failed task patterns and extract error message
    if (message.includes('FAILED') || message.includes('ERROR') || message.includes('Exception')) {
      const isDiagnosticPipelineLog = message.includes('[PIPELINE]') && !/FAILED|Exception/i.test(message);
      if (isDiagnosticPipelineLog) {
        // Ignore informational instrumentation logs (e.g., "Task.run() CALLED - Luigi worker IS running!")
        const taskMatch = message.match(/(\w+Task)/);
        if (taskMatch) {
          updateTaskStatus(taskMatch[1], 'running');
        }
        return;
      }

      const taskMatch = message.match(/(\w+Task)/);
      if (taskMatch) {
        // Extract error message - try multiple patterns
        let errorMessage = message;

        // Pattern 1: "ERROR: <message>" or "FAILED: <message>"
        const errorPattern1 = message.match(/(?:ERROR|FAILED|Exception):\s*(.+)/i);
        if (errorPattern1) {
          errorMessage = errorPattern1[1].trim();
        } else {
          // Pattern 2: Everything after task name
          const taskNameIndex = message.indexOf(taskMatch[1]);
          if (taskNameIndex !== -1) {
            const afterTaskName = message.substring(taskNameIndex + taskMatch[1].length).trim();
            if (afterTaskName.length > 0) {
              errorMessage = afterTaskName;
            }
          }
        }

        updateTaskStatus(taskMatch[1], 'failed', errorMessage);
      }
    }
  }, [updateTaskStatus]);

  // WebSocket connection using centralized WebSocketClient
  useEffect(() => {
    if (!planId) return;

    const client = fastApiClient.streamProgress(planId);
    wsClientRef.current = client;

    console.log('🔌 Luigi Pipeline connecting to WebSocket');

    const handleMessage = (payload: WebSocketMessage | CloseEvent) => {
      if ('code' in payload) return; // CloseEvent, ignore

      const message = payload;

      // Parse Luigi log messages for task status
      if (message.type === 'log' && 'message' in message && message.message) {
        parseLuigiLogMessage(message.message);
      }

      // Handle pipeline status updates
      if (message.type === 'status') {
        const statusMsg = message as WebSocketMessage & { status?: string };
        if (statusMsg.status === 'completed') {
          console.log('✅ Luigi pipeline completed!');
        } else if (statusMsg.status === 'failed') {
          console.log('❌ Luigi pipeline failed!');
        }
      }

      // Handle stream end
      if (message.type === 'stream_end') {
        console.log('📋 Luigi pipeline stream ended');
        setWsConnected(false);
      }
    };

    const handleClose = () => {
      setWsConnected(false);
      console.log('🔌 Luigi pipeline WebSocket closed');
    };

    client.on('message', handleMessage);
    client.on('close', handleClose);
    client.on('error', handleClose);

    client
      .connect()
      .then(() => {
        setWsConnected(true);
        console.log('✅ Connected to Luigi pipeline WebSocket');
      })
      .catch((error) => {
        console.error('Luigi pipeline WebSocket connection failed:', error);
        setWsConnected(false);
      });

    return () => {
      client.off('message', handleMessage);
      client.off('close', handleClose);
      client.off('error', handleClose);
      client.disconnect();
      wsClientRef.current = null;
    };
  }, [planId, updateTaskStatus, parseLuigiLogMessage]);

  const totalTasks = phases.reduce((sum, phase) => sum + phase.totalTasks, 0);
  const overallCompleted = phases.reduce((sum, phase) => sum + phase.completedTasks, 0);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <span>Luigi Pipeline Progress</span>
          </div>
          <div className="flex items-center space-x-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <div className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                    wsConnected
                      ? 'bg-green-500 shadow-green-300 shadow-lg'
                      : 'bg-red-500 shadow-red-300 shadow-lg'
                  }`}></div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {wsConnected
                      ? 'WebSocket Connected'
                      : 'WebSocket Disconnected'
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="secondary" className="text-xs font-medium">
              {overallCompleted} / {totalTasks} tasks
            </Badge>
          </div>
        </CardTitle>
        {/* Overall Progress Bar */}
        <div className="space-y-3 mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 font-medium">Overall Progress</span>
            <span className="text-gray-500">
              {totalTasks > 0 ? Math.round((overallCompleted / totalTasks) * 100) : 0}% Complete
            </span>
          </div>
          <Progress
            value={totalTasks > 0 ? (overallCompleted / totalTasks) * 100 : 0}
            className="h-2"
          />
        </div>

        {currentTask && (
          <div className="flex items-center space-x-2 mt-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
            <span className="text-sm text-blue-700 font-medium">
              Currently running: {currentTask}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {phases.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Waiting for Luigi pipeline to initialize...</p>
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={phases.map(p => p.name)} className="w-full">
            {phases.map((phase) => (
              <AccordionItem value={phase.name} key={phase.name}>
                <AccordionTrigger>
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center space-x-3">
                      <TrendingUp className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">{phase.name}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">
                          {phase.completedTasks} / {phase.totalTasks} completed
                        </div>
                        <div className="text-xs text-gray-400">
                          {phase.totalTasks > 0 ? Math.round((phase.completedTasks / phase.totalTasks) * 100) : 0}%
                        </div>
                      </div>
                      <div className="w-16">
                        <Progress
                          value={phase.totalTasks > 0 ? (phase.completedTasks / phase.totalTasks) * 100 : 0}
                          className="h-1.5"
                        />
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-2 pl-4">
                    {phase.tasks.map((task, index) => (
                      <li key={task.id} data-task-id={task.id} className={`flex items-center space-x-3 p-2 rounded-lg transition-all duration-200 ${
                        task.status === 'running'
                          ? 'bg-blue-50 border border-blue-200 shadow-sm'
                          : task.status === 'completed'
                          ? 'bg-green-50 border border-green-200'
                          : task.status === 'failed'
                          ? 'bg-red-50 border border-red-200'
                          : 'hover:bg-gray-50'
                      }`}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-xs text-gray-400 w-8 text-center font-mono">
                                {String(phases.slice(0, phases.indexOf(phase)).reduce((sum, p) => sum + p.totalTasks, 0) + index + 1).padStart(2, '0')}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Task #{phases.slice(0, phases.indexOf(phase)).reduce((sum, p) => sum + p.totalTasks, 0) + index + 1} of {totalTasks}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <div className={`transition-transform duration-200 ${
                          task.status === 'running' ? 'animate-pulse scale-110' : ''
                        }`}>
                          {statusIcons[task.status]}
                        </div>

                        <div className="flex-1 flex flex-col">
                          <span className={`transition-all duration-200 ${
                            task.status === 'completed'
                              ? 'text-gray-500 line-through'
                              : task.status === 'running'
                              ? 'font-semibold text-blue-700'
                              : task.status === 'failed'
                              ? 'text-red-600 font-medium'
                              : 'text-gray-700'
                          }`}>
                            {task.name}
                          </span>

                          {/* Show error message for failed tasks */}
                          {task.status === 'failed' && task.error && (
                            <div className="mt-1 ml-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-900">
                              <div className="font-semibold mb-0.5">Error:</div>
                              <div className="whitespace-pre-wrap break-words">{task.error}</div>
                            </div>
                          )}
                        </div>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs">
                                {task.id}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Luigi Task ID: {task.id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};