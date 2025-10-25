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

3. There may be a lot of them, make a list and focus on fixing all of them. 

---

## Quick workflow for the next dev

1. `rg "from llama_index.core.llms.llm" planexe` – each hit needs its signature updated.
2. `rg "ChatMessage" planexe` – confirm anything under `planexe/` (not `proof_of_concepts/`) uses the new helpers.
3. After each round, make the fix and move to the next.  Make a list of the files and line numbers of what you need to edit if you need to help yourself not get lost.   DO not get lost thinking about testing or other shit, your only tasks are making the code fixes.  

---

## Extra notes

- CLI/POC scripts can stay broken for now; we only care about the FastAPI -> Luigi path.
- Don’t touch the DB-first write logic – it already behaves; the crashes happen before it writes anything.
- `planexe/llm_util/simple_openai_llm.py` still subclasses some llama-index internals on purpose. Leave it alone until the pipeline is stable.


Main goal: kill every llama-index dependency inside production Luigi tasks so the adapter finally runs end-to-end.   