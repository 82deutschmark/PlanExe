# Changelog - Use Proper Semantic Versioning and follow the Keep a Changelog standard

## [0.9.6] - 2025-10-26
- **Reasoning Effort UI**: Added visible reasoning effort selector to `PlanForm` component with four levels (minimal, low, medium, high) and helpful badges indicating speed/thoroughness trade-offs.
- **Conversation Modal**: Extended `ConversationModal` to accept and display the user-selected reasoning effort, passing it through to the conversation API instead of always using backend defaults.
- **Resume Dialog**: Added reasoning effort selector to `ResumeDialog` so resumed plans can optionally override the original setting, with the previous value pre-selected by default.
- **Recovery Flow**: Updated recovery page to preserve reasoning effort when resuming plans, passing it through to both fallback and targeted resume operations.
- **Data Flow**: Updated `useResponsesConversation` hook to accept optional `reasoningEffort` parameter and use it in conversation turn payloads, while falling back to backend defaults only when not provided.
- **Visual Feedback**: Added reasoning effort badge to conversation modal header so users can see the active setting during intake conversations.
- **Unlimited Intake**: Removed all character limits from intake fields across frontend and backend:
  - Frontend: Removed 10,000 character limit from `PlanFormSchema` prompt validation
  - Backend: Removed 10,000 character limit from `CreatePlanRequest.prompt` field
  - Backend: Removed 6,000 character limit from `ConversationTurnRequest.user_message` field (conversation modal)
  - Backend: Removed 8,000 character limit from `AnalysisStreamRequest.prompt` field
  - Users can now provide unlimited project context and detailed intake information without truncation
- Fixed the gap where reasoning effort was configured via backend defaults but never exposed in the UI, making the setting invisible and unchangeable.

## [0.9.5] - 2025-10-26
- Fixed the Railway static export by replacing the dynamic `/plan/[planId]` route with a query-string driven `/plan` page so Next.js no longer requires `generateStaticParams()`.
- Moved the report viewer client component to the new `/plan` entry point and updated recovery redirects/download actions to use `?planId=` links.
- Verified `npm run build` completes with `output: 'export'`, unblocking single-service deployments.

## [0.9.4] - 2025-10-26
- Fixed the pipeline execution service fast-mode normalisation to avoid referencing a non-existent
  `SpeedVsDetailEnum` member, ensuring plan launches succeed when coercing legacy aliases such as
  "balanced". The Luigi subprocess now starts correctly for both fast and detailed requests.

## [0.9.3] - 2025-10-26
- Normalised speed vs detail inputs in the pipeline execution service so legacy/uppercase "fast" selections coerce to Luigi's
  fast mode, including debug logs that surface the resolved value before launching the subprocess. This keeps fast-mode runs in
  sync with the lightweight Q&A placeholders and prevents accidental full-detail executions.

## [0.9.2] - 2025-10-26
- Honour fast-mode expectations by emitting lightweight placeholder artefacts for Questions & Answers, avoiding the long-running
  LLM calls when users select "Fast" on the frontend. Pipeline runs now skip the deep Q&A loop while still producing well-formed
  outputs for downstream tasks.

## [0.9.1] - 2025-10-26
- Resume Picker Modal and Per-task Selection
- Added inline modal to replace prompt-based selection. Users can pick individual missing artefacts (checkbox list grouped by stage), set model, and choose speed.
- Recovery header button now opens the modal; confirmation launches a resume run targeting only selected files.
- Keeps DB-first behavior, relying on pipeline to skip previously completed content.

## [0.9.0] - 2025-10-26
- Recovery UX polish and targeted resume
- Added auto-redirect to report page when a plan completes (from recovery to `/plan/{planId}`) with a friendly banner.
- Reworked "Relaunch" action to "Resume Missing Sections". It inspects missing artefacts from `/api/plans/{id}/fallback-report` and only resumes gaps.
- Stage picker for resume: users can choose which missing stages to resume before launching a targeted run.
- New report viewer page at `/plan/{planId}`: shows final HTML when available, otherwise embeds the database-assembled fallback report with explicit missing-section reasons.

## [0.8.9] - 2025-10-26
- **Vibrant Color Scheme**: Replaced entire grey/slate color scheme with warm amber/orange/yellow palette
- **Main Background**: Changed to warm gradient `from-amber-50 via-orange-50 to-yellow-50`
- **Stage Timeline**: Amber borders, green completion dots, amber active states with shadow
- **LiveStreamPanel**: Amber borders and accents on dark background (amber-500/orange-500)
- **StreamHistoryPanel**: Amber borders (amber-600) with amber text on dark background
- **RecoveryReportPanel**: Amber borders and amber button with hover effects
- **RecoveryHeader**: Renamed to "Plan Assembly Workspace" with amber-900 headings and amber-700 text
- **Improved Readability**: All text now uses high-contrast colors (amber-900, gray-900) instead of unreadable grey

## [0.8.8] - 2025-10-26
- **Recovery Page Redesign**: Transformed recovery page into dense, info-rich assembly workspace
- **Removed Duplications**: Eliminated PipelineDetails (3 tabs), RecoveryArtefactPanel (file manager), and ArtefactPreview (modal)
- **Reorganized Layout**: Logs remain at top full-width, stage timeline in left sidebar
- **Dense Styling**: Reduced padding/margins throughout (gap-4→gap-2, p-4→p-2) for maximum information density
- **Simplified Reports**: Removed tabs from RecoveryReportPanel - now shows canonical HTML or fallback automatically
- **Compact Components**: Applied dense styling to StageTimeline, LiveStreamPanel, and StreamHistoryPanel
- **Better Focus**: Page now emphasizes live streaming, logs, and assembled plan content without file management overhead

## [0.8.7] - 2025-10-26
- Added real-time progress monitoring to pipeline execution service, broadcasting incremental progress updates (1-99%) based on completed task counts from the `plan_content` table.
- Fixed recovery page header progress display that was stuck at 0% throughout execution by implementing periodic database polling every 3 seconds.
- Added `count_plan_content_entries()` method to DatabaseService for efficient task completion tracking.
- Progress updates now broadcast via WebSocket with format "Processing... X/61 tasks completed" and update both database and connected clients.

## [0.8.6] - 2025-10-25
- Completed the SimpleOpenAILLM rollout in `run_plan_pipeline.py`, handing adapters directly to Luigi tasks and documenting remaining signature migrations in `docs/pipeline_handoff_notes.md`.
- Hardened WBS and review tasks with structured fallback handling, fast-mode aware prompts, and richer progress metadata persisted to `plan_content`.

## [0.8.4] - 2025-10-25
- Replaced residual `llama_index` bindings across Luigi tasks with the shared SimpleOpenAILLM adapter and new `SimpleChatMessage` helpers.
- Updated CLI entry points to honour `llm_config.json` precedence and removed hard-coded model IDs.
- Added adapter support for schema-aware messaging, enabling DataCollection, ExpertCost, EstimateWBSTaskDurations, and other tasks to run purely through the Responses API.

## [0.8.3] - 2025-10-25
- Restored `_extract_output` in `planexe/llm_util/simple_openai_llm.py`, fixing structured Responses parsing for early pipeline tasks (RedlineGateTask, IdentifyPurposeTask, etc.).

## [0.8.2] - 2025-10-25
- Ensured `PlanTask.get_database_service()` creates tables on demand so early Luigi stages can write to the database before the API initialises it.

## [0.7.5] - 2025-10-24
- Centralised reasoning effort defaults under `REASONING_EFFORT_DEFAULT`, exposed via `/api/config`, and updated backend, pipeline, and frontend consumers to read the same value.

## [0.7.4] - 2025-10-24
- Added defensive fallbacks for ConvertPitchToMarkdown, EstimateTaskDurations, and IdentifyDocuments so schema or LLM failures inject safe defaults rather than aborting the pipeline.

## [0.7.2] - 2025-10-24
- Finalised deterministic response chaining: persisted `previous_response_id` metadata, normalised legacy content types to OpenAI’s `input_text`/`output_text`, and cleared stale pipeline stop flags before restarts.

## [0.7.0] - 2025-10-24
- Introduced `SimpleOpenAILLM.get_last_response_id()` helpers and wired response chaining through multi-step tasks (QuestionsAnswers, ReviewPlan, lever enrichment, expert finder, premortem diagnostics).

## [0.6.6] - 2025-10-24
- Added an input sanitizer for Responses API payloads to coerce legacy `text` segments into `input_text`/`output_text`, preventing HTTP 400 errors in conversation and analysis streaming.

## [0.6.4] - 2025-10-24
- Implemented `save_markdown()` across plan domain classes and `to_filtered_documents_json()` helpers for document filters, unblocking IdentifyPurposeTask and downstream artefact persistence.

## [0.6.1] - 2025-10-23
- Created a Luigi `PlanContentTarget` so report generation completes when HTML is stored in `plan_content`; updated `/api/plans/{id}/report` to serve database artefacts first.

## [0.6.0] - 2025-10-23
- Consolidated recovery streaming utilities into dedicated controllers and shared types while keeping WebSocket handling DRY across components.

## [0.5.0] - 2025-10-23
- Added consistent `to_markdown()` methods to pipeline classes, removing AttributeErrors in DataCollection, Governance, and ReviewPlan tasks.
- Aligned FastAPI report endpoints with `/api/plans/{plan_id}/report` and resolved unused imports reported by TypeScript linting.

## [0.4.9] - 2025-10-23
- Normalised WebSocket telemetry timestamps to UTC with repository-standard helpers, ensuring downstream consumers receive ISO8601 suffixes.

## [0.4.8] - 2025-10-23
- Fixed `_enforce_openai_schema_requirements` to preserve `$defs` and inline references correctly, resolving Responses API schema validation errors.

## [0.4.7] - 2025-10-23
- Switched schema registry labels to class names, staying within OpenAI’s 64-character limit and adding regression tests around sanitisation.
- Added `timestamp` to `WebSocketRawMessage` so TypeScript type guards compile.

## [0.4.5] - 2025-10-22
- Tightened validation around candidate scenarios, lever enrichment, and SelectScenarioTask to prevent cascade failures after EnrichLeversTask fixes.

## [0.4.4] - 2025-10-22
- Rebuilt `planexe/lever/enrich_potential_levers.py`, reinstated structured batching, and standardised lever setting serialization via `lever_setting_utils`.

## [0.4.2] - 2025-10-22
- Updated `_enforce_openai_schema_requirements` to auto-require declared properties, ensuring strict JSON outputs for Redline Gate and downstream tasks.
- Synced `/api/models` and CLI entry points with timestamped model keys from `llm_config.json`.
- Added `/api/plans/{id}/files` metadata parity between backend and frontend clients.

## [0.4.1] - 2025-10-20
- Migrated Responses API calls to `response_format.json_schema` and increased streaming ceilings to 120k tokens while correcting content type coercion.

## [0.4.0] - 2025-10-20
- Promoted `gpt-5-mini-2025-08-07` to default, adopted the OpenAI Responses API (schema registry + telemetry persistence), and streamed reasoning/token usage through Luigi and FastAPI.

## [0.3.24] - 2025-10-24
- Normalised frontend API host detection so development instances map to the FastAPI backend on port 8080 without manual overrides.

## [0.3.22] - 2025-10-19
- Removed `llama-index` meta packages and 11 provider dependencies, keeping only `llama-index-core` alongside `openai==2.5.0` to resolve pip conflicts.

## [0.3.21] - 2025-10-30
- Rebuilt conversation streaming to emit official `response.*` events, persisting `conversation_id`, `response_id`, and usage metrics for intake turns.

## [0.3.20] - 2025-11-05
- Persisted hashed OpenRouter API keys and injected them into Luigi subprocesses so request-scoped credentials survive restarts.

## [0.3.17] - 2025-10-30
- Added dedicated `/api/conversations` endpoints, chained Responses API sessions, and stored intake transcripts with structured reasoning payloads.

## [0.3.16] - 2025-10-27
- Enabled analysis streaming by default, preventing HTTP 403 responses in production.

## [0.3.14] - 2025-10-18
- Guarded OpenAI client initialisation against SDK layout changes (`client.beta.responses`) and replaced double-encoded pipeline emojis with ASCII tags.

## [0.3.12] - 2025-10-17
- Fixed TypeScript build failures from the Responses migration, added missing `llm_model` field to `PlanResponse`, and re-exported streaming analysis types.

## [0.3.11] - 2025-10-27
- Released `/api/stream/analyze` SSE endpoint, reusable React hooks for reasoning streams, and persisted summaries for monitoring.

## [0.3.10] - 2025-10-17
- Normalised pipeline stage payloads, added relaunch helpers, and bundled artefacts with an inline ZIP builder for recovery workflows.

## [0.3.7] - 2025-10-18
- Implemented the Responses API migration (Phase 1): schema registry, telemetry persistence, and reasoning streaming across backend, Luigi, and monitoring UI.

## [0.3.6] - 2025-10-15
- Corrected `tsconfig.json` JSX type discovery by removing restrictive `types` arrays; documented the fix after the previous release inaccurately reported it.

## [0.3.5] - 2025-10-15 *(superseded by 0.3.6)*
- Documented but did not complete TypeScript fixes; see 0.3.6 for the actual resolution.

## [0.3.4] - 2025-10-15
- Set writable run directories for Railway containers, relaxed dual-provider API key requirements, and aligned PlanForm fallback models with backend configuration.

## [0.3.3] - 2025-10-03
- Added `/api/plans/{plan_id}/artefacts`, enabling database-driven artefact metadata surfaced in the recovery workspace and FileManager.

## [0.3.2] - 2025-10-03
- Introduced `/api/plans/{plan_id}/fallback-report`, assembling HTML directly from `plan_content` when ReportTask fails.

## [0.3.1] - 2025-10-02
- Added serialization helpers (`to_clean_json()`, `to_dict()`) across scenario and assumption tasks, restoring Option-3 persistence flows.
- Implemented structured LLM fallback retries in `simple_openai_llm.py` and reinstated missing `import time` statements for duration logging.

## [0.3.0] - 2025-10-01
- Completed the database-first Luigi refactor: every task writes primary outputs to `plan_content` before filesystem writes, enabling resumability and API-first artefact delivery.

## [0.2.5] - 2025-09-30
- Documented Luigi agentisation plans and generated task-specific agents for future automation (no runtime code changes).

## [0.2.4] - 2025-09-29
- Fixed pipeline bootstrap: corrected module path (`planexe.plan.run_plan_pipeline`) and normalised `SPEED_VS_DETAIL` mappings passed to Luigi.

## [0.2.3] - 2025-09-28
- Consolidated Railway deployment into a single service; FastAPI now serves both API and static frontend exports.

## [0.2.2] - 2025-09-27
- Hardened Railway model loading with richer diagnostics, error handling, and fallback options in the PlanForm flow.

## [0.2.1] - 2025-09-27
- Documented the shift to Railway-first debugging workflows with UI-based instrumentation (no direct code changes).

## [0.2.0] - 2025-09-27
- Replaced SSE progress streaming with a thread-safe WebSocket architecture, including connection management, heartbeats, and Luigi subprocess broadcasting.

## [0.1.12] - 2025-09-26
- Converted frontend API calls to relative URLs, enabling Railway deployments to target the FastAPI backend without hardcoding hosts.

## [0.1.10] - 2025-01-27
- Added Dockerfiles, Railway configuration, and deployment scripts to run the FastAPI backend and Next.js frontend in containers with PostgreSQL.

## [0.1.8] - 2025-09-23
- Refactored retry logic to create fresh plans and added `/api/plans/{plan_id}/stream-status` so the frontend waits for logs before attaching.

## [0.1.7] - 2025-09-23
- Replaced derived progress parsing with raw Luigi stdout streaming, giving users direct visibility into pipeline execution via SSE.

## [0.1.5] - 2025-09-22
- Replaced the legacy llama-index LLM layer with the SimpleOpenAILLM wrapper, supporting four tested models and simplifying the factory.

## [0.1.4] - 2025-09-22
- Fixed PlanForm TypeScript warnings and improved backend logging for Luigi stderr capture.

## [0.1.3] - 2025-09-21
- Simplified frontend state management, fixed CORS/configuration issues, and stabilised SSE connections for real-time monitoring.

## [0.1.2] - 2025-09-20
- Restored FastAPI endpoints, aligned prompt schemas, and added scripts for spinning up both servers during development.

## [0.1.1] - 2025-09-20
- Established direct FastAPI client usage in the frontend, resolved import issues, and documented the two-terminal workflow.

## [0.1.0] - 2025-09-19
- Initial release: FastAPI REST API, PostgreSQL schema, SSE progress streaming, Node.js client SDK, and Dockerised deployment stack.
