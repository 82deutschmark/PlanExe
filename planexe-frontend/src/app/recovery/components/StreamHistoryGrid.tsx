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
      <Card className="border-slate-300">
        <CardHeader className="pb-2 px-3 py-2 border-b bg-slate-50">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-1 text-xs font-semibold">
              <History className="h-3 w-3" />
              Completed Tasks
            </CardTitle>
            <span className="text-xs text-gray-500">{streams.length} total</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {streams.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">
              No completed tasks yet
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-0 border-t">
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
                    className={`border-r border-b p-2 text-left transition-colors cursor-pointer ${getStatusColor(stream.status)}`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-[10px] font-semibold text-gray-900 line-clamp-1 flex-1">
                        {stream.stage}
                      </span>
                      {getStatusIcon(stream.status)}
                    </div>
                    
                    <div className="text-[9px] text-gray-600 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">ID:</span>
                        <span className="font-mono">#{stream.interactionId}</span>
                      </div>
                      
                      {duration > 0 && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-2 w-2" />
                          <span className="font-mono">{duration.toFixed(2)}s</span>
                        </div>
                      )}
                      
                      {totalTokens > 0 && (
                        <div className="flex items-center gap-1">
                          <Zap className="h-2 w-2" />
                          <span className="font-mono">{totalTokens.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    
                    {stream.error && (
                      <div className="mt-1 text-[8px] text-red-600 line-clamp-1">
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
