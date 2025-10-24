## 2025-10-24 Updates (Staging)

- FIX: Responses API input content sanitizer added to prevent invalid `type: "text"` items from reaching OpenAI.
  - Effected paths: Conversation modal streaming, Analysis streaming
  - Files:
    - planexe_api/services/conversation_service.py (sanitizer in _build_request_args)
    - planexe_api/streaming/analysis_stream_service.py (sanitizer in _stream_openai before dispatch)
  - Behavior: Any stray `type: "text"` coerced to `input_text` (user/system) or `output_text` (assistant) with a WARNING log. Prevents OpenAI 400 invalid_value.
  - Verification: Launch/finalize conversation modal — no 400 responses; logs will show any coercions.

- STATUS (Response Chaining): Partial — Sanitizer in place. Follow-up tasks remain to thread chaining and reasoning-effort consistently through Luigi tasks (see action list below).

- ACTIONS REMAINING (high-level):
  - Ensure all Luigi tasks calling LLM use StructuredSimpleOpenAILLM with previous_response_id and reasoning_effort (env-driven) wired through.
  - Standardize logging levels for pipeline operations (INFO for start/end, WARN for fallbacks, ERROR for failures).
  - Close DB sessions reliably in all tasks (context managers or finally blocks).

---

**Errors Identified in the Luigi Pipeline Code**

1. **DeduplicateLeversTask Violation of Data Transformation Best Practices**  
   - **Issue**: DeduplicateLeversTask is marked as a non-LLM data transformation task (ǃDemocracy Undertakers Need Integrity) but uses LLM in its `run_inner` method (`EnrichPotentialLevers.execute`).  
   - **Fix**: Replace LLM logic with deterministic deduplication (e.g., JSON operations, sets) to avoid unnecessary LLM calls and ensure idempotency.

2. **Missing Task Dependency**  
   - **Issue**: `ApplyDiscountsMarkdownTask` is referenced in `ReportTask`/`CreatePitchTask` requires but is not defined in the codebase.  
   - **Fix**: Define the missing task or adjust dependencies to exclude it if redundant.

3. **Inconsistent Task Naming/Structure**  
   - **Issue**: WBS tasks like `CreateWBSLevel3Task` use filenames with lowercase `wbs_level3_raw.json` instead of the standard `WBS_` prefix used elsewhere.  
   - **Fix**: Standardize filenames to `WBS_` for consistency (e.g., `WBS_LEVEL3_RAW.json`).

4. **Improper Chaining of LLM Tasks**  
   - **Issue**: `CreateWBSLevel3Task` depends on `CreateWBSLevel2Task`, which itself depends on `CreateWBSLevel1Task`. This creates an implicit chain where errors in Level 1 cascade unchecked.  
   - **Fix**: Add validation at each level to ensure prerequisites are correctly formatted before proceeding.

5. **Database Connection Leaks**  
   - **Issue**: Tasks like `RedlineGateTask` open database sessions but may not close them reliably on exceptions (e.g., `db_service.close()` is called in `finally`, but exceptions in `update_llm_interaction` could bypass cleanup).  
   - **Fix**: Use context managers or ensure all transactions are explicitly committed or rolled back.

6. **Unresolved LLM Fallback Logic**  
   - **Issue**: The fallback mechanism for LLM models only retries the next model in the list `self.llm_models` but doesn't handle model-specific configuration failures (e.g., invalid API keys).  
   - **Fix**: Implement stricter model validation and retry logic with backoffs.

7. **Overly Complex Task Dependencies**  
   - **Issue**: Tasks like `QuestionsAndAnswersTask` and `PremortemTask` depend on 10+ upstream tasks, creating a brittle chain prone to partial failures.  
   - **Fix**: Split into smaller, modular pipelines or use conditional dependencies (e.g., `requires` blocks).

8. **Logging Level Misuse**  
   - **Issue**: Critical pipeline events (e.g., task start/end) are logged at `logger.error` instead of `logger.info`, reducing debuggability.  
   - **Fix**: Standardize logging levels (e.g., `INFO` for pipeline metadata).

9. **Stop Flag Not Reset on Restart**  
   - **Issue**: The stop flag (`PIPELINE_STOP_REQUESTED_FLAG`) is not cleared on pipeline restart, potentially preventing resumed runs.  
   - **Fix**: Add a reset mechanism in the entrypoint.

10. **Redundant LLM Calls in Data Collection**  
    - **Issue**: `DataCollectionTask` uses LLM to process document files but could aggregate simple resources deterministically.  
    - **Fix**: Replace LLM with rule-based parsing for static documents.

---

**Critical Fixes Summary**  
- **DeduplicateLeversTask**: Replace LLM logic with set-based deduplication.  
- **Dependencies**: Define missing tasks or correct references.  
- **WLBS/Task Naming**: Standardize filenames to `WBS_` format.  
- **Database Handling**: Use transaction boundaries and ensure proper cleanup.  
- **Error Propagation**: Ensure exceptions bubble up with context for upstream failure tracking.  
- **Logging**: Adjust log levels to `INFO` for pipeline operations.  
- **Stop Flag**: Implement flag reset logic during initialization.  

Implementing these fixes will improve reliability, observability, and adherence to Luigi best practices.

Looking at the code, I can identify several issues related to proper Responses API usage and chaining. Here are the main errors I found:

## Major Issues with Responses API and Chaining:

### 1. **Incorrect LLMExecutor Usage Pattern**
The current pattern in many tasks is flawed:
```python
def run_inner(self):
    llm_executor: LLMExecutor = self.create_llm_executor()
    
    def execute_function(llm: LLM) -> None:
        self.run_with_llm(llm)
    
    llm_executor.run(execute_function)
```

This doesn't properly utilize the new Responses API chaining. The correct pattern should be:

```python
def run_inner(self):
    llm_executor: LLMExecutor = self.create_llm_executor()
    
    def execute_function(llm: LLM) -> Any:  # Should return the result
        return self.run_with_llm(llm)  # Should return the result
    
    result = llm_executor.run(execute_function)  # Capture the result
    # Process the result as needed
```

### 2. **Missing Response Chaining in Task Implementations**
Many tasks don't properly chain responses. For example, in `PremiseAttackTask`:

```python
def run_inner(self):
    # ... setup code ...
    premise_attack = PremiseAttack.execute(llm_executor, plan_prompt)
    # Should be chaining the response properly
```

### 3. **Incorrect Callback Pattern**
The `_handle_task_completion` method and related callback infrastructure doesn't leverage the new Responses API for proper observability and chaining.

## Specific Issues in Key Areas:

### **PlanTask Class - Core Issues:**
1. **Line ~185**: The `run()` method catches `PipelineStopRequested` but doesn't properly chain responses
2. **Lines 193-215**: The `run_inner()` method doesn't follow proper Responses API patterns
3. **Lines 217-225**: The `run_with_llm()` method should return responses for proper chaining

### **Database Integration Issues:**
The database persistence code is good, but it's not properly integrated with the Responses API for observability. For example, in `RedlineGateTask` around line 287:

```python
# Track LLM interaction START (Phase 1.2)
logger.error(f"[PIPELINE] RedlineGateTask: About to create LLM interaction in database...")
# Should use Responses API to track this interaction
```

### **Error Handling Issues:**
The extensive use of `logger.error` with `[PIPELINE]` prefixes suggests the logging isn't properly integrated with the new observability features of the Responses API.

## Recommendations for Fixing:

1. **Update the LLMExecutor pattern** to properly chain responses
2. **Modify all `run_with_llm` methods** to return proper response objects
3. **Integrate database tracking** with the Responses API for proper observability
5. **Ensure proper exception handling** that maintains response chaining

The code shows a solid foundation but needs updates to leverage the new Responses API's chaining and observability features properly.