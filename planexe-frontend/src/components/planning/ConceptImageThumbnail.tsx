/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-10-30
 * PURPOSE: Reusable concept image thumbnail component with click-to-expand functionality.
 * SRP and DRY check: Pass - focused solely on displaying a concept image thumbnail.
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wand2, Maximize2 } from 'lucide-react';
import { ConceptImageData } from '@/lib/hooks/useConceptImage';
import { IntakeImageLightbox } from '@/components/planning/IntakeImageLightbox';

interface ConceptImageThumbnailProps {
  imageData: ConceptImageData;
  className?: string;
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

export const ConceptImageThumbnail: React.FC<ConceptImageThumbnailProps> = ({
  imageData,
  className = '',
}) => {
  const [showLightbox, setShowLightbox] = useState(false);

  const resolvedFormat = normaliseImageFormat(imageData.metadata.format);
  const imageMimeType = imageMimeTypeForFormat(resolvedFormat);
  const imageSrc = `data:${imageMimeType};base64,${imageData.imageB64}`;

  return (
    <>
      <Card className={`border-amber-200 bg-amber-50 ${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-amber-900">
            <Wand2 className="h-4 w-4 text-purple-600" />
            Concept Image
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div
            className="relative group cursor-pointer"
            onClick={() => setShowLightbox(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowLightbox(true);
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt="Plan concept (click to expand)"
              className="w-full h-auto max-h-[200px] object-contain rounded border-2 border-amber-300 transition-all group-hover:border-amber-500 group-hover:shadow-lg"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded">
              <div className="flex flex-col items-center gap-1 text-white">
                <Maximize2 className="h-6 w-6" />
                <span className="text-xs font-semibold">View full size</span>
              </div>
            </div>
          </div>
          {imageData.prompt && (
            <p className="text-xs text-gray-700 line-clamp-2">
              <span className="font-semibold">Prompt:</span> {imageData.prompt}
            </p>
          )}
        </CardContent>
      </Card>

      <IntakeImageLightbox
        isOpen={showLightbox}
        onClose={() => setShowLightbox(false)}
        imageB64={imageData.imageB64}
        prompt={imageData.prompt}
        metadata={imageData.metadata}
      />
    </>
  );
};
