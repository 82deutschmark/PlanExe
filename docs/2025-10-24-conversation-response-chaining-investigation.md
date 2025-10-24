# Conversation Response Chaining Investigation - "type: 'text'" Error

**Date**: 2025-10-24
**Status**: INVESTIGATING - Root cause suspected but not yet isolated
**Priority**: CRITICAL - Blocks conversation modal functionality

---

## Executive Summary

The conversation modal broke after commit `b15e936` (Oct 23, 2025) which implemented response chaining. The `ui2` branch (commit `3f0d8bd`) works perfectly, but `staging` throws a 400 error from OpenAI complaining about invalid content type `'text'` instead of `'input_text'`.

**Key Finding**: The normalization code itself is identical between working (ui2) and broken (staging) branches. The bug was introduced by the response chaining implementation, likely through an unexpected interaction between `previous_response_id` injection and message serialization.

---

## Error Details

### OpenAI API Error Response
```
Error code: 400 - {
  'error': {
    'message': "Invalid value: 'text'. Supported values are: 'input_text', 'input_image', 'output_text', 'refusal', 'input_file', 'computer_screenshot', and 'summary_text'.",
    'type': 'invalid_request_error',
    'param': 'input[0].content[0].type',
    'code': 'invalid_value'
  }
}
```

### Location
- Frontend: `useResponsesConversation.ts` line 279 (during streaming conversation turn)
- Backend: `planexe_api/services/conversation_service.py` → `_execute_stream()` → OpenAI Responses API

---

## Timeline of Changes

### Working State: ui2 Branch (commit 3f0d8bd)
- ✅ Conversation modal works flawlessly
- ✅ No response chaining logic present
- ✅ Messages normalized correctly
- ✅ All OpenAI API calls succeed

### Breaking Commits on staging Branch

1. **commit b15e936** - "feat: complete reasoning effort and response chaining implementation" (Oct 23, 21:55)
   - Added `previous_response_id` and `reasoning_effort` parameters to LLM methods
   - Modified: `simple_openai_llm.py`, `conversation_service.py`, `analysis_stream_service.py`

2. **commit 2d56dd0** - "Responses and Reasoning Fixes" (Oct 23, 21:36)
   - Added auto-injection of `previous_response_id` from database
   - Modified: `conversation_service.py` (lines 100-111)
   - Added `ResponseIDStore` class for tracking response IDs

3. **commit c6164d2** - "Fixes" (Oct 23, 22:10)
   - Extracted `ResponseIDStore` into separate file to avoid circular imports
   - Refactoring only, no functional changes

---

## Code Analysis

### Normalization Logic (IDENTICAL in both branches)

**File**: `planexe/llm_util/simple_openai_llm.py`

```python
def _normalize_content(content: Any, *, role: str = "user") -> List[Dict[str, Any]]:
    text_type = "output_text" if role == "assistant" else "input_text"

    if isinstance(content, str):
        return [{"type": text_type, "text": content}]

    if isinstance(content, dict):
        return [_coerce_content_dict(content, role=role)]

    if isinstance(content, list):
        normalized: List[Dict[str, Any]] = []
        for item in content:
            if isinstance(item, dict):
                normalized.append(_coerce_content_dict(item, role=role))
            elif isinstance(item, str):
                normalized.append({"type": text_type, "text": item})
            else:
                normalized.append({"type": text_type, "text": str(item)})
        return normalized

    return [{"type": text_type, "text": str(content)}]
```

**This code is IDENTICAL** between ui2 and staging. The bug is NOT in the normalization function itself.

### Response Chaining Logic (NEW in staging)

**File**: `planexe_api/services/conversation_service.py` (lines 100-111)

```python
# Automatically include previous response ID if not explicitly provided
if not request.previous_response_id:
    # Get database service for response ID lookup
    db = SessionLocal()
    try:
        db_service = DatabaseService(db)
        response_id_store = ResponseIDStore(db_service)
        previous_response_id = await response_id_store.get_response_id(conversation_id)
        if previous_response_id:
            print(f"INFO: Chaining turn with previous_response_id={previous_response_id}")
            request = request.model_copy(update={"previous_response_id": previous_response_id})
    finally:
        db.close()
```

**This is the PRIMARY suspect.** When `previous_response_id` is injected, something downstream may behave differently.

---

## Hypothesis: Common Failure Patterns

Based on research into OpenAI Responses API response chaining, these are the typical ways `type: "text"` errors are introduced:

### Pattern 1: Conditional Normalization Based on previous_response_id
When `previous_response_id` is present, a normalization layer may skip or alter its behavior, incorrectly mapping:
```python
# WRONG
{text: "..."} → {type: "text"}

# CORRECT
{text: "..."} → {type: "input_text"}
```

### Pattern 2: Reposting Assistant Outputs as Inputs
If code tries to "rebuild conversation history" by including prior assistant responses in the `input` array:
```python
# WRONG - includes assistant output in input
input = [
    {"type": "output_text", "text": "previous assistant response"},  # ❌ assistant output
    {"type": "input_text", "text": "new user message"}
]

# CORRECT - only new user message
input = [
    {"type": "input_text", "text": "new user message"}
]
```

### Pattern 3: SDK Shorthand Mixing
Mixing SDK shorthand (plain strings) with explicit item arrays when `previous_response_id` is present may cause divergent coercion paths.

### Pattern 4: Misplaced Request Parameters
Attaching `reasoning_effort` or other per-request fields inside an item dict triggers fallback parsing that drops proper typing.

### Pattern 5: Cross-Conversation previous_response_id
Passing a `previous_response_id` from a different `conversation_id` causes the server to ignore it, potentially triggering client fallback to legacy message assembly.

---

## Response Chaining Contract (Correct Behavior)

### Chain Model
1. One conversation per project
2. Each turn saves `last_response_id`
3. Next turn references that with `previous_response_id = last_response_id`
4. **DO NOT resend prior assistant outputs** - server resolves context from `conversation_id` + `previous_response_id`

### Content-Typing Rules
- User inputs MUST be `type: "input_text"` (or `input_image`, `input_audio`, etc.)
- Assistant outputs are `type: "output_text"`
- **NEVER send `type: "text"` in inputs**
- If you have a raw string, coerce it to `input_text`, not `text`
- Do NOT inject prior assistant `output_text` back into `input`

### Turn Loop (Request/Response Lifecycle)
1. User acts: collect only the NEW user message
2. Build: `input = [{"type": "input_text", "text": "..."}]`
3. Call Responses API with:
   - `conversation_id`
   - `previous_response_id = last_response_id`
   - `input = [...]` (new user content only)
   - `reasoning_effort` at request level (NOT inside content)
4. Save `response.id` → becomes new `last_response_id`
5. Repeat. Never rebuild full history on client.

### Memory Hygiene
- Never pipe assistant `output_text` directly into `input`
- Summaries or vector store notes are NEW `input_text` items authored by user/app

---

## Diagnostic Tools Added

### 1. Request Build Logging
**File**: `planexe_api/services/conversation_service.py` (lines 484-509)

```python
print(f"\n\n========== BUILDING REQUEST ARGS FOR CONVERSATION {conversation_id} ==========")
print(f"User message: {request.user_message[:100]}")
print(f"Previous response ID: {request.previous_response_id}")

input_segments = SimpleOpenAILLM.normalize_input_messages(
    [{"role": "user", "content": request.user_message}]
)

print(f"Normalized input_segments: {json.dumps(input_segments, default=str, indent=2)}")
```

This will show:
- Whether `previous_response_id` is being injected
- The exact structure of normalized messages
- Whether any `type: "text"` items sneak through

### 2. Validation Checkpoint
**File**: `planexe_api/services/conversation_service.py` (lines 495-507)

```python
# Validate that normalization happened correctly
for segment in input_segments:
    if "content" in segment and isinstance(segment["content"], list):
        for content_item in segment["content"]:
            content_type = content_item.get("type")
            if content_type == "text":
                logger.error(
                    f"BUG: Found unnormalized 'text' type in message after normalize_input_messages! "
                    f"Content: {content_item}. This should have been converted to 'input_text' or 'output_text'."
                )
                raise ValueError(
                    f"Message content type must be 'input_text' or other Responses API types, not 'text'. "
                    f"Got: {content_item}"
                )
```

If this ValueError is raised, normalization is failing. If NOT raised but OpenAI still errors, the bug is after normalization (serialization or SDK issue).

### 3. Pre-OpenAI API Logging
**File**: `planexe_api/services/conversation_service.py` (lines 385-387)

```python
logger.info(f"Sending Responses API request with keys: {list(request_args.keys())}")
if "input" in request_args:
    logger.debug(f"Input segments structure: {json.dumps([{k: v for k, v in seg.items() if k in ['role', 'content']} for seg in request_args.get('input', [])], default=str)}")
```

Shows the exact payload before it's sent to OpenAI.

---

## Fault-Isolation Checklist

### Step 1: Capture Wire-Level Payloads
- [ ] Run conversation modal on ui2 (working)
- [ ] Run conversation modal on staging (broken)
- [ ] Diff the console output showing normalized input_segments
- [ ] Confirm working branch sends `type: "input_text"`
- [ ] Confirm broken branch sends `type: "text"` (or different structure)

### Step 2: Verify previous_response_id Handling
- [ ] Log the exact `previous_response_id` being sent
- [ ] Verify it equals the last saved `response.id` from same `conversation_id`
- [ ] Check if first turn (no previous_response_id) works but second turn (with previous_response_id) fails

### Step 3: Validate Coercion Path
- [ ] Plain string → `[{"type": "input_text", "text": s}]` ✅
- [ ] Never → `[{"type": "text", "text": s}]` ❌
- [ ] Ensure no assistant outputs included in input
- [ ] Confirm `reasoning_effort` at request level only

### Step 4: Check OpenAI SDK Behavior
- [ ] Verify SDK version: `openai>=2.5.0`
- [ ] Check if SDK has different serialization when `previous_response_id` present
- [ ] Test direct SDK call with same payload structure

### Step 5: Isolate Layer
- [ ] Temporarily disable automatic previous_response_id injection
- [ ] If error disappears, regression is in chaining layer
- [ ] If error persists, bug is elsewhere

---

## Suspected Code Locations

### Primary Suspects
1. **Automatic previous_response_id injection** (`conversation_service.py:100-111`)
2. **Message build when previous_response_id present** (`conversation_service.py:484-516`)
3. **OpenAI SDK serialization** (external library behavior)

### Secondary Suspects
4. **Frontend payload construction** (`fastapi-client.ts:createConversationRequest`)
5. **Request model validation** (`models.py:ConversationTurnRequest`)

### Unlikely (Code Identical Between Branches)
- ❌ `normalize_input_messages()` - identical code
- ❌ `_coerce_content_dict()` - identical code
- ❌ `_normalize_content()` - identical code

---

## Next Actions

### Immediate (To Diagnose)
1. **Run staging branch conversation modal** with API server console visible
2. **Capture diagnostic output** showing:
   - User message
   - previous_response_id value
   - Normalized input_segments structure
   - Whether validation ValueError is raised
3. **Compare first turn (no chaining) vs. second turn (with chaining)**

### If Validation Passes (No ValueError)
- Bug is AFTER normalization
- Check OpenAI SDK version compatibility
- Inspect wire-level HTTP request to OpenAI
- May be serialization issue in OpenAI Python client

### If Validation Fails (ValueError Raised)
- Bug is IN normalization or BEFORE normalization
- Check if user_message has unexpected structure when previous_response_id present
- Verify `_ensure_message_dict()` behavior

### Fallback Option
- **Revert staging to ui2 commit 3f0d8bd**
- Re-implement response chaining incrementally with tests
- Ensure each change preserves message type correctness

---

## References

- Working branch: `ui2` at commit `3f0d8bd`
- Breaking commit: `b15e936` - "feat: complete reasoning effort and response chaining implementation"
- OpenAI Responses API docs: Content typing requirements
- Related doc: `docs/2025-10-24-luigi-response-chaining-implementation.md`
- CHANGELOG: Section "INVESTIGATING: Conversation Modal Responses API Message Type Error"

---

## Confidence Assessment

**Confidence the bug is in response chaining implementation**: 0.9
**Confidence normalization code is correct**: 0.95
**Confidence diagnostic tools will isolate root cause**: 0.85

The next run of the conversation modal with logging enabled should definitively show where `type: "text"` is being introduced.
