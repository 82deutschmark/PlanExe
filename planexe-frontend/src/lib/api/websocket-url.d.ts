/**
 * Author: ChatGPT gpt-5-codex
 * Date: 2025-03-16
 * PURPOSE: TypeScript definitions for the shared WebSocket URL utilities implemented in JavaScript.
 * SRP and DRY check: Pass - exposes runtime helpers without duplicating logic.
 */

export interface LocationLike {
  protocol: string;
  host: string;
}

export function buildWebSocketUrl(planId: string, baseURL: string, location?: LocationLike): string;
