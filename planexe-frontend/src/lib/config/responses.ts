/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-19T00:00:00Z
 * PURPOSE: Centralised configuration for Responses API control defaults shared across the
 *          frontend. Now dynamically loaded from backend to maintain single source of truth.
 * SRP and DRY check: Pass - single source of truth for client-side AI control defaults.
 */

import { configService, FrontendConfig } from './dynamic-config';

// Legacy exports for backward compatibility - will be removed after migration
export const RESPONSES_STREAMING_DEFAULTS = {
  reasoningEffort: 'medium' as const, // These are fallback values only
  reasoningSummary: 'detailed' as const,
  textVerbosity: 'high' as const,
  maxOutputTokens: undefined as number | undefined,
};

export const RESPONSES_CONVERSATION_DEFAULTS = {
  reasoningEffort: 'medium' as const, // These are fallback values only
  reasoningSummary: 'detailed' as const,
  textVerbosity: 'high' as const,
};

// New dynamic config functions
export async function getStreamingDefaults(): Promise<FrontendConfig> {
  return configService.getConfig();
}

export async function getConversationDefaults(): Promise<FrontendConfig> {
  return configService.getConfig();
}
