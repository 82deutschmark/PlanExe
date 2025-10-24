# Luigi Pipeline Response Chaining Implementation

**Author:** Cascade (Current Implementation)
**Date:** 2025-10-24
**Status:** Ready for Implementation
**Priority:** Critical - Required for full response chaining compliance

---

## Problem Summary

The Luigi pipeline tasks are using llama-index's `as_structured_llm()` interface, which makes direct OpenAI API calls that bypass the response chaining implemented in `SimpleOpenAILLM`. This means:

1. **Response ID Chaining Broken**: Pipeline tasks don't include `previous_response_id` in API calls
2. **Reasoning Effort Ignored**: Pipeline tasks don't use the configurable `reasoning_effort` from plan settings
3. **Database Persistence Missing**: Response IDs from pipeline tasks aren't stored for chaining

## Root Cause Analysis

**Current Flow (Broken):**
```
Plan Creation → Database stores reasoning_effort 
              → Environment variables set for subprocess
              → Luigi tasks call llm.as_structured_llm() 
              → llama-index makes direct OpenAI API calls (no chaining)
```

**Required Flow (Target):**
```
Plan Creation → Database stores reasoning_effort
              → Environment variables set for subprocess  
              → Luigi tasks read reasoning_effort from env
              → Luigi tasks get previous_response_id from database
              → Luigi tasks call sllm.chat(previous_response_id=..., reasoning_effort=...)
              → StructuredSimpleOpenAILLM passes parameters to SimpleOpenAILLM
              → SimpleOpenAILLM includes parameters in OpenAI API calls
```

## Implementation Requirements

### 1. PipelineEnvironment Integration ✅ (Partially Complete)
- ✅ Added `REASONING_EFFORT` to `PipelineEnvironmentEnum`
- ✅ Added `reasoning_effort` field to `PipelineEnvironment` dataclass
- ✅ Updated `from_env()` method to read `REASONING_EFFORT` environment variable
- ✅ Updated pipeline execution service to set `REASONING_EFFORT` environment variable

### 2. Database Access for Response Chaining
- [ ] Add database service access to Luigi pipeline context
- [ ] Implement `get_previous_response_id(plan_id)` function for pipeline tasks
- [ ] Ensure database connection works in Luigi subprocess environment

### 3. Luigi Task Updates Required

#### A. Environment Variable Access
All Luigi tasks that make LLM calls need to:
```python
from planexe.plan.pipeline_environment import PipelineEnvironment

# Get reasoning effort from environment
env = PipelineEnvironment.from_env()
reasoning_effort = env.reasoning_effort or "medium"
```

#### B. Database Access for Response Chaining
```python
from planexe_api.database import DatabaseService, SessionLocal

# Get previous response ID from database
db = SessionLocal()
db_service = DatabaseService(db)
response_id_store = ResponseIDStore(db_service)
previous_response_id = await response_id_store.get_response_id(plan_id)
db.close()
```

#### C. LLM Call Updates
All `sllm.chat()` calls need to be updated:
```python
# Before (broken)
chat_response = sllm.chat(chat_message_list)

# After (with chaining)
chat_response = sllm.chat(
    chat_message_list,
    previous_response_id=previous_response_id,
    reasoning_effort=reasoning_effort
)
```

## Files Requiring Updates

### Core Pipeline Infrastructure
- [ ] `planexe/plan/pipeline_environment.py` ✅ (Updated - reasoning effort support added)
- [ ] `planexe_api/services/pipeline_execution_service.py` ✅ (Updated - environment variable set)
- [ ] Add database access utilities for Luigi subprocess

### Luigi Task Updates Required

#### Assume Module (`planexe/assume/`)
- [ ] `identify_purpose.py` - Update LLM calls with chaining parameters
- [ ] `make_assumptions.py` - Update LLM calls with chaining parameters  
- [ ] `identify_risks.py` - Update LLM calls with chaining parameters
- [ ] `distill_assumptions.py` - Update LLM calls with chaining parameters
- [ ] `review_assumptions.py` - Update LLM calls with chaining parameters
- [ ] `currency_strategy.py` - Update LLM calls with chaining parameters
- [ ] `physical_locations.py` - Update LLM calls with chaining parameters
- [ ] `shorten_markdown.py` - Update LLM calls with chaining parameters

#### Document Module (`planexe/document/`)
- [ ] All files in document module - Update LLM calls with chaining parameters

#### Governance Module (`planexe/governance/`)
- [ ] All governance phase files - Update LLM calls with chaining parameters

#### Lever Module (`planexe/lever/`)
- [ ] All lever module files - Update LLM calls with chaining parameters

#### Plan Module (`planexe/plan/`)
- [ ] All plan module files - Update LLM calls with chaining parameters

#### Other Modules
- [ ] `expert/` - All expert module files
- [ ] `fiction/` - All fiction module files  
- [ ] `pitch/` - All pitch module files
- [ ] `questions_answers/` - All Q&A module files
- [ ] `schedule/` - All schedule module files
- [ ] `swot/` - All SWOT module files
- [ ] `team/` - All team module files
- [ ] `wbs/` - All WBS module files

## Implementation Strategy

### Phase 1: Infrastructure Setup
1. ✅ Add database access utilities for Luigi subprocess
2. ✅ Create helper functions for getting reasoning effort and previous response ID
3. ✅ Update pipeline environment to pass reasoning effort

### Phase 2: Task-by-Task Updates  
1. **Identify all LLM calls**: Search codebase for `as_structured_llm()` and `chat()` calls
2. **Update pattern**: For each task, add environment variable reading and database access
3. **Test incrementally**: Update one module at a time and test response chaining

### Phase 3: Verification
1. **Test response chaining**: Verify multi-turn conversations maintain context
2. **Test reasoning effort**: Verify different effort levels produce different results
3. **Test database persistence**: Verify response IDs survive restarts

## Technical Challenges

### 1. Database Access in Luigi Subprocess
- **Issue**: Luigi runs in subprocess, needs database access for response chaining
- **Solution**: Pass DATABASE_URL environment variable and create database sessions in tasks

### 2. Plan Context Access
- **Issue**: Luigi tasks need to know the plan_id to get reasoning effort and previous response ID
- **Solution**: Pass plan_id as environment variable or derive from run directory structure

### 3. Response ID Storage Location
- **Issue**: Where to store response IDs from pipeline tasks for chaining
- **Solution**: Use existing `llm_interactions` table in database

## Testing Approach

### Unit Tests
- Test individual task LLM calls with response chaining parameters
- Test environment variable reading
- Test database response ID retrieval

### Integration Tests  
- Test full pipeline execution with response chaining
- Test reasoning effort configuration end-to-end
- Test response ID persistence across task boundaries

### Manual Testing
- Run pipeline with different reasoning effort levels
- Verify response IDs are stored in database
- Check OpenAI API calls include previous_response_id

## Success Criteria

1. **All LLM calls include response chaining**: Every OpenAI API call includes `previous_response_id`
2. **Reasoning effort respected**: Different effort levels produce measurably different results
3. **Database persistence**: Response IDs survive pipeline restarts and are available for chaining
4. **Backward compatibility**: Existing functionality continues to work
5. **Performance**: No significant performance degradation from database lookups

## Risk Assessment

**High Risk**: Database connection issues in Luigi subprocess could cause pipeline failures
**Medium Risk**: Environment variable passing might fail in some deployment scenarios  
**Low Risk**: Response chaining parameters might be ignored by some LLM calls

## Rollback Plan

If implementation causes issues:
1. Revert PipelineEnvironment changes
2. Remove response chaining parameters from task calls
3. Fall back to original llama-index direct API calls
4. Document any remaining response chaining gaps

---

## Next Steps

1. **Immediate**: Complete infrastructure setup (database access, environment variables)
2. **Week 1**: Update assume/ module tasks (8 files)
3. **Week 2**: Update document/ and governance/ modules  
4. **Week 3**: Update remaining modules (lever/, plan/, etc.)
5. **Week 4**: Integration testing and performance validation

**Estimated Timeline**: 3-4 weeks for complete implementation
**Testing Time**: 1 week for verification
**Total Effort**: 4-5 weeks for full completion
