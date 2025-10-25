/**
 * Author: Cascade
 * Date: 2025-10-24
 * PURPOSE: Dynamic configuration fetched from backend API instead of hardcoded defaults.
 * SRP and DRY check: Pass - Single source of truth for frontend configuration from backend.
 */

import { fastApiClient } from '@/lib/api/fastapi-client';

export interface ConfigResponse {
  reasoning_effort_streaming_default: string;
  reasoning_effort_conversation_default: string;
  reasoning_summary_default: string;
  text_verbosity_default: string;
  max_output_tokens_default: number | null;
  streaming_enabled: boolean;
  version: string;
}

export interface FrontendConfig {
  reasoningEffort: string;
  reasoningSummary: string;
  textVerbosity: string;
  maxOutputTokens: number | undefined;
  streamingEnabled: boolean;
}

class ConfigService {
  private config: FrontendConfig | null = null;
  private configPromise: Promise<FrontendConfig> | null = null;

  async getConfig(): Promise<FrontendConfig> {
    // Return cached config if available
    if (this.config) {
      return this.config;
    }

    // Return existing promise if fetch is in progress
    if (this.configPromise) {
      return this.configPromise;
    }

    // Fetch from backend
    this.configPromise = this.fetchConfig();

    try {
      this.config = await this.configPromise;
      return this.config;
    } finally {
      this.configPromise = null;
    }
  }

  private async fetchConfig(): Promise<FrontendConfig> {
    const backendConfig = await fastApiClient.getConfig();

    return {
      reasoningEffort: backendConfig.reasoning_effort_streaming_default,
      reasoningSummary: backendConfig.reasoning_summary_default,
      textVerbosity: backendConfig.text_verbosity_default,
      maxOutputTokens: backendConfig.max_output_tokens_default ?? undefined,
      streamingEnabled: backendConfig.streaming_enabled,
    };
  }

  // Legacy compatibility - these will be removed after migration
  get RESPONSES_STREAMING_DEFAULTS() {
    console.warn('RESPONSES_STREAMING_DEFAULTS is deprecated. Use getConfig() instead.');
    return this.getLegacyDefaults();
  }

  get RESPONSES_CONVERSATION_DEFAULTS() {
    console.warn('RESPONSES_CONVERSATION_DEFAULTS is deprecated. Use getConfig() instead.');
    return this.getLegacyDefaults();
  }

  private getLegacyDefaults() {
    if (!this.config) {
      throw new Error('Config not loaded. Call getConfig() first.');
    }
    return {
      reasoningEffort: this.config.reasoningEffort,
      reasoningSummary: this.config.reasoningSummary,
      textVerbosity: this.config.textVerbosity,
      maxOutputTokens: this.config.maxOutputTokens,
    };
  }
}

export const configService = new ConfigService();
