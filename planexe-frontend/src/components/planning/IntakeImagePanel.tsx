/**
 * Author: gpt-5-codex
 * Date: 2025-10-29
 * PURPOSE: Display concept image generation for intake conversation with status-aware metadata and edit feedback.
 * SRP and DRY check: Pass - focused solely on presenting concept image state while delegating data fetch to the hook.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ChevronDown, ChevronUp, Sparkles, Wand2, Copy } from 'lucide-react';
import {
  GeneratedImageMetadata,
  ImageGenerationErrorDetails,
  ImageGenerationState,
} from '@/lib/conversation/useResponsesConversation';

interface IntakeImagePanelProps {
  state: ImageGenerationState;
  imageB64: string | null;
  prompt: string | null;
  metadata: GeneratedImageMetadata | null;
  error: ImageGenerationErrorDetails | null;
}

const LOADING_MESSAGES = [
  'Bringing your idea to life...',
  'Painting your vision...',
  'Crafting concept art...',
  'Sketching possibilities...',
  'Visualizing your plan...',
  'Creating imagery...',
];

const DEFAULT_IMAGE_FORMAT = 'png';

const normaliseImageFormat = (format?: string | null): string => {
  if (!format) {
    return DEFAULT_IMAGE_FORMAT;
  }
  const cleaned = format.trim().toLowerCase();
  if (!cleaned) {
    return DEFAULT_IMAGE_FORMAT;
  }
  if (cleaned === 'jpg') {
    return 'jpeg';
  }
  if (cleaned === 'base64') {
    return DEFAULT_IMAGE_FORMAT;
  }
  if (['png', 'jpeg', 'webp'].includes(cleaned)) {
    return cleaned;
  }
  return DEFAULT_IMAGE_FORMAT;
};

const imageMimeTypeForFormat = (format: string): string => {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
};

const displayLabelForFormat = (rawFormat?: string | null, fallback?: string): string => {
  if (!rawFormat) {
    return (fallback ?? DEFAULT_IMAGE_FORMAT).toUpperCase();
  }
  const cleaned = rawFormat.trim().toLowerCase();
  if (!cleaned || cleaned === 'base64') {
    return (fallback ?? DEFAULT_IMAGE_FORMAT).toUpperCase();
  }
  if (cleaned === 'jpg') {
    return 'JPEG';
  }
  return cleaned.toUpperCase();
};

export const IntakeImagePanel: React.FC<IntakeImagePanelProps> = ({
  state,
  imageB64,
  prompt,
  metadata,
  error,
}) => {
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const isGenerating = state === 'generating';
  const isEditing = state === 'editing';
  const isWorking = isGenerating || isEditing;

  const resolvedFormat = normaliseImageFormat(metadata?.format);
  const imageMimeType = imageMimeTypeForFormat(resolvedFormat);
  const displayFormat = displayLabelForFormat(metadata?.format, resolvedFormat);
  const imageSrc = imageB64 ? `data:${imageMimeType};base64,${imageB64}` : null;

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [isGenerating]);

  const activeMessage = isGenerating
    ? LOADING_MESSAGES[loadingMessageIndex]
    : 'Applying your edit…';

  return (
    <Card className="flex h-full flex-col overflow-hidden border-slate-800 bg-slate-900">
      <CardHeader className="shrink-0 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          <Wand2 className="h-4 w-4 text-purple-400" />
          Concept Image
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 items-center justify-center p-3 md:p-4">
        {state === 'idle' && (
          <div className="text-center text-slate-500 text-sm">
            <Sparkles className="h-12 w-12 mx-auto mb-3 text-slate-600" />
            <p>Image will generate when you start the conversation</p>
          </div>
        )}

        {isWorking && (
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
                {activeMessage}
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
          <div className="w-full h-full flex flex-col gap-3">
            <div className="flex-1 flex items-center justify-center">
              {/* Base64 data URL cannot leverage next/image optimisations */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc ?? ''}
                alt="Generated concept"
                className="h-full w-full rounded-lg border border-indigo-700/50 object-contain shadow-xl"
                onError={(e) => {
                  // Fallback: if a bare base64 without data URI sneaks in, try png prefix
                  const el = e.currentTarget as HTMLImageElement;
                  const val = el.getAttribute('src') || '';
                  if (val && !val.startsWith('data:') && /^[A-Za-z0-9+/=]+$/.test(val)) {
                    el.src = `data:image/png;base64,${val}`;
                  }
                }}
              />
            </div>
            {(prompt || metadata) && (
              <div className="rounded-lg border border-indigo-800/40 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                {prompt && (
                  <p className="mb-1 text-slate-200">
                    <span className="font-semibold uppercase tracking-wide text-slate-400">Prompt:</span> {prompt}
                  </p>
                )}
                {metadata && (
                  <p className="text-slate-500">
                    {metadata.model} · {metadata.size} · {displayFormat}
                    {typeof metadata.compression === 'number' ? ` (${metadata.compression}% compression)` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {state === 'error' && error && (
          <div className="w-full px-4 py-3 space-y-3">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
              <p className="text-sm font-semibold text-red-300 mb-1">Image generation failed</p>
              <p className="text-sm text-slate-300">{error.message}</p>
            </div>

            {(error.error_type || error.context) && (
              <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-left">
                <button
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className="flex w-full items-center justify-between text-xs font-semibold text-red-300 uppercase tracking-wide hover:text-red-200"
                >
                  <span>Error Details</span>
                  {showErrorDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showErrorDetails && (
                  <div className="mt-3 space-y-2 text-xs text-slate-300">
                    {error.error_type && (
                      <div>
                        <span className="font-semibold text-slate-200">Error Type:</span>{' '}
                        <span className="font-mono text-red-300">{error.error_type}</span>
                      </div>
                    )}

                    {error.context && Object.keys(error.context).length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-200">Context:</span>
                        <div className="mt-1 rounded bg-slate-950/50 p-2 font-mono text-xs">
                          {Object.entries(error.context).map(([key, value]) => (
                            <div key={key} className="text-slate-400">
                              <span className="text-slate-300">{key}:</span>{' '}
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const errorText = JSON.stringify(error, null, 2);
                        navigator.clipboard.writeText(errorText).then(() => {
                          setCopySuccess(true);
                          setTimeout(() => setCopySuccess(false), 2000);
                        });
                      }}
                      className="mt-2 w-full"
                    >
                      <Copy className="mr-2 h-3 w-3" />
                      {copySuccess ? 'Copied!' : 'Copy Error Details'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
