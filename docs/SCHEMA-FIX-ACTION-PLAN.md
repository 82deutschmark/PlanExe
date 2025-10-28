# Schema Architecture Fix - Action Plan

## Executive Summary

**Problem:** Circular "fixes" between permissive (`extra='allow'`) and strict (`extra='forbid'`) validation, with 90+ redundant manual schema configurations.

**Root Cause:** Developer unaware that `_enforce_openai_schema_requirements()` automatically handles OpenAI schema compliance.

**Solution:** Adopt unified strict policy, remove redundant configurations, add automated tests.

## Phase 1: Immediate Stabilization (Priority: CRITICAL)

### 1.1 Choose Validation Policy

**DECISION REQUIRED:** Pick ONE and document it.

**Option A: Strict Mode (RECOMMENDED)**
```python
# All models use:
model_config = ConfigDict(extra='forbid')
# NO json_schema_extra needed
```
- **Pros:** Full OpenAI Responses API compatibility, predictable validation
- **Cons:** Must ensure LLM prompts guide to exact schema
- **When to use:** Production pipeline with well-tested prompts

**Option B: Permissive Mode**
```python
# All models use:
model_config = ConfigDict(extra='allow')
# DON'T use Responses API structured outputs
```
- **Pros:** Tolerates LLM variability, fewer validation errors
- **Cons:** Can't use Responses API structured outputs, lose type safety
- **When to use:** Experimental/rapid prototyping phases

**RECOMMENDATION:** Choose **Strict Mode** for production. The pipeline already works with it.

### 1.2 Remove Redundant Configurations

**Files to clean up (41 files):**

Remove `json_schema_extra={"additionalProperties": False}` from:
- `planexe/team/*.py` (5 files)
- `planexe/governance/*.py` (6 files)  
- `planexe/plan/*.py` (11 files)
- `planexe/lever/*.py` (8 files)
- `planexe/assume/*.py` (8 files)
- `planexe/swot/*.py` (1 file)
- `planexe/questions_answers/*.py` (1 file)
- `planexe/pitch/*.py` (1 file)

**Before:**
```python
class MyModel(BaseModel):
    field1: str
    model_config = ConfigDict(extra='forbid', json_schema_extra={"additionalProperties": False})
```

**After:**
```python
class MyModel(BaseModel):
    field1: str
    model_config = ConfigDict(extra='forbid')
```

**Why:** The `_enforce_openai_schema_requirements()` function already adds `additionalProperties: false` automatically (proven by `test_schema_enforcement.py`).

### 1.3 Fix Inconsistent Models

**Files with `extra='allow'` to fix (15 files):**

Change from permissive to strict:
- `planexe/diagnostics/premise_attack.py`
- `planexe/diagnostics/premortem.py`
- `planexe/diagnostics/redline_gate.py`
- `planexe/diagnostics/experimental_premise_attack*.py` (4 files)
- `planexe/document/identify_documents.py`
- `planexe/document/filter_documents_to_*.py` (2 files)
- `planexe/document/draft_document_to_*.py` (2 files)
- `planexe/expert/expert_criticism.py`
- `planexe/expert/expert_finder.py`

**Change:**
```python
# OLD (v0.9.14 permissive fix)
model_config = {'extra': 'allow'}

# NEW (unified strict policy)
model_config = ConfigDict(extra='forbid')
```

## Phase 2: Architectural Improvements (Priority: HIGH)

### 2.1 Create Base Response Model

**File:** `planexe/llm_util/base_response_model.py`

```python
"""
Author: Cascade
Date: 2025-10-28
PURPOSE: Base class for all OpenAI Responses API models with unified validation policy.
SRP and DRY check: Pass. Centralizes model configuration to prevent inconsistencies.
"""
from pydantic import BaseModel, ConfigDict

class StrictResponseModel(BaseModel):
    """
    Base class for all Pydantic models used with OpenAI Responses API.
    
    Enforces strict validation:
    - extra='forbid': Runtime rejects any fields not in schema
    - Automatic schema enforcement adds additionalProperties: false
    
    DO NOT manually add json_schema_extra - it's redundant and handled automatically
    by _enforce_openai_schema_requirements() in simple_openai_llm.py.
    """
    model_config = ConfigDict(
        extra='forbid',
        # Improve error messages for better debugging
        str_strip_whitespace=True,
        validate_assignment=True
    )
```

**Usage in task models:**
```python
from planexe.llm_util.base_response_model import StrictResponseModel

class MyTaskResponse(StrictResponseModel):  # Inherit, don't redefine config
    field1: str
    field2: int
    # No model_config needed - inherited from base
```

### 2.2 Add Schema Validation Tests

**File:** `planexe/llm_util/tests/test_schema_compliance.py`

```python
"""Test that all pipeline models generate OpenAI-compatible schemas."""
import pytest
from pydantic import BaseModel
from planexe.llm_util.simple_openai_llm import _enforce_openai_schema_requirements
import jsonschema

# Discover all response models
def get_all_pipeline_models() -> list[type[BaseModel]]:
    """Scan codebase for all Pydantic models used with as_structured_llm()."""
    # Implementation: Use importlib to discover models
    pass

@pytest.mark.parametrize("model_class", get_all_pipeline_models())
def test_schema_openai_compatible(model_class):
    """Verify each model generates a valid OpenAI Responses schema."""
    schema = model_class.model_json_schema()
    enforced = _enforce_openai_schema_requirements(schema)
    
    # Test 1: Valid JSON Schema Draft 7
    try:
        jsonschema.Draft7Validator.check_schema(enforced)
    except jsonschema.SchemaError as e:
        pytest.fail(f"{model_class.__name__} produces invalid JSON Schema: {e}")
    
    # Test 2: Has required OpenAI properties
    assert enforced.get("type") == "object", f"{model_class.__name__} must be object type"
    assert enforced.get("additionalProperties") == False, \
        f"{model_class.__name__} must have additionalProperties=false"
    
    # Test 3: No $defs remaining (should be inlined)
    assert "$defs" not in enforced, \
        f"{model_class.__name__} has un-inlined $defs references"

def test_no_manual_json_schema_extra():
    """Ensure no models have redundant json_schema_extra configuration."""
    import ast
    import pathlib
    
    violations = []
    for py_file in pathlib.Path("planexe").rglob("*.py"):
        content = py_file.read_text()
        if 'json_schema_extra' in content and 'additionalProperties' in content:
            violations.append(py_file)
    
    assert not violations, \
        f"Found redundant json_schema_extra in: {violations}\n" \
        f"Remove these - automatic enforcement handles it!"

def test_consistent_extra_policy():
    """Ensure all models use the same extra validation policy."""
    # Scan all models and verify they use ConfigDict(extra='forbid')
    # No models should have {'extra': 'allow'} unless explicitly documented
    pass
```

### 2.3 Add CI/CD Schema Validation

**File:** `.github/workflows/schema-validation.yml` (if using GitHub Actions)

```yaml
name: Schema Validation

on: [push, pull_request]

jobs:
  validate-schemas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest jsonschema
      
      - name: Run schema compliance tests
        run: pytest planexe/llm_util/tests/test_schema_compliance.py -v
```

## Phase 3: Documentation & Process (Priority: MEDIUM)

### 3.1 Update Developer Guidelines

**File:** `docs/DEVELOPER-GUIDE-PYDANTIC-MODELS.md`

```markdown
# Pydantic Models for OpenAI Responses API

## Quick Start

**Use the base class:**
```python
from planexe.llm_util.base_response_model import StrictResponseModel

class YourTaskResponse(StrictResponseModel):
    field1: str
    field2: int
    # That's it! No model_config needed.
```

## Why This Works

1. **Automatic Schema Enforcement:** `_enforce_openai_schema_requirements()` in 
   `simple_openai_llm.py` automatically adds `additionalProperties: false` to ALL
   schemas before sending to OpenAI.

2. **No Manual Configuration:** Don't add `json_schema_extra` - it's redundant.

3. **Consistent Validation:** All models use `extra='forbid'` for predictable behavior.

## Common Mistakes to Avoid

### ❌ DON'T: Manually add json_schema_extra
```python
model_config = ConfigDict(
    extra='forbid',
    json_schema_extra={"additionalProperties": False}  # REDUNDANT!
)
```

### ✅ DO: Just inherit from base class
```python
class MyResponse(StrictResponseModel):
    field: str
```

### ❌ DON'T: Mix permissive and strict policies
```python
# Causes schema/runtime mismatch
model_config = {'extra': 'allow'}  # Runtime accepts anything
# But schema says additionalProperties: false
```

### ✅ DO: Use consistent strict policy
```python
# Runtime and schema agree
model_config = ConfigDict(extra='forbid')
```

## When You Need Flexibility

If your task genuinely needs to accept variable LLM outputs, use **discriminated unions**:

```python
from typing import Literal, Union
from pydantic import Field
from typing_extensions import Annotated

class SuccessResponse(StrictResponseModel):
    type: Literal["success"] = "success"
    data: str

class ErrorResponse(StrictResponseModel):
    type: Literal["error"] = "error"
    message: str

# Both Pydantic and OpenAI can parse this
TaskResponse = Annotated[
    Union[SuccessResponse, ErrorResponse], 
    Field(discriminator="type")
]
```

## Testing Your Models

Before committing, run:
```bash
pytest planexe/llm_util/tests/test_schema_compliance.py -v
```

This ensures your model generates OpenAI-compatible schemas.
```

### 3.2 Update Architecture Documentation

**File:** `AGENTS.md` - Add section on schema handling

```markdown
## Schema Handling Architecture

### Automatic Enforcement
All Pydantic schemas are automatically processed by `_enforce_openai_schema_requirements()`
before being sent to the OpenAI Responses API. This function:

1. Adds `additionalProperties: false` to all object types
2. Inlines `$defs` references for OpenAI compatibility  
3. Ensures all properties are marked as required

**Location:** `planexe/llm_util/simple_openai_llm.py` lines 50-139

### Model Configuration Policy
- **Runtime validation:** `extra='forbid'` (reject unknown fields)
- **Schema advertisement:** `additionalProperties: false` (automatic)
- **Base class:** `StrictResponseModel` in `planexe/llm_util/base_response_model.py`

### What Developers Should Know
- **Don't manually add `json_schema_extra`** - it's handled automatically
- **Do inherit from `StrictResponseModel`** - ensures consistency
- **Do test your schemas** - run `test_schema_compliance.py`
```

## Phase 4: Monitoring & Maintenance (Priority: LOW)

### 4.1 Add Runtime Metrics

Track how often LLM responses fail validation:

```python
# In llm_executor.py or simple_openai_llm.py
class SchemaComplianceMetrics:
    """Track LLM output compliance with expected schemas."""
    
    @staticmethod
    def record_validation_error(model_name: str, error: ValidationError):
        """Log when LLM output fails Pydantic validation."""
        logger.warning(
            f"LLM output failed validation for {model_name}: {error}",
            extra={"metric": "schema_validation_failure"}
        )
    
    @staticmethod
    def record_successful_parse(model_name: str):
        """Log successful schema parsing."""
        logger.debug(
            f"LLM output successfully parsed for {model_name}",
            extra={"metric": "schema_validation_success"}
        )
```

### 4.2 Quarterly Review Process

Add to `docs/MAINTENANCE-CHECKLIST.md`:

```markdown
## Quarterly Schema Health Check

### 1. Review Validation Metrics
- Check logs for `schema_validation_failure` incidents
- If > 5% failure rate for any model, investigate:
  - Is the prompt unclear?
  - Is the schema too strict?
  - Does the model need discriminated unions?

### 2. Verify Schema Consistency
```bash
# Run compliance tests
pytest planexe/llm_util/tests/test_schema_compliance.py -v

# Check for policy violations
grep -r "extra.*allow" planexe/ --include="*.py"
grep -r "json_schema_extra.*additionalProperties" planexe/ --include="*.py"
```

### 3. Update Documentation
- Ensure new models use `StrictResponseModel`
- Document any exceptions to strict policy
- Keep `DEVELOPER-GUIDE-PYDANTIC-MODELS.md` current
```

## Success Metrics

### Phase 1 Complete When:
- [ ] All 41 files have redundant `json_schema_extra` removed
- [ ] All 15 inconsistent models use `extra='forbid'`
- [ ] `test_schema_enforcement.py` passes
- [ ] No schema-related pipeline failures for 1 week

### Phase 2 Complete When:
- [ ] `StrictResponseModel` base class exists
- [ ] `test_schema_compliance.py` test suite passes
- [ ] CI/CD runs schema validation automatically
- [ ] 80% of models inherit from base class

### Phase 3 Complete When:
- [ ] `DEVELOPER-GUIDE-PYDANTIC-MODELS.md` published
- [ ] `AGENTS.md` updated with schema section
- [ ] Team trained on new standards
- [ ] No new violations introduced for 1 month

### Phase 4 Complete When:
- [ ] Metrics dashboard tracks validation failures
- [ ] Quarterly review process documented
- [ ] 3 months of stable schema operations

## Estimated Timeline

- **Phase 1:** 2-3 days (cleanup + stabilization)
- **Phase 2:** 3-5 days (architecture + testing)
- **Phase 3:** 2-3 days (documentation)
- **Phase 4:** Ongoing maintenance

**Total:** ~2 weeks to full architectural improvement

## Risk Mitigation

### Risk: Changing `extra='allow'` → `extra='forbid'` breaks working models

**Mitigation:**
1. Test each model after change with actual LLM calls
2. Keep detailed logs of validation errors
3. Have rollback plan (git revert)
4. Change in batches, monitor each batch

### Risk: Removing `json_schema_extra` causes regressions

**Mitigation:**
1. Run `test_schema_enforcement.py` to prove it's redundant FIRST
2. Remove in stages (10 files at a time)
3. Monitor pipeline health after each stage
4. Schema enforcement function is already working (proven)

### Risk: Team reverts to old patterns

**Mitigation:**
1. Automated tests catch violations (`test_no_manual_json_schema_extra`)
2. CI/CD blocks PRs that violate policy
3. Clear documentation shows the RIGHT way
4. Code reviews enforce standards

## Conclusion

This action plan transforms chaotic circular "fixes" into a coherent, testable architecture. 
The key insight: **automatic enforcement already works** - we just need to stop fighting it 
with manual contradictory configurations.
