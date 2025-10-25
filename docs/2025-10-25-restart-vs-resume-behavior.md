<!--
Author: Buffy the Base Agent (AI)
Date: 2025-10-25T00:00:00Z
Purpose: Document current behavior of Restart/Relaunch controls vs true resume in the PlanExe app, with evidence and minimal-change recommendations.
SRP/DRY: Pass — standalone behavior note for restart/resume; references existing modules without duplicating logic.
-->

# Restart vs Resume Behavior in PlanExe

This note documents the current behavior of frontend Restart/Relaunch controls and backend orchestration semantics, clarifying whether failed plans resume at the correct task or always restart from scratch. It also outlines minimal changes to support true resume.

## Summary
- Current UI "Retry/Relaunch" creates a brand-new plan (fresh run) and does not resume at the last successful step.
- There is no backend resume endpoint; the pipeline service cleans the run directory and starts over by design.
- Luigi can support resume semantics if the same run directory and outputs are reused, but the API layer currently does not expose this path.

## Evidence
Frontend
- Buttons/controls labeled Restart/Relaunch call the API that creates a new plan rather than a resume endpoint.
  - API client: planexe-frontend/src/lib/api/fastapi-client.ts (method for relaunch/new plan)
  - Store/UI: planexe-frontend/src/lib/stores/planning.ts and components like PlansQueue/Recovery page wire to the create/new plan path.
- A stub or placeholder for resume exists but is not wired to a working backend endpoint (no POST /api/plans/{id}/resume in API).

Backend
- Routes: planexe_api/api.py exposes POST /api/plans for creation; there is no /resume route implemented.
- Service: planexe_api/services/pipeline_execution_service.py writes pipeline inputs and removes/cleans the run directory prior to execution. This guarantees a clean, full restart instead of a resume.

Luigi/pipeline
- Luigi supports skipping already-completed tasks if you keep the same RUN_ID_DIR and do not delete outputs/targets.
- Current API usage does not reuse the run directory or outputs; it always constructs a new plan_id/run folder and wipes state, causing full restart behavior.

## Impact
- Users clicking Restart/Relaunch lose partial progress and re-execute completed tasks.
- UI affordances may be misleading if the expectation is resume-from-last-good-step. This costs time and compute, and can mask where failures occurred.

## Minimal changes to support true resume
1) Backend endpoint
- Add POST /api/plans/{plan_id}/resume
  - Validates that plan exists and is resumable (e.g., status in [failed, canceled, interrupted])
  - Reuses existing plan output_dir as RUN_ID_DIR
  - Skips destructive cleanup in the pipeline execution path (no rmtree or reinit)
  - Invokes Luigi with the same plan_id and configuration to continue

2) PipelineExecutionService adjustments
- Accept a mode flag (resume: boolean)
  - When resume=true: do not delete the run directory or existing outputs; only write any missing inputs idempotently
  - Ensure idempotent writes for inputs (write if missing; validate if exists)

3) Frontend wiring
- Expose a Resume action when a plan is resumable (failed/canceled and artefacts/run dir exist)
- Wire Resume button to POST /api/plans/{id}/resume
- Keep Relaunch/New run for starting over (retain current behavior)

## Safeguards and considerations
- Migrations: no DB schema changes required if plan status + output_dir already present
- Validation: verify run directory exists and is writable; surface a clear error if missing
- Concurrency: prevent multiple concurrent resume attempts on the same plan_id
- Visibility: reflect resumed progress in WebSocket stream; ensure progress UI reads from the resumed plan_id

## Quick testing checklist
- Start a plan, let it complete some tasks, watch it eventually fail
- Click Resume — verify execution continues from next pending task (no re-run of completed tasks)
- Click Relaunch — verify a brand-new plan_id is created and all tasks run from scratch
- Confirm artefacts and fallback-report endpoints reflect resumed state
- Check logs to ensure no cleanup happened prior to a resume run

## File references
- Frontend API client: planexe-frontend/src/lib/api/fastapi-client.ts
- Frontend state/UI: planexe-frontend/src/lib/stores/planning.ts, components where restart controls live (e.g., PlansQueue, Recovery page)
- FastAPI routes: planexe_api/api.py
- Pipeline service: planexe_api/services/pipeline_execution_service.py
- Luigi runner/docs: planexe/plan/run_plan_pipeline.py; docs/run_plan_pipeline_documentation.md

## Recommendation
Implement the minimal backend resume endpoint and a non-destructive resume path in PipelineExecutionService, then wire a Resume button in the UI that hits the new endpoint. Keep Relaunch as a separate action for clean restarts.
