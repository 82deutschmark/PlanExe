/**
 * Author: gpt-5-codex
 * Date: 2025-10-30
 * PURPOSE: Inline image generation/edit display with prominent loading states
 *          and integrated edit functionality for intake conversation flow.
 * SRP and DRY check: Pass - focused on inline image display with edit capabilities.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Sparkles, Wand2, Maximize2, Edit3 } from 'lucide-react';
import {
  GeneratedImageMetadata,
  ImageGenerationErrorDetails,
  ImageGenerationState,
} from '@/lib/conversation/useResponsesConversation';

interface InlineImageGenerationProps {
  state: ImageGenerationState;
  imageB64: string | null;
  prompt: string | null;
  metadata: GeneratedImageMetadata | null;
  error: ImageGenerationErrorDetails | null;
  onExpandImage?: () => void;
  onEditImage?: (editPrompt: string) => Promise<void>;
}

const LOADING_MESSAGES = [
  'Bringing your idea to life...',
  'Painting your vision...',
  'Crafting concept art...',
  'Sketching possibilities...',
  'Visualizing your plan...',
  'Creating imagery...',
];

export const InlineImageGeneration: React.FC<InlineImageGenerationProps> = ({
  state,
  imageB64,
  prompt,
  metadata,
  error,
  onExpandImage,
  onEditImage,
}) => {
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [editPrompt, setEditPrompt] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [showEditInput, setShowEditInput] = useState(false);
  
  const isGenerating = state === 'generating';
  const isEditing = state === 'editing';
  const isWorking = isGenerating || isEditing;

  useEffect(() => {
    if (!isWorking) {
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
  }, [isWorking]);

  const handleEditSubmit = async () => {
    if (!editPrompt.trim() || !onEditImage || isSubmittingEdit) {
      return;
    }
    
    setIsSubmittingEdit(true);
    try {
      await onEditImage(editPrompt.trim());
      setEditPrompt('');
      setShowEditInput(false);
    } catch (error) {
      console.error('[InlineImageGeneration] Edit failed:', error);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const activeMessage = isGenerating
    ? LOADING_MESSAGES[loadingMessageIndex]
    : 'Applying your edit…';

  // IDLE: Not shown in conversation
  if (state === 'idle') {
    return null;
  }

  // LOADING: Full-width prominent animation
  if (isWorking) {
    return (
      <div className="relative w-full rounded-xl overflow-hidden bg-gradient-to-br from-indigo-900/80 via-purple-900/80 to-pink-900/80 border-2 border-purple-500 p-8 my-4 shadow-2xl">
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />

        <div className="relative text-center space-y-6">
          {/* Large sparkle animation */}
          <div className="flex justify-center">
            <div className="relative">
              <Sparkles className="h-32 w-32 text-purple-300 animate-pulse" />
              <Sparkles className="h-16 w-16 text-indigo-300 absolute -top-8 -right-8 animate-ping" />
              <Sparkles className="h-12 w-12 text-pink-300 absolute -bottom-6 -left-6 animate-ping" style={{ animationDelay: '0.5s' }} />
            </div>
          </div>

          {/* HUGE timer */}
          <div className="text-7xl font-bold text-purple-200 tabular-nums">
            {elapsedSeconds}s
          </div>

          {/* Large message */}
          <p className="text-3xl font-semibold text-white animate-pulse">
            {activeMessage}
          </p>

          {/* Bouncing dots */}
          <div className="flex justify-center gap-4">
            <div className="h-5 w-5 rounded-full bg-purple-400 animate-bounce" />
            <div className="h-5 w-5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
            <div className="h-5 w-5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
          </div>

          <p className="text-lg text-purple-200">
            Typically takes 15-30 seconds
          </p>
        </div>
      </div>
    );
  }

  // COMPLETED: Show image with edit option
  if (state === 'completed' && imageB64) {
    return (
      <div className="w-full h-full rounded-lg border-2 border-indigo-700 bg-slate-900 p-3 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-400" />
            <span className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Concept Image Generated
            </span>
          </div>
          {onEditImage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEditInput(!showEditInput)}
              className="text-indigo-300 hover:text-indigo-200"
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Image
            </Button>
          )}
        </div>

        {/* Image */}
        <div 
          className="relative group cursor-pointer mb-2"
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${imageB64}`}
            alt="Generated concept (click to expand)"
            className="max-h-[300px] w-auto rounded-lg border-2 border-indigo-700/50 shadow-2xl transition-all group-hover:border-indigo-500 group-hover:shadow-3xl"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
            <div className="flex flex-col items-center gap-2 text-white">
              <Maximize2 className="h-10 w-10" />
              <span className="text-base font-semibold">Click to view full size</span>
            </div>
          </div>
        </div>

        {/* Edit Input (collapsible) */}
        {showEditInput && onEditImage && (
          <div className="mb-2 p-2 rounded-lg bg-indigo-950/40 border border-indigo-700/50">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Describe the changes you want:
            </label>
            <div className="flex gap-2">
              <Input
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="e.g., make it more futuristic, add mountains in background..."
                className="flex-1 bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleEditSubmit();
                  }
                }}
                disabled={isSubmittingEdit}
              />
              <Button
                onClick={handleEditSubmit}
                disabled={!editPrompt.trim() || isSubmittingEdit}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isSubmittingEdit ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                    Editing...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Apply Edit
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Press Enter to submit • The original image will be modified based on your description
            </p>
          </div>
        )}

        {/* Metadata */}
        {prompt && (
          <div className="text-sm text-slate-400 space-y-1">
            <p>
              <span className="font-semibold text-slate-300">Prompt:</span> {prompt}
            </p>
            {metadata && (
              <p className="text-xs text-slate-500">
                {metadata.model} · {metadata.size} · {metadata.format.toUpperCase()}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ERROR: Show error message
  if (state === 'error' && error) {
    return (
      <div className="w-full my-2 rounded-lg border-2 border-red-700 bg-red-950/30 p-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-6 w-6 text-red-400 shrink-0 mt-1" />
          <div className="flex-1">
            <p className="text-base font-semibold text-red-300 mb-1">
              Image generation failed
            </p>
            <p className="text-sm text-slate-300">{error.message}</p>
            {error.error_type && (
              <p className="text-xs text-red-400 mt-2 font-mono">
                {error.error_type}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
