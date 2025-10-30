/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-10-30
 * PURPOSE: Full-size image lightbox/modal for viewing concept images at their original resolution.
 * SRP and DRY check: Pass - focused solely on displaying full-size images in a modal overlay.
 */

'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { GeneratedImageMetadata } from '@/lib/conversation/useResponsesConversation';

interface IntakeImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageB64: string | null;
  prompt: string | null;
  metadata: GeneratedImageMetadata | null;
}

const normaliseImageFormat = (format?: string | null): string => {
  if (!format) return 'png';
  const cleaned = format.trim().toLowerCase();
  if (cleaned === 'jpg') return 'jpeg';
  if (['png', 'jpeg', 'webp'].includes(cleaned)) return cleaned;
  return 'png';
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
  if (!rawFormat) return (fallback ?? 'PNG').toUpperCase();
  const cleaned = rawFormat.trim().toLowerCase();
  if (!cleaned || cleaned === 'base64') return (fallback ?? 'PNG').toUpperCase();
  if (cleaned === 'jpg') return 'JPEG';
  return cleaned.toUpperCase();
};

export const IntakeImageLightbox: React.FC<IntakeImageLightboxProps> = ({
  isOpen,
  onClose,
  imageB64,
  prompt,
  metadata,
}) => {
  const resolvedFormat = normaliseImageFormat(metadata?.format);
  const imageMimeType = imageMimeTypeForFormat(resolvedFormat);
  const displayFormat = displayLabelForFormat(metadata?.format, resolvedFormat);
  const imageSrc = imageB64 ? `data:${imageMimeType};base64,${imageB64}` : null;

  if (!imageSrc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-slate-950 border-slate-800 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-slate-100">
              Concept Image - Full Size
            </DialogTitle>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Image container with scrolling */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt="Generated concept - full size"
            className="max-w-full h-auto rounded-lg border border-indigo-700/30 shadow-2xl"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              const val = el.getAttribute('src') || '';
              if (val && !val.startsWith('data:') && /^[A-Za-z0-9+/=]+$/.test(val)) {
                el.src = `data:image/png;base64,${val}`;
              }
            }}
          />
        </div>

        {/* Metadata footer */}
        {(prompt || metadata) && (
          <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur">
            {prompt && (
              <p className="mb-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Prompt:</span> {prompt}
              </p>
            )}
            {metadata && (
              <p className="text-xs text-slate-500">
                {metadata.model} · {metadata.size} · {displayFormat}
                {typeof metadata.compression === 'number' ? ` (${metadata.compression}% compression)` : ''}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
