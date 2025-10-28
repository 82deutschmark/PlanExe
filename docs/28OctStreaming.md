



















**Summary**  
`LiveStreamPanel` is a presentational surface over `useRecoveryPlan`’s LLM stream state, so the deeper streaming behavior lives in `useRecoveryPlan` and [recovery-streaming.ts](cci:7://file:///d:/GitHub/PlanExe/planexe-frontend/src/lib/streaming/recovery-streaming.ts:0:0-0:0). The panel itself is lightweight, but the surrounding hook deviates from several Responses API streaming best practices and has a few UI gaps.

**Findings**

1. **High – Responses event model is flattened into ad-hoc fields instead of mirroring SSE envelopes**  
   The hook drops the original event structure into custom fields (`textDeltas`, `textBuffer`, `finalText`, etc.) and exposes only the merged text to the component. This loses parity with the Responses SSE schema (e.g., no direct access to `aggregated` text, JSON deltas, or per-event metadata) and forces components to re-derive context. Best practice is to keep the canonical envelope and expose helpers on top of it, similar to the conversation harness on the backend. See `useRecoveryPlan`’s `handleLlmStreamMessage` @planexe-frontend/src/app/recovery/useRecoveryPlan.ts#599-707.

2. **Medium – Sequence and ordering guarantees are ignored**  
   The reducer throws away `message.sequence`, yet the Responses API depends on ordering for deterministic reconstruction when multiple workers stream concurrently. Storing and sorting by sequence before mutating buffers would keep the frontend resilient to out-of-order delivery (@planexe-frontend/src/app/recovery/useRecoveryPlan.ts#695-705).

3. **Medium – Reasoning aggregation double-inserts line breaks**  
   `appendReasoningChunk` already inserts `\n`, but `LiveStreamPanel` joins deltas with `'\n'`, causing duplicate blank lines when buffers are flushed mid-stream (@planexe-frontend/src/app/recovery/useRecoveryPlan.ts#190-196 and @planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx#79-108). Sticking to the aggregated buffer avoids this artifact.

4. **Low – Usage/completion metadata is collected but unused**  
   The hook records usage, errors, prompt previews, and raw payloads, yet the panel discards them. Surfacing usage (tokens, final status) and error context would align with best practices for operator tooling (@planexe-frontend/src/app/recovery/useRecoveryPlan.ts#668-700 paired with @planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx#100-116).

5. **Low – No backpressure or throttling on UI updates**  
   Unlike the conversation intake hook, recovery streaming updates React state on every delta without animation-frame batching, which can stutter the UI for verbose models. Compare [recovery-streaming.ts](cci:7://file:///d:/GitHub/PlanExe/planexe-frontend/src/lib/streaming/recovery-streaming.ts:0:0-0:0)’s [scheduleFlush()](cci:1://file:///d:/GitHub/PlanExe/planexe-frontend/src/lib/streaming/recovery-streaming.ts:325:2-337:3) to the inline buffering in `useRecoveryPlan` (@planexe-frontend/src/lib/streaming/recovery-streaming.ts#326-347 vs. @planexe-frontend/src/app/recovery/useRecoveryPlan.ts#635-694).

6. **Low – Idle panel message doesn’t reflect partial stream state**  
   When a stream finishes with an error, the active panel flips to “Idle,” hiding the failure badge even though `stream.status === 'failed'` is tracked. Keeping the failed stream visible improves diagnostics (@planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx#88-123).

**Recommendations**

1. Expose the raw SSE envelopes (event name, aggregated fields, sequence) to the component and build derived buffers via selectors rather than mutating shared maps.  
2. Preserve ordering by sequence and guard against out-of-order events before mutating buffers.  
3. Use the aggregated buffers from state (`textBuffer`, `reasoningBuffer`) exclusively in the panel to eliminate newline duplication.  
4. Extend the panel to render usage/error metadata and maybe the recent event timeline to aid operators.  
5. Consider consolidating the polling/streaming logic into [recovery-streaming.ts](cci:7://file:///d:/GitHub/PlanExe/planexe-frontend/src/lib/streaming/recovery-streaming.ts:0:0-0:0) so both hooks share the same backpressure strategy.