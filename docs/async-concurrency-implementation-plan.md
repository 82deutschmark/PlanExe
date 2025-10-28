# Async Concurrency Implementation Plan

Keep the scope tight: unlock actual async batching in the Luigi tasks and make sure workers don’t get stuck because of stale scheduler locks. The OpenAI model is fine—the fixes live in our code.

## Files to Touch

1. `planexe/llm_util/llm_executor.py`
2. `planexe/plan/run_plan_pipeline.py`
3. `planexe_api/services/pipeline_execution_service.py`
4. Tests under `planexe/plan/tests/` (or add a new module alongside them)

## What to Change

### 1. `planexe/llm_util/llm_executor.py`
- Let `run_async`/`run_batch_async` reuse a single `llm_model.create_llm()` per attempt instead of recreating the client for every coroutine.@planexe/llm_util/llm_executor.py#229-359
- Treat async callables as first-class citizens when validating execute functions (check `inspect.iscoroutinefunction`).@planexe/llm_util/llm_executor.py#278-290
- Lightweight logging: log attempt start/end plus duration in `_try_one_attempt_async` so we can trace batch timing without adding new infrastructure.@planexe/llm_util/llm_executor.py#337-359

### 2. `planexe/plan/run_plan_pipeline.py`
- Replace `asyncio.run(...)` wrappers with straight `await` calls inside the Luigi task methods (e.g. `DraftDocumentsToFindTask`, `DraftDocumentsToCreateTask`, `EstimateTaskDurationsTask`, `CreateWBSLevel3Task`).@planexe/plan/run_plan_pipeline.py#4330-5175
- Keep the helper coroutines but factor out the duplicated “build execute function + log interaction” logic so the two document tasks share one implementation.
- Before handing work to `run_batch_async`, cap concurrency with an env var like `PLANEXE_MAX_CONCURRENT_LLM` to stay under rate limits.
- Preserve deterministic ordering when you merge batch results back into the accumulated JSON that gets persisted.

### 3. `planexe_api/services/pipeline_execution_service.py`
- When composing the Luigi command, append the worker hygiene flags the other dev suggested: `--worker-id`, `--worker-timeout 160`, `--scheduler-disable-remove-delay 5`, `--retry-count 2`, `--retry-delay 3`.@planexe_api/services/pipeline_execution_service.py#440-529
- Keep using the existing local scheduler but make sure we unregister the process from `process_registry` on exit (success or failure) so we don’t leak handles.

### 4. Tests
- Add a fast test that stubs two async execute functions, feeds them into `run_batch_async`, and asserts both complete plus their order is preserved.
- Extend an integration test (or add a new one) that runs a pipeline snippet with `PLANEXE_MAX_CONCURRENT_LLM=2` to prove we’re not spawning sequentially anymore.

## Quick Rollout Checklist

1. Implement the edits above in a branch.
2. Run one real plan locally with `PLANEXE_MAX_CONCURRENT_LLM=3` and ensure logs show concurrent batches.
3. Verify the Luigi worker logs now include the new flag values when the subprocess starts.
4. Ship. No additional infrastructure work required.
