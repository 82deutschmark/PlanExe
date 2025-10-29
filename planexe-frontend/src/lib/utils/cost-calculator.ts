/**
 * Author: Cascade
 * Date: 2025-10-29
 * PURPOSE: Simple cost calculation utility for LLM usage
 * SRP and DRY check: Pass - Single responsibility for cost calculations
 */

export interface LLMCost {
  input: number;  // cost per 1M input tokens
  output: number; // cost per 1M output tokens
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Calculate cost based on token usage and model pricing
 */
export function calculateCost(usage: TokenUsage, modelCost: LLMCost): number {
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  
  // Convert from per-1M tokens to actual cost
  const inputCost = (inputTokens / 1_000_000) * modelCost.input;
  const outputCost = (outputTokens / 1_000_000) * modelCost.output;
  
  return inputCost + outputCost;
}

/**
 * Format cost as USD string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `<$0.01`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Get model cost info from model key
 */
export function getModelCost(modelKey: string): LLMCost | null {
  const costs: Record<string, LLMCost> = {
    'gpt-5-nano-2025-08-07': { input: 0.05, output: 0.40 },
    'gpt-5-mini-2025-08-07': { input: 0.25, output: 2.00 },
    'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60 },
  };
  
  return costs[modelKey] || null;
}
