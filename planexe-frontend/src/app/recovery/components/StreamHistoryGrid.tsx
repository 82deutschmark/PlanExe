/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: Prominent, interactive grid of completed tasks with rich visual feedback
 * SRP and DRY check: Pass - Focuses on compelling stream history presentation
 */
'use client';

import React, { useState } from 'react';
import { History, Clock, Zap, CheckCircle, XCircle, AlertCircle, MousePointer2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
              <MousePointer2 className="h-3 w-3 text-indigo-500" />
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
                  <button
                    key={stream.interactionId}
                    onClick={() => handleStreamClick(stream)}
                    className={`p-3 text-left transition-all duration-200 cursor-pointer rounded-lg transform hover:scale-105 ${getStatusColor(stream.status)}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-gray-900 line-clamp-2 flex-1 leading-tight">
                        {stream.stage}
                      </span>
                      {getStatusIcon(stream.status)}
                    </div>

                    <div className="text-[10px] text-gray-700 space-y-1 font-medium">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-600">ID:</span>
                        <span className="font-mono font-semibold">#{stream.interactionId}</span>
                      </div>

                      {duration > 0 && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-blue-600" />
                          <span className="font-mono font-semibold text-blue-700">{duration.toFixed(2)}s</span>
                        </div>
                      )}

                      {totalTokens > 0 && (
                        <div className="flex items-center gap-1">
                          <Zap className="h-3 w-3 text-purple-600" />
                          <span className="font-mono font-semibold text-purple-700">{totalTokens.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {stream.error && (
                      <div className="mt-2 text-[9px] text-rose-800 font-semibold line-clamp-2 bg-rose-200/50 p-1 rounded">
                        {stream.error}
                      </div>
                    )}
                  </button>
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
