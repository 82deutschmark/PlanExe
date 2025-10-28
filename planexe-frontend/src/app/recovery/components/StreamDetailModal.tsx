/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: Modal displaying comprehensive LLM stream details including full text, reasoning, usage, and events
 * SRP and DRY check: Pass - Focuses only on detailed stream data presentation
 */
'use client';

import React from 'react';
import { X, Zap, Clock, Activity, FileText, Brain, Code } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LLMStreamState } from '../useRecoveryPlan';

interface StreamDetailModalProps {
  stream: LLMStreamState | null;
  open: boolean;
  onClose: () => void;
}

export const StreamDetailModal: React.FC<StreamDetailModalProps> = ({
  stream,
  open,
  onClose,
}) => {
  if (!stream) return null;
  
  const assembledText = stream.finalText ?? stream.textBuffer ?? '';
  const assembledReasoning = stream.finalReasoning ?? stream.reasoningBuffer ?? '';
  
  // Calculate duration
  const duration = stream.usage && typeof stream.usage === 'object'
    ? (stream.usage as Record<string, unknown>).duration_seconds as number || 0
    : 0;
  
  const totalTokens = stream.usage && typeof stream.usage === 'object'
    ? (stream.usage as Record<string, unknown>).total_tokens as number || 0
    : 0;
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-lg font-semibold">
                {stream.stage}
              </DialogTitle>
              <Badge variant={stream.status === 'completed' ? 'default' : stream.status === 'failed' ? 'destructive' : 'secondary'}>
                {stream.status}
              </Badge>
              <span className="text-sm text-gray-500">#{stream.interactionId}</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Compact stats bar */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
            {duration > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{duration.toFixed(2)}s</span>
              </div>
            )}
            {totalTokens > 0 && (
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                <span>{totalTokens.toLocaleString()} tokens</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span>{stream.events.length} events</span>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          <Tabs defaultValue="output" className="h-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-white px-4">
              <TabsTrigger value="output" className="gap-1">
                <FileText className="h-3 w-3" />
                Output
              </TabsTrigger>
              <TabsTrigger value="reasoning" className="gap-1">
                <Brain className="h-3 w-3" />
                Reasoning
              </TabsTrigger>
              <TabsTrigger value="usage" className="gap-1">
                <Zap className="h-3 w-3" />
                Usage
              </TabsTrigger>
              <TabsTrigger value="events" className="gap-1">
                <Activity className="h-3 w-3" />
                Events
              </TabsTrigger>
              {stream.rawPayload && (
                <TabsTrigger value="raw" className="gap-1">
                  <Code className="h-3 w-3" />
                  Raw Data
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="output" className="m-0 p-4">
              <div className="bg-slate-50 rounded border p-3 font-mono text-sm whitespace-pre-wrap max-h-[60vh] overflow-auto">
                {assembledText || <span className="text-gray-400">No output</span>}
              </div>
            </TabsContent>
            
            <TabsContent value="reasoning" className="m-0 p-4">
              <div className="bg-orange-50 rounded border border-orange-200 p-3 font-mono text-sm whitespace-pre-wrap max-h-[60vh] overflow-auto">
                {assembledReasoning || <span className="text-gray-400">No reasoning trace</span>}
              </div>
            </TabsContent>
            
            <TabsContent value="usage" className="m-0 p-4">
              {stream.usage ? (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(stream.usage as Record<string, unknown>).map(([key, value]) => (
                    <div key={key} className="bg-slate-50 rounded border p-3">
                      <div className="text-xs font-medium text-gray-500 uppercase mb-1">{key}</div>
                      <div className="text-sm font-mono">
                        {typeof value === 'object' && value !== null ? (
                          <pre className="text-xs overflow-auto">{JSON.stringify(value, null, 2)}</pre>
                        ) : (
                          <span>{String(value)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 text-center py-8">No usage data available</div>
              )}
            </TabsContent>
            
            <TabsContent value="events" className="m-0 p-4">
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {stream.events.length > 0 ? (
                  stream.events.map((event, index) => (
                    <div key={index} className="bg-slate-50 rounded border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-xs">
                          #{event.sequence} - {event.event}
                        </Badge>
                        <span className="text-xs text-gray-500">{event.timestamp}</span>
                      </div>
                      {Object.keys(event.payload).length > 0 && (
                        <pre className="text-xs bg-white rounded p-2 overflow-auto">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-400 text-center py-8">No events recorded</div>
                )}
              </div>
            </TabsContent>
            
            {stream.rawPayload && (
              <TabsContent value="raw" className="m-0 p-4">
                <pre className="bg-slate-900 text-green-400 rounded p-4 text-xs overflow-auto max-h-[60vh] font-mono">
                  {JSON.stringify(stream.rawPayload, null, 2)}
                </pre>
              </TabsContent>
            )}
          </Tabs>
        </div>
        
        {stream.error && (
          <div className="px-4 py-3 bg-red-50 border-t border-red-200">
            <div className="text-sm font-medium text-red-900 mb-1">Error</div>
            <div className="text-sm text-red-700">{stream.error}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
