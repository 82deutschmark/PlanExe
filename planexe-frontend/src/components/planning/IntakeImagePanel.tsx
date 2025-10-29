/**
 * Author: Cascade
 * Date: 2025-10-29
 * PURPOSE: Display concept image generation for intake conversation with creative loading states.
 * SRP and DRY check: Pass - focused on image display and loading animation.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Sparkles, Wand2 } from 'lucide-react';

interface IntakeImagePanelProps {
  state: 'idle' | 'generating' | 'completed' | 'error';
  imageB64: string | null;
  error: string | null;
}

const LOADING_MESSAGES = [
  'Bringing your idea to life...',
  'Painting your vision...',
  'Crafting concept art...',
  'Sketching possibilities...',
  'Visualizing your plan...',
  'Creating imagery...',
];

export const IntakeImagePanel: React.FC<IntakeImagePanelProps> = ({
  state,
  imageB64,
  error,
}) => {
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    if (state !== 'generating') {
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [state]);

  return (
    <Card className="flex flex-col border-slate-800 bg-slate-900 overflow-hidden h-full">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          <Wand2 className="h-4 w-4 text-purple-400" />
          Concept Image
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex items-center justify-center p-4">
        {state === 'idle' && (
          <div className="text-center text-slate-500 text-sm">
            <Sparkles className="h-12 w-12 mx-auto mb-3 text-slate-600" />
            <p>Image will generate when you start the conversation</p>
          </div>
        )}

        {state === 'generating' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden bg-gradient-to-br from-indigo-900/40 via-purple-900/40 to-pink-900/40">
            {/* Animated gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
            
            {/* Sparkle effects */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <Sparkles className="h-16 w-16 text-purple-300 animate-pulse" />
                <Sparkles className="h-8 w-8 text-indigo-300 absolute -top-4 -right-4 animate-ping" style={{ animationDelay: '0.5s' }} />
                <Sparkles className="h-6 w-6 text-pink-300 absolute -bottom-2 -left-2 animate-ping" style={{ animationDelay: '1s' }} />
              </div>
            </div>

            {/* Loading message */}
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-lg font-medium text-slate-200 animate-fade-in">
                {LOADING_MESSAGES[loadingMessageIndex]}
              </p>
              <div className="mt-2 flex justify-center gap-1">
                <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="h-2 w-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        {state === 'completed' && imageB64 && (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={`data:image/png;base64,${imageB64}`}
              alt="Generated concept"
              className="max-w-full max-h-full object-contain rounded-lg border border-indigo-700/50 shadow-xl"
            />
          </div>
        )}

        {state === 'error' && (
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
            <p className="text-sm text-red-300 mb-2">Image generation failed</p>
            {error && <p className="text-xs text-slate-400">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
