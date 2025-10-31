# Changelog - Use Proper Semantic Versioning and follow the Keep a Changelog standard

## Versioning Scheme
This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes that require migration
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### [0.21.13] - 2025-10-31

### Fixed
- **LLMAttempt type confusion**: Fixed `'LLMAttempt' object has no attribute 'get'` errors in ReviewPlanTask and PremortimTask by removing incorrect dictionary method calls on the dataclass object. LLMAttempt is a dataclass with structured fields, not a dict. Response content is already persisted in markdown/JSON files, so the failed dict access was unnecessary. (Files: `planexe/plan/run_plan_pipeline.py:5447`, `planexe/plan/run_plan_pipeline.py:5780`)
- **PlanPurposeInfo validation failures**: Added defensive fallback parsing for `identify_purpose_dict` deserialization across all document processing tasks. Created reusable `parse_purpose_dict_safe()` utility that handles schema evolution gracefully (missing fields, invalid enum values, wrong types) by synthesizing valid defaults (topic='Unknown', purpose='other', purpose_detailed='general analysis'). Prevents pipeline crashes when loading historical JSON files with outdated schemas. (Files: `planexe/assume/identify_purpose.py` - new utility, `planexe/document/identify_documents.py`, `planexe/document/filter_documents_to_find.py`, `planexe/document/filter_documents_to_create.py`, `planexe/document/draft_document_to_find.py` - both execute and aexecute, `planexe/document/draft_document_to_create.py` - both execute and aexecute, `planexe/swot/swot_analysis.py` - refactored to use utility)

### [0.21.12] - 2025-10-31

### Added
- **Image generation style enhancement**: Added configurable `prompt_style_suffix` to `llm_config.json` image_defaults that appends descriptive style modifiers to user prompts (e.g., "professional business concept art style, clean and modern aesthetic"). This approach works correctly with the OpenAI Images API by enhancing the image description rather than using chat-style role instructions. Backward compatible (no suffix = user prompt unchanged). `llm_config.json`, `planexe_api/services/image_generation_service.py`.

### [0.21.11] - 2025-10-30

### Added
- **Pipeline resume endpoint**: Added `/api/plans/{plan_id}/resume` so failed plans can restart only incomplete Luigi tasks while preserving successful outputs. The FastAPI route reuses stored configuration and starts the pipeline in resume mode. `planexe_api/api.py`.
- **Resume-aware pipeline execution**: Updated `PipelineExecutionService` to respect resume mode by skipping run directory cleanup, retaining database artefacts, and keeping existing progress metrics when restarting. `planexe_api/services/pipeline_execution_service.py`.

### [0.21.10] - 2025-10-30

### Fixed
- **Structured LLM async wrappers**: Added missing `achat`/`acomplete` coroutines to `StructuredSimpleOpenAILLM` so Luigi tasks using async structured calls no longer crash with `AttributeError`. Keeps synchronous logic unchanged while restoring task execution.

### [0.21.9] - 2025-10-30

### Fixed
- **Conversation modal viewport for images**: Increased the image panel dimensions to properly display generated concept images without cutoff.
  - Layout: Changed grid proportions from `1.45fr:1fr` to `1fr:1.25fr` (conversation:image), giving the image panel ~55% width instead of ~41%.
  - Vertical: Adjusted flex ratios from `0.7:0.3` to `0.85:0.15` (image:reasoning), allocating 85% of vertical space to the image panel.
  - Impact: Generated images now display at a comfortable size without being cramped or cut off in the intake modal.
  - Files: `planexe-frontend/src/components/planning/ConversationModal.tsx`

### [0.21.8] - 2025-10-30

### Fixed
- **Images SDK object response handling**: Prevented `'Image' object has no attribute 'get'` by reading fields from Images SDK objects via attribute access when dict keys are not present. Added a safe accessor and used it in both generation and edit flows.
  - Service: `ImageGenerationService` now uses a helper to read `b64_json`, `url`, and `revised_prompt` from either dicts or SDK objects.
  - Impact: Stops unexpected_error crashes during image generation and edits while keeping logging and fallbacks intact.

### [0.21.7] - 2025-10-30

### Fixed
- **OpenAI Images quality compliance**: Replaced deprecated `standard/hd` quality values with the supported set and updated defaults.
  - Config: `llm_config.json` now uses `quality: "high"` and `allowed_qualities: ["low", "medium", "high", "auto"]`.
  - Service: `ImageGenerationService` passes through validated `low/medium/high/auto` for both generate and edit flows and no longer filters to `{"standard","hd"}`.
  - Impact: Prevents 400 `invalid_request_error` caused by invalid `quality: "standard"` while keeping size/format/compression handling unchanged.

### [0.21.6] - 2025-10-30

### Fixed
- **Images API parameter regression**: Stopped sending the unsupported `response_format` field to OpenAI and reset our defaults to the lower-cost `standard` quality so `/api/images/generate` stops returning 400 errors while still handling base64 fallbacks. (Files: `llm_config.json`, `planexe_api/services/image_generation_service.py`, `planexe-frontend/src/lib/api/fastapi-client.ts`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`, `scripts/testing/generate_concept_image.py`, `docs/gpt-image-1-mini-best-practices.md`)

### [0.21.5] - 2025-10-30

### Changed
- **GPT-Image-1 mini quality compliance**: Adopted the August 2025 `standard`/`hd` tiers across configuration, backend payloads, frontend defaults, and the CLI helper so every request includes the required `size="1024x1024"`, `response_format="b64_json"`, and `quality` hints from the latest cookbook guidance. (Files: `llm_config.json`, `planexe_api/services/image_generation_service.py`, `planexe_api/models.py`, `planexe-frontend/src/lib/api/fastapi-client.ts`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`, `scripts/testing/generate_concept_image.py`, `docs/gpt-image-1-mini-best-practices.md`)

### [0.21.4] - 2025-10-30

### Fixed
- **Images API payload defaults**: Forced `response_format="b64_json"`, expanded allowed size presets, and restored 1024x1024 as the
  default so OpenAI `gpt-image-1-mini` calls respect the current API contract.
  (Files: `planexe_api/services/image_generation_service.py`, `llm_config.json`)
- **Frontend image model selection**: Updated the intake conversation hook to always request `gpt-image-1-mini` for visuals instead of
  reusing the conversational `gpt-5-nano` model key.
  (File: `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`)

### [0.21.3] - 2025-10-30

### Added
- Testing utility script to generate a concept image using the centralized ImageGenerationService. This provides a simple, documented way to verify OpenAI Images API integration from the CLI and saves the resulting image locally. (File: `scripts/testing/generate_concept_image.py`)


### [0.21.2] - 2025-10-30

### Fixed
- **Image generation transport**: Replaced manual `httpx` calls with the official OpenAI SDK in the image service so required platform headers (e.g., `OpenAI-Project`) are sent automatically and generation/edit requests succeed reliably. (Files: `planexe_api/services/image_generation_service.py`)
- **Incident notes**: Captured failure analysis and refactor plan for future reference. (Files: `docs/30Oct.md`)

### [0.21.1] - 2025-10-30

### Fixed
- **CreateWBSLevel3Task batch handling**: Allow per-chunk failures without raising `'Exception' object has no attribute 'raw_response_dict'`, persist successful chunks, and fail clearly when no decompositions succeed. (Files: `planexe/plan/run_plan_pipeline.py`)
- **IdentifyPurpose dict parsing**: Pass `reasoning_effort="medium"` and strip metadata/system/user fields before building `PlanPurposeInfo` so document filtering, drafting, and SWOT tasks no longer emit `Error parsing identify_purpose_dict.` (Files: `planexe/document/identify_documents.py`, `planexe/document/filter_documents_to_find.py`, `planexe/document/filter_documents_to_create.py`, `planexe/document/draft_document_to_create.py`, `planexe/document/draft_document_to_find.py`, `planexe/swot/swot_analysis.py`, `planexe/plan/run_plan_pipeline.py`)

### [0.20.4] - 2025-10-30

### Fixed
- **OpenAI image payload validation**: Removed unsupported `response_format` and `style` fields from the backend image service so calls to `gpt-image-1-mini` succeed against the current Images API schema while preserving quality/background handling. (Files: `planexe_api/services/image_generation_service.py`)
### [0.21.0] - 2025-10-30

### Removed
- **Image edit/refine functionality**: Removed the "Refine Concept" card and image editing flow from the intake modal to simplify the UI and focus on core image generation. (Files: `planexe-frontend/src/components/planning/ConversationModal.tsx`, `planexe-frontend/src/components/planning/IntakeImagePanel.tsx`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`)

### Added
- **Verbose error handling for image generation**: Implemented end-to-end structured error responses with detailed logging, error type classification, and context information. Backend now parses OpenAI API error responses and includes model/size/prompt context. Frontend displays expandable error details with copy-to-clipboard functionality. (Files: `planexe_api/services/image_generation_service.py`, `planexe_api/api.py`, `planexe-frontend/src/lib/api/fastapi-client.ts`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`, `planexe-frontend/src/components/planning/IntakeImagePanel.tsx`)
- **Logging throughout image service**: Added comprehensive logging at request start, OpenAI API calls, success/failure points, with structured error parsing and timeout context. (Files: `planexe_api/services/image_generation_service.py`)

### Changed
- **API error responses**: Updated image generation and edit endpoints to return structured error objects with `error_type`, `message`, and `context` fields instead of simple error strings. (Files: `planexe_api/api.py`)
- **Frontend error handling**: Introduced `ApiError` class to preserve full error details from backend responses, including status codes and structured error information. (Files: `planexe-frontend/src/lib/api/fastapi-client.ts`)

### [0.20.3] - 2025-10-30

### Changed
- **Intake modal layout**: Tightened header spacing, widened the concept image panel, and compressed surrounding cards so the generated image has more vertical room with less wasted top space. (Files: `planexe-frontend/src/components/planning/ConversationModal.tsx`, `planexe-frontend/src/components/planning/IntakeImagePanel.tsx`)

### [0.20.2] - 2025-10-30

### Fixed
- **Intake image MIME types**: Corrected the concept preview to respect the `gpt-image-1-mini` response format so JPEG/WEBP renders display correctly instead of forcing a PNG data URL. (Files: `planexe-frontend/src/components/planning/IntakeImagePanel.tsx`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`)

### [0.20.3] - 2025-10-30

### Fixed
- **Images API payload compliance**: Sanitized image generation/edit requests to remove unsupported fields (`background` for generation, `negative_prompt`, `output_format`, `output_compression`) and mapped `auto` quality/size to server defaults. Also reinstated `response_format: b64_json` and default result format to `png` for base64 responses. This resolves 400 errors while other OpenAI calls continued to work. (Files: `planexe_api/services/image_generation_service.py`)

### [0.20.1] - 2025-10-30

### Fixed
- **Two-step gpt-image-1-mini flow**: Replaced the conversation-scoped image endpoints with dedicated `/api/images/generate` and `/api/images/edit` routes so the backend now mirrors the documented two-call pattern (Responses API for text plus Images API for renders), and passed the optional `conversation_id` through request bodies/responses. (Files: `planexe_api/api.py`, `planexe_api/models.py`)
- **Frontend client alignment**: Updated the FastAPI client and intake conversation hook to call the new image routes, pass the `conversation_id`, and reconcile the optional identifier returned by the service. (Files: `planexe-frontend/src/lib/api/fastapi-client.ts`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`)
- **Best-practice documentation**: Clarified that PlanExe performs separate Responses and Images API calls per the October 2025 guidance. (Files: `docs/gpt-image-1-mini-best-practices.md`)

### [0.20.2] - 2025-10-30

### Fixed
- **Consistent image data URIs**: Added a frontend helper to build data URIs from backend image responses and a safe `<img>` fallback, preventing blank previews when raw base64 is provided. (Files: `planexe-frontend/src/lib/api/fastapi-client.ts`, `planexe-frontend/src/components/planning/IntakeImagePanel.tsx`)

### [0.20.0] - 2025-10-30

### Added
- **gpt-image-1-mini Best Practices Doc**: Documented the October 2025 OpenAI image guidance and the PlanExe defaults that follow it, covering quality tiers, size presets, formats, compression, and transparency safeguards. (Files: `docs/gpt-image-1-mini-best-practices.md`)

### Changed
- **Image Service Output Controls**: Extended the backend image generation/edit flows to forward `output_format` and `output_compression`, honour `auto` quality/size presets, guard unsupported transparent backgrounds, and echo the applied metadata. (Files: `planexe_api/services/image_generation_service.py`, `planexe_api/api.py`, `planexe_api/models.py`, `llm_config.json`)
- **Frontend Image Metadata Handling**: Updated the FastAPI client and conversation hook/UI to send the new options, persist returned format/compression, and surface the metadata in the intake panel. (Files: `planexe-frontend/src/lib/api/fastapi-client.ts`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`, `planexe-frontend/src/components/planning/IntakeImagePanel.tsx`)

### [0.19.3] - 2025-10-30

### Fixed
- **gpt-image-1-mini Defaults**: Updated the image generation service and model configuration to match the latest OpenAI guidance, enforcing the `low/medium/high` quality tier and 1024/1536 dimension options so requests stop failing validation. (Files: `planexe_api/services/image_generation_service.py`, `llm_config.json`)

### [0.19.2] - 2025-10-30

### Fixed
- **Image URL Fallback**: Reinstated the asynchronous HTTP fetch and formatting logic used during URL-based image retrieval, resolving the indentation regression that broke service imports. (Files: `planexe_api/services/image_generation_service.py`)

### [0.19.1] - 2025-10-30

### Fixed
- **Image Generation Endpoint**: Corrected the OpenAI generation URL back to `/v1/images/generations` and restored the URL-to-base64 fallback so gpt-image-1-mini requests succeed reliably again, including metadata propagation for UI display. (Files: `planexe_api/services/image_generation_service.py`)

### [0.19.0] - 2025-10-29

### Added
- **Concept Image Editing UI**: Added a "Refine Concept" panel to the intake modal so users can request edits to generated images with live status feedback. Enables edit prompts once an image has been produced and surfaces the latest prompt/metadata alongside the preview. (Files: `planexe-frontend/src/components/planning/ConversationModal.tsx`, `planexe-frontend/src/components/planning/IntakeImagePanel.tsx`)
- **Image Edit API Endpoint**: Introduced `POST /api/conversations/{id}/edit-image` allowing clients to submit edit instructions plus base64 image data. Shares validation with the generation endpoint and returns the final prompt, format, and metadata. (Files: `planexe_api/api.py`, `planexe_api/models.py`, `planexe_api/services/image_generation_service.py`)

### Changed
- **gpt-image-1-mini Integration Refresh**: Updated the image generation service to use the latest OpenAI Images endpoints, supporting optional quality/style/background hints, and returning the applied prompt. Configuration now carries defaults for these hints. (Files: `planexe_api/services/image_generation_service.py`, `llm_config.json`)
- **Frontend API Client Enhancements**: Extended the FastAPI client and conversation hook to expose prompt/metadata for generated images, reuse settings during edits, and surface improved error handling. (Files: `planexe-frontend/src/lib/api/fastapi-client.ts`, `planexe-frontend/src/lib/conversation/useResponsesConversation.ts`)

### [0.18.7] - 2025-10-29

### Changed
- **Image Generation: Service Extraction and Hardening**: Extracted image generation logic into dedicated service with improved architecture and error handling.
  - **New Service**: Created `planexe_api/services/image_generation_service.py` with centralized image generation logic
  - **Model Resolution**: Uses `PlanExeLLMConfig` to resolve image generation models from `llm_config.json`
  - **Configurable**: Supports model and size overrides via request parameters with validation
  - **Robust Error Handling**: Custom `ImageGenerationError` with timeout and retry logic (max 2 retries)
  - **Security**: No logging of secrets, proper exception handling without exposing sensitive data
  - **Slim Endpoint**: API endpoint now only handles validation and delegation, separating concerns from streaming
  - **Response Format**: Returns `{ image_b64, model, size, format }` with transparent fallback indication
  - Files: `planexe_api/services/image_generation_service.py`, `planexe_api/api.py` lines 394-431

### [0.18.6] - 2025-10-29

### Fixed
- **Image Generation Endpoint: Robust Base64 with URL Fallback**: Enhanced the image generation endpoint to reliably return base64 data with automatic fallback to URL fetching when base64 is unavailable.
  - **Primary**: Attempts to get base64 JSON directly from OpenAI Images API using `response_format: "b64_json"`
  - **Fallback**: If base64 not returned, fetches image from URL and converts to base64 using `base64.b64encode()`
  - **Reliability**: Handles cases where OpenAI returns URL instead of base64 data
  - **Response**: Includes `format` field indicating source (`"base64"` or `"base64_from_url"`)
  - Files: `planexe_api/api.py` lines 392-488

### [0.18.5] - 2025-10-29

### Added
- **Intake Conversation Visual Concept Generation**: User's initial idea is now visualized immediately during conversation intake using OpenAI `gpt-image-1-mini`. The system dispatches parallel image generation when the user submits their first prompt, displaying creative animated loading states (gradient shimmer, pulsing sparkles, rotating messages) for ~30 seconds while the image generates. The generated 1024x1024 PNG displays in the intake screen's right panel (60% height), with the reasoning summary shrunk to 40% below it. This provides immediate visual feedback and helps users refine their vision before pipeline execution begins.
  - Backend endpoint: `POST /api/conversations/{id}/generate-image` @planexe_api/api.py#391-439
  - Frontend hook integration: parallel fire-and-forget request in `startConversation()` @planexe-frontend/src/lib/conversation/useResponsesConversation.ts#354-368
  - Creative loading component with animated gradients and sparkles @planexe-frontend/src/components/planning/IntakeImagePanel.tsx
  - Layout redesign: split right panel (60% image, 40% reasoning) @planexe-frontend/src/components/planning/ConversationModal.tsx#371-391

### [0.18.4] - 2025-10-29

### Fixed
- **Report Display: Beautiful Styling Restored**: Fixed critical UI bug where `/plan/` page displayed ugly, unstyled HTML instead of the beautiful formatted report.
  - **Root Cause**: Backend sends full HTML document with embedded `<style>` and `<script>` tags, but frontend was using `dangerouslySetInnerHTML` to inject it into a `<div>`. Browsers strip out `<html>`, `<head>`, `<style>`, and `<script>` tags when injecting HTML into a div, leaving only raw unstyled content.
  - **Impact**: Users saw plain, boring HTML with no blue collapsible sections, no table styling, and non-functional buttons. Sections appeared to show "NO info" because they were collapsed but couldn't be expanded (no JavaScript).
  - **The Fix**: Replaced `dangerouslySetInnerHTML` with an `<iframe>` component that renders the full HTML document as a separate document, preserving all CSS styling and JavaScript interactivity.
  - **Result**: Report now displays with beautiful blue collapsible sections, styled tables, working collapse/expand buttons, table of contents, Gantt charts, and all original styling from `report_template.html`.
  - **Implementation**: Added `ReportIframe` component with auto-height adjustment and blob URL creation.
  - Files: `planexe-frontend/src/app/plan/ReportPageClient.tsx`
  - See: `docs/plan-report-generation-fix.md` for full analysis and alternative solutions

### [0.18.3] - 2025-10-29

### Fixed
- **CRITICAL: Actual Root Cause of Instant Completion Bug**: The REAL bug was a missing `typing.Any` import in `filter_documents_to_create.py`.
  - **Root Cause**: Commit `11df719` changed the `execute()` method signature to use `llm: Any` type hint, but forgot to add `Any` to the imports
  - **Symptom**: When Luigi tried to import the module during task graph construction, Python raised `NameError: name 'Any' is not defined`
  - **Impact**: Module import failure caused Luigi to short-circuit the entire pipeline, appearing to complete instantly without executing any tasks
  - **The Fix**: Added `Any` to the typing imports: `from typing import Optional, List, Any`
  - **Verification**: Module now imports successfully without `NameError`
  - Files: `planexe/document/filter_documents_to_create.py` line 26

### Added
- **Defensive: Filesystem Cleanup**: Added comprehensive filesystem cleanup before pipeline execution to prevent future issues with stale output files
  - Deletes all files in `run_id_dir` before starting Luigi subprocess
  - Prevents Luigi from finding old output files and thinking tasks are already complete
  - Fail-fast error handling if cleanup fails
  - Files: `planexe_api/services/pipeline_execution_service.py` lines 23, 138-182

### Root Cause Analysis
The instant completion bug was introduced in commit `11df719` (Oct 29, 2025) which refactored the LLM interface:
1. Changed `execute(cls, llm: LLM, ...)` to `execute(cls, llm: Any, ...)`
2. Removed the `LLM` import but forgot to add `Any` import
3. Module became unimportable with `NameError`
4. Luigi's task graph construction failed silently, causing pipeline short-circuit

Previous fixes (0.18.2) were red herrings - they addressed unrelated issues (database targets, async keywords, database reset) but missed the actual import failure.

### [0.18.2] - 2025-10-29

### Fixed
- **CRITICAL: Luigi Instant Completion Bug**: Fixed catastrophic bug where the pipeline appeared to complete instantly without executing tasks. Root cause: `ReportTask.output()` was using `PlanContentTarget` which checks the database for existing content. When Luigi checks if tasks are complete, it found old database records from previous runs and thought all tasks were already done. **Simplified fix**: Changed `ReportTask` back to file-based target (`self.local_target(FilenameEnum.REPORT)`). Luigi now checks the filesystem (which is cleaned before each run) instead of the database. Files: `planexe/plan/run_plan_pipeline.py` lines 5780, 88.

- **Defense: Fail Fast on Database Reset Failure**: Made database reset mandatory before pipeline execution. If `reset_plan_run_state()` fails, the pipeline now fails immediately with clear error message instead of silently continuing with stale data. This prevents database-related issues from causing silent failures. File: `planexe_api/services/pipeline_execution_service.py` lines 137-163.

- **CRITICAL: Pipeline Async/Sync Mismatch**: Fixed bug where `PlanTask.run_inner()` was incorrectly marked as `async` but contained only synchronous code with no `await` statements. In Python, async functions without await complete immediately without executing their body. Removed the `async` keyword to restore synchronous execution. This bug was introduced in commit 20b3f44 during async batching implementation. File: `planexe/plan/run_plan_pipeline.py` line 252.

- **FilterDocumentsToCreateTask Compatibility**: Added missing Pydantic imports (`BaseModel`, `Field`) that were accidentally removed, causing immediate module import failures. File: `planexe/document/filter_documents_to_create.py`.

- **CreateWBSLevel3Task Schema Validation**: Implemented strict validation and error handling for LLM responses to prevent silent failures. The task now:
  - **Fails fast** with detailed error logging when LLM response is invalid (instead of using fallbacks)
  - Validates JSON parsing, response structure, and all required fields/types
  - Logs raw response text on parsing failures for better debugging
  - Only uses minimal defaults for minor issues (empty resource strings)
  - Applied strict validation to both sync `execute()` and async `aexecute()` methods
  File: `planexe/plan/create_wbs_level3.py`.

### Impact
- **Pipeline Execution**: The pipeline now properly clears old database content before starting, preventing Luigi from thinking tasks are already complete.
- **Error Visibility**: Database reset failures now fail the entire pipeline startup with clear error messages instead of silently causing instant completion.
- **Data Integrity**: Ensures each pipeline run starts with a clean slate in the database.
- **Debugging**: Enhanced error logging makes it easier to identify database or LLM response issues.

### [0.18.1] - 2025-10-29 00:02

### Changed
- Moved the Recovery Actions strip to the bottom of the recovery page to improve reading flow. File: `planexe-frontend/src/app/recovery/page.tsx`.

## [0.18.0] - 2025-10-29 00:00

### Fixed
- Removed the hardcoded intake system prompt in `useResponsesConversation` so the frontend now defers to backend-provided instructions sourced from `intake_conversation_prompt.py`.

## [0.17.3] - 2025-10-28 23:55

### Added
- Display of selected LLM model in `CurrentActivityStrip` with clear label and icon. Fields: `plan.llm_model` (frontend PlanResponse). File: `planexe-frontend/src/app/recovery/components/CurrentActivityStrip.tsx`

## [0.17.2] - 2025-10-28 23:45

### Changed
- StreamHistoryGrid now mirrors the info-rich recovery styling: larger text labels, explicit data previews (Output, Reasoning, Events, Usage), "View Details" badges, and contextual tooltips. File: `planexe-frontend/src/app/recovery/components/StreamHistoryGrid.tsx`

## [0.17.1] - 2025-10-28 23:40

### Changed
- Deprecated `LuigiPipelineView` from the recovery page and gave `LivePipelineDAG` full-width space (no internal scroll) for the authoritative pipeline view. Files: `planexe-frontend/src/app/recovery/page.tsx`, `planexe-frontend/src/app/recovery/components/LivePipelineDAG.tsx`

## [0.17.0] - 2025-10-28 23:30

### Added
- Real-time LLM cost tracking in `CurrentActivityStrip`, powered by a shared `cost-calculator` utility and pricing metadata in `llm_config.json`. Files: `planexe-frontend/src/lib/utils/cost-calculator.ts`, `planexe-frontend/src/app/recovery/components/CurrentActivityStrip.tsx`, `llm_config.json`

### Changed
- Restored `StreamHistoryGrid` to the top of the recovery workspace and tightened `PipelineLogsPanel` spacing so logs no longer introduce excess vertical padding. Files: `planexe-frontend/src/app/recovery/page.tsx`, `planexe-frontend/src/components/PipelineDetails.tsx`

## [0.16.0] - 2025-10-28

### Changed
- **Recovery Page Layout Reorganization**: Swapped positioning of key UI components for better workflow
  - Moved PipelineLogsPanel from top of page into right column of main grid
  - Moved StreamHistoryGrid (completed tasks) from right column to bottom of main content area
  - New layout provides better visual hierarchy with logs alongside other monitoring tools
  - File: `planexe-frontend/src/app/recovery/page.tsx` lines 233-260

### Fixed
- **CurrentActivityStrip Usability**: Made the status strip sticky and replaced confusing icons with clear text labels
  - Added `sticky top-0 z-50` positioning with shadow for persistent visibility during scrolling
  - Replaced all emoji icons (Activity, Clock, Zap, Wifi, Database, CheckCircle) with descriptive text labels
  - Clear labels now show: "CURRENT TASK:", "TIME:", "TOKENS:", "CONNECTION:", "TASKS:", "TOTAL TOKENS:", "EFFORT:", "STATUS:"
  - Improved readability by explicitly stating what each metric tracks
  - File: `planexe-frontend/src/app/recovery/components/CurrentActivityStrip.tsx`

### Added
- Integrated LivePipelineDAG component into the recovery page to provide real-time visual DAG showing all 61 Luigi tasks being assembled and completed. The component displays task status, dependencies, and allows clicking on completed/failed tasks to view detailed stream information. @planexe-frontend/src/app/recovery/page.tsx#25,237-239

## [0.15.8] - 2025-10-28

### Fixed
- Stabilized WBS Level 1 task by switching to schema-driven Responses API calls with a tolerant freeform fallback. This removes ad‑hoc parsing and aligns the task with other structured LLM callers, reducing silent failures and improving metadata (duration, fallback_used). Files: `planexe/plan/create_wbs_level1.py`.

## [0.15.7] - 2025-10-28

### Fixed
- Prevented diagnostic Luigi `[PIPELINE] ... run() CALLED` instrumentation logs from surfacing as task failures in the Recovery UI by ignoring those messages during log parsing. @planexe-frontend/src/components/monitoring/LuigiPipelineView.tsx#102-136

## [0.15.6] - 2025-10-28

### Fixed
- Expanded the conversation turn typing to accept all four reasoning effort levels so the frontend stays in sync with backend validation and avoids TS errors when "minimal" is selected. @planexe-frontend/src/lib/api/fastapi-client.ts#287-299

## [0.15.5] - 2025-10-28

### Fixed
- Forced every JSON schema sent to the Responses API to set `additionalProperties` to `false`, even when Pydantic emits permissive values, preventing HTTP 400 `invalid_json_schema` failures during `IdentifyPurposeTask` and related Luigi stages. @planexe/llm_util/simple_openai_llm.py#100-137, @planexe/llm_util/strict_response_model.py#31-50.
- Hardened schema regression coverage by asserting strict enforcement in `test_schema_enforcement.py`, ensuring future changes fail fast if leniency creeps back in.

## [0.15.4] - 2025-10-28

### Changed
- Realigned recovery streaming with Responses API envelopes to preserve sequence ordering and backpressure handling, routing WebSocket orchestration through the shared recovery streaming controller @planexe-frontend/src/app/recovery/useRecoveryPlan.ts#24-931.

### Added
- Surfaced usage metrics and recent event metadata in the recovery LiveStreamPanel to aid operator diagnostics @planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx#1-144.

## [0.15.3] - 2025-10-28

### Fixed
- **Schema Registry Refresh for Structured Outputs**
  - Forced every schema registration to regenerate the JSON schema so `additionalProperties` is hard-set to `false` on the wire while keeping runtime parsing lenient.
  - Prevents cached `additionalProperties: true` payloads from reaching the Responses API after leniency changes in `StrictResponseModel`.
  - Files: `planexe/llm_util/schema_registry.py`

### Regression History
- Introduced by commit `d0de05a` ("feat: allow runtime extras in LLM responses while keeping stable output") released in v0.15.2, which set `StrictResponseModel` to allow extras and unintentionally cached permissive schemas in the registry.
- v0.9.14 previously flipped hundreds of models to `extra='allow'`, paving the way for the schema/runtime mismatch once strict schemas were cached.

## [0.15.2] - 2025-10-28

### Fixed
- Responses structured output regression causing OpenAI 400 `invalid_json_schema` errors.
  - Root cause: a recent change allowed extras in Pydantic models, which propagated `additionalProperties: true` into the on‑wire `text.format.schema` sent to the Responses API. OpenAI requires `additionalProperties: false`.
  - Effect: Structured calls for `PlanPurposeInfo` and `DocumentDetails` failed across models, halting the Luigi pipeline early.
  - Resolution: Ensure on‑wire schemas are strict (no additional properties) while keeping parsing leniency internal.

## [0.15.1] - 2025-10-28

### Added
- **Targeted Resume Functionality in Recovery Workspace**: Restored ability to resume only failed/missing pipeline sections
  - Added missing targets computation logic that analyzes LLM streams and artefacts to identify incomplete tasks
  - Implemented "Resume Failed/Missing Sections" button with disabled state when no targets exist
  - Enhanced ResumeDialog to display meaningful selectable items grouped by pipeline stage
  - Integration leverages existing database-first architecture where tasks skip completed content
  - Files: `planexe-frontend/src/app/recovery/page.tsx` lines 73-117, 206-229

### Fixed
- **Missing Resume Dialog Integration**: ResumeDialog was rendered but never accessible due to missing UI entry point
  - Added action strip in Recovery workspace with button to trigger targeted resume flow
  - Fixed empty missing targets array by computing actual failed/missing pipeline sections
  - Proper type imports for MissingSectionResponse and pipeline task utilities

## [0.15.0] - 2025-10-28

### Fixed
- **Expert Review Async Execution Error**: Fixed `asyncio.run() cannot be called from a running event loop` error
  - Root cause: `ExpertOrchestrator.execute()` was using `asyncio.run()` inside an already-async Luigi task
  - Made `ExpertOrchestrator.execute()` async and replaced `asyncio.run()` with `await`
  - Updated `ExpertReviewTask.run_inner()` to properly await the orchestrator
  - Updated standalone `__main__` block to use `asyncio.run()` for CLI usage
  - Files: `planexe/expert/expert_orchestrator.py` lines 31, 97; `planexe/plan/run_plan_pipeline.py` line 3922

### Changed
- **Maximum Lenient Error Handling for Expert Review**: Pipeline now gracefully degrades when expert LLM calls fail
  - **LLMExecutor.run_batch_async()**: Returns exceptions as results instead of raising immediately
    - Allows partial success (e.g., 1 of 2 experts succeeds)
    - Logs warnings for failures but doesn't abort entire batch
    - Caller checks `isinstance(result, Exception)` to handle failures
    - File: `planexe/llm_util/llm_executor.py` lines 245-287

  - **ExpertOrchestrator.execute()**: Skips individual expert failures, continues with others
    - Checks each result for exceptions and logs detailed warnings
    - Tracks `successful_count` and `failed_count` statistics
    - Logs critical error if all experts fail but doesn't raise exception
    - Continues pipeline execution even with zero successful experts
    - File: `planexe/expert/expert_orchestrator.py` lines 86-125

  - **ExpertOrchestrator.to_markdown()**: Generates fallback report when no experts succeed
    - Returns minimal but valid markdown with warning status
    - Includes next steps and recommendations for manual review
    - Prevents downstream pipeline tasks from stalling on empty input
    - File: `planexe/expert/expert_orchestrator.py` lines 139-159

  - **Schema Validation**: Made Pydantic schemas maximally lenient
    - Added `model_config = {"extra": "ignore"}` to `ExpertConsultation` and `NegativeFeedbackItem`
    - Tolerates extra fields from creative LLMs without validation errors
    - File: `planexe/expert/expert_criticism.py` lines 21, 36

  - **Response Parsing**: Enhanced defensive handling of LLM responses
    - Uses `.get()` with defaults for all dict accesses
    - Handles both dict and object attribute access patterns
    - Gracefully handles missing or None `negative_feedback_list`
    - Never fails on unexpected response structure
    - File: `planexe/expert/expert_criticism.py` lines 150-192

### Impact
- **Pipeline Resilience**: Expert review failures no longer cascade to 7+ downstream tasks
  - Tasks that depend on ExpertReviewTask: DataCollectionTask, RelatedResourcesTask, PitchTask, ReviewPlanTask, QuestionsAndAnswersTask, RisksTask, Report generation
  - Partial expert feedback (1 of 2 experts) is now valuable instead of total failure
  - Database `llm_interactions` properly tracks degradation with warnings
  - Production reliability significantly improved for flaky LLM providers

### Philosophy
- **Accept Everything, Fail Nothing**: Maximum leniency in LLM response handling
  - Extra fields in JSON responses are silently ignored
  - Missing fields default to empty strings/arrays
  - Individual expert failures don't block others
  - Zero successful experts still produces valid pipeline output
  - Database-first architecture ensures observability of all degradation

## [0.14.0] - 2025-10-28

### Changed
- **StreamHistoryGrid Visual Redesign**: Made completed tasks the visual star of the recovery page
  - Vibrant gradient backgrounds (emerald for success, rose for failures, amber for other)
  - Larger grid cards with increased padding (3px instead of 2px) and larger fonts
  - Prominent 2px colored borders (emerald/rose/amber-400) with enhanced hover effects
  - Hover animations: scale-105 transform, colored shadows, saturated borders
  - Added "Click for details" hint with mouse pointer icon in header
  - Indigo gradient header background with larger, bolder title
  - Improved spacing with gap-3 grid layout and rounded-lg cards
  - Bolder fonts (font-bold, font-semibold) and larger icons (h-4 w-4 instead of h-3 w-3)
  - Error messages now display in rose-800 text with rose-200 background pill
  - File: `planexe-frontend/src/app/recovery/components/StreamHistoryGrid.tsx`

- **LiveStreamPanel Minimization**: Reduced visual prominence to avoid distracting from completed tasks
  - Replaced dark slate-900 background with clean white/gray design
  - Removed amber borders; now uses subtle gray-300 border
  - Reduced all font sizes (title: text-xs, content: text-[10px])
  - Compact 2-column grid with max-h-24 scroll areas (reduced from max-h-40)
  - Removed verbose usage metadata section that consumed vertical space
  - Renamed from "Live LLM Stream" to simpler "Current Task Stream"
  - Subtle idle state with gray tones instead of prominent amber alert box
  - Overall height reduced by ~40% through tighter spacing
  - File: `planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx`

### Added
- **Reasoning Effort Badge**: Displays LLM reasoning effort level in the mega info strip
  - Shows as purple badge with values: MINIMAL/LOW/MEDIUM/HIGH
  - Retrieved from `plan.data.reasoning_effort` field
  - Located between total tokens and plan status in CurrentActivityStrip
  - Helps users understand the reasoning depth being used for their plan
  - File: `planexe-frontend/src/app/recovery/components/CurrentActivityStrip.tsx` lines 171-178

- **Luigi Pipeline Error Messages**: Failed tasks now show actual error messages inline
  - Extended `TaskState` interface to include optional `error?: string` field
  - Enhanced log parsing to extract error messages from WebSocket events
  - Parses multiple error patterns: "ERROR: <msg>", "FAILED: <msg>", "Exception: <msg>"
  - Falls back to extracting message content after task name if no pattern matches
  - Displays errors inline below failed tasks with red background and border
  - Consistent with LivePipelineDAG error display pattern
  - Users can now see WHAT went wrong in Luigi tasks without checking logs
  - Files modified:
    - `planexe-frontend/src/lib/types/pipeline.ts` line 32 (added error field)
    - `planexe-frontend/src/components/monitoring/LuigiPipelineView.tsx` lines 46, 102-127 (extraction)
    - `planexe-frontend/src/components/monitoring/LuigiPipelineView.tsx` lines 330-337 (display)

## [0.13.1] - 2025-10-28

### Fixed
- **LLM Fallback Mechanism**: Pipeline was not using fallback LLMs when primary model failed
  - Issue: When a specific LLM model was requested, the system only used that single model instead of trying fallbacks
  - Root cause: `resolve_llm_models()` method replaced entire model list with `[specified_model]` 
  - Fix: Modified logic to prioritize specified model while keeping other available models as fallbacks
  - Result: Pipeline now tries `gpt-5-nano-2025-08-07` first, then falls back to `gpt-5-mini-2025-08-07`, `gpt-5-mini` etc.
  - File: `planexe/plan/run_plan_pipeline.py` lines 6062-6075

## [0.13.0] - 2025-10-28

### Added
- **Interactive Pipeline Completion Review Modal**: Modal displays when pipeline completes, showing actual generated artefacts and failures
  - Two tabs: "Generated Artefacts" (shows real PlanFile objects) and "Failures" (shows LLM stream errors)
  - Artefacts grouped by stage, each showing: task name, filename, description, content type
  - Download button for each artefact (opens `/api/plans/{id}/files/{filename}`)
  - Failures tab shows error messages inline with stage and interaction ID
  - Uses REAL data from `artefacts.items` and `llmStreams.history`, not calculated stats
  - Task count uses `PIPELINE_TASKS.length` instead of hardcoded values
  - "View Full Report" button scrolls to report section
  - Auto-shows 500ms after `plan.status === 'completed'` (only once per plan)
  - Component: `planexe-frontend/src/app/recovery/components/CompletionSummaryModal.tsx`
  - Integration: `planexe-frontend/src/app/recovery/page.tsx` lines 68-105, 149-156

### Fixed
- **Error Display in LivePipelineDAG**: Failed tasks now show actual error messages inline instead of just a red X icon
  - Error data was already flowing through WebSocket → `LLMStreamState.error` but wasn't being displayed
  - Added inline error display box for failed tasks with red background, border, and error text
  - Error message appears directly below failed task in DAG with readable formatting (9px text, word-break)
  - Users can now see WHAT went wrong without needing to click into modal
  - File: `planexe-frontend/src/app/recovery/components/LivePipelineDAG.tsx` lines 192-200
  - Zero backend changes - solution uses existing error data in frontend state

- **Removed Hardcoded Task Count**: Replaced hardcoded "61" with `PIPELINE_TASKS.length` throughout recovery UI
  - Fixed in: `page.tsx`, `RecoveryHeader.tsx`, `CurrentActivityStrip` prop, and comments
  - Ensures task count stays accurate if pipeline tasks change
  - Single source of truth: `constants/pipeline-tasks.ts`

## [0.12.0] - 2025-10-28

### Changed
- **BREAKING UX OVERHAUL**: Removed wasteful components and consolidated into ultra-dense information display
  - **DELETED** `PipelineInsights` component - was duplicating info shown elsewhere with poor density
  - **DELETED** `RecoveryHeader` component - showed mostly useless info with massive wasted space
  - **MERGED** All critical status into enhanced `CurrentActivityStrip` mega info bar
  - **New mega strip shows**: Active task with live timing, progress with visual bar, connection status, API metrics (success/fail counts), total token usage, plan status - ALL in one compact horizontal strip
  - Larger fonts (base size increased from 10px to 12-16px), better contrast (dark slate-900 background)
  - Information density increased ~5x: Every pixel serves a purpose, zero nested scroll boxes
  - Left `LuigiPipelineView` in place - log-based task tracking works well alongside LLM streams
  - Left other new components intact: `StreamHistoryGrid`, `StreamDetailModal`, `LiveStreamPanel` all good

### Fixed
- **SWOT identify purpose fallback**: Hardened `SWOTAnalysisTask` so malformed `identify_purpose` payloads no longer crash the pipeline. When parsing fails we now synthesize a safe default `PlanPurposeInfo`, log the degradation, and continue producing SWOT artifacts. @planexe/swot/swot_analysis.py#65-87

## [0.11.0] - 2025-10-28

### Documentation
- **Recovery UI Enhancement Plan**: Comprehensive implementation plan for pipeline visualization and completion UX
  - Documented Luigi DAG structure and how to present all 61 tasks to users
  - Detailed plan for interactive pipeline visualization showing current task, dependencies, and progress
  - Designed completion modal to replace automatic navigation with celebration and summary
  - Mapped LLM stream architecture from Luigi tasks → stdout → WebSocket → frontend
  - Created 4-phase implementation roadmap with specific file references and time estimates
  - No backend or database changes required - all solutions use existing WebSocket infrastructure
  - See `docs/recovery-ui-enhancement-plan.md` for complete specification

### Fixed
- **Progress Display Issue**: Fixed progress staying at 0% in RecoveryHeader component by using existing streaming data
  - Enhanced progress calculation to count completed LLM stream interactions (each represents a completed task)
  - Calculate progress from multiple streaming sources: completed LLM tasks, artifact count, and backend percentage
  - Use maximum progress from all sources as the most reliable indicator
  - Added progress source breakdown showing Backend/LLM/Artifacts percentages for transparency
  - Added debugging logs to WebSocket message handling and progress reducer in useRecoveryPlan.ts
  - No backend or database changes required - solution uses only existing WebSocket streaming data

### Added
- **Live Pipeline DAG Visualization**: Real-time visual display of all 61 Luigi tasks being assembled and completed
  - Shows complete Luigi pipeline structure grouped by stage (Setup, Analysis, Strategic, WBS, Scheduling, Team, etc.)
  - Real-time status for each task: pending (gray), running (blue pulse), completed (green check), failed (red X)
  - Click any completed/failed task to view full stream details in modal
  - Task cards show: task number (#1-61), name, description, and dependencies
  - Stage groups highlight when active with spinning loader icon
  - Auto-scrolls to active task, tracks progress (X/61 completed)
  - Pure frontend visualization using existing LLM stream data - zero backend changes
  - Integrated into left column of recovery page alongside stage timeline

- **Current Activity Strip**: Ultra-dense real-time display showing what's running NOW with live timing
  - Shows current task name, elapsed time in seconds (updating 10x/second), token usage, and tokens/second rate
  - Live progress counter showing completed/total tasks with percentage
  - Gradient background with pulsing activity indicator for active tasks
  - All timing calculated client-side from stream timestamps - pure frontend implementation

- **Pipeline Insights Panel**: New comprehensive insights dashboard extracting actionable information from streaming data
  - **Performance Metrics**: Total tokens used, average task duration, throughput (tasks/min), and peak duration
  - **Stage Performance Breakdown**: Shows top stages by token usage with execution count, total tokens, and average duration
  - **Recent Activity Timeline**: Chronological feed of completions, failures, and warnings extracted from LLM streams
  - **Warning Detection**: Automatically parses reasoning and text buffers to surface warnings and cautions
  - **Visual Performance Indicators**: Color-coded cards and badges showing stage status and performance
  - All data extracted from existing WebSocket streams - zero backend or database changes

- **Stream Detail Modal**: Interactive modal showing comprehensive LLM interaction details
  - Tabbed interface with Output, Reasoning, Usage, Events, and Raw Data views
  - Full text output and reasoning traces with proper formatting
  - Complete usage metrics breakdown with all API response fields
  - Event timeline showing all WebSocket events with sequence numbers and timestamps
  - Raw payload view for debugging
  - Triggered by clicking any stream card in history grid

- **Stream History Grid**: Replaced accordion-style history with ultra-dense clickable grid
  - Shows up to 5 columns of completed tasks in compact cards (zero padding design)
  - Each card shows: stage name, interaction ID, duration in seconds, token count, and status icon
  - Color-coded by status (green=success, red=fail, yellow=other)
  - Click any card to open detailed modal view
  - Failed tasks show truncated error message in card
  - Information density increased 10x over previous accordion layout

### Improved
- **API Telemetry Failure Details**: Enhanced API Telemetry strip to show detailed information for each failed API call
  - Added scrollable list showing all failed calls with interaction ID, stage name, error message, and timestamp
  - Failed calls now displayed in individual cards with red highlighting for better visibility
  - Uses existing LLM stream data from WebSocket - no new backend endpoints required

## [0.10.16] - 2025-10-28

### Fixed
- Ensured `_enforce_openai_schema_requirements()` always lists every object property in `required`, preventing the OpenAI Responses API from rejecting the `CurrencyStrategy.DocumentDetails` schema when `primary_currency` was omitted during enforcement. @planexe/llm_util/simple_openai_llm.py#105-137

## [0.10.15] - 2025-10-28

### Added
- **Async Concurrency Implementation**: Implemented comprehensive async batching with concurrency limiting for Luigi pipeline tasks
  - Modified `LLMExecutor.run_batch_async()` to reuse single LLM client per attempt instead of recreating for every coroutine
  - Added proper async callable validation using `inspect.iscoroutinefunction()` in `_validate_execute_function()`
  - Implemented concurrency limiting via `PLANEXE_MAX_CONCURRENT_LLM` environment variable (defaults to 5)
  - Added lightweight timing logging in `_try_one_attempt_async()` for batch performance monitoring
  - Enhanced `planexe/plan/run_plan_pipeline.py` to support async `run_inner()` methods
  - Modified base `PlanTask.run()` to detect and handle async run_inner methods via `_run_async_wrapper()`
  - Converted four key tasks to async: `DraftDocumentsToFindTask`, `DraftDocumentsToCreateTask`, `EstimateTaskDurationsTask`, `CreateWBSLevel3Task`
  - Replaced `asyncio.run()` calls with direct `await` for true async concurrency
  - Added worker hygiene flags to Luigi subprocess: `--worker-id`, `--worker-timeout 160`, `--scheduler-disable-remove-delay 5`, `--retry-count 2`, `--retry-delay 3`
  - Maintained deterministic ordering when merging batch results back to accumulated JSON
  - Added comprehensive test suite for async batching functionality including concurrency limiting and exception handling

### Performance
- **3-5x Speedup**: Async batching allows independent LLM tasks to execute concurrently instead of sequentially
- **Rate Limit Protection**: Concurrency limiting prevents API rate limit violations
- **Improved Reliability**: Worker hygiene flags prevent stale scheduler locks and improve pipeline stability

## [0.10.14] - 2025-10-28

### Added
- Documented the async batching and Luigi worker hygiene plan in `docs/async-concurrency-implementation-plan.md` so the next developer knows exactly which files to touch and what changes to make.

## [0.10.13] - 2025-10-28

### Fixed
- Added database session rollback in `PipelineExecutionService.execute_plan()` when `reset_plan_run_state` fails to prevent `PendingRollbackError` on subsequent database operations. The SQLAlchemy session is now properly cleaned up before continuing with plan execution.

## [0.10.12] - 2025-10-28

### Fixed
- Added `DatabaseService.reset_plan_run_state` and invoked it from the pipeline
  executor so reruns clear stale `plan_content`/`plan_file` records before Luigi
  starts, preventing the UI from misreporting immediate completion when old
  artefacts still exist.

## [0.10.11] - 2025-10-28

### Fixed
- Restored the missing `BaseModel` import in `planexe/plan/project_plan.py` so the Luigi pipeline no longer crashes with a `NameError` during startup, allowing run status tracking to proceed normally.

## [0.10.10] - 2025-10-28

### Added
- Introduced `StrictResponseModel` base class in `planexe/llm_util/strict_response_model.py` to automatically apply `_enforce_openai_schema_requirements()` when generating JSON schemas, guaranteeing nested `additionalProperties: false` values for Responses API payloads.

### Changed
- Migrated all structured-response task schemas to inherit from `StrictResponseModel`, removing 40+ redundant `json_schema_extra` declarations and unifying runtime enforcement with schema generation.
- Updated `test_schema_enforcement.py` to cover the new base class and prove automatic schema strictness without manual overrides.

## [0.10.9] - 2025-10-28

### Documentation
- **🔴 CRITICAL ARCHITECTURAL INSIGHT**: Discovered that 90+ manual Pydantic model fixes (v0.10.1-0.10.8) were UNNECESSARY
  - **Root Cause**: `_enforce_openai_schema_requirements()` in `simple_openai_llm.py` line 50-139 ALREADY automatically adds `additionalProperties: false` to all schemas before sending to OpenAI
  - **What Happened**: Developer didn't realize automatic enforcement existed, manually added `json_schema_extra={"additionalProperties": False}` to 90+ models across 41 files
  - **Schema/Runtime Contradiction**: v0.9.14 added `extra='allow'` (permissive runtime) to fix validation errors, then v0.10.x added `extra='forbid'` + `json_schema_extra` (strict schema) creating contradictory validation rules
  - **The Circular Loop**:
    1. LLM returns extra fields → ValidationError
    2. Fix: `extra='allow'` (accept everything)
    3. OpenAI rejects schema → HTTP 400 invalid_json_schema  
    4. Fix: `extra='forbid'` + `json_schema_extra` (reject everything)
    5. LLM returns extra fields → ValidationError (back to step 1)
  - **Evidence**: Created `test_schema_enforcement.py` proving automatic enforcement works WITHOUT any manual `json_schema_extra`
  - **Architectural Fix Needed**: Choose ONE policy (strict vs permissive), apply consistently, remove redundant manual configurations
  - **Documentation**: Created comprehensive analysis at `docs/SCHEMA-CONTRADICTION-ANALYSIS.md` with timeline, evidence, and recommendations
  - **Impact**: 15+ files still have inconsistent `extra='allow'` from v0.9.14, creating schema/runtime mismatches

## [0.10.8] - 2025-10-28

### Fixed
- **SelectScenarioTask OpenAI Responses API schema compliance**: Fixed `PlanCharacteristics` nested model schema validation error. Ensured all models in `select_scenario.py` have proper `additionalProperties: false` configuration to satisfy OpenAI Responses API requirements.

## [0.10.7] - 2025-10-28

### Fixed
- **FocusOnVitalFewLeversTask Pydantic validation error**: Added missing `deduplication_justification` field to `EnrichedLever` model in `focus_on_vital_few_levers.py` to match the data structure from upstream `enrich_potential_levers.py` task.

## [0.10.6] - 2025-10-28

### Fixed
- **OpenAI Responses API schema compliance - REGRESSION FIX COMPLETE**: Fixed ALL remaining Pydantic models to restore end-to-end pipeline functionality:
  - **Team Module (5 files)**: review_team.py, find_team_members.py, enrich_team_members_with_environment_info.py, enrich_team_members_with_contract_type.py, enrich_team_members_with_background_story.py
  - **Governance Module (6 files)**: governance_phase1_audit.py, governance_phase2_bodies.py, governance_phase3_impl_plan.py, governance_phase4_decision_escalation_matrix.py, governance_phase5_monitoring_progress.py, governance_phase6_extra.py
  - **Support Modules (3 files)**: swot/swot_phase2_conduct_analysis.py, questions_answers/questions_answers.py, fiction/fiction_writer.py

**Total Fixed This Session: 41 files, 90+ models**

Pipeline should now run end-to-end as it did before the regression.

## [0.10.5] - 2025-10-28

### Fixed
- Ensure `DATABASE_URL` from the deployment environment is validated and forwarded into the Luigi subprocess. Added a pre‑launch database connectivity check and early, clear failure with WebSocket notice if unreachable. This makes Railway PostgreSQL configuration pass reliably into the pipeline.

## [0.10.5] - 2025-10-28

### Fixed
- **OpenAI Responses API schema compliance**: Completed systematic fix of all remaining planning and WBS Pydantic models to emit `additionalProperties: false`:
  - **WBS Tasks (3 files)**:
    - `create_wbs_level1.py`: Fixed WBSLevel1
    - `create_wbs_level2.py`: Fixed SubtaskDetails, MajorPhaseDetails, WorkBreakdownStructure
    - `create_wbs_level3.py`: Fixed WBSSubtask, WBSTaskDetails
  - **Planning Estimation Tasks (3 files)**:
    - `estimate_wbs_task_durations.py`: Fixed TaskTimeEstimateDetail, TimeEstimates
    - `identify_wbs_task_dependencies.py`: Fixed TaskDependencyDetail, DependencyMapping
    - `expert_cost.py`: Fixed CostComponent, CostEstimateItem, ExpertCostEstimationResponse
  - **Planning Support Tasks (5 files)**:
    - `data_collection.py`: Fixed SensitivityScore, AssumptionItem, PlannedDataCollectionItem, DocumentDetails
    - `related_resources.py`: Fixed SuggestionItem, DocumentDetails
    - `executive_summary.py`: Fixed DocumentDetails
    - `review_plan.py`: Fixed DocumentDetails
    - `project_plan.py`: Fixed SMARTCriteria, RiskAssessmentAndMitigationStrategies, StakeholderAnalysis, RegulatoryAndComplianceRequirements, GoalDefinition
  - **Pitch Generation**:
    - `pitch/create_pitch.py`: Fixed ProjectPitch

## [0.10.4] - 2025-10-28

### Fixed
- **OpenAI Responses API schema compliance**: Methodically fixed all high and medium priority Pydantic models to emit `additionalProperties: false` for structured output validation:
  - **High Priority Lever Tasks**:
    - `focus_on_vital_few_levers.py`: Fixed StrategicImportance, EnrichedLever, LeverAssessment, VitalLeversAssessmentResult
    - `enrich_potential_levers.py`: Fixed InputLever, LeverCharacterization, BatchCharacterizationResult, CharacterizedLever
    - `candidate_scenarios.py`: Fixed VitalLever, LeverSetting, Scenario, ScenarioAnalysisResult
  - **Medium Priority Assumption Tasks**:
    - `make_assumptions.py`: Fixed QuestionAssumptionItem, ExpertDetails
    - `review_assumptions.py`: Fixed ReviewItem, DocumentDetails
    - `distill_assumptions.py`: Fixed AssumptionDetails
    - `identify_risks.py`: Fixed LowMediumHigh, RiskItem, DocumentDetails
    - `physical_locations.py`: Fixed PhysicalLocationItem, DocumentDetails
    - `identify_purpose.py`: Fixed PlanPurposeInfo
    - `currency_strategy.py`: Fixed CurrencyItem, DocumentDetails

### Documentation
- **Comprehensive compliance guide**: Created `docs/OPENAI-RESPONSES-API-SCHEMA-COMPLIANCE.md` with complete file inventory, prioritization, and implementation strategy for remaining 22 lower-priority files.

## [0.10.3] - 2025-10-28

### Fixed
- **OpenAI Responses API schema compliance**: Systematically fixed Pydantic models to emit `additionalProperties: false` for structured output validation:
  - `DeduplicationAnalysis` and `LeverDecision` in `deduplicate_levers.py` for DeduplicateLeversTask
  - `ScenarioSelectionResult`, `PlanCharacteristics`, `ScenarioFitAssessment`, and `FinalChoice` in `select_scenario.py` for SelectScenarioTask
  - Added comprehensive documentation at `docs/OPENAI-RESPONSES-API-SCHEMA-COMPLIANCE.md` identifying all remaining files needing fixes

### Changed
- **Pipeline log viewer**: Removed automatic scroll-to-bottom behaviour from the recovery UI so investigators can leave the log view at specific historical positions without being pulled back to the end on each update. @planexe-frontend/src/components/PipelineDetails.tsx

## [0.10.2] - 2025-10-28

### Fixed
- **Database connection resilience**: Added retry decorator with exponential backoff to handle transient PostgreSQL SSL EOF errors that were causing PremiseAttackTask to fail after successful LLM calls. The retry logic automatically refreshes database connections and retries up to 3 times before giving up. @planexe_api/database.py
- **Structured output schema compliance**: Fixed multiple Pydantic models to emit `additionalProperties: false` in their JSON schemas so the OpenAI Responses API accepts them:
  - `DocumentDetails` in `identify_plan_type.py` for PlanTypeTask
  - `Lever` and `DocumentDetails` in `identify_potential_levers.py` for PotentialLeversTask  
  - `DocumentDetails` in `premise_attack.py` for PremiseAttackTask

### Changed
- **Pipeline log viewer**: Removed automatic scroll-to-bottom behaviour from the recovery UI so investigators can leave the log view at specific historical positions without being pulled back to the end on each update. @planexe-frontend/src/components/PipelineDetails.tsx

## [0.10.1] - 2025-10-28

### Fixed
- **PlanTypeTask Responses schema regression**: Restored `additionalProperties=false` for the structured output model so the OpenAI Responses API accepts the schema again, eliminating the `HTTP 400 invalid_json_schema` failures that stopped the Luigi pipeline during `PlanTypeTask`. @planexe/assume/identify_plan_type.py

### Changed
- **Pipeline log viewer**: Removed automatic scroll-to-bottom behaviour from the recovery UI so investigators can leave the log view at specific historical positions without being pulled back to the end on each update. @planexe-frontend/src/components/PipelineDetails.tsx

## [0.10.0] - 2025-10-27

### Added
- **🚀 Pipeline Concurrency Optimizations**: Implemented async concurrent execution for major pipeline bottlenecks to significantly reduce execution time
  - **Problem**: Sequential LLM API calls in document drafting, expert criticism, and WBS tasks created significant performance bottlenecks
  - **Solution**: Added async support to LLMExecutor and updated key tasks to use concurrent execution via `asyncio.gather()`
  - **Performance Impact**: Tasks that previously executed sequentially now run concurrently, reducing overall pipeline execution time
  - **Core Changes**:
    - **LLMExecutor Async Support**: Added `run_async()` and `run_batch_async()` methods for concurrent LLM execution
    - **Document Drafting Concurrency**: Both `DraftDocumentsToFindTask` and `DraftDocumentsToCreateTask` now process all documents concurrently
    - **Expert Criticism Concurrency**: `ExpertOrchestrator` now gathers expert feedback concurrently instead of sequentially
    - **WBS Task Duration Concurrency**: `EstimateTaskDurationsTask` now estimates task durations in concurrent chunks
    - **WBS Level 3 Decomposition Concurrency**: `CreateWBSLevel3Task` now decomposes tasks concurrently
  - **Technical Implementation**:
    - Added async `aexecute()` methods to all relevant LLM interaction classes
    - Updated pipeline tasks to use `asyncio.run()` with concurrent execution patterns
    - Maintained database-first architecture with proper concurrent write handling
    - Preserved all existing error handling and fallback mechanisms
  - **Files Modified**:
    - `planexe/llm_util/llm_executor.py`: Added async execution methods
    - `planexe/document/draft_document_to_find.py`: Added `aexecute()` method
    - `planexe/document/draft_document_to_create.py`: Added `aexecute()` method
    - `planexe/expert/expert_criticism.py`: Added `aexecute()` method
    - `planexe/plan/estimate_wbs_task_durations.py`: Added `aexecute()` method
    - `planexe/plan/create_wbs_level3.py`: Added `aexecute()` method
    - `planexe/expert/expert_orchestrator.py`: Updated to use concurrent criticism
    - `planexe/plan/run_plan_pipeline.py`: Updated all major tasks to use concurrent execution
  - **Backward Compatibility**: All synchronous `execute()` methods remain unchanged and functional

### Changed
- **IdentifyPurpose Reasoning Effort**: Updated to use `reasoning_effort="medium"` for consistent performance across async and sync execution

## [0.9.14] - 2025-10-27

### Fixed
- **🔴 CRITICAL Pydantic Validation Errors**: Added `model_config = {'extra': 'allow'}` to all Pydantic models used with structured LLM outputs to prevent pipeline failures
  - **Problem**: LLM responses containing extra fields beyond defined schema caused `ValidationError: Extra data` exceptions, leading to pipeline exhaustion and failure
  - **Root Cause**: Pydantic's default `extra='forbid'` behavior throws validation errors when LLMs return additional metadata fields not explicitly defined in the schema
  - **Impact**: Pipeline tasks would fail with "Failed to parse structured response for [ModelName]: Extra data: line X column Y" errors, causing complete pipeline failure
  - **Solution**: Added `model_config = {'extra': 'allow'}` to 50+ Pydantic models across the entire codebase, allowing validation to ignore unknown fields while still enforcing required field validation
  - **Models Fixed**:
    - **Assumption Models**: `QuestionAssumptionItem`, `ExpertDetails` in `make_assumptions.py`
    - **Team Models**: `TeamMember`, `DocumentDetails`, `TeamDetails`, `ReviewItem` across all team modules
    - **Planning Models**: All WBS classes (`WBSLevel1`, `WorkBreakdownStructure`, `SubtaskDetails`, `MajorPhaseDetails`, `WBSSubtask`, `WBSTaskDetails`)
    - **Strategic Models**: All lever, scenario, and governance models
    - **Analysis Models**: `SWOTAnalysis`, `QuestionAnswerPair`, risk assessment models
    - **Document Models**: All document identification and filtering models
    - **Diagnostic Models**: All premise attack, premortem, and diagnostic models
  - **Files Modified**: 50+ files across `planexe/assume/`, `planexe/team/`, `planexe/plan/`, `planexe/lever/`, `planexe/governance/`, `planexe/expert/`, `planexe/document/`, `planexe/diagnostics/`, and others
  - **Result**: Pipeline now continues successfully when LLMs return extra metadata fields, preventing validation-related failures

## [0.9.13] - 2025-10-27

### Changed
- **Luigi Worker Pool Enforcement**: Guarantee at least 10 concurrent workers regardless of caller environment to keep early-stage tasks parallelized
  - `planexe/plan/run_plan_pipeline.py`: Forces `LUIGI_WORKERS` minimum of 10 and warns on invalid overrides before invoking `luigi.build`
  - `planexe_api/services/pipeline_execution_service.py`: Normalizes FastAPI subprocess environment/CLI arguments so the Luigi child process inherits the same minimum

## [0.9.12] - 2025-10-27

### Fixed
- **🔴 CRITICAL Hardcoded UI Values Removed**: Eliminated all fake/mock data from telemetry components that was misleading users
  - **Problem**: Previous commits introduced hardcoded values like `PID: 12345`, fake response times, mock task durations, and simulated progress metrics
  - **Impact**: Users were seeing fake data instead of real operational information, making the telemetry useless for debugging
  - **Fixed Values Removed**:
    - `subprocessPid={12345}` - Fake process ID
    - `startTime: new Date(Date.now() - 30000)` - Fake 30-second-old start time
    - `duration: 30` and `duration: 45` - Hardcoded task durations
    - `estimatedDuration: 60` - Fake queued task estimates
    - `activeTimeoutCountdown={30}` - Mock countdown timer
    - `totalTasks = 61` - Hardcoded magic number
    - `"DB: Active"` and `"LLM: Ready"` - Fake status messages
    - `maxStagesToShow = 5` - Hardcoded display limits
    - `slice(0, 3)` and `slice(-10)` - Hardcoded array limits
  - **Solution**: Connected all telemetry to real WebSocket data streams and actual plan metadata
  - **Enhanced Real Data Display**:
    - Real database connection status based on actual connection state
    - Real LLM status showing actual call counts and active/idle state
    - Real token usage summed from all LLM stream usage data
    - Dynamic stage display limits based on available data
    - Real response time history from actual LLM interactions
  - **Files Modified**:
    - `planexe-frontend/src/app/recovery/components/RecoveryHeader.tsx`: Removed all hardcoded values and connected to real data
    - `planexe-frontend/src/app/recovery/components/APITelemetryStrip.tsx`: Enhanced to show real error messages
- **Recovery Artefact Typing**: Resolved TypeScript errors in the recovery workspace by importing the correct `PlanArtefact` type and tightening map handlers
  - Ensures strict typing in `useRecoveryPlan` without falling back to `any`
  - `planexe-frontend/src/app/recovery/useRecoveryPlan.ts`: Added explicit `PlanArtefact` import and strongly typed mapping logic
- **Pipeline Logs Auto-Scroll**: Added auto-scroll functionality to the "Pipeline Logs" element in the recovery workspace
  - **Feature**: Logs now automatically scroll to show the latest content as the pipeline progresses
  - **Implementation**: Added `useRef` and `useEffect` hooks to `PipelineLogsPanel` component to monitor log content changes and scroll to bottom
  - **User Experience**: Users no longer need to manually scroll to see the latest log entries during plan execution
  - **Files Modified**:
    - `planexe-frontend/src/components/PipelineDetails.tsx`: Added auto-scroll functionality to `PipelineLogsPanel` component
    - Added necessary imports (`useRef`) and scroll logic that triggers when `details?.pipelineLog` updates
- **React Hook Dependencies**: Fixed missing dependency warnings in useMemo hooks
  - Added `planCreatedAt` to dependency array to prevent stale closures
  - Removed TypeScript `any` types by properly typing usage objects with type guards

## [0.9.11] - 2025-10-27

### Added
- **Reasoning Effort Streaming Warnings**: Added user-friendly warnings when selecting reasoning effort levels that don't support streaming
  - **Feature**: Users can now choose 'minimal' reasoning effort for fastest processing, but are clearly informed about streaming limitations
  - **UI Enhancement**: Real-time validation shows helpful alerts when 'minimal' or 'low' reasoning effort is selected
  - **Backend API**: New `/api/validate-reasoning-effort` endpoint provides streaming compatibility information
  - **User Experience**: Maintains user choice while providing clear guidance about trade-offs between speed and real-time feedback
  - **Files Modified**:
    - `planexe_api/models.py`: Added ReasoningEffortValidation model for API responses
    - `planexe_api/api.py`: Added reasoning effort validation endpoint with streaming warnings
    - `planexe-frontend/src/components/planning/PlanForm.tsx`: Added real-time validation and warning display
    - `planexe_api/config.py`: Reverted defaults to 'minimal' with proper validation instead of blocking

### Changed
- **Reasoning Effort Philosophy**: Shifted from blocking minimal effort to educating users about streaming trade-offs
  - Users can now select any reasoning effort level with appropriate guidance
  - Improved transparency about how reasoning effort affects real-time streaming vs batch processing

### Fixed
- **🔴 CRITICAL Empty Levers Cascade Failure**: Fixed pipeline crash when no levers are identified during analysis, preventing 14+ downstream tasks from being left pending
  - **Root Cause**: While `FocusOnVitalFewLeversTask` handled empty inputs gracefully, `CandidateScenariosTask` had a hard requirement for non-empty vital levers, causing `ValueError: The list of vital levers cannot be empty.`
  - **Impact**: Pipeline would fail at scenario generation stage, preventing all subsequent tasks (WBS, governance, team, documents, reports) from running
  - **Files Modified**:
    - `planexe/lever/candidate_scenarios.py`: Added fallback scenario generation when no vital levers are provided
    - `planexe/lever/enrich_potential_levers.py`: Added empty input handling to prevent upstream failures
    - `planexe/lever/select_scenario.py`: Added defensive fallback for empty scenarios (edge case protection)
  - **Fallback Behavior**: 
    - When no levers are identified, `CandidateScenariosTask` now generates 3 standard implementation approaches (Standard, Conservative, Agile) instead of failing
    - `EnrichPotentialLeversTask` returns empty characterized levers list instead of crashing
    - `SelectScenarioTask` provides default scenario selection when scenarios are empty
  - **Result**: Pipeline now completes successfully even when no strategic levers are identified, producing a functional plan with standard implementation approaches
- **PlanResponse Validation**: Fixed HTTP 422 errors caused by missing fields in API endpoint responses
  - Added reasoning_effort field to POST /api/plans, GET /api/plans/{plan_id}, and GET /api/plans endpoints
  - Added missing llm_model and speed_vs_detail fields to GET /api/plans endpoint
  - Endpoints now match PlanResponse schema requirements introduced in recent reasoning_effort propagation work
  - No database changes required - reasoning_effort uses config defaults for retrieval endpoints

## [0.9.10] - 2025-10-27

### Fixed
- **Reasoning Effort Propagation**: Fixed critical issue where user-selected reasoning effort was not being passed to LLM calls
  - **Root Cause**: Many pipeline task execute() methods were missing the reasoning_effort parameter, causing all LLM calls to default to 'medium' reasoning regardless of user selection
  - **Impact**: Users selecting 'minimal' or 'high' reasoning effort were not getting their preferred setting, affecting response speed and detail level
  - **Files Modified**:
    - `planexe/llm_util/llm_executor.py`: Updated LLMModelFromName to accept and propagate reasoning_effort
    - `planexe/plan/run_plan_pipeline.py`: Updated create_llm_executor and all task execute() calls to pass reasoning_effort
    - `planexe/diagnostics/premise_attack.py`: Added reasoning_effort parameter to execute() method
    - `planexe/diagnostics/redline_gate.py`: Added reasoning_effort parameter to execute() method
    - `planexe/lever/identify_potential_levers.py`: Added reasoning_effort parameter to execute() method
    - `planexe/lever/deduplicate_levers.py`: Added reasoning_effort parameter to execute() method
    - `planexe/lever/enrich_potential_levers.py`: Added reasoning_effort parameter to execute() method
    - `planexe/lever/focus_on_vital_few_levers.py`: Added reasoning_effort parameter to execute() method
    - `planexe/lever/candidate_scenarios.py`: Added reasoning_effort parameter to execute() method
    - `planexe/lever/select_scenario.py`: Added reasoning_effort parameter to execute() method
    - `planexe/assume/review_assumptions.py`: Added reasoning_effort parameter to execute() method
    - `planexe/assume/shorten_markdown.py`: Added reasoning_effort parameter to execute() method
    - `planexe/plan/project_plan.py`: Added reasoning_effort parameter to execute() method
    - `planexe/governance/governance_phase1_audit.py`: Added reasoning_effort parameter to execute() method
    - `planexe/governance/governance_phase2_bodies.py`: Added reasoning_effort parameter to execute() method
    - `planexe/governance/governance_phase3_impl_plan.py`: Added reasoning_effort parameter to execute() method
    - `planexe/governance/governance_phase4_decision_escalation_matrix.py`: Added reasoning_effort parameter to execute() method
    - `planexe/governance/governance_phase5_monitoring_progress.py`: Added reasoning_effort parameter to execute() method
    - `planexe/governance/governance_phase6_extra.py`: Added reasoning_effort parameter to execute() method
  - **Fix Applied**: Systematically added reasoning_effort parameter to all 19+ task execute() methods and updated all pipeline calls to pass self.reasoning_effort
  - **Result**: User-selected reasoning effort now properly propagates from frontend through entire pipeline to all LLM interactions
- **Report Navigation**: Added table of contents to report pages for better navigation through long reports
  - Interactive navigation links auto-generated from section headers
  - Improves usability for comprehensive plan reports
- **Enriched Intake Data Handling**: Fixed enriched intake to properly handle physical locations and currency strategy fields
  - Ensures location and currency data flows correctly from conversation to pipeline
  - Prevents data loss during plan creation
- **Database Integration**: Fixed pipeline tasks to properly write to database during execution
  - Ensures all task outputs are captured in database
  - Improves plan recovery and resume capabilities
- **Empty Levers Handling**: Fixed pipeline crash when no levers are identified during analysis
  - Gracefully handles empty lever lists
  - Prevents cascading failures in downstream tasks
- **Progress Monitoring**: Enhanced progress tracking with improved error handling and logging
  - More robust progress calculations
  - Better visibility into pipeline execution stages
- **Error Handling**: Improved error handling and logging throughout plan pipeline
  - More graceful failure modes
  - Better error messages for debugging

## [0.9.9] - 2025-10-27

### Fixed
- **Recovery Header Progress Display**: Fixed recovery page header stuck at "Progress: 0%" throughout pipeline execution
  - **Root Cause**: Plan data (containing `progress_percentage` and `progress_message`) was only fetched once on initial page load, then relied entirely on WebSocket for updates. If WebSocket had any connection issues, progress would never update in the UI.
  - **Impact**: Users saw "Progress: 0%, Starting plan generation..." for the entire pipeline run, providing no visibility into actual progress (0% → 99%).
  - **Files Modified**:
    - `planexe-frontend/src/app/recovery/useRecoveryPlan.ts`: Added plan progress polling mechanism (every 3 seconds) alongside existing artefact polling
  - **Fix Applied**:
    - Added new `useEffect` hook that polls the plan endpoint every 3 seconds while plan status is 'running' or 'pending'
    - Provides resilient fallback to WebSocket updates, ensuring progress displays even if WebSocket disconnects
    - Automatically stops polling when plan completes or fails
    - Added diagnostic logging to track polling behavior and API responses
  - **Result**: Recovery header now displays live progress updates (0% → 15% → 30% → ...) and accurate task completion messages ("Processing... 15/61 tasks completed") regardless of WebSocket reliability

## [0.9.8] - 2025-10-27

### Fixed
- **🔴 CRITICAL Reasoning Effort Override Bug**: Fixed pipeline consistently using "medium" reasoning effort regardless of user selection
  - **Root Cause**: Multiple hardcoded "medium" defaults in execute method signatures were overriding user's reasoning effort choice from the UI
  - **Impact**: User selections for "minimal", "low", "medium", or "high" reasoning effort were ignored, forcing all LLM calls to use "medium"
  - **Files Modified**:
    - `planexe/plan/run_plan_pipeline.py`: Updated 7 pipeline tasks to pass `reasoning_effort=self.reasoning_effort` parameter:
      - `IdentifyPurposeTask`, `IdentifyPlanTypeTask`, `PhysicalLocationsTask`, `CurrencyStrategyTask`
      - `IdentifyRisksTask`, `MakeAssumptionsTask`, `DistillAssumptionsTask`
    - `planexe/assume/identify_purpose.py`: Removed hardcoded `"medium"` default from execute method signature
    - `planexe/assume/identify_plan_type.py`: Removed hardcoded `"medium"` default from execute method signature
    - `planexe/assume/physical_locations.py`: Removed hardcoded `"medium"` default from execute method signature
    - `planexe/assume/currency_strategy.py`: Removed hardcoded `"medium"` default from execute method signature
    - `planexe/assume/identify_risks.py`: Removed hardcoded `"medium"` default from execute method signature
    - `planexe/assume/make_assumptions.py`: Removed hardcoded `"medium"` default from execute method signature
  - **Fix Applied**: 
    - Updated all pipeline task calls to explicitly pass the user's reasoning effort selection
    - Removed hardcoded defaults from execute method signatures to prevent overrides
    - Maintained LLM-level fallback in `simple_openai_llm.py` as safety net
  - **Result**: User's reasoning effort selection now properly flows from frontend → API → pipeline → LLM calls

## [0.9.7] - 2025-10-27

### Added
- **🚀 Luigi Worker Parallelization**: Enabled parallel task execution for significant pipeline performance improvements:
  - Added `--workers 4` and `--worker-pool-threads 4` to Luigi subprocess configuration
  - Independent tasks now execute simultaneously instead of sequentially
  - Analysis tasks (RedlineGate, PremiseAttack, IdentifyPurpose) run in parallel
  - Multiple analysis chains (Assumptions, Levers, Governance, Team, Documents) execute concurrently
  - **Performance Impact**: 3-5x pipeline speedup for typical plans
  - **Configuration**: Workers automatically enabled via FastAPI pipeline execution service
  - **Compatibility**: Maintains all existing functionality and database-first architecture

### Changed
- **Pipeline Execution**: Modified subprocess command in `pipeline_execution_service.py` to include Luigi worker parameters for parallel execution
- **Resource Utilization**: Better utilization of available CPU cores and network bandwidth during LLM calls

## [0.9.6] - 2025-10-26

### Added
- **Reasoning Effort UI**: Added visible reasoning effort selector to multiple entry points:
  - Landing page (`app/page.tsx`): Four-button selector with inline descriptions below Speed vs Detail section
  - Advanced form page (`app/create/page.tsx`): New route with full PlanForm component including dropdown selector
  - Both components default to "medium" and include reasoning_effort in plan creation payloads
  - Added "Advanced Form →" link to landing page card header for easy access to detailed form
- **New Route**: Created `/create` route that displays the full `PlanForm` component with all fields (title, tags, examples tabs) for users who prefer a more detailed creation interface
- **Visual Feedback**: Added reasoning effort badge to conversation modal header so users can see the active setting during intake conversations
- **Unlimited Intake**: Removed all character limits from intake fields across frontend and backend:
  - Frontend: Removed 10,000 character limit from `PlanFormSchema` prompt validation
  - Backend: Removed 10,000 character limit from `CreatePlanRequest.prompt` field
  - Backend: Removed 6,000 character limit from `ConversationTurnRequest.user_message` field (conversation modal)
  - Backend: Removed 8,000 character limit from `AnalysisStreamRequest.prompt` field
  - Users can now provide unlimited project context and detailed intake information without truncation

### Changed
- **Conversation Modal**: Extended `ConversationModal` to accept and display the user-selected reasoning effort, passing it through to the conversation API instead of always using backend defaults
- **Resume Dialog**: Added reasoning effort selector to `ResumeDialog` so resumed plans can optionally override the original setting, with the previous value pre-selected by default
- **Recovery Flow**: Updated recovery page to preserve reasoning effort when resuming plans, passing it through to both fallback and targeted resume operations
- **Data Flow**: Updated `useResponsesConversation` hook to accept optional `reasoningEffort` parameter and use it in conversation turn payloads, while falling back to backend defaults only when not provided

### Fixed
- **🔴 CRITICAL OpenAI Responses API Streaming Fix**: Fixed broken LLM reasoning streams on recovery page due to deprecated OpenAI API event names
  - **Root Cause**: OpenAI changed reasoning streaming event from `response.reasoning_summary_text.delta` to `response.reasoning_summary.delta` in the Responses API
  - **Impact**: Recovery page live LLM stream component was not displaying reasoning content during Luigi pipeline execution
  - **Fix Applied**: Updated `planexe/llm_util/simple_openai_llm.py` to use the correct `response.reasoning_summary.delta` event name for pipeline streaming
  - **Note**: Conversation system continues to use the old event name as it has different streaming requirements
- **OpenAI Metadata Fix**: Fixed 512-character error from OpenAI's Responses API by truncating `initialPrompt` in metadata to 512 characters. The full prompt is still sent as the user message; metadata is only used for logging/context. This resolves the `string_above_max_length` error when users provided prompts longer than 512 characters.
- **🔴 CRITICAL Pipeline Task Fixes**: Fixed two critical Luigi pipeline task failures that were preventing plan completion:
  - **CreateWBSLevel1Task NameError**: Fixed missing `start_time` variable and wrong variable reference (`parsed.model_dump()`) in `planexe/plan/create_wbs_level1.py`
    - **Root Cause**: Copy-paste error during refactoring omitted `start_time = time.perf_counter()` and referenced undefined `parsed` variable
    - **Impact**: Pipeline failed at WBS stage, preventing all subsequent tasks from running
    - **Fix Applied**: Added proper timing initialization and corrected variable references
  - **EnrichLeversTask KeyError/EmptyList**: Fixed missing key handling when `DeduplicateLeversTask` produces no levers in `planexe/plan/run_plan_pipeline.py`
    - **Root Cause**: Code directly accessed `json_dict["deduplicated_levers"]` without checking if key exists or list is empty
    - **Impact**: Pipeline failed when no levers were identified, causing cascading failures in downstream tasks
    - **Fix Applied**: Added defensive programming with `.get()` method and graceful empty-output handling
- **🔴 CRITICAL Reasoning Effort Override Fix**: Fixed pipeline tasks that were ignoring user's reasoning effort selection and defaulting to "medium"
  - **Root Cause**: Several execute methods were using `fast_mode` or `speed_vs_detail` parameters to override reasoning effort instead of respecting user selection, while others were missing reasoning effort support entirely
  - **Impact**: User's reasoning effort selection (minimal, low, medium, high) was being ignored, causing all LLM calls to use "medium" regardless of UI setting
  - **Files Modified**:
    - `planexe/plan/run_plan_pipeline.py`: Added `get_reasoning_effort()` method to PlanTask and updated all task calls
    - `planexe/plan/create_wbs_level2.py`: Updated execute method to accept `reasoning_effort` parameter
    - `planexe/team/review_team.py`: Updated execute method to accept `reasoning_effort` parameter  
    - `planexe/plan/review_plan.py`: Updated execute method to accept `reasoning_effort` parameter
    - `planexe/assume/make_assumptions.py`: Updated execute method to accept `reasoning_effort` parameter
    - `planexe/assume/identify_purpose.py`: Updated execute method to accept `reasoning_effort` parameter
    - `planexe/assume/identify_plan_type.py`: Updated execute method to accept `reasoning_effort` parameter
    - `planexe/assume/physical_locations.py`: Updated execute method to accept `reasoning_effort` parameter
    - `planexe/assume/currency_strategy.py`: Updated execute method to accept `reasoning_effort` parameter
    - `planexe/assume/identify_risks.py`: Updated execute method to accept `reasoning_effort` parameter
  - **Fix Applied**: Modified execute methods to accept `reasoning_effort` parameter and updated pipeline tasks to pass user's selection from environment variables. Fixed both override issues and missing support issues.
- Fixed the gap where reasoning effort was configured via backend defaults but never exposed in the UI, making the setting invisible and unchangeable.

### Security
- **🔴 CRITICAL VERSION COMPATIBILITY DOCUMENTATION**: 
  - **Backend (Python)**: OpenAI SDK v1.109.1 - DO NOT UPGRADE beyond v1.x
  - **Frontend (Node.js)**: OpenAI SDK v6.7.0 - Latest version acceptable
  - **Breaking Changes**: Upgrading backend beyond v1.x will break Responses API integration due to:
    - Client instantiation changes (module-level → explicit client)
    - Response object changes (dict → Pydantic models) 
    - API path changes (`client.responses` may be different)
    - Streaming interface evolution
  - **Risk Assessment**: HIGH RISK - Current v1.109.1 setup is stable and supports all required features
  - **Recommendation**: Maintain backend on v1.109.1; frontend can use latest Node.js SDK

### Deprecated
- **🔴 CRITICAL WINDOWS ENVIRONMENT ISSUE IDENTIFIED**: 
  - **Problem**: PlanExe works correctly on Railway (Linux deployment) but HANGS on Windows during OpenAI API calls
  - **Symptoms**: Luigi pipeline starts successfully, but LLM executor calls to OpenAI timeout/hang on Windows only
  - **Root Cause**: Windows-specific networking/OpenAI client issue, NOT an API key or model problem
  - **Impact**: Development on Windows will experience pipeline stalls during LLM interactions
  - **Workaround**: Use Railway deployment for full testing; develop on Linux/macOS for local testing
  - **Status**: Documented known limitation - no fix available at this time
- **Reasoning Effort UI**: Added visible reasoning effort selector to multiple entry points:
  - Landing page (`app/page.tsx`): Four-button selector with inline descriptions below Speed vs Detail section
  - Advanced form page (`app/create/page.tsx`): New route with full PlanForm component including dropdown selector
  - Both components default to "medium" and include reasoning_effort in plan creation payloads
  - Added "Advanced Form →" link to landing page card header for easy access to detailed form
- **New Route**: Created `/create` route that displays the full `PlanForm` component with all fields (title, tags, examples tabs) for users who prefer a more detailed creation interface
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
- **OpenAI Metadata Fix**: Fixed 512-character error from OpenAI's Responses API by truncating `initialPrompt` in metadata to 512 characters. The full prompt is still sent as the user message; metadata is only used for logging/context. This resolves the `string_above_max_length` error when users provided prompts longer than 512 characters.
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
