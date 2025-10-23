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

The Terminal component demonstrates the correct pattern for LLM stream display:

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

## Inspiration: ARC-Explainer UI (Screenshot Reference)

The provided screenshot shows a superior information-dense layout:


- **Monitoring Table**: Status, phase, progress, images, log lines
- **Work Table**: Phase-by-phase breakdown with messages and timestamps
- **Puzzle Info**: Metadata about current task
- **Total phases counter**: Clear progress indicator

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
7. **


## Proposed Layout Redesign

**Purpose**: Quick-glance status and metrics

Components:
1. **Pipeline Status Card**
   - Current phase (e.g., "contextual_analysis")
   - Progress bar (12/61 tasks)
   - Status badge (running/completed/failed)
   - Elapsed time

2. **Stage Progress List**
   - Compact list of all 10 stages
   - Checkmarks for completed stages
   - Spinner for active stage
   - Task counts per stage (e.g., "WBS: 8/8 tasks")

3. **Live Metrics Card**
   - **Token usage aggregates** (critical for cost monitoring)
     - Total input tokens across all interactions
     - Total output tokens
     - Total reasoning tokens
     - Running cost estimate
   - **Interaction count** (how many LLM calls so far)
   - **Current stage interaction** (e.g., "3rd call for this stage")

4. **Recent Log Lines** (mini terminal)
   - Last 5-10 log lines
   - Color-coded by level (info/warn/error)
   - Click to expand full terminal

**Purpose**: PRIMARY FOCUS - Live LLM reasoning and execution visibility

Components:
1. **Active LLM Stream Display** (top priority)
   - **Large, prominent panel** for current streaming interaction
   - Two-column layout: Model Output | Reasoning Trace
   - Stage indicator (which task is executing)
   - Status badge (running with animation, completed, failed)
   - Prompt preview (truncated, click to expand)
   - Token usage for THIS interaction
   - Auto-scroll as deltas arrive
   - **This is where users spend 80% of their time**

2. **Stream History** (collapsible accordion below active stream)
   - Previous completed interactions
   - Collapsed by default (show stage name + token count)
   - Expand to see full output/reasoning
   - Search/filter by stage or keyword

3. **Terminal / Raw Logs** (collapsible panel at bottom)
   - Full Luigi pipeline logs
   - WebSocket connection status
   - System messages
   - Defaults to collapsed (show first 3 lines)
   - Expand to see full terminal view



Components:
1. **Canonical HTML Report** (top priority)
   - Totally bugged and non-functional.  Needs to be removed.
   - "View Report" button (opens modal or new tab)
   - Report generation status
   - Last updated timestamp

2. **Fallback Report** (if canonical fails)
   - Totally bugged and non-functional.  Needs to be removed.
   - "View Fallback Report" button
   - Explanation of why fallback is shown

3. **Artefacts** (compact, collapsed by default)  NO IDEA WHAT THIS EVEN IS OR WHY THE USER CARES???
   - **Collapsed state**: "5 artefacts available - Click to expand"
   - **Expanded state**:
     - Grouped by stage (accordion)
     - File name + size
     - Click to preview in modal
   - **Why collapsed?**: Artefacts are secondary during live execution
   - **Empty state**: "No artefacts yet - pipeline is running"

4. **Preview Pane** (optional, if file selected)
   - Shows selected artefact content  WHY???
   - Syntax highlighting for code
   - Rendered HTML for reports

## Implementation Requirements

### 1. Data Flow - Streaming Reasoning Integration

**Add to `useRecoveryPlan.ts`**:
```typescript
interface RecoveryState {
  // ... existing fields ...

  // NEW: LLM streaming state
  llmStreams: Record<number, LLMStreamState>;  // keyed by interaction_id
  activeStreamId: number | null;  // which stream is currently running
}
```

**WebSocket message handler update**:
```typescript
// In useRecoveryPlan.ts WebSocket effect
case 'llm_stream':
  handleLlmStreamMessage(message as WebSocketLLMStreamMessage);
  break;

// New handler function (copy from Terminal.tsx:126-250)
const handleLlmStreamMessage = useCallback((message: WebSocketLLMStreamMessage) => {
  // Buffer management
  const buffer = streamBuffersRef.current.get(message.interaction_id) ?? { text: '', reasoning: '' };

  // Update state based on event type
  switch (message.event) {
    case 'start': /* initialize stream */
    case 'text_delta': /* append to text buffer */
    case 'reasoning_delta': /* append to reasoning buffer */
    case 'final': /* capture final output + usage */
    case 'end': /* mark completed/failed */
  }

  // Update llmStreams state
  dispatch({ type: 'llm_stream:update', payload: { interactionId, data } });
}, []);
```

### 2. Component Architecture

**New components to create**:

1. `app/recovery/components/LiveStreamPanel.tsx`
   - Displays active LLM stream
   - Two-column layout (output | reasoning)
   - Status indicators, token usage
   - Auto-scroll, copy buttons
   - **Directly port from Terminal.tsx:638-720**

2. `app/recovery/components/StreamHistory.tsx`
   - Accordion of completed streams
   - Collapsed by default
   - Search/filter functionality
   - Stage grouping

3. `app/recovery/components/PipelineMetrics.tsx`
   - Aggregate token usage
   - Stage progress list
   - Cost estimates
   - Interaction counts

4. `app/recovery/components/CompactArtefactList.tsx`
   - Collapsed by default
   - Stage-grouped accordion
   - Click to preview
   - Smart empty states

**Components to refactor**:

1. `RecoveryHeader.tsx` - Simplify to single-line header
2. `RecoveryMiniHud.tsx` - Remove (info moves to left sidebar)
3. `ArtefactPreview.tsx` - Move to modal instead of inline pane

### 3. Layout Implementation

**New layout grid** (`app/recovery/page.tsx`):
```typescript
<div className="grid grid-cols-12 gap-4 h-screen">
  {/* Left Sidebar */}
  <aside className="col-span-3 overflow-y-auto">
    <PipelineStatusCard />
    <StageProgressList />
    <PipelineMetrics />
    <RecentLogs />
  </aside>

  {/* Center Panel - PRIMARY FOCUS */}
  <main className="col-span-6 flex flex-col overflow-hidden">
    <LiveStreamPanel
      activeStream={llmStreams[activeStreamId]}
      status={connection.status}
    />

    <StreamHistory
      streams={Object.values(llmStreams).filter(s => s.status !== 'running')}
      className="flex-shrink-0"
    />

    <TerminalPanel
      logs={logs}
      className="flex-shrink-0"
      defaultCollapsed
    />
  </main>

  {/* Right Sidebar */}
  <aside className="col-span-3 overflow-y-auto">
    <ReportLinks plan={plan.data} />
    <CompactArtefactList artefacts={artefacts} />
    {previewFile && <ArtefactPreviewModal />}
  </aside>
</div>
```

### 4. State Management Updates

**Add to `useRecoveryPlan` return value**:
```typescript
return {
  // ... existing ...

  // NEW: LLM streaming
  llmStreams: {
    active: state.llmStreams[state.activeStreamId],
    history: Object.values(state.llmStreams).filter(s => s.status !== 'running'),
    all: state.llmStreams,
  },

  // NEW: Aggregate metrics
  metrics: {
    totalInputTokens: calculateTotalInputTokens(state.llmStreams),
    totalOutputTokens: calculateTotalOutputTokens(state.llmStreams),
    totalReasoningTokens: calculateTotalReasoningTokens(state.llmStreams),
    interactionCount: Object.keys(state.llmStreams).length,
    estimatedCost: calculateCost(tokens, modelId),
  },
};
```

## Key UX Improvements

### User Experience
- ✅ Users can see live LLM reasoning without scrolling
- ✅ Users can see EVERYTHING RELEVANT without scrolling
- ✅ Users can see their plan being assembled in real time!!
- X Token usage is visible at a glance   NOT IMPORTANT!!!!
- ✅ Pipeline progress is clear and unambiguous
- ✅ Artefacts don't dominate the UI when empty
- ✅ Layout density!!!!  No wasted pixels!!!

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
