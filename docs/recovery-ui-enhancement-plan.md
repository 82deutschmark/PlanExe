# Recovery UI Enhancement Plan: Pipeline Visualization & Completion UX

**Author**: Cascade
**Date**: 2025-10-28
**Purpose**: Comprehensive plan to enhance the Recovery workspace with real-time pipeline visualization, task-level progress tracking, and improved completion experience.

---

## Executive Summary

The Recovery UI currently shows LLM stream data but doesn't effectively communicate **where we are in the Luigi pipeline** or **what task is currently executing**. Users miss the relationship between streaming reasoning and the overall 61-task DAG structure. This plan addresses these UX gaps by leveraging existing infrastructure without backend changes.

---

## Current State Analysis

### What Works Well ✅

1. **WebSocket Architecture** (`planexe_api/api.py:730-789`)
   - `ws://localhost:8080/ws/plans/{plan_id}/progress`
   - Thread-safe WebSocket manager with heartbeat
   - Broadcasts two message types: `status` and `llm_stream`

2. **LLM Stream Emission** (`planexe/llm_util/__init__.py`)
   - Luigi tasks emit `LLM_STREAM|{json}` to stdout
   - Events: `start`, `text_delta`, `reasoning_delta`, `final`, `end`
   - Contains: `plan_id`, `stage`, `interaction_id`, `sequence`, `timestamp`, `data`

3. **Frontend Stream Reception** (`planexe-frontend/src/app/recovery/useRecoveryPlan.ts`)
   - `LLMStreamState` interface captures all stream data
   - Maintains `active` stream and `history` array
   - Updates in real-time via WebSocket

4. **Reusable Components**
   - `StreamingMessageBox.tsx` - Beautiful text/reasoning/json display
   - `ConversationModal.tsx` - Full-screen streaming modal pattern
   - `StreamingAnalysisPanel.tsx` - Status controls and aggregated buffers
   - `PipelineDetails.tsx` - Stage list with status icons

### Critical Gaps 🔴

1. **No Luigi DAG Visualization**
   - Users can't see the 61-task pipeline structure
   - No visual indication of current task position
   - Stage names like "identify_purpose" aren't human-friendly

2. **Disconnected Stream Display**
   - LiveStreamPanel shows reasoning but not which Luigi task it's for
   - No clear connection between "Processing... 15/61 tasks" and current activity

3. **Automatic Navigation on Completion**
   - `useRecoveryPlan.ts:137-141` automatically redirects to `/plan` page
   - Users lose context and can't review completion summary
   - No opportunity to see final metrics before transition

4. **Missing Task Context**
   - Stream shows `stage: "identify_purpose"` but users don't know:
     - What this task does
     - What it depends on
     - What depends on it
     - How long it typically takes

---

## Technical Architecture Deep Dive

### Data Flow Diagram

```
Luigi Pipeline (Python)
   └─> Task executes
       └─> push_llm_stream_context() [llm_util/__init__.py:40-64]
           └─> Prints: LLM_STREAM|{json}
               └─> pipeline_execution_service.py reads stdout [line 544-569]
                   └─> Parses LLM_STREAM messages
                       └─> websocket_manager.broadcast_to_plan() [line 565]
                           └─> WebSocket: ws://localhost:8080/ws/plans/{plan_id}/progress
                               └─> Frontend: fastApiClient.streamProgress() [fastapi-client.ts]
                                   └─> useRecoveryPlan.ts handles messages [line 734-757]
                                       └─> Updates llmStreams state
                                           └─> LiveStreamPanel displays active
                                           └─> StreamHistoryGrid shows history
```

### Luigi DAG Structure (`docs/LUIGI.md`)

**61 Tasks organized into stages:**
1. Setup (Tasks 1-2)
2. Analysis (Tasks 3-11) - Purpose, risks, currency, locations
3. Strategic (Tasks 12-16) - Decisions, scenarios, experts
4. Planning (Tasks 17-30) - WBS levels 1-3, schedule, exports
5. Team (Tasks 31-36) - Find and enrich team members
6. Pitch (Tasks 37-38)
7. Reports (Tasks 39-41, 61) - Executive summary, final report
8. Governance (Tasks 42-48) - 6-phase governance framework
9. Documents (Tasks 62-66) - Identify, filter, draft
10. Q&A (Task 67)

**Key Insight**: Each Luigi task maps to one or more `stage` names in LLM streams.

### Stage Name Mapping

Current stage names are technical identifiers. We need to map them to human-friendly labels:

**File to Reference**: `planexe-frontend/src/app/recovery/useRecoveryPlan.ts:112-127` 
- Already has `KNOWN_STAGE_ORDER` array
- Already has `STAGE_LABELS` mapping
- Example: `identify_purpose` → "Purpose Analysis"

---

## Proposed Solutions

### 1. Interactive Pipeline Visualization Component

**New Component**: `PipelineDAGVisualization.tsx`

**Purpose**: Visual representation of the 61-task Luigi pipeline with real-time highlighting

**Design Approach**:
- **Vertical timeline** showing all 61 tasks grouped by stage
- **Current task highlighted** with pulsing border
- **Completed tasks** with green checkmark
- **Failed tasks** with red X
- **Pending tasks** grayed out
- **Click any task** to open detail modal (reuse `StreamDetailModal` pattern)

**Data Source**: Existing `stageSummary` from `useRecoveryPlan.ts`
- Already provides: stage key, label, count (artifacts created)
- Already tracks: `activeStageKey` (current stage)

**UI Pattern to Follow**: `planexe-frontend/src/app/recovery/components/StageTimeline.tsx`
- Already exists but only shows stage-level progress
- Enhance to show individual task names within each stage

**Implementation Files**:
```
CREATE: planexe-frontend/src/app/recovery/components/PipelineDAGVisualization.tsx
MODIFY: planexe-frontend/src/app/recovery/page.tsx (add to left column)
REFERENCE: docs/LUIGI.md for task names and dependencies
REFERENCE: useRecoveryPlan.ts STAGE_LABELS for human-friendly names
```

**Key Features**:
1. **Task Card Structure**:
   ```tsx
   {taskName} // e.g., "Purpose Analysis"
   Status Icon // ✓ completed | ⚡ active | ○ pending | ✗ failed
   Duration: 3.2s // if completed
   Artifacts: 2 // from stageSummary.count
   ```

2. **Active Task Indicator**:
   - Pulsing blue border
   - "🔄 Running" badge
   - Live timer showing elapsed seconds
   - Preview of current reasoning (first 100 chars)

3. **Interactive Actions**:
   - Click completed task → Open StreamDetailModal with full history
   - Click active task → Focus LiveStreamPanel
   - Hover task → Show tooltip with dependencies

### 2. Enhanced Current Activity Display

**Enhance**: `CurrentActivityStrip.tsx` (already created)

**Add Connection to Pipeline Context**:
```tsx
// Current: Shows "TASK: identify_purpose"
// Enhanced: Shows "TASK 5/61: Purpose Analysis - Determining project type"
```

**New Props Needed**:
```typescript
interface CurrentActivityStripProps {
  activeStream: LLMStreamState | null;
  completedCount: number;
  totalTasks: number;
  taskDescription?: string;  // NEW: Human-friendly task description
  taskNumber?: number;       // NEW: Task position in DAG (1-61)
  dependenciesCompleted?: string[]; // NEW: What tasks just finished
  nextTasks?: string[];      // NEW: What's queued next
}
```

**Data Source**: Create mapping in `useRecoveryPlan.ts`
```typescript
// Map stage names to task numbers and descriptions
const TASK_METADATA: Record<string, { number: number; description: string }> = {
  identify_purpose: {
    number: 5,
    description: "Analyzing project objectives and determining plan type"
  },
  // ... 60 more entries from LUIGI.md
};
```

### 3. Live Reasoning Panel Enhancement

**Enhance**: `LiveStreamPanel.tsx`

**Current Issues**:
- Shows raw stage name: "identify_purpose"
- No context about what this task produces
- Reasoning and output in small boxes

**Proposed Changes**:
1. **Add Task Context Header**:
   ```tsx
   <div className="task-context-banner">
     <h3>Task 5/61: Purpose Analysis</h3>
     <p>Analyzing your prompt to determine if this is a business, personal, or creative project...</p>
     <Badge>Feeds into: Risk Analysis, Currency Strategy, Locations</Badge>
   </div>
   ```

2. **Expand Reasoning Display**:
   - Make reasoning box full-width (not split 50/50)
   - Add "Pin Reasoning" button to keep visible while output streams
   - Show reasoning token count in real-time

3. **Add Contextual Help**:
   ```tsx
   <Tooltip>
     <InfoIcon />
     <TooltipContent>
       This task uses the Responses API to analyze your prompt and determine
       the project type. Results will inform currency selection and risk analysis.
     </TooltipContent>
   </Tooltip>
   ```

**Files to Modify**:
```
MODIFY: planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx
ADD: Task metadata mapping in useRecoveryPlan.ts
REFERENCE: docs/LUIGI.md for task descriptions
REFERENCE: StreamingAnalysisPanel.tsx for status/control patterns
```

### 4. Completion Summary Modal

**Problem**: `useRecoveryPlan.ts:137-141` auto-redirects on completion
```typescript
React.useEffect(() => {
  if (plan.data?.status === 'completed') {
    router.replace(`/plan?planId=${encodeURIComponent(planId)}&from=recovery`);
  }
}, [plan.data?.status, planId, router]);
```

**Solution**: Replace with completion modal

**New Component**: `PipelineCompletionModal.tsx`

**Design Pattern**: Follow `ConversationModal.tsx` structure
- Full-screen modal with dark overlay
- Celebration animation (confetti or checkmark)
- Comprehensive summary before navigation

**Modal Content**:
```tsx
<CompletionModal>
  {/* Success Banner */}
  <div className="success-banner">
    <CheckCircle className="h-16 w-16 text-green-500 animate-bounce" />
    <h1>Plan Generation Complete! 🎉</h1>
    <p>All 61 tasks completed successfully in {totalDuration}</p>
  </div>

  {/* Executive Summary */}
  <Card>
    <CardHeader>Pipeline Summary</CardHeader>
    <CardContent>
      <Stat label="Total Duration" value={`${minutes}m ${seconds}s`} />
      <Stat label="Tasks Completed" value="61/61" />
      <Stat label="LLM Calls" value={llmStreams.history.length} />
      <Stat label="Total Tokens" value={totalTokens.toLocaleString()} />
      <Stat label="Average Task Time" value={`${avgDuration.toFixed(1)}s`} />
      <Stat label="Artifacts Generated" value={artefacts.length} />
    </CardContent>
  </Card>

  {/* Stage Breakdown */}
  <Card>
    <CardHeader>Stage Performance</CardHeader>
    <CardContent>
      {stageMetrics.map(stage => (
        <div key={stage.name}>
          <Badge>{stage.label}</Badge>
          <span>{stage.duration}s</span>
          <span>{stage.tokens} tokens</span>
        </div>
      ))}
    </CardContent>
  </Card>

  {/* Quick Actions */}
  <div className="actions">
    <Button onClick={handleViewReport} size="lg">
      View Full Report 📄
    </Button>
    <Button onClick={handleDownloadArtifacts} variant="outline">
      Download All Artifacts
    </Button>
    <Button onClick={handleShareResults} variant="outline">
      Share Results
    </Button>
  </div>

  {/* Fine Print */}
  <div className="disclaimer">
    <p>Report available at /plan?planId={planId}</p>
    <Button onClick={() => router.replace('/plan?planId=' + planId)} variant="link">
      Continue to Report →
    </Button>
  </div>
</CompletionModal>
```

**Implementation**:
```typescript
// In useRecoveryPlan.ts
const [showCompletionModal, setShowCompletionModal] = useState(false);

React.useEffect(() => {
  if (plan.data?.status === 'completed' && !showCompletionModal) {
    setShowCompletionModal(true);
    // Do NOT auto-navigate
  }
}, [plan.data?.status, showCompletionModal]);

return {
  // ... existing returns
  showCompletionModal,
  setShowCompletionModal,
};
```

```tsx
// In page.tsx
{showCompletionModal && (
  <PipelineCompletionModal
    planId={planId}
    plan={plan.data}
    llmStreams={llmStreams}
    artefacts={artefacts}
    stageSummary={stageSummary}
    onClose={() => setShowCompletionModal(false)}
    onViewReport={() => router.replace(`/plan?planId=${planId}`)}
  />
)}
```

**Files to Create/Modify**:
```
CREATE: planexe-frontend/src/app/recovery/components/PipelineCompletionModal.tsx
MODIFY: planexe-frontend/src/app/recovery/useRecoveryPlan.ts (remove auto-redirect)
MODIFY: planexe-frontend/src/app/recovery/page.tsx (add modal)
REFERENCE: ConversationModal.tsx for full-screen modal pattern
REFERENCE: PipelineInsights.tsx for metrics calculation
```

### 5. Task Detail Modal Enhancement

**Enhance**: `StreamDetailModal.tsx` (already created)

**Add Pipeline Context Tab**:
```tsx
<TabsContent value="pipeline">
  <div className="pipeline-context">
    <h3>Task #{taskNumber} in Pipeline</h3>
    
    <Section title="Dependencies">
      <TaskList tasks={dependencies} />
    </Section>
    
    <Section title="Produces">
      <ArtifactList artifacts={outputs} />
    </Section>
    
    <Section title="Feeds Into">
      <TaskList tasks={downstream} />
    </Section>
    
    <Section title="Typical Performance">
      <Stat label="Average Duration" value="3.2s" />
      <Stat label="Average Tokens" value="1,200" />
      <Stat label="Success Rate" value="98%" />
    </Section>
  </div>
</TabsContent>
```

**Data Source**: Static mapping from `LUIGI.md`
```typescript
// New file: planexe-frontend/src/app/recovery/constants/pipeline-metadata.ts
export const PIPELINE_TASKS = {
  identify_purpose: {
    number: 5,
    name: "Purpose Analysis",
    description: "Determines if this is a business, personal, or creative project",
    dependencies: ["premise_attack"],
    outputs: ["005-purpose.json"],
    downstream: ["currency_strategy", "physical_locations", "identify_risks"],
    avgDuration: 3.2,
    avgTokens: 1200,
    stage: "analysis",
  },
  // ... 60 more entries
};
```

---

## Implementation Roadmap

### Phase 1: Foundation (2-3 hours)
**Goal**: Create pipeline metadata and enhance existing components

1. **Create Pipeline Metadata** (30 min)
   ```
   CREATE: planexe-frontend/src/app/recovery/constants/pipeline-metadata.ts
   - Extract all 61 tasks from docs/LUIGI.md
   - Map stage names to task numbers, descriptions, dependencies
   - Add typical performance metrics (can start with placeholders)
   ```

2. **Remove Auto-Navigation** (15 min)
   ```
   MODIFY: planexe-frontend/src/app/recovery/useRecoveryPlan.ts:137-141
   - Comment out or condition the auto-redirect
   - Add showCompletionModal state
   - Export completion modal visibility
   ```

3. **Enhance CurrentActivityStrip** (45 min)
   ```
   MODIFY: planexe-frontend/src/app/recovery/components/CurrentActivityStrip.tsx
   - Add task number display (e.g., "Task 5/61")
   - Add human-friendly task name from metadata
   - Add task description tooltip
   - Calculate and show task-level progress percentage
   ```

4. **Add Pipeline Context to LiveStreamPanel** (60 min)
   ```
   MODIFY: planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx
   - Add task context banner at top
   - Show: task number, name, description
   - Add "What this produces" section
   - Add "Feeds into" badges
   - Reference: StreamingAnalysisPanel.tsx for layout patterns
   ```

### Phase 2: Completion Experience (2-3 hours)
**Goal**: Beautiful completion summary instead of auto-navigation

1. **Create Completion Modal** (90 min)
   ```
   CREATE: planexe-frontend/src/app/recovery/components/PipelineCompletionModal.tsx
   - Full-screen modal with celebration
   - Pipeline summary statistics
   - Stage-by-stage breakdown
   - Action buttons (View Report, Download, Share)
   - Reference: ConversationModal.tsx for structure
   - Reference: PipelineInsights.tsx for metrics calculation
   ```

2. **Wire Completion Modal** (30 min)
   ```
   MODIFY: planexe-frontend/src/app/recovery/page.tsx
   - Import PipelineCompletionModal
   - Add conditional rendering based on showCompletionModal
   - Pass all required props (plan, streams, artifacts, etc.)
   - Handle close and navigation actions
   ```

3. **Add Completion Confetti** (15 min)
   ```
   OPTIONAL: Install react-confetti or similar
   - Trigger on modal open
   - Auto-stop after 3 seconds
   ```

### Phase 3: DAG Visualization (3-4 hours)
**Goal**: Interactive pipeline visualization showing all 61 tasks

1. **Create Basic DAG Component** (120 min)
   ```
   CREATE: planexe-frontend/src/app/recovery/components/PipelineDAGVisualization.tsx
   - Vertical timeline layout
   - Group by stage (10 stage sections)
   - Task cards with: name, status icon, duration, artifacts
   - Highlight active task with pulse animation
   - Reference: StageTimeline.tsx for stage grouping
   - Reference: StreamHistoryGrid.tsx for card layout
   ```

2. **Add Interactivity** (60 min)
   ```
   ENHANCE: PipelineDAGVisualization.tsx
   - Click task → Open StreamDetailModal with that task's data
   - Hover task → Show tooltip with dependencies
   - Active task → Auto-scroll into view
   - Add mini progress bar showing X/61 tasks
   ```

3. **Integrate into Layout** (30 min)
   ```
   MODIFY: planexe-frontend/src/app/recovery/page.tsx
   - Add PipelineDAGVisualization to left column
   - Replace or enhance current StageTimeline
   - Ensure responsive layout (collapsible on mobile)
   ```

### Phase 4: Polish & Testing (2-3 hours)
**Goal**: Refinement and user testing

1. **Add Task Detail Tab** (60 min)
   ```
   ENHANCE: planexe-frontend/src/app/recovery/components/StreamDetailModal.tsx
   - Add "Pipeline Context" tab
   - Show: dependencies, outputs, downstream tasks
   - Show: typical performance metrics
   - Reference: pipeline-metadata.ts for data
   ```

2. **Responsive Design** (45 min)
   ```
   TEST & FIX: All new components
   - Test on mobile (< 768px)
   - Test on tablet (768-1024px)
   - Test on desktop (> 1024px)
   - Ensure modals work well on all sizes
   - Collapse DAG visualization on mobile
   ```

3. **Performance Optimization** (30 min)
   ```
   OPTIMIZE: useRecoveryPlan.ts and components
   - Memoize pipeline metadata lookups
   - Debounce real-time updates if needed
   - Lazy load StreamDetailModal content
   - Profile render performance with React DevTools
   ```

4. **Documentation** (45 min)
   ```
   UPDATE: docs/recovery-ui-enhancement-plan.md
   - Document actual implementation vs. plan
   - Add screenshots of final UI
   - Document any deviations or learnings
   - Create user guide for new features
   ```

---

## File Reference Guide

### Files to READ (Understanding)
```
✅ docs/LUIGI.md - Complete Luigi DAG structure (61 tasks)
✅ docs/run_plan_pipeline_documentation.md - Pipeline documentation
✅ planexe/llm_util/__init__.py - How LLM streams are emitted
✅ planexe_api/services/pipeline_execution_service.py - WebSocket broadcasting
✅ planexe_api/api.py:730-789 - WebSocket endpoint
✅ planexe-frontend/src/app/recovery/useRecoveryPlan.ts - Stream state management
```

### Files to CREATE
```
📝 planexe-frontend/src/app/recovery/constants/pipeline-metadata.ts
   - 61 task definitions with metadata
   
📝 planexe-frontend/src/app/recovery/components/PipelineCompletionModal.tsx
   - Full-screen completion summary modal
   
📝 planexe-frontend/src/app/recovery/components/PipelineDAGVisualization.tsx
   - Interactive 61-task pipeline visualization
```

### Files to MODIFY
```
✏️ planexe-frontend/src/app/recovery/useRecoveryPlan.ts
   - Lines 137-141: Remove/condition auto-redirect
   - Add showCompletionModal state
   - Export task metadata lookups
   
✏️ planexe-frontend/src/app/recovery/page.tsx
   - Add PipelineCompletionModal
   - Add/enhance PipelineDAGVisualization
   - Wire up new modal state
   
✏️ planexe-frontend/src/app/recovery/components/CurrentActivityStrip.tsx
   - Add task number and description
   - Enhance with pipeline context
   
✏️ planexe-frontend/src/app/recovery/components/LiveStreamPanel.tsx
   - Add task context banner
   - Show dependencies and outputs
   
✏️ planexe-frontend/src/app/recovery/components/StreamDetailModal.tsx
   - Add "Pipeline Context" tab
   - Show task metadata and dependencies
```

### Files to REFERENCE (Patterns)
```
👀 planexe-frontend/src/components/analysis/StreamingAnalysisPanel.tsx
   - Status display patterns
   - Control button layouts
   
👀 planexe-frontend/src/components/analysis/StreamingMessageBox.tsx
   - Styled content boxes
   - Variant-based coloring
   
👀 planexe-frontend/src/components/planning/ConversationModal.tsx
   - Full-screen modal pattern
   - Message history display
   
👀 planexe-frontend/src/app/recovery/components/StageTimeline.tsx
   - Stage grouping logic
   - Progress indicators
   
👀 planexe-frontend/src/app/recovery/components/StreamHistoryGrid.tsx
   - Dense grid layout
   - Click-to-detail pattern
   
👀 planexe-frontend/src/app/recovery/components/PipelineInsights.tsx
   - Metrics calculation
   - Performance summary
```

---

## UX Design Principles

### 1. Progressive Disclosure
- **Show overview first**: 61-task pipeline at a glance
- **Click for details**: Individual task modal with full context
- **Real-time focus**: Highlight current task prominently

### 2. Context Awareness
- Always show: "Task X/61: Task Name"
- Always explain: What this task does and why
- Always connect: What feeds in, what comes out

### 3. Information Density
- **Dense but scannable**: Use consistent card layouts
- **Visual hierarchy**: Size, color, and position convey importance
- **No wasted space**: Every pixel serves a purpose

### 4. Celebration & Closure
- **Don't auto-navigate**: Let users enjoy completion
- **Show achievements**: Total time, tokens, artifacts
- **Provide next steps**: Clear CTAs for report viewing

### 5. Mobile Responsiveness
- **Collapse DAG on mobile**: Show compact stage list instead
- **Full-screen modals**: Use entire viewport for detail views
- **Touch-friendly**: Large tap targets (min 44x44px)

---

## Testing Checklist

### Functional Testing
- [ ] Pipeline visualization shows all 61 tasks
- [ ] Active task highlighted correctly
- [ ] Completed tasks show green checkmark
- [ ] Failed tasks show red X with error
- [ ] Click task opens detail modal
- [ ] Modal shows correct stream data
- [ ] Completion modal appears on 100% progress
- [ ] Completion modal blocks auto-navigation
- [ ] "View Report" button navigates correctly
- [ ] CurrentActivityStrip shows live timing
- [ ] LiveStreamPanel shows task context

### Data Accuracy
- [ ] Task numbers match Luigi DAG (1-61)
- [ ] Stage names map to human labels correctly
- [ ] Dependencies shown are accurate
- [ ] Metrics calculation is correct
- [ ] Token counts aggregate properly

### Performance
- [ ] UI remains responsive with 61 tasks
- [ ] Real-time updates don't lag (< 100ms)
- [ ] Modal opens/closes smoothly
- [ ] Scrolling is smooth
- [ ] No memory leaks with WebSocket

### Responsive Design
- [ ] Desktop (1920x1080) - All features visible
- [ ] Laptop (1366x768) - Layout adapts
- [ ] Tablet (768x1024) - DAG collapses
- [ ] Mobile (375x667) - Critical info shown

---

## Success Metrics

### User Understanding
- Users can answer: "What task is running right now?"
- Users can answer: "How far through the pipeline are we?"
- Users can answer: "What does the current task produce?"

### Engagement
- Users explore completed tasks via detail modal
- Users review completion summary before navigating
- Users appreciate celebration vs. immediate redirect

### Performance
- No perceivable lag in real-time updates
- Modal interactions feel instant
- Page load time < 2 seconds

---

## Future Enhancements (Out of Scope)

These are good ideas but NOT part of this plan:

1. **Edit Pipeline Mid-Run**: Allow skipping/prioritizing tasks
2. **Performance Comparison**: Compare run times across multiple plans
3. **Custom Task Descriptions**: Let users annotate what they expect
4. **Pipeline Templates**: Pre-configured task sequences
5. **Collaborative Viewing**: Multiple users watch same plan
6. **Historical Analytics**: Track performance trends over time

---

## Conclusion

This plan provides a complete blueprint for dramatically improving the Recovery UI without any backend changes. By leveraging existing WebSocket infrastructure and reusing proven component patterns, we can deliver:

1. **Clear pipeline visualization** - Users see all 61 tasks and where they are
2. **Rich task context** - Every stream shows what task it's for and why it matters
3. **Satisfying completion** - Celebration and summary before navigation
4. **Interactive exploration** - Click any task to see full details

**Estimated Total Time**: 9-13 hours of focused development

**Key Dependencies**: None - all data already streams via WebSocket

**Risk Level**: Low - no backend changes, reuses existing patterns

The next developer should start with Phase 1 (Foundation) and can deliver value incrementally. Each phase builds on the previous while remaining independently deployable.
