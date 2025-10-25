# Recovery Page: Streaming Reasoning Integration & Layout Redesign Plan

**Date**: 2025-10-23
**Author**: Claude (Sonnet 4.5)
**Status**: Planning
**Priority**: High

## Problem Statement

The current recovery page uses a 3-column layout that is SHITTY!!!:
- **Confusing**: Shows many empty artefact panels that provide no value
- **Inefficient**: Wastes screen real estate on low-information-density components
- **Missing critical data**: Does NOT display live LLM streaming reasoning, which is the most valuable debugging information
- **Poor UX**: Forces users to hunt through static file lists instead of seeing live execution context

The Terminal component (`components/monitoring/Terminal.tsx`) already has a complete, working implementation of streaming reasoning display that we should leverage.

## Reference Implementation: Terminal.tsx Streaming Reasoning

The Terminal component demonstrates the correct pattern for LLM raw stream display:

### Data Structure (Terminal.tsx:46-63)
```typescript
interface LLMStreamState {
  interactionId: number;
  planId: string;
  stage: string;
  textDeltas: string[];           // Individual text chunks
  reasoningDeltas: string[];      // Individual reasoning chunks
  textBuffer: string;             // Accumulated text
  reasoningBuffer: string;        // Accumulated reasoning
  finalText?: string;             // Final completed text
  finalReasoning?: string;        // Final completed reasoning
  usage?: Record<string, unknown>; // Token usage metrics
  rawPayload?: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  lastUpdated: number;
  promptPreview?: string;
  events: StreamEventRecord[];    // Full event stream for audit
}
```
WHERE ARE WE USING the terminal component?????  
### Message Handling (Terminal.tsx:126-250)
The Terminal handles WebSocket `llm_stream` messages with events:
- `start`: Initialize new stream
- `text_delta`: Append to text buffer
- `reasoning_delta`: Append to reasoning buffer (newline-separated)
- `final`: Capture final output + usage metrics
- `end`: Mark stream as completed/failed

### UI Display (Terminal.tsx:638-720)
The Terminal renders LLM streams as:
- **Two-column grid** (model output | reasoning trace)
- **Stage identification** (which pipeline task is executing)
- **Status badges** (running/completed/failed with color coding)
- **Prompt preview** (first N chars of the prompt)
- **Token usage metrics** (input/output/reasoning/total tokens)
- **Scrollable text areas** (max-height with overflow)
- **Raw payload inspector** (for debugging)

**This is the proven pattern.** The recovery page must adopt this same approach.


- **AI Reasoning Output**: Large, prominent panel showing real-time reasoning
- **Token counters**: Input/Output/Reasoning/Total clearly displayed
- **Status indicators**: Model config, reasoning effort
- **Action buttons**: Start Analysis, Render, etc.


- **The plan being assembled as markdown**
- **Each parsed reply fitted into the correct spot in the plan**

### Key UX Principles from Screenshot
1. **Information density**: Every pixel serves a purpose
2. **Real-time feedback**: Live reasoning and status updates
3. **Clear hierarchy**: Most important data (reasoning) gets most space
4. **Scannable metrics**: Token counts and progress at a glance
5. **Purposeful empty states**: When panels are empty, they explain WHY

## Current Recovery Page Problems

### Current Layout (3-column grid)
```
[Left Column - 33%]        [Center Column - 33%]      [Right Column - 33%]
- Stage timeline           - Report HTML viewer       - Artefact file list
- Connection status        - Fallback report          - Preview pane
- Mini HUD                                            - Empty artefact cards (!)
```

### Critical Issues
1. **No streaming reasoning display** - The most valuable debugging data is missing
2. **Artefact list dominates** - Takes 33% of screen for mostly empty cards
3. **Static content focus** - Reports are post-execution; no live execution visibility
4. **Poor information scent** - Users can't see what the AI is thinking RIGHT NOW
5. **Wasted vertical space** - Mini HUD repeats header info
6. **Wasted horizontal space** - Margins and padding are excessive

## Key UX Improvements

### User Experience
- ✅ Users can see live LLM reasoning without scrolling
- ✅ Users can see EVERYTHING RELEVANT without scrolling
- ✅ Users can see their plan being assembled in real time!!
- X Token usage is visible at a glance   NOT IMPORTANT!!!!
- ✅ Pipeline progress is clear and unambiguous
- ✅ Artefacts don't dominate the UI when empty
- ✅ Layout density!!!!  No wasted pixels!!!

## Implementation Status (2025-10-24)

### ✅ Streaming data plumbing
- `useRecoveryPlan` now mirrors the Terminal websocket handler so the recovery workspace receives live `textBuffer`, `reasoningBuffer`, deltas, usage, and event metadata per interaction.
- Active stream metadata is exposed alongside a sorted history list, plus the active stage key so we can spotlight the corresponding recovery stage.

### ✅ UI panels wired to real buffers
- **LiveStreamPanel** displays the in-flight interaction exactly like the Terminal (reply on the left, reasoning on the right, status badge, prompt preview, usage/error callouts).
- **StreamHistoryPanel** lists completed/failed interactions with expandable reasoning + output blocks for instant review.
- Stage timeline now highlights the active stage so it's obvious where Luigi is currently working.

### ✅ Recovery layout priorities
- Live stream and history panels sit at the top of the right column, pushing logs/reports/artefacts below the reasoning-first experience.
- Artefact and report panels remain accessible but no longer hog the prime viewport when nothing important is in them.

## Remaining Follow-Ups

1. **Usage telemetry formatting** – Convert the ad‑hoc usage key/value display into the standardized token counters once cost reporting lands (optional, low priority).
2. **Prompt inspection modal** – Add a quick action to expand the full prompt when the preview truncates too aggressively.
3. **Testing** – Add RTL coverage for LiveStreamPanel + StreamHistoryPanel to guard against regression when the websocket schema shifts.

### Technical
- ✅ Reuses Terminal.tsx streaming logic (DRY principle)
- ✅ WebSocketClient integration maintained
- ✅ No performance degradation with many streams
- ✅ Mobile-responsive (stack panels vertically)

### Information Density
- ✅ >50% of screen dedicated to live execution data
- ✅ All critical metrics visible without scrolling
- ✅ No "empty card" clutter
- ✅ Progressive disclosure for secondary data

## References

- Terminal streaming implementation: `components/monitoring/Terminal.tsx:46-720`
- WebSocketClient architecture: `lib/api/fastapi-client.ts:423-521`
- Current recovery layout: `app/recovery/page.tsx`
- Streaming architecture analysis: `docs/2025-10-23-streaming-architecture-analysis.md`
- ARC-Explainer screenshot: User-provided reference image

## Notes

- **DO NOT** remove existing WebSocket connection logic (it's correct)
- **DO** reuse Terminal's LLM stream handling (proven, tested)
- **DO** prioritize streaming reasoning over static artifacts
- **DO** follow ARC-Explainer's information density principles
- **DO** maintain database-first architecture (no changes to backend)
