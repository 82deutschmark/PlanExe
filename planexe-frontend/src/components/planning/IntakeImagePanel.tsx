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
import { AlertCircle, ChevronDown, ChevronUp, Sparkles, Wand2, Copy, Maximize2 } from 'lucide-react';
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
  onExpandImage?: () => void;
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
  onExpandImage,
}) => {
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isGenerating = state === 'generating';
  const isEditing = state === 'editing';
  const isWorking = isGenerating || isEditing;

  const resolvedFormat = normaliseImageFormat(metadata?.format);
  const imageMimeType = imageMimeTypeForFormat(resolvedFormat);
  const displayFormat = displayLabelForFormat(metadata?.format, resolvedFormat);
  const imageSrc = imageB64 ? `data:${imageMimeType};base64,${imageB64}` : null;

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      return;
    }

    const messageInterval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    const timerInterval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(timerInterval);
    };
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
          <div className="relative w-full h-full rounded-lg overflow-hidden bg-gradient-to-br from-indigo-900/60 via-purple-900/60 to-pink-900/60 border-2 border-purple-500/30">
            {/* Animated gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />

            {/* Sparkle effects - larger and more prominent */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <Sparkles className="h-24 w-24 text-purple-300 animate-pulse" />
                <Sparkles className="h-12 w-12 text-indigo-300 absolute -top-6 -right-6 animate-ping" style={{ animationDelay: '0.5s' }} />
                <Sparkles className="h-10 w-10 text-pink-300 absolute -bottom-4 -left-4 animate-ping" style={{ animationDelay: '1s' }} />
              </div>
            </div>

            {/* Loading message - much more prominent */}
            <div className="absolute bottom-8 left-0 right-0 text-center px-4">
              <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg px-6 py-5 inline-block border-2 border-purple-500/50 shadow-2xl">
                <div className="text-4xl font-bold text-purple-300 mb-3 tabular-nums">
                  {elapsedSeconds}s
                </div>
                <p className="text-xl font-semibold text-white mb-2 animate-pulse">
                  {activeMessage}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-purple-400 animate-bounce" />
                  <div className="h-3 w-3 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="h-3 w-3 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
                <p className="text-sm text-purple-200 mt-3 animate-fade-in">
                  Typically takes 15-30 seconds
                </p>
              </div>
            </div>
          </div>
        )}

        {state === 'completed' && imageB64 && (
          <div className="w-full h-full flex flex-col gap-3">
            <div className="flex-1 flex flex-col items-center justify-center gap-3 overflow-hidden">
              {/* Thumbnail container with click to expand */}
              <div
                className="relative group cursor-pointer"
                onClick={onExpandImage}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onExpandImage?.();
                  }
                }}
              >
                {/* Base64 data URL cannot leverage next/image optimisations */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc ?? ''}
                  alt="Generated concept (click to expand)"
                  className="max-h-[300px] w-auto rounded-lg border-2 border-indigo-700/50 object-contain shadow-xl transition-all group-hover:border-indigo-500 group-hover:shadow-2xl"
                  onError={(e) => {
                    // Fallback: if a bare base64 without data URI sneaks in, try png prefix
                    const el = e.currentTarget as HTMLImageElement;
                    const val = el.getAttribute('src') || '';
                    if (val && !val.startsWith('data:') && /^[A-Za-z0-9+/=]+$/.test(val)) {
                      el.src = `data:image/png;base64,${val}`;
                    }
                  }}
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                  <div className="flex flex-col items-center gap-2 text-white">
                    <Maximize2 className="h-8 w-8" />
                    <span className="text-sm font-semibold">Click to view full size</span>
                  </div>
                </div>
              </div>
              {/* Expand button below image */}
              {onExpandImage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExpandImage}
                  className="border-indigo-700/50 bg-indigo-950/40 text-indigo-200 hover:bg-indigo-900/60 hover:text-indigo-100"
                >
                  <Maximize2 className="mr-2 h-4 w-4" />
                  View Full Size
                </Button>
              )}
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
