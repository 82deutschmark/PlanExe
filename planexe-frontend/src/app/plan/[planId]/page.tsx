/**
 * Author: Cascade AI
 * Date: 2025-10-26T00:00:00Z
 * PURPOSE: DEPRECATED - This dynamic route is incompatible with output: 'export'.
 *          Use /plan?planId=... instead (query params like /recovery page).
 * SRP and DRY check: N/A - This file should be removed after migration.
 */

// This page is intentionally empty and should redirect users
// For static export compatibility, use /plan?planId=... with query parameters
export default function Redirect() {
  return null;
}
