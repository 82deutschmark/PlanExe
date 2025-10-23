# Streaming Architecture Analysis

**Date**: 2025-10-23
**Author**: Claude (Sonnet 4.5)
**Purpose**: Analysis of streaming implementation patterns across the PlanExe frontend

## Executive Summary

The recovery page **CORRECTLY** implements streaming by reusing the centralized `WebSocketClient` class. However, `Terminal.tsx` and `LuigiPipelineView.tsx` contain **duplicated WebSocket management code** that should be refactored to use the same reusable client.

## Streaming Patterns in the Codebase

### 1. EventSource (SSE) Streaming - ✅ Properly Abstracted

**Used for**: Conversations API and Analysis API

**Files**:
- [`lib/streaming/conversation-streaming.ts`](../planexe-frontend/src/lib/streaming/conversation-streaming.ts) - Conversation streaming hook
- [`lib/streaming/analysis-streaming.ts`](../planexe-frontend/src/lib/streaming/analysis-streaming.ts) - Analysis streaming hook

**Pattern**:
```typescript
// Clean abstraction via hooks
const { status, textBuffer, startStream, closeStream } = useConversationStreaming();
const { status, textBuffer, startStream, cancelStream } = useAnalysisStreaming();
```

**Status**: ✅ **EXCELLENT** - Both hooks properly encapsulate EventSource lifecycle, handshake, throttled delta aggregation, error handling, and cleanup.

---

### 2. WebSocket Streaming - ⚠️ Mixed Implementation

**Used for**: Real-time pipeline progress updates

#### 2a. Centralized WebSocketClient - ✅ Reusable Abstraction

**File**: [`lib/api/fastapi-client.ts`](../planexe-frontend/src/lib/api/fastapi-client.ts#L423-L521)

**Features**:
- Event-based API (`on`, `off`, `emit`)
- Automatic reconnection with exponential backoff
- Connection state management
- Type-safe message handling
- Clean lifecycle (`connect`, `disconnect`, `isConnected`)

**Usage**:
```typescript
const client = fastApiClient.streamProgress(planId);
client.on('message', handleMessage);
client.on('close', handleClose);
await client.connect();
// ... cleanup
client.disconnect();
```

**Status**: ✅ **EXCELLENT** - This is the canonical implementation.

---

#### 2b. Recovery Page - ✅ Correctly Uses WebSocketClient

**File**: [`app/recovery/useRecoveryPlan.ts`](../planexe-frontend/src/app/recovery/useRecoveryPlan.ts#L514-L634)

**Implementation**:
```typescript
useEffect(() => {
  const client = fastApiClient.streamProgress(planId);
  wsClientRef.current = client;

  client.on('message', handleMessage);
  client.on('close', handleClose);
  client.on('error', handleClose);

  client.connect()
    .then(() => setConnection({ status: 'connected' }))
    .catch(() => setConnection({ mode: 'polling', status: 'error' }));

  return () => {
    client.disconnect();
  };
}, [planId]);
```

**Status**: ✅ **CORRECT** - Properly reuses the centralized client.

---

#### 2c. Terminal Component - ❌ Duplicates WebSocket Logic

**File**: [`components/monitoring/Terminal.tsx`](../planexe-frontend/src/components/monitoring/Terminal.tsx#L263-L433)

**Problems**:
- ~170 lines of manual WebSocket management
- Duplicates reconnection logic (attempts, exponential backoff)
- Duplicates connection state tracking
- Duplicates message parsing/routing
- Manual cleanup logic

**Code smell**:
```typescript
const connectWebSocket = useCallback(() => {
  const ws = new WebSocket(wsUrl);  // ❌ Raw WebSocket
  wsRef.current = ws;

  ws.onopen = () => { /* ... */ };
  ws.onmessage = (event) => { /* 50+ lines of parsing */ };
  ws.onerror = () => { /* ... */ };
  ws.onclose = (event) => { /* manual reconnection logic */ };
}, [planId, ...]);

const scheduleReconnect = useCallback(() => {
  // ❌ Duplicates WebSocketClient.scheduleReconnect
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  setTimeout(() => { connectWebSocket(); }, delay);
}, [reconnectAttempts, connectWebSocket]);
```

**Status**: ❌ **NEEDS REFACTORING** - Should use `WebSocketClient`.

---

#### 2d. LuigiPipelineView Component - ❌ Duplicates WebSocket Logic

**File**: [`components/monitoring/LuigiPipelineView.tsx`](../planexe-frontend/src/components/monitoring/LuigiPipelineView.tsx#L87-L233)

**Problems**:
- ~150 lines of manual WebSocket management
- Duplicates exact same reconnection pattern as Terminal
- Duplicates connection state tracking
- Duplicates message parsing (with Luigi-specific logic)

**Status**: ❌ **NEEDS REFACTORING** - Should use `WebSocketClient`.

---

## Recommendations

### Priority 1: Refactor Terminal.tsx to Use WebSocketClient

**Current**: 170 lines of duplicated WebSocket code
**Target**: ~50 lines using `WebSocketClient`

**Proposed approach**:
```typescript
useEffect(() => {
  if (!planId) return;

  const client = fastApiClient.streamProgress(planId);

  client.on('message', (payload) => {
    if (!isWebSocketMessage(payload)) return;

    switch (payload.type) {
      case 'llm_stream':
        handleLlmStreamMessage(payload);
        break;
      case 'log':
        addLog(payload.message, detectLogLevel(payload.message));
        break;
      case 'status':
        handleStatusUpdate(payload);
        break;
      // ... other cases
    }
  });

  client.on('close', () => startPollingFallback());

  client.connect()
    .then(() => addLog('Connected to pipeline stream', 'info'))
    .catch(() => startPollingFallback());

  return () => client.disconnect();
}, [planId]);
```

**Benefits**:
- Removes ~120 lines of duplicated code
- Consistent reconnection behavior across app
- Easier to maintain/debug
- Single source of truth for WebSocket state

---

### Priority 2: Refactor LuigiPipelineView.tsx to Use WebSocketClient

**Current**: 150 lines of duplicated WebSocket code
**Target**: ~60 lines using `WebSocketClient`

**Proposed approach**:
```typescript
useEffect(() => {
  const client = fastApiClient.streamProgress(planId);

  client.on('message', (payload) => {
    if (!isWebSocketMessage(payload)) return;

    if (payload.type === 'log') {
      // Luigi-specific parsing
      const taskMatch = payload.message.match(/(\w+Task)/);
      if (taskMatch && payload.message.includes('completed successfully')) {
        updateTaskStatus(taskMatch[1], 'completed');
      }
    }
    // ... other Luigi-specific logic
  });

  client.on('close', () => setWsConnected(false));

  client.connect()
    .then(() => setWsConnected(true))
    .catch(() => console.error('Luigi WS failed'));

  return () => client.disconnect();
}, [planId]);
```

**Benefits**:
- Same as Terminal refactor
- Luigi-specific message parsing remains, but infrastructure is shared

---

### Priority 3: Consider WebSocket Hook Abstraction (Optional)

If we refactor Terminal and LuigiPipelineView, we might extract a common hook:

```typescript
// lib/streaming/websocket-streaming.ts
export function useWebSocketProgress(planId: string, handlers: {
  onMessage?: (msg: WebSocketMessage) => void;
  onStatus?: (status: StatusMessage) => void;
  onLog?: (log: LogMessage) => void;
  onLlmStream?: (stream: LLMStreamMessage) => void;
  onClose?: () => void;
}) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = fastApiClient.streamProgress(planId);

    client.on('message', (payload) => {
      if (!isWebSocketMessage(payload)) return;

      handlers.onMessage?.(payload);

      switch (payload.type) {
        case 'status': handlers.onStatus?.(payload); break;
        case 'log': handlers.onLog?.(payload); break;
        case 'llm_stream': handlers.onLlmStream?.(payload); break;
      }
    });

    client.on('close', () => {
      setConnected(false);
      handlers.onClose?.();
    });

    client.connect().then(() => setConnected(true));

    return () => client.disconnect();
  }, [planId]);

  return { connected };
}
```

**Usage**:
```typescript
// Terminal.tsx
const { connected } = useWebSocketProgress(planId, {
  onLog: (msg) => addLog(msg.message, detectLogLevel(msg.message)),
  onLlmStream: handleLlmStreamMessage,
  onStatus: handleStatusUpdate,
  onClose: startPollingFallback,
});

// LuigiPipelineView.tsx
const { connected } = useWebSocketProgress(planId, {
  onLog: (msg) => parseLuigiTaskStatus(msg.message),
});
```

---

## Conclusion

### Current State

| Component | Pattern | Status | LOC |
|-----------|---------|--------|-----|
| Conversation streaming | EventSource + hook | ✅ Excellent | ~150 |
| Analysis streaming | EventSource + hook | ✅ Excellent | ~180 |
| **Recovery page** | **WebSocketClient** | **✅ Correct** | **~120** |
| Terminal | Raw WebSocket | ❌ Duplicated | ~170 |
| LuigiPipelineView | Raw WebSocket | ❌ Duplicated | ~150 |

### Answer to Original Question

> "Does the recovery page correctly implement and reuse the streaming logic we use in the rest of the project?"

**YES** - The recovery page is actually the **ONLY** component that correctly reuses the centralized `WebSocketClient` abstraction. Terminal and LuigiPipelineView should follow the recovery page's example.

### Recommended Actions

1. ✅ **Keep recovery page as-is** - it's the reference implementation
2. 🔧 **Refactor Terminal.tsx** - replace raw WebSocket with `WebSocketClient`
3. 🔧 **Refactor LuigiPipelineView.tsx** - replace raw WebSocket with `WebSocketClient`
4. 📋 **Optional**: Create `useWebSocketProgress` hook for even cleaner reuse

### Estimated Impact

- **Lines of code removed**: ~240 lines (duplicated WebSocket management)
- **Maintenance burden**: Reduced (single source of truth for reconnection logic)
- **Bug surface area**: Reduced (fewer places where WebSocket edge cases can hide)
- **Consistency**: Improved (all components use same WebSocket lifecycle)

---

## Files Reference

### ✅ Good Examples (Reuse Centralized Logic)
- [`lib/api/fastapi-client.ts`](../planexe-frontend/src/lib/api/fastapi-client.ts) - WebSocketClient class
- [`app/recovery/useRecoveryPlan.ts`](../planexe-frontend/src/app/recovery/useRecoveryPlan.ts) - Uses WebSocketClient
- [`lib/streaming/conversation-streaming.ts`](../planexe-frontend/src/lib/streaming/conversation-streaming.ts) - EventSource hook
- [`lib/streaming/analysis-streaming.ts`](../planexe-frontend/src/lib/streaming/analysis-streaming.ts) - EventSource hook

### ❌ Needs Refactoring (Duplicate Logic)
- [`components/monitoring/Terminal.tsx`](../planexe-frontend/src/components/monitoring/Terminal.tsx) - Should use WebSocketClient
- [`components/monitoring/LuigiPipelineView.tsx`](../planexe-frontend/src/components/monitoring/LuigiPipelineView.tsx) - Should use WebSocketClient
