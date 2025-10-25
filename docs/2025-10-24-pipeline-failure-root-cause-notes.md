# Pipeline Failure Investigation – 2025-10-24

## Context

- Date: 2025-10-24
- Trigger: Luigi pipeline run `PlanExe_c6cae6b1-6aee-4937-a09a-78e373411165`, model `gpt-5-nano-2025-08-07`.
- Status: 46 tasks succeeded, 3 failed, 11 blocked by dependency failures.
- Failing tasks:
  1. `ConvertPitchToMarkdownTask`
  2. `EstimateTaskDurationsTask`
  3. `FilterDocumentsToFindTask`

Each failure is linked to our new OpenAI Responses API adapter (`planexe/llm_util/simple_openai_llm.py`). All three rely on structured outputs (`as_structured_llm`) with Pydantic schemas enforced through the schema registry.

## Key Observations by Task

### 1. `ConvertPitchToMarkdownTask`
- Source: `planexe/plan/run_plan_pipeline.py`@4527-4574, invoking `ConvertPitchToMarkdown.execute` (`planexe/pitch/convert_pitch_to_markdown.py`).
- Flow: formats pitch JSON, calls `llm.chat`, expects `[START_MARKDOWN]` / `[END_MARKDOWN]` delimiters, trims, and saves.
- Risk:
  - Delimiter enforcement is best-effort. If the Responses output omits delimiters or mixes JSON/markdown, `start_index` / `end_index` remain `-1`, leading to fallback to entire response, which may include system instructions.
  - Adapter expects `chat_response.message.content`. Our streaming wrapper concatenates delta text, but if the model returns only structured `parsed` blocks, `message.content` may be empty, yielding blank markdown.
  - No guard for empty markdown before writing to disk/DB.
- Suspected failure mode:
  - Responses output likely delivered structured JSON without delimiters; adapter returned empty `message.content`, causing downstream crash. Need raw payload to confirm.

### 2. `EstimateTaskDurationsTask`
- Source: `run_plan_pipeline.py`@4630-4748; schema defined in `planexe/plan/estimate_wbs_task_durations.py` (`TimeEstimates`).
- Flow: chunk WBS tasks in groups of three; each chunk invokes `EstimateWBSTaskDurations.execute`, which uses structured Responses.
- Risk:
  - `StructuredSimpleOpenAILLM.chat` gathers streamed text. When Responses only emits `output_parsed`, `aggregated_text` ends up empty, causing `_parse_candidates` -> `ValueError` if text fallback missing.
  - Schema enforcement (`additionalProperties=False`) means extra keys (e.g., new metadata from model) break validation.
  - Fallback block only triggers for exceptions raised inside chunk loop; streaming/parsing errors propagate before fallback logic executes.
- Suspected failure mode:
  - Pydantic validation failure due to missing `task_details` or extra keys, triggered during streaming parse, bypassing fallback and failing the chunk.

### 3. `FilterDocumentsToFindTask`
- Source: `run_plan_pipeline.py`@3992-4053; structured model `DocumentImpactAssessmentResult` in `planexe/document/filter_documents_to_find.py`.
- Flow: load purpose + markdown inputs + document list, call `FilterDocumentsToFind.execute`, remap integer IDs to UUIDs, enforce that filtered set matches LLM output.
- Risk:
  - Strict equality check `len(filtered_documents_raw_json) == len(ids_to_keep)` throws if LLM omits a doc or returns duplicate IDs.
  - Structured schema requires enumerated `impact_rating`; casing mismatch (`"CRITICAL"` vs `"Critical"`) or missing field yields Pydantic error.
  - Large prompt pushes Responses length; model may truncate list, causing mismatch.
- Suspected failure mode:
  - Either Pydantic validation failed or LLM dropped documents leading to length mismatch, raising `ValueError`.

## Cross-Cutting Issues

1. **Structured Responses vs Streaming** (`SimpleOpenAILLM.stream_chat` + `StructuredSimpleOpenAILLM`)
   - For structured outputs, Responses API already returns a JSON block in `output_parsed`. Our streaming adapter waited for textual deltas and occasionally observed an empty `aggregated_text`, triggering downstream validation errors.
   - Streaming adds complexity (partial chunks, reasoning events) without tangible benefits for these tasks. Non-streaming structured calls are supported directly by the API and remove this failure mode.
   - `_enforce_openai_schema_requirements` still forces strict schemas; optional fields should provide defaults to avoid rejections.

2. **Error Handling**
   - Tasks wrap structured calls but don’t catch `ValueError`/`ValidationError` before Luigi surfaces failure. Minimal fallback coverage (only durations task has heuristics).
   - No DB logging of raw LLM response for failed interactions; only status flips to `failed`.

3. **Schema Alignment**
   - Need to audit Pydantic models to ensure optional fields have defaults consistent with `_enforce_openai_schema_requirements`.
   - Enumerations must match assistant output exactly (case-sensitive). Any mismatch yields validation failure.

## Recommended Actions

1. **Instrument Failures**
   - Capture `chat_response.text`, `chat_response.raw`, and Response IDs in DB before raising. Add temporary logging around structured parsing points for the three tasks.
   - Update failure handling to persist raw payload to `plan_content` or a diagnostic table when validation fails.

2. **Adapter Change (Implemented 2025-10-24)**
   - `StructuredSimpleOpenAILLM.chat` now bypasses streaming and calls `_invoke_responses` directly. This leverages the Responses API's native structured JSON return path, eliminating dependence on partial text chunks.
   - The adapter still surfaces reasoning and usage metadata from the final payload.

3. **Task-Level Safeguards (Follow-Up)**
   - `ConvertPitchToMarkdownTask`: add guard for empty markdown, fallback to storing raw content with warning.
   - `EstimateTaskDurationsTask`: catch `ValueError` inside chunk loop to trigger built-in heuristic fallback, log failure details.
   - `FilterDocumentsToFindTask`: soften strict length check (warn and proceed) or pre-validate that Response IDs map to known UUIDs.

4. **Schema Review**
   - Revisit Pydantic models (`TimeEstimates`, `DocumentImpactAssessmentResult`, etc.) to ensure optional fields have defaults and enumerations align with expected assistant casing.
   - Verify `identify_purpose_dict` and downstream data flows use consistent field names between tasks.

## Open Questions

- What exact payloads did the Responses API return? Need instrumentation before next run.
- Are there other tasks using structured streaming that can fail the same way? (Likely yes: governance, team enrichment, etc.)
- Should we standardize on non-streaming mode for structured structured outputs? Implemented for structured adapter; monitor for regressions before rolling back.

## File References

- `planexe/plan/run_plan_pipeline.py`
  - `ConvertPitchToMarkdownTask`: lines 4527-4574
  - `EstimateTaskDurationsTask`: lines 4630-4748
  - `FilterDocumentsToFindTask`: lines 3992-4053
- `planexe/pitch/convert_pitch_to_markdown.py`
- `planexe/plan/estimate_wbs_task_durations.py`
- `planexe/document/filter_documents_to_find.py`
- `planexe/llm_util/simple_openai_llm.py`
- `planexe/llm_util/schema_registry.py`

These notes should guide the next iteration of instrumentation and schema alignment work across all structured-response tasks.
