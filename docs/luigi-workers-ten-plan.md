# Luigi Worker Scaling Plan

## Objective
Guarantee that every pipeline execution runs with **10 Luigi workers** available, eliminating the current fallback to a single worker when `LUIGI_WORKERS` is unset or malformed.

## Current Behaviour Snapshot
- `ExecutePipeline.run()` in `planexe/plan/run_plan_pipeline.py` reads `LUIGI_WORKERS` and defaults to `1` on any missing/invalid value.
- FastAPI launches the Luigi subprocess without enforcing a worker count; local shells must set `LUIGI_WORKERS` manually.
- Windows deployments inherit whatever the parent shell exports, making concurrency inconsistent across environments.

## Proposed Changes
1. **Set a Code-Level Default of 10**
   - In `ExecutePipeline.run()`, replace the existing fallback logic so that `workers = 10` when `LUIGI_WORKERS` is absent/invalid.
   - Preserve the ability to override by exporting a different `LUIGI_WORKERS`, but never drop below 10.

2. **Enforce via FastAPI Launch Path**
   - In `pipeline_execution_service.py` (or the launcher responsible for `luigi.build` subprocesses), ensure the spawned environment sets `LUIGI_WORKERS=10` if the caller did not supply one.
   - Document the precedence: CLI/env override > FastAPI default (10) > Luigi fallback (also 10).

3. **Align Local Tooling & Deployment Scripts**
   - Update shell/PowerShell helpers, Railway Dockerfiles, and README snippets to export `LUIGI_WORKERS=10` before invoking the pipeline.
   - Add validation (e.g., log warning if `workers != 10`) during startup to surface drift early.

## Validation Strategy
- Run the pipeline locally (Windows dev box) and confirm the Luigi log prints `workers=10`.
- Execute the FastAPI-triggered pipeline on Railway staging and verify concurrent task execution via logs.
- Add a regression check to the diagnostics suite (if available) that asserts the configured worker count.

## Risks & Mitigations
- **Resource contention**: Ten workers may overwhelm small machines. Mitigate by documenting opt-out (set smaller value explicitly) and monitoring CPU usage.
- **Legacy scripts**: Old automation relying on single-worker behaviour must be updated concurrently.

## Rollout Checklist
1. Update `ExecutePipeline.run()` fallback to 10.
2. Inject default `LUIGI_WORKERS` in FastAPI pipeline launcher.
3. Refresh docs/scripts to advertise the new default.
4. Smoke-test on Windows + Railway.
5. Communicate change in CHANGELOG.
