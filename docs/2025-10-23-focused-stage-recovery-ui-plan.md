# Recovery Page: Focused Stage View - Asymmetric Streaming UI

**Date**: 2025-10-23
**Author**: Claude (Sonnet 4.5)
**Status**: Planning
**Priority**: Critical
**Supersedes**: `2025-10-23-recovery-page-streaming-reasoning-plan.md` (3-column layout - REJECTED)

## Executive Summary

This plan replaces the failed 3-column layout with a **theatrical, asymmetric single-focus UI** that maximizes streaming visibility and real-time feedback. The design centers on ONE active task at a time (the "stage") with context rails, not competing columns.

**Core Principle**: At any moment, ONE Luigi task is executing. That's what the user watches. Everything else is peripheral context.

## The Problem with 3-Column Layouts

Traditional equal-column layouts (33-33-33 or 25-50-25) create **decision paralysis**:
- User doesn't know where to look
- Equal visual weight implies equal importance (false)
- Wasted space on empty artefact cards
- Static content competes with dynamic streaming
- Generic, newspaper-like, uninspired

**Result**: Developer fired for lack of imagination.

## The Focused Stage View Concept

### Layout Architecture: 15-70-15 Asymmetric Theater

```
┌──────────────────────────────────────────────────────────────────┐
│  Header Bar: Plan Name │ Status │ Elapsed Time │ Actions         │ 5vh
├──────┬────────────────────────────────────────────────┬──────────┤
│      │                                                │          │
│ PIPE │           ACTIVE TASK STAGE                   │   PLAN   │
│ LINE │  ┌──────────────────────────────────────────┐ │   DOC    │
│      │  │ Task: Generate WBS Level 1               │ │          │
│ Time │  │ Model: claude-opus-4-20250514            │ │ Shows    │
│ line │  │ Interaction 3 of 8                       │ │ actual   │
│      │  └──────────────────────────────────────────┘ │ plan     │
│ 61   │                                                │ markdown │
│ tasks│  ┌──────────────────┬──────────────────────┐ │ being    │
│      │  │   MODEL OUTPUT   │   REASONING TRACE    │ │ built    │
│ Vert │  │                  │                      │ │          │
│ ical │  │ Streaming text   │ Streaming reasoning  │ │ Live     │
│ scrl │  │ appears here     │ deltas appear here   │ │ updates  │
│ able │  │ with auto-scroll │ with auto-scroll     │ │ as tasks │
│      │  │                  │                      │ │ complete │
│ Click│  │ [█████████░░░░]  │ [████████████░░░]   │ │          │
│ any  │  │ 85% complete     │ 92% complete         │ │ Syntax   │
│ task │  │                  │                      │ │ highlight│
│ to   │  │                  │                      │ │          │
│ jump │  │                  │                      │ │ User sees│
│ there│  │                  │                      │ │ delivrbl │
│      │  │                  │                      │ │ grow     │
│ Auto │  └──────────────────┴──────────────────────┘ │          │
│ scrls│                                                │ Auto     │
│ to   │  Tokens: ▓▓▓▓▓░░░ 1,234 in | 856 out        │ scroll   │
│ actve│  Progress: [████████░░] 80% of this task     │ to new   │
│      │                                                │ content  │
│ Stge │  [Copy Output] [Copy Reasoning] [Raw JSON]   │          │
│ colr │                                                │ [Export] │
│ code │                                                │ [Copy]   │
│      │                                                │          │
│ 15vw │                  70vw                         │  15vw    │
└──────┴────────────────────────────────────────────────┴──────────┘
│  ⚠️ SYSTEM LOG DRAWER (collapsed • slides up on errors)         │ collapsed
└──────────────────────────────────────────────────────────────────┘
```

### Visual Hierarchy

```
PRIMARY (70% width, center vision):
  → Active task streaming output + reasoning
  → Large readable fonts (16-18px base)
  → High contrast
  → Animation on new deltas

SECONDARY (15% width, peripheral right):
  → Plan markdown being assembled
  → Syntax highlighted
  → Auto-scrolls to latest section
  → Shows the DELIVERABLE

TERTIARY (15% width, peripheral left):
  → Pipeline position/progress
  → All 61 tasks in timeline
  → Grouped by stage
  → Click to navigate

EMERGENCY (0% until needed, bottom):
  → System logs/errors
  → Auto-slides up on failures
  → Can be pinned open
```

## Component Breakdown

### 1. Left Rail: Vertical Pipeline Timeline (15vw)

**Purpose**: Show pipeline progress and enable task navigation

**Components**:

```typescript
<VerticalTimeline>
  {stages.map(stage => (
    <StageGroup
      name={stage.name}
      tasks={stage.tasks}
      status={stage.status}  // pending | running | completed | failed
      collapsed={stage.status === 'pending'}
      autoExpand={stage.status === 'running'}
    >
      {stage.tasks.map(task => (
        <TaskNode
          name={task.name}
          status={task.status}
          isActive={task.id === activeTaskId}
          onClick={() => jumpToTask(task.id)}
          statusIcon={getStatusIcon(task.status)}
          className={cn(
            task.status === 'completed' && 'bg-green-100 border-green-500',
            task.status === 'running' && 'bg-blue-100 border-blue-500 animate-pulse',
            task.status === 'failed' && 'bg-red-100 border-red-500',
            task.status === 'pending' && 'bg-gray-50 border-gray-300',
            task.isActive && 'ring-2 ring-blue-600 shadow-lg'
          )}
        />
      ))}
      <StageMiniMetrics
        completedTasks={stage.completedCount}
        totalTasks={stage.totalCount}
        totalTokens={stage.tokenUsage}
      />
    </StageGroup>
  ))}

  <TimelineMetrics>
    <div>Tasks: {completedTasks}/{totalTasks}</div>
    <div>Elapsed: {formatDuration(elapsed)}</div>
    <div>Total tokens: {formatNumber(totalTokens)}</div>
  </TimelineMetrics>
</VerticalTimeline>
```

**Features**:
- Auto-scroll to keep active task in view
- Color-coded status (green=done, blue-pulse=active, red=failed, gray=pending)
- Stage groups collapse/expand
- Mini progress bars per stage
- Click any task → center stage shows its stream history
- Compact display (task names truncated with tooltip)

**File**: `planexe-frontend/src/app/recovery/components/VerticalTimeline.tsx`

---

### 2. Center Stage: Active Task Theater (70vw)

**Purpose**: Showcase live streaming output and reasoning for the active task

**Components**:

```typescript
<ActiveTaskStage>
  <TaskHeader>
    <TaskIdentifier>
      <h2>{task.name}</h2>
      <Badge status={task.status}>{task.status}</Badge>
    </TaskIdentifier>
    <TaskMetadata>
      <span>Model: {task.model}</span>
      <span>Interaction {task.currentInteraction} of {task.totalInteractions}</span>
      <span>Started: {formatTime(task.startTime)}</span>
    </TaskMetadata>
  </TaskHeader>

  <StreamingPanels className="grid grid-cols-2 gap-4">
    <OutputPanel>
      <PanelHeader>
        <h3>Model Output</h3>
        <ProgressBar value={outputProgress} />
      </PanelHeader>
      <StreamingText
        content={stream.textBuffer || stream.finalText}
        isStreaming={stream.status === 'running'}
        autoScroll={true}
        className="font-mono text-base leading-relaxed"
      />
    </OutputPanel>

    <ReasoningPanel>
      <PanelHeader>
        <h3>Reasoning Trace</h3>
        <ProgressBar value={reasoningProgress} />
      </PanelHeader>
      <StreamingText
        content={stream.reasoningBuffer || stream.finalReasoning}
        isStreaming={stream.status === 'running'}
        autoScroll={true}
        className="font-mono text-sm leading-relaxed text-muted-foreground"
      />
    </ReasoningPanel>
  </StreamingPanels>

  <TaskFooter>
    <TokenMetrics>
      <TokenBar label="Input" value={usage.inputTokens} max={maxTokens} />
      <TokenBar label="Output" value={usage.outputTokens} max={maxTokens} />
      <TokenBar label="Reasoning" value={usage.reasoningTokens} max={maxTokens} />
      <span>Total: {formatNumber(usage.totalTokens)}</span>
    </TokenMetrics>

    <TaskActions>
      <Button onClick={copyOutput}>Copy Output</Button>
      <Button onClick={copyReasoning}>Copy Reasoning</Button>
      <Button onClick={viewRawJSON}>Raw JSON</Button>
    </TaskActions>
  </TaskFooter>
</ActiveTaskStage>
```

**Features**:
- **Two-column streaming display** (output | reasoning) - proven Terminal.tsx pattern
- **Auto-scroll** as deltas arrive
- **Progress bars** show completion percentage
- **Large readable fonts** (16-18px for output, 14-16px for reasoning)
- **Status animations** (pulse during streaming, checkmark on complete)
- **Token usage as visual bars** (not just numbers)
- **Quick actions** (copy, export, view raw)
- **Responsive** (stacks vertically on mobile)

**File**: `planexe-frontend/src/app/recovery/components/ActiveTaskStage.tsx`

---

### 3. Right Rail: Live Plan Document Assembly (15vw)

**Purpose**: Show the actual plan deliverable being built in real-time

**Components**:

```typescript
<LivePlanDocument>
  <DocumentHeader>
    <h3>Plan Document</h3>
    <DocumentActions>
      <Button onClick={exportMarkdown}>Export</Button>
      <Button onClick={copyMarkdown}>Copy</Button>
      <Button onClick={viewFullscreen}>Fullscreen</Button>
    </DocumentActions>
  </DocumentHeader>

  <MarkdownPreview
    content={assembledPlanMarkdown}
    highlightLatest={true}
    autoScroll={true}
    syntaxHighlight={true}
    className="prose prose-sm max-w-none"
  >
    {planSections.map(section => (
      <PlanSection
        key={section.id}
        title={section.title}
        content={section.content}
        isNew={section.justAdded}
        isStreaming={section.isStreaming}
        className={cn(
          section.isNew && 'animate-fadeIn bg-blue-50',
          section.isStreaming && 'animate-pulse'
        )}
      />
    ))}
  </MarkdownPreview>

  <DocumentFooter>
    <span>Sections: {completedSections}/{totalSections}</span>
    <span>Words: {formatNumber(wordCount)}</span>
  </DocumentFooter>
</LivePlanDocument>
```

**Features**:
- **Live markdown rendering** as tasks complete
- **Syntax highlighting** for code blocks
- **Auto-scroll to latest section** being written
- **Pulse animation** on new content arrival
- **Highlight fade** for recently added sections
- **Section outline** (clickable navigation)
- **Export/copy actions**
- **Fullscreen mode** (overlay)

**Data Source**:
```typescript
// Query plan_content table for all completed tasks
// Assemble into cohesive markdown document
const assembledPlan = await fetch(`/api/plans/${planId}/assembled-document`);
// Returns structured sections with task mappings
```

**File**: `planexe-frontend/src/app/recovery/components/LivePlanDocument.tsx`

---

### 4. Bottom Drawer: Smart System Log (collapsed by default)

**Purpose**: Show system logs, connection status, debug info - but only when needed

**Components**:

```typescript
<SystemLogDrawer
  collapsed={!hasErrors && !userPinned}
  autoExpand={hasErrors}
  height={collapsed ? '40px' : '30vh'}
>
  <DrawerHandle onClick={toggleDrawer}>
    <ChevronIcon direction={collapsed ? 'up' : 'down'} />
    <DrawerSummary>
      <ConnectionStatus status={wsStatus} />
      <ErrorCount count={errorCount} />
      <LastLogTime time={lastLogTimestamp} />
    </DrawerSummary>
    <PinButton pinned={userPinned} onClick={togglePin} />
  </DrawerHandle>

  <DrawerContent className={collapsed ? 'hidden' : 'block'}>
    <TabBar>
      <Tab active={activeTab === 'logs'}>System Logs</Tab>
      <Tab active={activeTab === 'connection'}>Connection</Tab>
      <Tab active={activeTab === 'debug'}>Debug Info</Tab>
    </TabBar>

    <LogPanel show={activeTab === 'logs'}>
      <LogLines
        lines={logs}
        colorCoded={true}
        autoScroll={true}
        filter={logFilter}
      />
    </LogPanel>

    <ConnectionPanel show={activeTab === 'connection'}>
      <WebSocketStatus connection={wsConnection} />
      <DatabaseStatus connection={dbConnection} />
      <LuigiStatus pipelineStatus={luigiStatus} />
    </ConnectionPanel>

    <DebugPanel show={activeTab === 'debug'}>
      <RawEventStream events={wsEvents} />
      <StateInspector state={recoveryState} />
    </DebugPanel>
  </DrawerContent>
</SystemLogDrawer>
```

**Features**:
- **Collapsed by default** (just 40px handle with summary)
- **Auto-expands on errors** (slides up with animation)
- **Pinnable** (user can force open/closed)
- **Three tabs**: System Logs | Connection | Debug Info
- **Color-coded logs** (error=red, warn=yellow, info=blue)
- **Auto-scroll** to latest
- **Filter/search** logs
- **Doesn't compete** for attention when everything is working

**File**: `planexe-frontend/src/app/recovery/components/SystemLogDrawer.tsx`

---

## Data Flow & State Management

### 1. Add LLM Streaming State to `useRecoveryPlan.ts`

```typescript
interface LLMStreamState {
  interactionId: number;
  planId: string;
  stage: string;
  taskName: string;
  textDeltas: string[];
  reasoningDeltas: string[];
  textBuffer: string;
  reasoningBuffer: string;
  finalText?: string;
  finalReasoning?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
  status: 'running' | 'completed' | 'failed';
  error?: string;
  lastUpdated: number;
  promptPreview?: string;
  events: StreamEventRecord[];
}

interface RecoveryState {
  // Existing fields...
  plan: AsyncData<Plan>;
  tasks: Task[];
  logs: LogEntry[];
  connection: ConnectionState;

  // NEW: LLM streaming
  llmStreams: Record<number, LLMStreamState>;  // keyed by interaction_id
  activeStreamId: number | null;  // currently streaming interaction

  // NEW: Plan document assembly
  planDocument: {
    sections: PlanSection[];
    markdown: string;
    wordCount: number;
    lastUpdated: number;
  };

  // NEW: Aggregate metrics
  metrics: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
    interactionCount: number;
    estimatedCost: number;
  };
}
```

### 2. WebSocket Message Handlers

**Add to `useRecoveryPlan.ts`**:

```typescript
useEffect(() => {
  const ws = WebSocketClient.getInstance();

  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'llm_stream':
        handleLlmStreamMessage(message as WebSocketLLMStreamMessage);
        break;

      case 'task_update':
        handleTaskUpdate(message as WebSocketTaskMessage);
        break;

      case 'plan_content_update':
        handlePlanContentUpdate(message as WebSocketPlanContentMessage);
        break;

      // ... existing handlers
    }
  };

  ws.on('message', handleMessage);
  return () => ws.off('message', handleMessage);
}, [planId]);

// Port from Terminal.tsx:126-250
const handleLlmStreamMessage = useCallback((message: WebSocketLLMStreamMessage) => {
  const buffer = streamBuffersRef.current.get(message.interaction_id) ?? {
    text: '',
    reasoning: ''
  };

  switch (message.event) {
    case 'start':
      dispatch({
        type: 'llm_stream:start',
        payload: {
          interactionId: message.interaction_id,
          planId: message.plan_id,
          stage: message.stage,
          taskName: message.task_name,
          promptPreview: message.data?.prompt?.slice(0, 200),
        },
      });
      break;

    case 'text_delta':
      buffer.text += message.data?.delta || '';
      streamBuffersRef.current.set(message.interaction_id, buffer);
      dispatch({
        type: 'llm_stream:update',
        payload: {
          interactionId: message.interaction_id,
          textBuffer: buffer.text,
          textDeltas: [...(state.llmStreams[message.interaction_id]?.textDeltas || []), message.data?.delta],
        },
      });
      break;

    case 'reasoning_delta':
      buffer.reasoning += (message.data?.delta || '') + '\n';
      streamBuffersRef.current.set(message.interaction_id, buffer);
      dispatch({
        type: 'llm_stream:update',
        payload: {
          interactionId: message.interaction_id,
          reasoningBuffer: buffer.reasoning,
          reasoningDeltas: [...(state.llmStreams[message.interaction_id]?.reasoningDeltas || []), message.data?.delta],
        },
      });
      break;

    case 'final':
      dispatch({
        type: 'llm_stream:update',
        payload: {
          interactionId: message.interaction_id,
          finalText: message.data?.text,
          finalReasoning: message.data?.reasoning,
          usage: message.data?.usage,
        },
      });
      break;

    case 'end':
      dispatch({
        type: 'llm_stream:complete',
        payload: {
          interactionId: message.interaction_id,
          status: message.data?.error ? 'failed' : 'completed',
          error: message.data?.error,
        },
      });
      streamBuffersRef.current.delete(message.interaction_id);
      break;
  }
}, [dispatch]);

const handlePlanContentUpdate = useCallback((message: WebSocketPlanContentMessage) => {
  // Task completed → update plan document
  dispatch({
    type: 'plan_document:update',
    payload: {
      section: message.section,
      content: message.content,
      taskName: message.task_name,
    },
  });

  // Trigger plan document re-assembly
  fetchPlanDocument(planId);
}, [planId]);
```

### 3. Backend API Endpoint for Plan Document Assembly

**NEW ENDPOINT**: `GET /api/plans/{plan_id}/assembled-document`

```python
@app.get("/api/plans/{plan_id}/assembled-document")
async def get_assembled_plan_document(
    plan_id: str,
    db: Session = Depends(get_db)
):
    """
    Assemble the plan document from completed task outputs.
    Returns structured sections with content in markdown format.
    """
    plan_contents = db.query(PlanContent)\
        .filter(PlanContent.plan_id == plan_id)\
        .order_by(PlanContent.created_at)\
        .all()

    sections = []
    markdown_parts = []

    # Group by stage/task
    for content in plan_contents:
        section = {
            "id": content.id,
            "task_name": content.task_name,
            "stage": content.stage,
            "content": content.content_json.get("markdown") or content.content_json.get("text"),
            "created_at": content.created_at.isoformat(),
            "is_final": content.is_final,
        }
        sections.append(section)

        if section["content"]:
            markdown_parts.append(f"## {content.task_name}\n\n{section['content']}\n\n")

    full_markdown = "\n".join(markdown_parts)

    return {
        "plan_id": plan_id,
        "sections": sections,
        "markdown": full_markdown,
        "word_count": len(full_markdown.split()),
        "section_count": len(sections),
        "last_updated": max([c.created_at for c in plan_contents]).isoformat() if plan_contents else None,
    }
```

**File**: `planexe_api/api.py` (add endpoint)

---

## Page Layout Implementation

### Main Recovery Page (`app/recovery/page.tsx`)

```typescript
'use client';

import { useRecoveryPlan } from '@/hooks/useRecoveryPlan';
import { VerticalTimeline } from './components/VerticalTimeline';
import { ActiveTaskStage } from './components/ActiveTaskStage';
import { LivePlanDocument } from './components/LivePlanDocument';
import { SystemLogDrawer } from './components/SystemLogDrawer';
import { RecoveryHeader } from './components/RecoveryHeader';

export default function RecoveryPage() {
  const {
    plan,
    tasks,
    llmStreams,
    planDocument,
    metrics,
    connection,
    logs,
    activeTaskId,
    jumpToTask,
  } = useRecoveryPlan();

  const activeStream = llmStreams.active;
  const hasErrors = logs.some(log => log.level === 'error');

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header: 5vh */}
      <RecoveryHeader
        planName={plan.data?.user_prompt || 'Loading...'}
        status={plan.data?.status}
        elapsed={plan.data?.elapsed_time}
      />

      {/* Main Grid: 15-70-15 asymmetric */}
      <div className="flex-1 grid grid-cols-[15vw_70vw_15vw] gap-2 p-2 overflow-hidden">

        {/* Left Rail: Vertical Timeline */}
        <aside className="overflow-y-auto bg-card rounded-lg border">
          <VerticalTimeline
            tasks={tasks}
            activeTaskId={activeTaskId}
            onTaskClick={jumpToTask}
            metrics={metrics}
          />
        </aside>

        {/* Center Stage: Active Task Theater */}
        <main className="flex flex-col overflow-hidden bg-card rounded-lg border">
          <ActiveTaskStage
            stream={activeStream}
            task={tasks.find(t => t.id === activeTaskId)}
            isStreaming={activeStream?.status === 'running'}
          />
        </main>

        {/* Right Rail: Live Plan Document */}
        <aside className="overflow-y-auto bg-card rounded-lg border">
          <LivePlanDocument
            sections={planDocument.sections}
            markdown={planDocument.markdown}
            wordCount={planDocument.wordCount}
            isUpdating={planDocument.lastUpdated > Date.now() - 5000}
          />
        </aside>
      </div>

      {/* Bottom Drawer: System Logs (collapsed by default) */}
      <SystemLogDrawer
        logs={logs}
        connection={connection}
        hasErrors={hasErrors}
      />
    </div>
  );
}
```

---

## Key UX Innovations

### 1. Asymmetric Focus
- **70% center stage** for active task (not boring 33%)
- Side rails are **context, not competition**
- No equal columns = clear visual hierarchy

### 2. Vertical Timeline
- **All 61 tasks visible** in scrollable list
- **Color-coded status** (instant recognition)
- **Click to navigate** to any task's history
- **Auto-scroll** to keep active task visible
- **Stage grouping** with collapse/expand

### 3. Live Deliverable Visibility
- **Right rail shows the plan being built**
- User sees **value being created** in real-time
- Not just process metrics—actual output
- **Syntax highlighting** makes it readable
- **Auto-scroll** to latest section

### 4. Streaming-First Design
- **Both output AND reasoning** streams visible
- **No delays** (WebSocket direct to UI)
- **Visual progress** (animated bars, pulse effects)
- **Token usage as graphics** (not just numbers)
- **Auto-scroll** maintains focus

### 5. Smart Collapsing
- **System logs hidden** unless errors occur
- **Auto-expand** on failures (slides up)
- **Pin control** for power users
- **No wasted space** when everything works

### 6. Zero Empty States
- **No empty artefact cards** cluttering UI
- **Plan document shows progress** ("Section 3 of 12 completed...")
- **Timeline shows pending tasks** (gray with clear labels)
- **Every pixel has purpose**

---

## Performance Considerations

### Streaming Optimization
```typescript
// Use refs for high-frequency updates (Terminal.tsx pattern)
const streamBuffersRef = useRef<Map<number, StreamBuffer>>(new Map());

// Batch state updates (don't dispatch on every delta)
const debouncedDispatch = useMemo(
  () => debounce((payload) => dispatch({ type: 'llm_stream:update', payload }), 100),
  [dispatch]
);

// Virtual scrolling for long task lists (if >100 tasks)
import { useVirtualizer } from '@tanstack/react-virtual';
```

### Rendering Optimization
```typescript
// Memoize expensive components
const ActiveTaskStage = memo(ActiveTaskStageComponent);
const LivePlanDocument = memo(LivePlanDocumentComponent);

// Use React.lazy for heavy components
const SystemLogDrawer = lazy(() => import('./components/SystemLogDrawer'));

// Virtualize long markdown documents
const VirtualMarkdown = ({ content }) => {
  const virtualizer = useVirtualizer({
    count: content.split('\n').length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
  });
  // ...
};
```

---

## Responsive Behavior

### Desktop (>1200px): Full Asymmetric Layout
- 15-70-15 grid as designed
- All panels visible
- System drawer collapsed by default

### Tablet (768px - 1200px): Adjusted Proportions
- 20-60-20 grid (give rails more space)
- Smaller fonts (14-16px base)
- Drawer auto-collapses

### Mobile (<768px): Stacked Vertical
```typescript
<div className="flex flex-col h-screen">
  <RecoveryHeader compact />

  <TabBar>
    <Tab>Stage</Tab>
    <Tab>Timeline</Tab>
    <Tab>Document</Tab>
  </TabBar>

  <TabPanel show={activeTab === 'stage'}>
    <ActiveTaskStage fullWidth />
  </TabPanel>

  <TabPanel show={activeTab === 'timeline'}>
    <VerticalTimeline compact />
  </TabPanel>

  <TabPanel show={activeTab === 'document'}>
    <LivePlanDocument fullWidth />
  </TabPanel>

  <SystemLogDrawer height="25vh" />
</div>
```

---

## Implementation Checklist

### Phase 1: Core Layout (Week 1)
- [ ] Create `VerticalTimeline.tsx` component
- [ ] Create `ActiveTaskStage.tsx` component (port Terminal.tsx logic)
- [ ] Create `LivePlanDocument.tsx` component
- [ ] Create `SystemLogDrawer.tsx` component
- [ ] Implement 15-70-15 grid layout in `app/recovery/page.tsx`
- [ ] Add LLM streaming state to `useRecoveryPlan.ts`
- [ ] Port WebSocket `llm_stream` handlers from Terminal.tsx
- [ ] Test streaming with real pipeline execution

### Phase 2: Plan Document Assembly (Week 1)
- [ ] Add `GET /api/plans/{id}/assembled-document` endpoint
- [ ] Query `plan_content` table for all task outputs
- [ ] Assemble sections into cohesive markdown
- [ ] Add WebSocket `plan_content_update` messages
- [ ] Implement live markdown rendering with syntax highlighting
- [ ] Add auto-scroll to latest section
- [ ] Add export/copy actions

### Phase 3: Visual Polish (Week 2)
- [ ] Add color-coded status indicators
- [ ] Implement pulse animations for active tasks
- [ ] Add progress bars for streaming completion
- [ ] Add token usage visualizations (bars, not just numbers)
- [ ] Implement auto-expand drawer on errors
- [ ] Add responsive breakpoints (desktop/tablet/mobile)
- [ ] Test with long-running pipelines

### Phase 4: Optimization (Week 2)
- [ ] Add virtual scrolling for 61-task timeline
- [ ] Memoize expensive components
- [ ] Debounce high-frequency state updates
- [ ] Add lazy loading for heavy components
- [ ] Optimize markdown rendering for long documents
- [ ] Add error boundaries for graceful failures
- [ ] Performance testing with concurrent pipelines

---

## Success Metrics

### User Experience
- ✅ **Users can see live LLM reasoning without scrolling**
- ✅ **Users can see the plan deliverable being built in real-time**
- ✅ **Users can navigate to any task in <2 clicks**
- ✅ **Zero empty artefact cards wasting space**
- ✅ **Errors are immediately visible (auto-expand drawer)**
- ✅ **90% of screen time focused on center stage**

### Technical
- ✅ **Reuses Terminal.tsx streaming logic (DRY principle)**
- ✅ **No performance degradation with 61 tasks**
- ✅ **WebSocket latency <100ms (delta to UI)**
- ✅ **Responsive across desktop/tablet/mobile**
- ✅ **Graceful degradation on connection loss**

### Information Density
- ✅ **70% of viewport dedicated to active task**
- ✅ **All critical metrics visible without scrolling**
- ✅ **No wasted margins or padding**
- ✅ **Progressive disclosure for secondary data**

---

## References

- Terminal streaming implementation: `planexe-frontend/src/components/monitoring/Terminal.tsx:46-720`
- WebSocketClient architecture: `planexe-frontend/src/lib/api/fastapi-client.ts:423-521`
- Current recovery layout: `planexe-frontend/src/app/recovery/page.tsx`
- Plan content model: `planexe_api/models.py` (PlanContent table)
- Luigi pipeline tasks: `planexe/` (61 tasks across 10 stages)

---

## Notes

- **DO NOT** remove existing WebSocket connection logic (it's correct)
- **DO** reuse Terminal.tsx LLM stream handling (proven, tested)
- **DO** prioritize streaming reasoning over static artefacts
- **DO** maintain asymmetric layout (15-70-15, NOT 33-33-33)
- **DO** show the plan deliverable in real-time (right rail)
- **DO** keep system logs collapsed unless errors occur
- **DO** maintain database-first architecture (no backend schema changes)
- **DO NOT** create a 3-column layout (that's what got the last dev fired)
