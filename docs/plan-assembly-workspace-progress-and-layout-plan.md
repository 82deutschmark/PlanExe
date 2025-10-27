# Plan Assembly Workspace Progress & Layout Remediation Plan

## Background
- **Page**: `/recovery` ("Plan Assembly Workspace") rendered by `RecoveryPageContent` using `RecoveryHeader` and `StageTimeline` components.
- **Current issues**: (1) progress indicator remains at 0% despite pipeline execution; (2) header card wastes space and omits stage-level feedback.
- **Impact**: Users cannot trust run status, and the layout buries actionable progress signals, causing confusion during recovery-mode operation.

## Key Findings
1. **Progress telemetry**
   - Backend watchdog counts rows in `plan_content` and updates `plans.progress_percentage` every 3 seconds (`PipelineExecutionService.monitor_progress`).
   - `_setup_environment` only warns when `DATABASE_URL` is missing, allowing Luigi to fall back to local SQLite on Windows. When deployed on Railway, env vars exist, but any mis-resolution leaves the API polling an empty Postgres table → progress stuck at 0%.
2. **UX layout**
   - `RecoveryHeader` dedicates the entire right column to a single % number (`plan.progress_percentage`).
   - `StageTimeline` already exposes per-stage counts + active stage but sits in a lower sidebar, creating redundant whitespace in the header while hiding critical context.

## Proposed Fixes
### Backend (Reliability)
1. **Fail fast without `DATABASE_URL`**
   - In `_setup_environment`, throw a descriptive exception when `DATABASE_URL` cannot be resolved. Prevent silent SQLite fallback.
2. **Connection sanity check**
   - After spawning the Luigi subprocess, run a `SELECT 1` against the resolved connection string (same credentials). Abort plan + surface failure if unreachable.
3. **Stall detection**
   - Extend `monitor_progress` to send a WebSocket warning (e.g., after 2 polling intervals with zero delta) so the UI reflects stalled pipelines instead of idling at 0%.
4. **Telemetry**
   - Log masked host info when configuring the environment to confirm the subprocess targets Railway Postgres in production logs.

### Frontend (UX)
1. **Compact header grid**
   - Refactor `RecoveryHeader` card body into a responsive two-column grid.
   - Left: plan meta (ID, connection badge, timestamps). Right: progress module.
2. **Inline stage summary**
   - Pass `stageSummary` & `activeStageKey` into `RecoveryHeader`; render a concise stage tracker (e.g., segmented bar or top stages with badge counts) adjacent to overall %.
3. **API call telemetry strip**
   - Add real-time API call indicator showing: LLM calls made/successful/failed, current model in use, last API response time, and active timeout countdown.
   - Display mini sparkline of recent API response times (last 10 calls).
   - Show API provider status badge (OpenAI/Responses API connectivity).
4. **Live task activity feed**
   - Scrollable ticker showing currently executing task name, duration, and queued next tasks.
   - Display task start/end timestamps with elapsed time counters.
   - Show Luigi worker status and active subprocess PID.
5. **Secondary cues**
   - Display active stage label, tasks completed/61, latest progress message, and database write count beneath the %.
   - Add pipeline velocity indicator (tasks/minute) and estimated remaining time.
6. **Spacing cleanup**
   - Reduce vertical padding, align badges, and ensure mobile breakpoint stacks modules without excessive whitespace.

## Implementation Steps
1. **Backend**
   1. Update `_setup_environment` to raise `RuntimeError` if `DATABASE_URL` missing.
   2. Add helper to verify DB connectivity post-spawn; fail plan + broadcast error when check fails.
   3. Enhance `monitor_progress` with stall detection + warning event, and ensure database writes include stall diagnostics.
   4. Add structured log (`progress_env_info`) with masked DB host + mode.
   5. **NEW: API telemetry tracking**
      - Add `api_calls` table to track LLM requests: timestamp, model, response_time, status, tokens_used.
      - Emit WebSocket events for each API call start/completion with response metrics.
      - Track Luigi task execution timestamps and durations in `plan_content`.
2. **Frontend**
   1. Update `useRecoveryPlan` return signature to expose `stageSummary` & `activeStageKey` to header.
   2. Redesign `RecoveryHeader` layout, adding stage chips/mini bar and compact progress stats.
   3. **NEW: API telemetry components**
      - Create `APITelemetryStrip` component with real-time call counters, response time sparkline, and provider status.
      - Add `LiveTaskTicker` component showing current executing task, duration, and queued tasks.
      - Implement countdown timers for API timeouts and velocity calculations.
   4. Adjust CSS classes for tighter spacing (header + card) and ensure accessibility labels on new elements.
3. **QA / Validation**
   - Run plan end-to-end on Railway staging; confirm progress % increments beyond 0% and stage tracker updates.
   - Test failure path by temporarily masking `DATABASE_URL` to observe fail-fast behavior.
   - Verify responsive layout on ≥3 breakpoints and screen-reader output for progress section.

## Risks & Mitigations
- **Potential regression**: Raising on missing `DATABASE_URL` could break local dev without envs → document requirement and optionally allow explicit opt-out via feature flag.
- **UI density**: Adding stage info could clutter mobile view → design responsive stack (vertical list below 768px).
- **NEW: API telemetry overhead**: WebSocket events for each API call could increase traffic → batch events or throttle updates during high-frequency calls.
- **Database load**: Additional `api_calls` table writes during LLM requests → use async writes and consider partitioning by plan_id.

## Dependencies / Follow-ups
- Confirm with DevOps that Railway env vars (`DATABASE_URL`, `PLANEXE_CLOUD_MODE`) remain available to the API container and child processes.
- Post-update, capture screenshots for docs and update onboarding playbook to highlight fail-fast behavior.
