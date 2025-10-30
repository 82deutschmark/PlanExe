/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-10-30
 * PURPOSE: Hook for retrieving concept images from sessionStorage for display on various pages.
 * SRP and DRY check: Pass - focused solely on concept image retrieval from session storage.
 */

'use client';

import { useState, useEffect } from 'react';
import { GeneratedImageMetadata } from '@/lib/conversation/useResponsesConversation';

export interface ConceptImageData {
  imageB64: string;
  prompt: string;
  metadata: GeneratedImageMetadata;
  timestamp: number;
}

export function useConceptImage(conversationId: string | null): ConceptImageData | null {
  const [imageData, setImageData] = useState<ConceptImageData | null>(null);

  useEffect(() => {
    if (!conversationId || typeof window === 'undefined') {
      setImageData(null);
      return;
    }

    try {
      const key = `planexe_concept_image_${conversationId}`;
      const stored = sessionStorage.getItem(key);

      if (!stored) {
        setImageData(null);
        return;
      }

      const parsed = JSON.parse(stored) as ConceptImageData;

      // Validate the structure
      if (parsed && parsed.imageB64 && parsed.prompt && parsed.metadata) {
        setImageData(parsed);
        console.log('[useConceptImage] Retrieved concept image from sessionStorage');
      } else {
        console.warn('[useConceptImage] Invalid concept image data in sessionStorage');
        setImageData(null);
      }
    } catch (error) {
      console.error('[useConceptImage] Failed to retrieve concept image:', error);
      setImageData(null);
    }
  }, [conversationId]);

  return imageData;
}
