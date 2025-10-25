# Pipeline Refactor Handoff Notes

**Context:** We are removing the old `llama_index` types and wiring the Luigi pipeline so every task uses `SimpleOpenAILLM`. The UI/back-end stack already assumes the new adapter, but the Luigi tasks still mix both worlds, which is why runs keep crashing.

---

## What’s already done

- `planexe/plan/run_plan_pipeline.py`
  - Dropped the direct `llama_index.core.llms.llm.LLM` import and patched the executor so tasks receive the raw adapter instance (`Any`).
  - Added a temporary alias `LLM = Any` to keep type hints compiling until every task drops the legacy annotation.
- Many individual modules (team enrich, SWOT, etc.) already use `SimpleChatMessage` / `SimpleMessageRole`, so the adapter works once a task is converted.
- Frontend + FastAPI already expect pipeline outputs from `SimpleOpenAILLM`; the breakage is limited to the Luigi side.

---

## What’s still broken

- **ReviewTeamTask still fails:** the giant schema dump you saw comes from remaining llama-index assumptions. Until each task hands valid messages to the adapter, the Responses API returns malformed payloads and Luigi aborts.
- **`LLM = Any` alias is a band-aid:** it keeps the code running but hides the fact that dozens of `run_with_llm(self, llm: LLM)` overrides still import the legacy class. We can’t delete the alias until all of them are fixed.
- **Schemas/messages still expect llama-index objects:** anywhere we still build `ChatMessage` or poke at `.message.content` the old way, the adapter chokes.

---

## Priority todo list

1. **Swap every `llm: LLM` signature to `llm: Any` (or a shared protocol) and drop the old import.**
   - High-priority directories: `planexe/plan/`, `planexe/governance/`, `planexe/diagnostics/`, `planexe/lever/`, `planexe/document/`, `planexe/expert/`, `planexe/team/`.
   - After changing the signature, replace any lingering `ChatMessage`/`MessageRole` usage with `SimpleChatMessage` helpers (copy from already-converted files like `planexe/team/enrich_team_members_with_environment_info.py`).
2. **Remove the `LLM = Any` shim** once the above is done. Compiler errors will point at stragglers we missed.
3. **Re-run the pipeline** (through FastAPI or `python -m planexe.plan.run_plan_pipeline`) and keep fixing tasks until ReviewTeam and friends stop throwing schema errors.
4. **Document quick sanity checks** (optional, but helpful): e.g. run `pytest planexe/llm_util/tests/test_llm_executor.py` to confirm executor still works.

---

## Quick workflow for the next dev

1. `rg "from llama_index.core.llms.llm" planexe` – each hit needs its signature updated.
2. `rg "ChatMessage" planexe` – confirm anything under `planexe/` (not `proof_of_concepts/`) uses the new helpers.
3. After each round, try a pipeline run; if another task blows up with a JSON schema dump, convert that module next.
4. Once the run finishes cleanly, ditch the alias in `run_plan_pipeline.py` and commit the sweep.

---

## Extra notes

- CLI/POC scripts can stay broken for now; we only care about the FastAPI -> Luigi path.
- Don’t touch the DB-first write logic – it already behaves; the crashes happen before it writes anything.
- `planexe/llm_util/simple_openai_llm.py` still subclasses some llama-index internals on purpose. Leave it alone until the pipeline is stable.
- Keep commits small so we can bisect if the pipeline still fails.

Main goal: kill every llama-index dependency inside production Luigi tasks so the adapter finally runs end-to-end.
