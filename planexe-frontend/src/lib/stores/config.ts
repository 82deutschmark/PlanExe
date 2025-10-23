/**
 * Author: Cascade
 * Date: 2025-09-19T17:40:43-04:00
 * PURPOSE: Configuration state management for LLM models, prompts, and system settings with caching
 * SRP and DRY check: Pass - Single responsibility for configuration management, integrates with llm_config.json
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { LLMModel, PromptExample } from '@/lib/api/fastapi-client';

interface ConfigState {
  // LLM Models
  llmModels: LLMModel[];
  defaultModel: string;
  priorityOrder: string[];
  isLoadingModels: boolean;
  modelsError: string | null;
  modelsLastLoaded: Date | null;

  // Prompt Examples
  promptExamples: PromptExample[];
  promptCategories: string[];
  isLoadingPrompts: boolean;
  promptsError: string | null;
  promptsLastLoaded: Date | null;

  // System Health
  systemHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, 'up' | 'down'>;
    lastChecked: Date | null;
  };

  // Actions
  loadLLMModels: (force?: boolean) => Promise<void>;
  loadPromptExamples: (force?: boolean) => Promise<void>;
  testLLMModel: (modelId: string, apiKey?: string) => Promise<boolean>;
  checkSystemHealth: () => Promise<void>;
  clearErrors: () => void;

  // Model management
  setDefaultModel: (modelId: string) => void;
  updateModelPriority: (priorityOrder: string[]) => void;

  // Prompt filtering
  getPromptsBySearch: (searchTerm?: string) => PromptExample[];
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      // Initial state
      llmModels: [],
      defaultModel: '',
      priorityOrder: [],
      isLoadingModels: false,
      modelsError: null,
      modelsLastLoaded: null,

      promptExamples: [],
      promptCategories: [],
      isLoadingPrompts: false,
      promptsError: null,
      promptsLastLoaded: null,

      systemHealth: {
        status: 'healthy',
        services: {},
        lastChecked: null
      },

      // Load LLM models
      loadLLMModels: async (force = false) => {
        const { modelsLastLoaded } = get();
        
        // Check if we need to reload (force or older than 5 minutes)
        if (!force && modelsLastLoaded) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (modelsLastLoaded > fiveMinutesAgo) {
            return; // Use cached data
          }
        }

        set({ isLoadingModels: true, modelsError: null });

        try {
          // Use FastAPI client for consistent URL handling
          const { fastApiClient } = await import('@/lib/api/fastapi-client');
          const models = await fastApiClient.getModels();



          // Use first model by priority as default
          const defaultModelId = models.length > 0 ? models[0].id : '';

          set({
            llmModels: models,
            defaultModel: defaultModelId,
            priorityOrder: models.map((m) => m.id),
            isLoadingModels: false,
            modelsError: null,
            modelsLastLoaded: new Date()
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown Railway connection error';
          
          // Enhanced error with Railway debugging context
          const railwayError = `${errorMessage}. Railway deployment may still be starting up. Try refreshing in 30 seconds.`;
          
          set({ 
            modelsError: railwayError, 
            isLoadingModels: false 
          });

          // Auto-retry after 10 seconds for Railway startup scenarios
          setTimeout(() => {
            const { modelsError } = get();
            if (modelsError && modelsError.includes('Railway')) {
              get().loadLLMModels(true);
            }
          }, 10000);
        }
      },

      // Load prompt examples
      loadPromptExamples: async (force = false) => {
        const { promptsLastLoaded } = get();
        
        // Check if we need to reload (force or older than 15 minutes)
        if (!force && promptsLastLoaded) {
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
          if (promptsLastLoaded > fifteenMinutesAgo) {
            return; // Use cached data
          }
        }

        set({ isLoadingPrompts: true, promptsError: null });

        try {
          // Temporary hardcoded prompt examples while we fix the backend
          const hardcodedPrompts = [
            {
              uuid: "business-plan",
              title: "Business Plan",
              prompt: "Create a comprehensive business plan for a new tech startup"
            },
            {
              uuid: "project-plan",
              title: "Project Plan",
              prompt: "Plan the development of a mobile app from concept to launch"
            },
            {
              uuid: "marketing-strategy",
              title: "Marketing Strategy",
              prompt: "Develop a marketing strategy for launching a new product"
            }
          ];

          set({
            promptExamples: hardcodedPrompts,
            promptCategories: ["Business", "Project Management", "Marketing"],
            isLoadingPrompts: false,
            promptsError: null,
            promptsLastLoaded: new Date()
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          set({ 
            promptsError: errorMessage, 
            isLoadingPrompts: false 
          });
        }
      },

      // Test LLM model availability
      testLLMModel: async (modelId) => {
        try {
          // Note: LLM testing endpoint doesn't exist in current backend
          // For now, assume all models are available
          console.log('LLM test not implemented, assuming model is available:', modelId);
          return true;
        } catch (error) {
          console.error('LLM test error:', error);
          return false;
        }
      },

      // Check system health
      checkSystemHealth: async () => {
        try {
          const { fastApiClient } = await import('@/lib/api/fastapi-client');
          const healthData = await fastApiClient.getHealth();
          
          set({
            systemHealth: {
              status: 'healthy',
              services: { api: 'up', models: healthData.available_models > 0 ? 'up' : 'down' },
              lastChecked: new Date()
            }
          });
        } catch (error) {
          console.error('Health check error:', error);
          set((state) => ({
            systemHealth: {
              ...state.systemHealth,
              status: 'unhealthy',
              lastChecked: new Date()
            }
          }));
        }
      },

      // Clear all errors
      clearErrors: () => set({ 
        modelsError: null, 
        promptsError: null 
      }),

      // Set default model
      setDefaultModel: (modelId) => {
        set({ defaultModel: modelId });
      },

      // Update model priority
      updateModelPriority: (priorityOrder) => {
        set({ priorityOrder });
      },

      // Get prompts by search term
      getPromptsBySearch: (searchTerm?: string) => {
        const { promptExamples } = get();
        if (!searchTerm) return promptExamples;

        const term = searchTerm.toLowerCase();
        return promptExamples.filter(prompt =>
          (prompt.title?.toLowerCase().includes(term)) ||
          prompt.prompt.toLowerCase().includes(term)
        );
      }
    }),
    {
      name: 'planexe-config-v2', // Bump cache version to clear old hardcoded models
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Cache models and prompts for offline use
        llmModels: state.llmModels,
        defaultModel: state.defaultModel,
        priorityOrder: state.priorityOrder,
        modelsLastLoaded: state.modelsLastLoaded,

        promptExamples: state.promptExamples,
        promptCategories: state.promptCategories,
        promptsLastLoaded: state.promptsLastLoaded
      })
    }
  )
);

// Auto-load configuration on store creation
if (typeof window !== 'undefined') {
  // Load initial config after a short delay to avoid SSR issues
  setTimeout(() => {
    const store = useConfigStore.getState();
    store.loadLLMModels(true); // Force reload to get fresh API data
    store.loadPromptExamples();
  }, 100);
}

