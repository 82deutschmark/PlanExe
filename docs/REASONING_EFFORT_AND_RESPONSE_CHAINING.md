# Reasoning Effort Centralization & Response ID Chaining

**Author:** Claude Code
**Date:** 2025-10-23
**Status:** Draft - Ready for Implementation

---

## Part 1: Centralize Reasoning Effort Configuration

### Goal
Ensure `reasoning_effort` is set once at plan creation time via UI and respected throughout the system. Remove scattered hardcoded defaults.

### Current State (Before)
- Backend API defaults to `"medium"` (config.py)
- Frontend defaults to `"high"` (responses.ts)
- Luigi pipeline hardcodes `"high"` (simple_openai_llm.py:369)
- **No UI control on landing page**

### Implementation Steps

#### 1. Database Schema (planexe_api/database.py)
- [x] Add column to `Plan` model: `reasoning_effort = Column(String(50), nullable=False, default="medium")`
- Allows SQLite to add with default for existing rows

#### 2. API Request/Response Models (planexe_api/models.py)
- [ ] Add to `CreatePlanRequest`: `reasoning_effort: Optional[str] = Field("medium", description="Reasoning effort level: minimal, medium, high")`
- [ ] Add to `PlanResponse`: `reasoning_effort: str = Field(..., description="Reasoning effort level used for this plan")`

#### 3. Plan Creation Endpoint (planexe_api/api.py:495-583)
- [ ] Extract `reasoning_effort` from `CreatePlanRequest`
- [ ] Validate against enum values: `["minimal", "medium", "high"]`
- [ ] Store in `plan_data` dict alongside `speed_vs_detail`
- [ ] Pass to `effective_request` so pipeline can access it

#### 4. Frontend Types (planexe-frontend/src/lib/types/forms.ts)
- [ ] Add to `CreatePlanFormData`: `reasoning_effort: "minimal" | "medium" | "high"`
- [ ] Default value: `"medium"`

#### 5. Frontend UI Component (planexe-frontend/src/components/PlanForm.tsx)
- [ ] Add dropdown/radio button group for reasoning effort selection
- [ ] 3 options with brief tooltips:
  - `minimal`: Fastest, minimal reasoning
  - `medium`: Balanced (default)
  - `high`: Most thorough reasoning
- [ ] Include in form submission to `/api/plans`

#### 6. API Client (planexe-frontend/src/lib/api/fastapi-client.ts)
- [ ] Ensure `reasoning_effort` is passed in plan creation request
- [ ] No changes needed if using request model directly

#### 7. Verification (No Luigi Changes Yet)
- [ ] Test UI: create plan with each reasoning_effort level
- [ ] Verify database stores correct value
- [ ] Verify API response includes reasoning_effort
- [ ] Luigi can consume from plan DB record later if needed

---

## Part 2: Implement Response ID Chaining for Conversations

### Goal
Persist and chain response IDs across all Responses API follow-up calls to maintain context and comply with OpenAI's chaining requirements.

### Requirements (from OpenAI Docs)
1. **Persist the ID** — Capture returned `response.id` after each call
2. **Send on next turn** — Include `previous_response_id` field on follow-up requests
3. **Always send fresh input** — Include model + new user message + previous_response_id
4. **Streaming edge case** — Read response ID from early event, persist before stream completes
5. **Storage toggle** — Set `store: true` to keep 30-day retrieval window
6. **Cost awareness** — Prior input tokens re-billed on each turn (keep messages tight)
7. **Reasoning preservation** — Chaining preserves prior reasoning/tools without resending
8. **Failure checks** — Log chaining to verify it's actually happening

### Implementation Steps

#### Backend: Conversation Service (planexe_api/services/conversation_service.py)

##### A. Capture Response ID
- [ ] After `ConversationTurnRequest` completes, extract `response_id` from response
- [ ] Store in session/in-memory cache keyed by `conversation_id`
- [ ] For streaming: Read `response_id` from first SSE event, store immediately (don't wait for full stream)

##### B. Retrieve & Include on Follow-up
- [ ] When creating new `ConversationTurnRequest`, lookup stored `response_id` from prior turn
- [ ] If exists, set `previous_response_id` in request before sending to OpenAI API
- [ ] Log the chaining: `INFO: Chaining turn with previous_response_id={id}`

##### C. Session Management
- [ ] Create `ResponseIDStore` or similar to track latest response ID per conversation
- [ ] Options:
  - Simple dict in memory (conversation_id → response_id)
  - Or extend database with `last_response_id` column in conversations table
- [ ] Clean up on `finalize()` call

##### D. Ensure store: true
- [ ] Verify all `ConversationTurnRequest` calls set `store: true` (already in model)
- [ ] Document 30-day retention window in code comments

##### E. Debug Endpoint
- [ ] Add `GET /api/conversations/{conversation_id}/debug`
- [ ] Returns: `{ conversation_id, last_response_id, chain_length, last_updated_at }`
- [ ] Helps verify chaining is working

#### Frontend: Conversation Context (planexe-frontend/src/hooks/)

##### A. Track Response ID
- [ ] After each turn completes, capture `response_id` from:
  - `ConversationFinalizeResponse.response_id` (direct call)
  - Or extract from SSE event payload (streaming case)
- [ ] Store in Zustand store or React context for the conversation thread

##### B. Provide to Next Turn
- [ ] On follow-up request, lookup stored response ID
- [ ] Pass as `previous_response_id` in `ConversationTurnRequest`
- [ ] Log locally: `console.log("Chaining with prior response ID")`

##### C. Cost Awareness
- [ ] Add comment in code: "All prior input tokens are re-billed on each turn — keep context tight"
- [ ] Consider UI tooltip in conversation panel

#### API Client (planexe-frontend/src/lib/api/fastapi-client.ts)

##### A. Response ID Extraction
- [ ] When parsing `ConversationFinalizeResponse`, capture `.response_id`
- [ ] Return to caller (React component)

##### B. Follow-up Chain Handling
- [ ] Accept `previousResponseId` parameter in follow-up request method
- [ ] Inject into `ConversationTurnRequest.previous_response_id`

---

## Implementation Order (Sequential)

1. **Reasoning Effort Part 1-6** — Get UI selector working (frontend + backend API)
2. **Reasoning Effort Part 7** — Verify data flows through (no Luigi changes yet)
3. **Response Chaining Part Backend A-B** — Add capture & include logic in conversation service
4. **Response Chaining Part Backend C-E** — Add storage + debug endpoint
5. **Response Chaining Part Frontend A-C** — Store ID and pass on follow-ups
6. **Response Chaining Part API Client** — Ensure response ID is exposed to components
7. **Integration Test** — Multi-turn conversation verifies chaining via logs/debug endpoint

---

## Testing Checklist

### Reasoning Effort
- [ ] UI dropdown renders on landing page
- [ ] Plan creation with `minimal`, `medium`, `high` all succeed
- [ ] Database stores correct value
- [ ] API response includes reasoning_effort field
- [ ] Subsequent plan fetches include reasoning_effort

### Response ID Chaining
- [ ] First conversation turn completes, response_id captured
- [ ] Second turn in same conversation includes previous_response_id in request
- [ ] Server logs show chaining: `"Chaining turn with previous_response_id=..."`
- [ ] Debug endpoint returns current response ID and chain length
- [ ] Multi-turn conversation (3+ turns) maintains full chain
- [ ] Stream interrupted mid-response: recovery continues with correct response_id

---

## Notes

- **Reasoning Effort & Luigi:** For now, just persist in DB. Luigi can be updated later to read from plan record if/when needed.
- **Response Chaining & Streaming:** SSE events include `id` in early payload — extract immediately before stream ends.
- **In-Memory vs DB Storage:** Start with in-memory (simpler), can migrate to DB if sessions need to survive restarts.
- **Backward Compatibility:** Existing conversations without response IDs should still work (previous_response_id optional).

