// Utility helpers for parsing backend timestamps that may be emitted without
// explicit timezone offsets. The FastAPI service frequently serialises
// `datetime.utcnow()` values which produce naive ISO strings (e.g.
// `2024-05-12T15:24:00`) that should be interpreted as UTC. Relying on
// `new Date()` directly causes local-time conversion and incorrect relative
// timestamps in the recovery workspace. These helpers normalise such values so
// that UI components can display accurate "time ago" descriptions.

const TIMEZONE_REGEX = /(z|Z|[+-]\d{2}:?\d{2})$/;

/**
 * Attempt to normalise backend-provided timestamps to a valid ISO string that
 * is safe to pass to the JavaScript `Date` constructor. If the backend omits a
 * timezone designator we assume the value is UTC and append `Z`.
 */
export const normaliseBackendTimestamp = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalisedSeparators = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed;
  if (TIMEZONE_REGEX.test(normalisedSeparators)) {
    return normalisedSeparators;
  }

  return `${normalisedSeparators}Z`;
};

/**
 * Parse a backend timestamp into a `Date` object while handling naive UTC
 * strings. Returns `null` when parsing fails.
 */
export const parseBackendDate = (
  value: string | number | Date | null | undefined,
): Date | null => {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const numeric = new Date(value);
    return Number.isNaN(numeric.getTime()) ? null : numeric;
  }

  const normalised = normaliseBackendTimestamp(value);
  const parsed = new Date(normalised);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

/**
 * Convenience helper to convert a backend timestamp into a canonical ISO string
 * with an explicit UTC offset. Falls back to the original value when parsing
 * fails.
 */
export const toIsoStringOrFallback = (value: string | null | undefined): string | null => {
  if (!value) {
    return value ?? null;
  }

  const parsed = parseBackendDate(value);
  return parsed ? parsed.toISOString() : value;
};
