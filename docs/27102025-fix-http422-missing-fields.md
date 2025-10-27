# Fix HTTP 422 Error - Missing Fields in PlanResponse

## Objective
Fix HTTP 422 validation errors occurring when creating or retrieving plans by adding missing `reasoning_effort` field (and other missing fields) to PlanResponse constructions in three API endpoints.

## Root Cause
The `PlanResponse` Pydantic model (planexe_api/models.py:69-72) now requires `reasoning_effort` field, but three endpoints in planexe_api/api.py are not including it when constructing PlanResponse objects. This causes Pydantic validation failures resulting in HTTP 422 errors.

## Constraints
NO database schema changes. The `reasoning_effort` is a request parameter passed to the pipeline, NOT persisted state in the database.

## Files to Modify

- `planexe_api/api.py` - Add missing fields to three PlanResponse constructions
- `CHANGELOG.md` - Document the bug fix

## Implementation Tasks

### 1. Fix POST /api/plans endpoint (line 600-612)
Add `reasoning_effort` field to PlanResponse construction in the plan creation endpoint.

**Current code (lines 600-612):**
```python
return PlanResponse(
    plan_id=plan.plan_id,
    status=PlanStatus(plan.status),
    created_at=plan.created_at,
    prompt=plan.prompt,
    llm_model=plan.llm_model,
    speed_vs_detail=SpeedVsDetail(plan.speed_vs_detail),
    progress_percentage=plan.progress_percentage,
    progress_message=plan.progress_message,
    error_message=plan.error_message,
    output_dir=plan.output_dir,
    enriched_intake=enriched_intake_str
)
```

**Fix:** Add `reasoning_effort=request.reasoning_effort` to echo back the user's selection.

### 2. Fix GET /api/plans/{plan_id} endpoint (line 683-695)
Add `reasoning_effort` field to PlanResponse construction in the single plan retrieval endpoint.

**Current code (lines 683-695):**
```python
return PlanResponse(
    plan_id=plan.plan_id,
    status=PlanStatus(plan.status),
    created_at=plan.created_at,
    prompt=plan.prompt,
    llm_model=plan.llm_model,
    speed_vs_detail=SpeedVsDetail(plan.speed_vs_detail),
    progress_percentage=plan.progress_percentage,
    progress_message=plan.progress_message,
    error_message=plan.error_message,
    output_dir=plan.output_dir,
    enriched_intake=None  # Not returned in get_plan for simplicity
)
```

**Fix:** Add `reasoning_effort=RESPONSES_STREAMING_CONTROLS.reasoning_effort` to use the config default since the database doesn't store this field.

### 3. Fix GET /api/plans endpoint (line 1490-1499)
Add THREE missing fields to PlanResponse construction in the list all plans endpoint.

**Current code (lines 1490-1499):**
```python
return [
    PlanResponse(
        plan_id=plan.plan_id,
        status=PlanStatus(plan.status),
        created_at=plan.created_at,
        prompt=plan.prompt,
        progress_percentage=plan.progress_percentage,
        progress_message=plan.progress_message,
        error_message=plan.error_message,
        output_dir=plan.output_dir
    )
    for plan in plans
]
```

**Fix:** Add missing fields:
- `llm_model=plan.llm_model` (from database)
- `speed_vs_detail=SpeedVsDetail(plan.speed_vs_detail)` (from database)
- `reasoning_effort=RESPONSES_STREAMING_CONTROLS.reasoning_effort` (config default)

### 4. Update CHANGELOG.md
Add entry under version 0.9.10 documenting this bug fix in the "Fixed" section.

**Content to add:**
```markdown
- **PlanResponse Validation**: Fixed HTTP 422 errors caused by missing fields in API endpoint responses
  - Added reasoning_effort field to POST /api/plans, GET /api/plans/{plan_id}, and GET /api/plans endpoints
  - Added missing llm_model and speed_vs_detail fields to GET /api/plans endpoint
  - Endpoints now match PlanResponse schema requirements introduced in recent reasoning_effort propagation work
  - No database changes required - reasoning_effort uses config defaults for retrieval endpoints
```

## Integration Points

- Frontend PlanForm (planexe-frontend/src/components/PlanForm.tsx) sends reasoning_effort in create requests
- Frontend recovery page (planexe-frontend/src/app/recovery/page.tsx:608,610) expects reasoning_effort in responses
- All three endpoints return PlanResponse which frontend depends on for state management
- RESPONSES_STREAMING_CONTROLS config provides fallback defaults (planexe_api/config.py:46)

## Validation

Plan implementation complete. User will test by:
1. Creating new plan via POST /api/plans
2. Retrieving single plan via GET /api/plans/{plan_id}
3. Listing all plans via GET /api/plans
4. Verifying no HTTP 422 errors occur
5. Confirming reasoning_effort field appears in all responses
