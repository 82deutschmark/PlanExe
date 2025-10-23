# Recovery Page Refactor Plan

Status: Proposed
Owners: Frontend Platform, API Client Maintainers
Scope: planexe-frontend/src/app/recovery and related shared components/hooks

## Goals

- Preserve and improve live streaming visuals and debug info so users see progress continuously.
- Reduce cascading errors by separating data fetching/state from presentation.
- Keep API compatibility: no Next.js API routes; use `fastapi-client.ts` directly; `snake_case` fields.
- Maintain existing recovery behavior: canonical report vs fallback, artefact browsing, logs, and stage progress.

## Current Issues (from page snapshot)

- Single page mixes responsibilities: data loading, routing glue, and UI for multiple widgets.
- Interdependent effects for preview, artefacts, and report cause brittle coupling and rerender churn.
- Hard to test in isolation; small changes break unrelated areas.

References

- StageTimeline is inline: planexe-frontend/src/app/recovery/page.md:139
- ReportPanel is inline: planexe-frontend/src/app/recovery/page.md:174
- Artefact preview/list/state tightly coupled: planexe-frontend/src/app/recovery/page.md:257
- Streaming utilities already exist and must be preserved: 
  - planexe-frontend/src/lib/streaming/analysis-streaming.ts
  - planexe-frontend/src/components/monitoring/Terminal.tsx
  - planexe-frontend/src/components/files/FileManager.tsx
  - planexe-frontend/src/lib/api/fastapi-client.ts

## Architecture Overview

Introduce a thin container and a single hook that own state and data loading; extract presentational components so each piece can render independently without cross-coupling.

- RecoveryLayout (container)
  - Wires hook data/signals to presentational components.
  - Owns high-level layout and inter-panel coordination only.
- useRecoveryPlan(planId) (hook)
  - Centralizes API calls (plan, artefacts, report), derived summaries, and streaming updates.
  - Exposes stable, minimal state and actions for the UI.
- Presentational components (pure)
  - RecoveryHeader: plan meta, status badge, relaunch link.
  - StageTimeline: stage counts and progress state.
  - ReportPanel: canonical vs fallback tabs; refresh with status.
  - ArtefactList: paginated/sorted list with metadata.
  - ArtefactPreview: error-bounded inline preview for text/html; download for others.
  - TerminalPanel: live logs view with pause/resume and search.

All components remain client components and talk only to the hook or to streaming utilities; no direct API calls from presentational layers.

## Streaming Strategy (Preserve “stuff happening”)

- WebSocket-first with polling fallback:
  - Connect to `/api/plans/{id}/stream` for plan status, stage counts, and last-write timestamps.
  - On disconnect or heartbeat failure, fall back to interval polling via `fastapi-client.ts`.
- Visual feedback patterns:
  - Top-level live HUD: status badge, “tasks complete” counter, “last artefact at” timestamp.
  - StageTimeline updates incrementally; show pulsing dots while awaiting first artefact.
  - ReportPanel shows skeleton and “assembling report…” while canonical is building; auto-switch to fallback once available; one-click refresh.
  - ArtefactList displays “new since you opened” badge and lazy-inserts at top.
  - TerminalPanel streams logs continuously; allow pause/resume so users can inspect without losing position.
- Heartbeats and health:
  - Display connection indicator (WS connected/polling) and last event age.
  - Backoff reconnect (exponential to 30s) with snackbar to inform the user.

## Hook Design: useRecoveryPlan(planId)

Responsibilities

- Fetch plan, artefacts (paged), canonical report, and fallback report metadata.
- Integrate WebSocket events to update status, per-stage counts, and last-write time.
- Drive preview selection and download actions; enforce size/type limits.
- Derive `stageSummary` from `artefacts` with stable sorting (`KNOWN_STAGE_ORDER`).

API Surface (tentative)

```ts
type UseRecoveryPlan = (
  planId: string
) => {
  // plan status
  plan: PlanResponse | null
  statusDisplay: { label: string; className: string; icon: React.ReactNode }
  lastWriteAt: Date | null

  // report
  canonicalHtml: string | null
  canonicalError: string | null
  refreshReport: () => Promise<void>
  reportLoading: boolean

  // artefacts
  artefacts: PlanFile[]
  artefactLoading: boolean
  artefactError: string | null
  artefactLastUpdated: Date | null
  refreshArtefacts: () => Promise<void>

  // stage summary
  stageSummary: { key: string; label: string; count: number }[]

  // preview
  previewFile: PlanFile | null
  setPreviewFile: (f: PlanFile | null) => void
  preview: { mode: 'text' | 'html'; content: string } | null
  previewLoading: boolean
  previewError: string | null
  loadPreview: () => Promise<void>

  // streaming
  connection: { mode: 'websocket' | 'polling'; lastEventAt: Date | null }
}
```

Implementation Notes

- Use `fastapi-client.ts` for all HTTP calls; no Next.js API routes.
- WebSocket manager mirrors backend heartbeat/cleanup; expose `connection` state for the HUD.
- Batch state updates inside a single `useReducer` or `zustand` store slice to minimize rerenders.
- Guard inline preview with content-type and byte-size thresholds; send others to download.

## Component Breakdown

- RecoveryHeader
  - Shows status, plan prompt excerpt, model, and “Relaunch” link.
  - Displays connection status and last write timestamp.
- StageTimeline
  - Pure component; input is `stageSummary` only.
- ReportPanel
  - Tabs for canonical/fallback; primary button = Refresh; show “last built” time.
  - Canonical iframe with sandbox attrs; fallback uses existing `ReportTaskFallback` embedded variant.
- ArtefactList
  - Table or list with filename, stage, size, content-type, created_at.
  - Filtering by stage and search by filename; virtualization for large lists.
- ArtefactPreview
  - Error boundary localized to preview only; skeleton while loading.
  - Text and JSON pretty-print; HTML via `srcDoc` iframe with strict sandbox.
- TerminalPanel
  - Existing streaming log viewer; preserve pause/resume and auto-scroll.

All new/modified TSX files must include the project header block used in `page.md` (Author, Date, PURPOSE, SRP/DRY check).

## UX Improvements for “Show Me Progress”

- Live counters: “N/61 tasks completed”, per-stage artefact counts, and “last artefact at hh:mm:ss”.
- Micro toasts for meaningful events (first artefact, report assembled, fallback available, failures).
- Sticky mini-HUD at top on scroll with status, connection, and refresh.
- Consolidated “Loading/Empty/Error” templates that are visually distinct and consistent.

## Migration Plan (Incremental, Low-Risk)

1) Introduce `useRecoveryPlan` and switch existing page to consume it without changing layout.
2) Extract StageTimeline and ReportPanel into their own files; wire to the hook.
3) Move preview logic into `ArtefactPreview`; simplify list into `ArtefactList`.
4) Add connection HUD and WS backoff; keep polling as fallback.
5) Trim dead preview code and prop drilling; keep route/URL stable.
6) Performance pass: memoization, virtualization for artefact list, batched setState.

Each step should land as a separate PR for easy rollback and review.

## Testing Strategy

- Frontend component tests via React Testing Library against a running dev backend populated with prior plan data (no mocks per project rules).
- Verify:
  - StageTimeline updates from WS and polling fallback.
  - ReportPanel toggles canonical/fallback and refresh works.
  - Artefact preview enforces size/type and isolates errors.
  - Terminal continues to stream and respects pause.

## Non-Goals / Constraints

- Do not change FastAPI endpoints or introduce Next.js API routes.
- Keep `snake_case` for all API payload fields.
- Do not alter Luigi DAG dependencies.

## Risks and Mitigations

- WS reliability: implement heartbeat and exponential backoff with user-visible status; retain polling.
- Rerender storms: coalesce updates in hook/store, memoize selectors.
- Preview security: sandbox iframe, strip inline scripts, and never auto-execute blobs.

## Acceptance Criteria

- Recovery page remains at same route and loads without regressions.
- Live HUD shows status, connection mode, tasks completed, and last artefact time.
- StageTimeline updates within 1s when WS connected; <5s via polling.
- ReportPanel supports refresh and canonical/fallback with clear states.
- Artefact list/preview are decoupled; preview handles text/html with clear errors for others.
- Terminal streams continuously with pause/resume.
- All new TSX files include the header block and pass SRP/DRY checks.

