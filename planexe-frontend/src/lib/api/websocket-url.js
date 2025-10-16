/**
 * Author: ChatGPT gpt-5-codex
 * Date: 2025-02-14
 * PURPOSE: Shared WebSocket URL builder that keeps absolute origins and reverse-proxy prefixes intact.
 * SRP and DRY check: Pass - isolates URL assembly logic for reuse and targeted testing.
 */

const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

function normalizeSegments(segments) {
  return segments
    .filter(segment => typeof segment === 'string' && segment.trim().length > 0)
    .flatMap(segment => segment.split('/'))
    .map(piece => piece.trim())
    .filter(piece => piece.length > 0);
}

function joinUrlPath(basePath, suffix) {
  const pathSegments = normalizeSegments([basePath, suffix]);
  return `/${pathSegments.join('/')}`;
}

function resolveLocation(location) {
  if (location) {
    return location;
  }
  if (typeof window !== 'undefined' && window.location) {
    return window.location;
  }
  throw new Error('Relative baseURL requires a location context to resolve WebSocket endpoint');
}

function buildWebSocketUrl(planId, baseURL, locationLike) {
  const sanitizedBase = (baseURL || '').trim();
  const encodedPlanId = encodeURIComponent(planId);
  const planSuffix = `ws/plans/${encodedPlanId}/progress`;

  if (ABSOLUTE_URL_PATTERN.test(sanitizedBase)) {
    const parsed = new URL(sanitizedBase);
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = joinUrlPath(parsed.pathname, planSuffix);
    return `${protocol}//${parsed.host}${path}`;
  }

  const resolvedLocation = resolveLocation(locationLike);
  const protocol = resolvedLocation.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = joinUrlPath(sanitizedBase, planSuffix);
  return `${protocol}//${resolvedLocation.host}${path}`;
}

module.exports = {
  buildWebSocketUrl,
  joinUrlPath,
};
