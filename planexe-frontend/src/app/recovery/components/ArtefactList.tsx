/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-23T00:00:00Z
 * PURPOSE: Thin wrapper around the shared FileManager to keep the recovery page
 *          layout declarative while still supporting custom props.
 * SRP and DRY check: Pass - delegates artefact rendering to FileManager and only
 *          provides prop forwarding.
 */
'use client';

import React from 'react';

import { FileManager } from '@/components/files/FileManager';
import { PlanFile } from '@/lib/types/pipeline';

interface RecoveryArtefactPanelProps {
  planId: string;
  artefacts: PlanFile[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  onRefresh: () => Promise<void> | void;
  onPreview: (file: PlanFile) => void;
}

export const RecoveryArtefactPanel: React.FC<RecoveryArtefactPanelProps> = ({
  planId,
  artefacts,
  isLoading,
  error,
  lastUpdated,
  onRefresh,
  onPreview,
}) => (
  <FileManager
    planId={planId}
    artefacts={artefacts}
    isLoading={isLoading}
    error={error}
    lastUpdated={lastUpdated}
    onRefresh={() => {
      void onRefresh();
    }}
    onPreview={onPreview}
  />
);
