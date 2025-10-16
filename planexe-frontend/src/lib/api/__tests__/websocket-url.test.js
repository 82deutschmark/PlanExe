/**
 * Author: ChatGPT gpt-5-codex
 * Date: 2025-02-14
 * PURPOSE: Validate WebSocket URL resolution logic to prevent regressions in reverse proxy deployments.
 * SRP and DRY check: Pass - isolates URL building scenarios without duplicating production code paths.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildWebSocketUrl } = require('../websocket-url');

const planId = 'plan-123';

test('uses an absolute FastAPI base URL origin while preserving path segments', () => {
  const url = buildWebSocketUrl(
    planId,
    'https://api.planexe.dev/core',
    { protocol: 'https:', host: 'ignored-host' }
  );

  assert.equal(url, 'wss://api.planexe.dev/core/ws/plans/plan-123/progress');
});

test('falls back to window location for relative base URLs and preserves prefixes', () => {
  const url = buildWebSocketUrl(
    planId,
    '/api',
    { protocol: 'http:', host: 'localhost:3000' }
  );

  assert.equal(url, 'ws://localhost:3000/api/ws/plans/plan-123/progress');
});

test('supports empty relative base URLs by using the provided location origin', () => {
  const url = buildWebSocketUrl(
    planId,
    '',
    { protocol: 'https:', host: 'app.planexe.dev' }
  );

  assert.equal(url, 'wss://app.planexe.dev/ws/plans/plan-123/progress');
});

test('trims stray slashes to avoid duplicate separators in the resolved path', () => {
  const url = buildWebSocketUrl(
    planId,
    ' https://example.com/base/ ',
    { protocol: 'https:', host: 'irrelevant' }
  );

  assert.equal(url, 'wss://example.com/base/ws/plans/plan-123/progress');
});
