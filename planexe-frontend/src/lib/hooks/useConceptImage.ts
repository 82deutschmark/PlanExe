/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-10-30
 * PURPOSE: Hook for retrieving concept images from database (via API) or sessionStorage for display on various pages.
 * SRP and DRY check: Pass - focused solely on concept image retrieval with database-first approach.
 */

'use client';

import { useState, useEffect } from 'react';
import { GeneratedImageMetadata } from '@/lib/conversation/useResponsesConversation';
import { fastApiClient } from '@/lib/api/fastapi-client';

export interface ConceptImageData {
  imageB64: string;
  prompt: string;
  metadata: GeneratedImageMetadata;
  timestamp: number;
}

export function useConceptImage(planId: string | null): ConceptImageData | null {
  const [imageData, setImageData] = useState<ConceptImageData | null>(null);

  useEffect(() => {
    if (!planId) {
      setImageData(null);
      return;
    }

    let cancelled = false;

    const loadConceptImage = async () => {
      try {
        // First try to load from database via API
        const artefacts = await fastApiClient.getPlanArtefacts(planId);

        if (cancelled) return;

        // Find the concept image and metadata artefacts
        const imageArtefact = artefacts.artefacts.find(a => a.filename === '000-concept_image.png');
        const metadataArtefact = artefacts.artefacts.find(a => a.filename === '000-concept_image_metadata.json');

        if (imageArtefact) {
          // We need to fetch the actual content from the database
          // For now, we'll use the downloadFile endpoint which should work for any file
          const imageBlob = await fastApiClient.downloadFile(planId, '000-concept_image.png');

          if (cancelled) return;

          // Convert blob to base64
          const reader = new FileReader();
          reader.onloadend = async () => {
            if (cancelled) return;

            const base64 = reader.result as string;
            // Remove data URL prefix if present
            const imageB64 = base64.includes(',') ? base64.split(',')[1] : base64;

            let metadata: GeneratedImageMetadata = {
              model: 'unknown',
              size: '1024x1024',
              format: 'png'
            };

            let promptText = 'Concept visualization';

            // Try to load metadata if available
            if (metadataArtefact) {
              try {
                const metadataBlob = await fastApiClient.downloadFile(planId, '000-concept_image_metadata.json');
                const metadataText = await metadataBlob.text();
                const parsedMetadata = JSON.parse(metadataText);

                if (parsedMetadata.model) metadata.model = parsedMetadata.model;
                if (parsedMetadata.size) metadata.size = parsedMetadata.size;
                if (parsedMetadata.format) metadata.format = parsedMetadata.format;
                if (parsedMetadata.compression !== undefined) metadata.compression = parsedMetadata.compression;
                if (parsedMetadata.prompt) promptText = parsedMetadata.prompt;
              } catch (e) {
                console.warn('[useConceptImage] Failed to load metadata:', e);
              }
            }

            setImageData({
              imageB64,
              prompt: promptText,
              metadata,
              timestamp: Date.now()
            });
            console.log('[useConceptImage] Retrieved concept image from database');
          };

          reader.readAsDataURL(imageBlob);
          return;
        }
      } catch (error) {
        console.warn('[useConceptImage] Failed to load from database, trying sessionStorage:', error);
      }

      // Fall back to sessionStorage if database load fails
      if (typeof window !== 'undefined') {
        try {
          const key = `planexe_concept_image_${planId}`;
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
          console.error('[useConceptImage] Failed to retrieve concept image from sessionStorage:', error);
          setImageData(null);
        }
      }
    };

    loadConceptImage();

    return () => {
      cancelled = true;
    };
  }, [planId]);

  return imageData;
}
