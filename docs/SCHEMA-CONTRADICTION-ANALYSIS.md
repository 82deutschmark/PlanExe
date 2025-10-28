# Schema Contradiction Root Cause Analysis

## The Complete Timeline of Circular "Fixes"

### October 27, 2025 (v0.9.14): The First "Fix"
**Problem Observed:** LLM responses contained extra fields causing `ValidationError: Extra data` exceptions

**Developer Response:** Added `model_config = {'extra': 'allow'}` to 50+ models
- **What this does at runtime:** Pydantic accepts ANY extra fields beyond defined schema
- **What this does to JSON schema:** Advertises `"additionalProperties": true` to OpenAI
- **Actual effect:** Tells OpenAI "send whatever you want" while hiding validation errors

**CHANGELOG quote:**
> Added `model_config = {'extra': 'allow'}` to all Pydantic models used with structured LLM outputs to prevent pipeline failures

### October 28, 2025 (v0.10.1-0.10.8): The Contradictory "Fix"
**Problem Observed:** OpenAI Responses API rejected schemas with:
```
HTTP 400: 'additionalProperties' is required to be supplied and to be false
```

**Developer Response:** Started manually adding `json_schema_extra={"additionalProperties": False}` to models
- **Critical mistake:** Changed to `extra='forbid'` + `json_schema_extra` on SOME models
- **What this does:** Forces schema to say "no extras allowed" 
- **The contradiction:** Now runtime behavior doesn't match what was originally needed

**CHANGELOG quotes:**
> Fixed multiple Pydantic models to emit `additionalProperties: false` in their JSON schemas

> Fixed ALL remaining Pydantic models to restore end-to-end pipeline functionality

## The Fundamental Contradiction

### What v0.9.14 Created
```python
class MyModel(BaseModel):
    field1: str
    model_config = {'extra': 'allow'}  # Runtime: accept anything
```
- **Runtime validator:** Accepts `{"field1": "x", "surprise_field": "ignored"}`
- **JSON Schema sent to OpenAI:** `{"additionalProperties": true, ...}`
- **OpenAI behavior:** May return extra fields, runtime silently accepts them

### What v0.10.x Changed It To
```python
class MyModel(BaseModel):
    field1: str
    model_config = ConfigDict(
        extra='forbid',  # Runtime: reject extras
        json_schema_extra={"additionalProperties": False}  # Schema: no extras
    )
```
- **Runtime validator:** Rejects `{"field1": "x", "surprise_field": "error!"}`
- **JSON Schema sent to OpenAI:** `{"additionalProperties": false, ...}`
- **OpenAI behavior:** Restricted to exact schema
- **The problem:** If LLM DOES return extra fields, runtime validation fails again!

## Current State: Inconsistent Codebase

**Models with `extra='forbid'` + `json_schema_extra` (41+ files):**
- All team modules
- All planning/WBS modules  
- All governance modules
- Most strategic/lever modules

**Models STILL with `extra='allow'` (15+ files):**
- `diagnostics/premise_attack.py`
- `diagnostics/premortem.py`
- `diagnostics/redline_gate.py`
- `diagnostics/experimental_premise_attack*.py`
- `document/identify_documents.py`
- `document/filter_documents_to_*.py`
- `document/draft_document_to_*.py`
- `expert/expert_criticism.py`
- `expert/expert_finder.py`

## Why This Is a Circular Problem

1. **LLMs naturally produce some variability** in their outputs
2. **v0.9.14 response:** "Let's accept everything!" (`extra='allow'`)
3. **OpenAI Responses API:** "No, your schema must be strict" (rejects `additionalProperties: true`)
4. **v0.10.x response:** "Fine, let's be strict!" (`extra='forbid'`)
5. **Future inevitable problem:** LLM returns something slightly off-schema → validation error
6. **Next "fix":** Switch back to permissive? We're in a loop.

## The Missing Architecture

### What Should Exist But Doesn't

#### 1. **Automatic Schema Enforcement (Already Exists!)**
```python
# This ALREADY runs on every schema in simple_openai_llm.py:362
enforced_schema = _enforce_openai_schema_requirements(schema_copy)
```
- Automatically adds `additionalProperties: false` to ALL object types
- Inlines `$defs` for OpenAI compatibility
- Makes all properties required

**The manual `json_schema_extra` is REDUNDANT** — the enforcement function already does this!

#### 2. **What's Actually Missing**

**A. Schema-Runtime Agreement Policy:**
```python
# Define ONCE what your policy is:
SCHEMA_POLICY = "strict"  # or "permissive"

if SCHEMA_POLICY == "strict":
    # All models use extra='forbid'
    # Schema advertises additionalProperties: false
    # OpenAI constrained, runtime validation strict
    
elif SCHEMA_POLICY == "permissive":
    # Models use extra='allow' or custom validator
    # DON'T send to OpenAI Responses API (not compatible)
    # Use regular chat completion instead
```

**B. Schema Validation Test Suite:**
```python
def test_all_schemas_openai_compatible():
    """Run BEFORE any API call to catch incompatibilities."""
    for model_class in get_all_pipeline_models():
        schema = model_class.model_json_schema()
        enforced = _enforce_openai_schema_requirements(schema)
        
        # Verify it's valid JSON Schema
        jsonschema.Draft7Validator.check_schema(enforced)
        
        # Verify OpenAI accepts it (dry run)
        try:
            client.responses.create(
                model="gpt-4o-mini",
                input=[{"role": "user", "content": "test"}],
                text={"format": {"type": "json_schema", "schema": enforced, "strict": True}},
                stream=False
            )
        except InvalidRequestError as e:
            pytest.fail(f"{model_class.__name__} schema rejected: {e}")
```

**C. Discriminated Unions for Flexibility:**
```python
# When you NEED multiple response types:
class ResponseA(BaseModel):
    type: Literal["success"] = "success"
    data: str
    
class ResponseB(BaseModel):
    type: Literal["error"] = "error"
    message: str

# Discriminated union - both Pydantic and OpenAI can parse
Response = Annotated[Union[ResponseA, ResponseB], Field(discriminator="type")]
```

## Recommendations

### Immediate (Stop the Loop)

1. **Choose ONE policy:**
   - **Option A (Recommended):** Full strict mode — `extra='forbid'`, use Responses API
   - **Option B:** Permissive mode — `extra='allow'`, DON'T use Responses API structured outputs

2. **Remove ALL manual `json_schema_extra`:**
   - The automatic enforcement already handles this
   - 41 files have redundant configuration
   - Creates false sense that manual intervention is needed

3. **Apply policy consistently:**
   - If strict: Change ALL remaining `extra='allow'` to `extra='forbid'`
   - If permissive: Remove Responses API calls, use chat completion

### Medium Term (Prevent Recurrence)

4. **Add schema validation CI tests:**
   - Test that all models pass `_enforce_openai_schema_requirements`
   - Dry-run every schema against OpenAI Responses API
   - Catch incompatibilities before deployment

5. **Centralize model configuration:**
   ```python
   # planexe/llm_util/base_response_model.py
   class StrictResponseModel(BaseModel):
       """Base class for all Responses API models."""
       model_config = ConfigDict(extra='forbid')
       # No json_schema_extra needed - enforcement handles it
   
   # Then all models inherit:
   class MyTaskResponse(StrictResponseModel):
       field1: str
       field2: int
   ```

6. **Document the architecture:**
   - Explain that `_enforce_openai_schema_requirements` exists
   - Show developers they DON'T need manual fixes
   - Explain when to use strict vs permissive modes

### Long Term (Architectural Hygiene)

7. **Add discriminated unions where needed:**
   - For tasks that genuinely need multiple response types
   - Properly structured so both OpenAI and Pydantic understand

8. **Monitor LLM output compliance:**
   - Track how often LLM responses require fallback parsing
   - If frequent, the prompts may need tuning
   - Or the schema may be too strict for the task

## The Core Insight

**You cannot have both:**
- Runtime validation that accepts anything (`extra='allow'`)
- JSON schema that promises strict adherence (`additionalProperties: false`)

**Pick one. Enforce it everywhere. Stop flip-flopping.**

The automatic enforcement in `simple_openai_llm.py` already does the heavy lifting. 
The manual changes to 90+ models are symptoms of not understanding that the infrastructure already works.

## Evidence

See `test_schema_enforcement.py` for proof that automatic enforcement works correctly without any manual `json_schema_extra` configuration.
