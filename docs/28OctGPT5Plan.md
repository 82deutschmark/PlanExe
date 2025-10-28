You already have enough frontend building blocks (no backend/DB changes) to deliver a clear, real‑time “what’s running and why” UI without over‑engineering.

Below is a tightened plan that reuses existing hooks, events, and components. It keeps scope on the frontend, composes what you’ve got, and removes the automatic redirect so users see a completion summary in place.

Principles

Frontend‑only: rely on existing WebSocket events and REST endpoints.
Compose, don’t rebuild: wire up existing recovery components for real‑time explanations.
Keep it legible: stage/timeline + task list beats a bespoke graph renderer.
Don’t move users on completion: show a clear summary and next actions inline.
What To Keep

Live reasoning and output: planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx
Stage‑level progress: planexe-frontend/src/app/recovery/components/StageTimeline.tsx
Log viewer: planexe-frontend/src/components/PipelineDetails.tsx → PipelineLogsPanel
Insights + metrics: planexe-frontend/src/app/recovery/components/PipelineInsights.tsx
Current activity: planexe-frontend/src/app/recovery/components/CurrentActivityStrip.tsx
WS plumbing and polling fallback: planexe-frontend/src/app/recovery/useRecoveryPlan.ts
Minimal Additions (Frontend Only)

Keep the “DAG” as an accordion task timeline (not a diagram):
Use planexe-frontend/src/components/monitoring/LuigiPipelineView.tsx + planexe-frontend/src/lib/luigi-tasks.ts.
It already parses WS log messages to infer running/completed/failed; no backend tweak required.
Show “Currently running: X” with a small pulse and completion ticks. That’s enough DAG explainability without drawing edges.
Show reasoning next to status:
You already do this: LiveStreamPanel.tsx consumes reasoning_delta and text_delta from WS (fastapi-client.ts).
Pair LuigiPipelineView and LiveStreamPanel in the recovery layout so “task status” and “why” are visible together.
Fix Completion UX (No Auto‑Redirect)

Remove the redirect to the report when done and show a “Completion Summary” card right in the recovery view:
File to adjust: planexe-frontend/src/app/recovery/page.tsx (removes the useEffect that calls router.replace(...) on completed).
New lightweight component (presentational only) rendered conditionally when plan.status === 'completed':
Status badge, duration, total tasks complete, “Open Report”, “Open Fallback Report”, “Review Artefacts”, and “Stay Here”.
Data already available via useRecoveryPlan (plan, artefacts, reports).
This keeps users in place and provides clear next actions.
Explaining “What’s Happening”

Stage‑level explanation (static, no backend):
Add short, static descriptions (sourced from docs/LUIGI.md) into PipelineInsights.tsx or a tiny local map to display “About this stage” when a stage is active.
Keep it light: one‑line purpose per stage group, not a new schema.
Task‑level explainability:
When a LuigiPipelineView task is RUNNING, highlight the LiveStreamPanel so users see reasoning for the current interaction.
Optional: clicking a task in LuigiPipelineView focuses the stream if it’s the active interaction (pure UI state, no API).
Where To Wire It

Monitoring layout: planexe-frontend/src/app/recovery/page.tsx
Already composes:
CurrentActivityStrip (active context)
PipelineInsights (metrics + stage activity)
PipelineLogsPanel (logs)
LiveStreamPanel + StreamHistoryGrid (active stream + history)
StageTimeline (stage counts)
Add LuigiPipelineView under or beside StageTimeline.
Replace the completion redirect with the in‑place summary card.
Data Sources (Unchanged)

WS messages handled in fastapi-client.ts:
type: 'llm_stream' with text_delta, reasoning_delta, final, end → already consumed in useRecoveryPlan.ts.
type: 'log' → already parsed by LuigiPipelineView.tsx to update task statuses.
type: 'status' → feeds overall plan progress and status.
Periodic details/files/log fallback:
PipelineDetails.tsx polling /api/plans/{id}/details stays as a resilient fallback for logs/files list.
Not Over‑Engineered By Design

No new backend fields or DB writes.
No new adapters: keep useRecoveryPlan as the data orchestrator and only compose UI.
No runtime parsing of markdown DAG; luigi-tasks.ts already contains the 61 tasks and phase groupings.
No SVG graph/edge layout; the accordion phases list conveys order and completeness clearly.
Concrete Steps (Small, Safe Deltas)

Recovery page composition
Add LuigiPipelineView next to StageTimeline. Path: planexe-frontend/src/app/recovery/page.tsx
Reasoning emphasis
Keep LiveStreamPanel as‑is; optionally add a subtle focus/scroll‑into‑view when the current task changes (UI only).
Completion summary
Remove the useEffect that redirects to /plan on completion in planexe-frontend/src/app/recovery/page.tsx.
Render a “Pipeline Completed” card with actions using existing reports and artefacts data.
Stage explanations
Add a small map of stage key → one‑line description inside PipelineInsights.tsx. Path: planexe-frontend/src/app/recovery/components/PipelineInsights.tsx
Keep PipelineDetails
Continue using PipelineLogsPanel for a simple, reliable log surface. Path: planexe-frontend/src/components/PipelineDetails.tsx
Why This Is Better

Zero backend/DB changes; fully leverages existing WS and REST payloads.
Uses existing components (less code churn, faster review).
Provides real‑time “now running” and “reasoning” without duplicative logic.
Stops redirecting at completion — the user sees a clear summary and decides next steps.
If you want, I can write a short doc at docs/UX-PIPELINE-VISUALIZATION-DESIGN.md that spells out these wiring points and the exact component composition, and then stage a small PR to remove the auto‑redirect and add the completion card.