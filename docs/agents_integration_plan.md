# PlanExe Agents SDK Integration Plan

## 1. Research Summary
- The OpenAI Agents SDK (released with the 2024 platform updates) lets us define stateful agents that execute **actions** (tool calls) over a persistent session while the platform handles tool routing, code execution, and file management. Key capabilities documented by OpenAI include:
  - **Structured agent definitions** with instructions, model selection, response modalities, and metadata in a single object that can be reused across requests.
  - **Tool orchestration** via declarative action schemas that let the SDK call HTTP endpoints, function tools, File Search, and the Code Interpreter without manual polling.
  - **Session + Thread management** so long-running plan-generation flows can stream intermediate results, branch, and resume.
  - **Built-in resources** such as file uploads, vector stores, and auto-generated logs that simplify grounding the agent in proprietary documents.
- The SDK can run in either hosted mode (OpenAI handles execution) or Bring-Your-Own stack via Realtime/Responses APIs, meaning we can phase our adoption.

## 2. Current PlanExe Architecture (High-Level)
- The Gradio UI (`planexe/plan/app_text2plan.py`) funnels user intent into the pipeline entry point `planexe.plan.run_plan_pipeline`, orchestrating prompt construction, LLM calls, and report assembly on the local machine.
- Supporting modules include domain-specific planning steps (`planexe/plan`, `planexe/report`, `planexe/schedule`, `planexe/wbs`), prompt catalogues (`planexe/prompt`), and knowledge helpers (`planexe/plan/pipeline_environment.py`, `planexe/plan/speedvsdetail.py`).
- LLM usage is abstracted through `planexe.llm_factory` and `planexe.llm_util`, which route to OpenRouter, Ollama, or other providers. State is primarily file-system based under `run/` directories.

## 3. Target Agents-Driven Architecture
### 3.1 Agent Roles
1. **Planner Agent** – central orchestrator that receives user briefs, calls specialized tools to assemble the plan skeleton, and streams updates back to the UI.
2. **Research Agent** – enriches plans using File Search over curated corpora (existing prompt catalog, previous plans, uploaded docs).
3. **Validation Agent** – reviews generated sections with checklists (e.g., SWOT completeness) and issues follow-up improvement actions.

### 3.2 Tooling Strategy
- Wrap existing deterministic utilities (e.g., `planexe.plan.generate_run_id`, `planexe.plan.plan_file.PlanFile`, `planexe.report.create_report`) as callable actions exposed through the SDK’s tool schema.
- Maintain legacy `LLMInfo`/`llm_factory` functions as “custom tools” so the Agents runtime can still call local or third-party models when needed.
- Use the SDK’s built-in `file_search` tool for grounding: index canonical plan templates, market research PDFs, and previously exported plans stored in `run/`.
- Adopt the Code Interpreter tool for data-heavy appendices (financial tables, schedules) currently built via pandas utilities in `planexe/schedule` and `planexe/wbs_table_for_cost_estimation`.

### 3.3 Session and UI Integration
- Replace the synchronous Gradio callbacks with an agent session listener that streams `response.output_text.delta` events into the interface.
- Persist session metadata (user prompt, agent thread ID, output artifacts) alongside the existing run folder for backwards compatibility.
- Allow users to upload supplemental documents in the UI; the frontend saves them to the Agents file store and links the file IDs when invoking the Planner Agent.

## 4. Implementation Phases
### Phase 0 – Foundations
- Upgrade to the `openai` Python SDK ≥ 1.40 to access the `OpenAI` client’s `agents`, `responses`, and `beta.realtime` namespaces.
- Add configuration to `llm_config.json` for selecting the Agents backend vs. the legacy pipeline.
- Establish secrets management (e.g., `.env` integration) for the required `OPENAI_API_KEY` and optional workspace IDs.

### Phase 1 – Minimal Viable Agent Flow
- Implement a thin wrapper in `planexe/plan/agents_entrypoint.py` that:
  1. Creates/loads a Planner Agent with instructions mirroring the existing prompt template.
  2. Starts a thread, sends the user brief, waits for streamed messages, and writes outputs into the run directory.
- Update the Gradio app to route requests through this entrypoint when the “Agents SDK” mode is active.
- Instrument logging to capture agent tool invocations for debugging (`planexe/diagnostics`).

### Phase 2 – Tool Migration
- Convert the deterministic pipeline steps into agent tools:
  - `create_zip_archive`, `generate_run_id`, scheduling utilities, SWOT table builders.
  - Register each as a callable tool using the SDK’s JSON-schema interface.
- Introduce a “Plan Assembler” tool that takes partial agent outputs and renders the HTML/PDF using `planexe/report`.
- Provide fallbacks: if a tool call fails, proxy the request to the legacy synchronous function to maintain reliability.

### Phase 3 – Knowledge Integration
- Build a file ingestion job that pushes curated content into the Agents file store and creates a vector store for domain retrieval.
- On each session, attach relevant file IDs so the Planner or Research Agents can ground their reasoning.
- Optionally integrate live web search as a separate tool if the Agents SDK allows external function calls.

### Phase 4 – Multi-Agent Collaboration
- Define a workflow where the Planner Agent delegates to the Validation Agent; implement cross-agent messaging using the SDK’s session forwarding APIs.
- Surface agent-to-agent debates in the UI so users can watch the refinement process.

### Phase 5 – Production Hardening
- Add observability hooks (telemetry events, rate-limit metrics) to `planexe/utils`.
- Write integration tests that mock the Agents client to cover failure modes.
- Document operator playbooks under `extra/` for deploying the Agents-powered stack.

## 5. Risks and Mitigations
- **API Cost + Latency:** Agents sessions may run longer than single LLM calls. Mitigate by caching intermediate artifacts and allowing users to dial the `speed_vs_detail` knob which maps to agent instruction sets.
- **Tool Security:** Validate inputs before handing them to file or code tools; reuse the existing sanitization helpers in `planexe/purge` and `planexe/utils`.
- **Feature Parity:** Keep the legacy pipeline togglable until Agents functionality reaches parity; add end-to-end regression tests comparing outputs.

## 6. Next Steps Checklist
1. Spike a CLI proof-of-concept that calls a Planner Agent with a static brief using the SDK’s Responses API.
2. Write design docs for each new tool wrapper (owner, inputs/outputs, success criteria).
3. Schedule a knowledge-curation sprint to select the initial document set for File Search.
4. Align with product stakeholders on UI changes needed to surface streaming agent updates.
