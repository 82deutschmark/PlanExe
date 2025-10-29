/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: Prominent, interactive grid of completed tasks with rich visual feedback
 * SRP and DRY check: Pass - Focuses on compelling stream history presentation
 */
'use client';

import React, { useState } from 'react';
import { History, CheckCircle, XCircle, AlertCircle, Eye, FileText, Brain, Activity, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { LLMStreamState } from '../useRecoveryPlan';
import { StreamDetailModal } from './StreamDetailModal';

interface StreamHistoryGridProps {
  streams: LLMStreamState[];
}

export const StreamHistoryGrid: React.FC<StreamHistoryGridProps> = ({ streams }) => {
  const [selectedStream, setSelectedStream] = useState<LLMStreamState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleStreamClick = (stream: LLMStreamState) => {
    setSelectedStream(stream);
    setModalOpen(true);
  };

  const getStatusIcon = (status: LLMStreamState['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-emerald-700" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-rose-700" />;
      default:
        return <AlertCircle className="h-4 w-4 text-amber-700" />;
    }
  };

  const getStatusColor = (status: LLMStreamState['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-gradient-to-br from-emerald-50 to-green-100 border-2 border-emerald-400 hover:from-emerald-100 hover:to-green-200 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-200/50';
      case 'failed':
        return 'bg-gradient-to-br from-rose-50 to-red-100 border-2 border-rose-400 hover:from-rose-100 hover:to-red-200 hover:border-rose-500 hover:shadow-lg hover:shadow-rose-200/50';
      default:
        return 'bg-gradient-to-br from-amber-50 to-yellow-100 border-2 border-amber-400 hover:from-amber-100 hover:to-yellow-200 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-200/50';
    }
  };
  
  return (
    <>
      <Card className="border-indigo-400 shadow-lg">
        <CardHeader className="pb-3 px-4 py-3 border-b-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-indigo-900">
              <History className="h-5 w-5 text-indigo-600" />
              Completed Tasks
            </CardTitle>
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3 text-indigo-500" />
              <span className="text-xs text-indigo-600 font-medium">Click for details</span>
              <span className="text-sm font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">{streams.length}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {streams.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              No completed tasks yet
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {streams.map((stream) => {
                const duration = stream.usage && typeof stream.usage === 'object'
                  ? (stream.usage as Record<string, unknown>).duration_seconds as number || 0
                  : 0;

                const totalTokens = stream.usage && typeof stream.usage === 'object'
                  ? (stream.usage as Record<string, unknown>).total_tokens as number || 0
                  : 0;

                return (
                  <TooltipProvider key={stream.interactionId}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleStreamClick(stream)}
                          className={`p-4 text-left transition-all duration-200 cursor-pointer rounded-lg transform hover:scale-105 ${getStatusColor(stream.status)} hover:shadow-lg`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight mb-1">
                                {stream.stage}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">#{stream.interactionId}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-current bg-white/50">
                                  <Eye className="h-2.5 w-2.5 mr-1" />
                                  View Details
                                </Badge>
                              </div>
                            </div>
                            {getStatusIcon(stream.status)}
                          </div>

                          {/* Rich data indicators */}
                          <div className="flex items-center gap-3 text-[10px] text-gray-600 mb-3">
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
                              <span>{stream.events.length} Events</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Database className="h-3 w-3" />
                              <span>Usage</span>
                            </div>
                          </div>

                          {/* Metrics with labels */}
                          <div className="space-y-2 text-xs">
                            {duration > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600 font-medium">Duration:</span>
                                <span className="font-mono font-semibold text-blue-700">{duration.toFixed(2)}s</span>
                              </div>
                            )}

                            {totalTokens > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600 font-medium">Tokens:</span>
                                <span className="font-mono font-semibold text-purple-700">{totalTokens.toLocaleString()}</span>
                              </div>
                            )}
                          </div>

                          {stream.error && (
                            <div className="mt-3 p-2 bg-rose-100 border border-rose-300 rounded-md">
                              <div className="flex items-center gap-1 mb-1">
                                <XCircle className="h-3 w-3 text-rose-600" />
                                <span className="text-xs font-bold text-rose-900">Error Details:</span>
                              </div>
                              <div className="text-xs text-rose-800 break-words leading-tight font-mono bg-rose-50 p-1.5 rounded">
                                {stream.error}
                              </div>
                            </div>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-md p-4 bg-slate-900 border-slate-700">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-slate-800 rounded">
                              {getStatusIcon(stream.status)}
                            </div>
                            <div>
                              <div className="font-semibold text-white text-sm">{stream.stage}</div>
                              <div className="text-slate-400 text-xs">Task #{stream.interactionId}</div>
                            </div>
                          </div>
                          
                          <div className="text-slate-300 text-xs leading-relaxed">
                            Click to explore comprehensive task data including full LLM output, AI reasoning traces, usage metrics, and timeline events.
                          </div>
                          
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
                                <span>{stream.events.length} Timeline Events</span>
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
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          )}
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
