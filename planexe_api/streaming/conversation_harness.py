"""
Author: ChatGPT (gpt-5-codex)
Date: 2025-10-31T00:00:00Z
PURPOSE: Buffering harness for conversation SSE streams, accumulating
         Responses-style deltas and exposing them via an asyncio queue for
         the EventSource manager. Updated to support cross-thread emission so
         OpenAI streaming can execute inside worker threads without blocking
         the event loop.
SRP and DRY check: Pass - focuses solely on buffering and emitting events,
         delegating persistence and orchestration elsewhere.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator, Dict, List, Optional


@dataclass
class ConversationSummary:
    text: str
    reasoning: Optional[str] = None
    json_chunks: List[str] = field(default_factory=list)
    usage: Optional[Dict[str, Any]] = None


class ConversationHarness:
    """Buffers streaming deltas and exposes them via an async queue."""

    def __init__(self, conversation_id: str, response_id: str, model_key: str) -> None:
        self.conversation_id = conversation_id
        self.response_id = response_id
        self.model_key = model_key
        self._queue: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue()
        self._text_parts: List[str] = []
        self._reasoning_parts: List[str] = []
        self._json_parts: List[str] = []
        self._summary: Optional[ConversationSummary] = None
        self._completed = asyncio.Event()
        self._loop = asyncio.get_running_loop()

    @property
    def queue(self) -> "asyncio.Queue[Dict[str, Any]]":
        return self._queue

    @property
    def summary(self) -> Optional[ConversationSummary]:
        return self._summary

    def reset_for_response(self, response_id: str, model_key: Optional[str] = None) -> None:
        self.response_id = response_id
        if model_key:
            self.model_key = model_key
        self._text_parts = []
        self._reasoning_parts = []
        self._json_parts = []
        self._summary = None
        self._completed = asyncio.Event()
        self._queue = asyncio.Queue()

    async def emit_init(self) -> None:
        await self._queue.put(
            {
                "event": "stream.init",
                "data": {
                    "conversationId": self.conversation_id,
                    "responseId": self.response_id,
                    "modelKey": self.model_key,
                    "startedAt": datetime.utcnow().isoformat() + "Z",
                },
            }
        )

    async def emit_chunk(self, kind: str, delta: str) -> None:
        if kind == "text":
            self._text_parts.append(delta)
        elif kind == "reasoning":
            self._reasoning_parts.append(delta)
        elif kind == "json":
            self._json_parts.append(delta)

        await self._queue.put(
            {
                "event": "stream.chunk",
                "data": {
                    "conversationId": self.conversation_id,
                    "responseId": self.response_id,
                    "kind": kind,
                    "delta": delta,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            }
        )

    async def emit_complete(self, usage: Optional[Dict[str, Any]] = None) -> None:
        summary = ConversationSummary(
            text="".join(self._text_parts),
            reasoning="\n".join(self._reasoning_parts) if self._reasoning_parts else None,
            json_chunks=self._json_parts.copy(),
            usage=usage,
        )
        self._summary = summary
        await self._queue.put(
            {
                "event": "stream.complete",
                "data": {
                    "conversationId": self.conversation_id,
                    "responseId": self.response_id,
                    "completedAt": datetime.utcnow().isoformat() + "Z",
                    "summary": {
                        "text": summary.text,
                        "reasoning": summary.reasoning,
                        "jsonChunks": summary.json_chunks,
                        "usage": usage or {},
                    },
                },
            }
        )
        self._completed.set()

    async def emit_error(self, error: Any) -> None:
        await self._queue.put(
            {
                "event": "stream.error",
                "data": {
                    "conversationId": self.conversation_id,
                    "responseId": self.response_id,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "error": error,
                },
            }
        )
        self._completed.set()

    def emit_init_from_worker(self) -> None:
        asyncio.run_coroutine_threadsafe(self.emit_init(), self._loop)

    def emit_chunk_from_worker(self, kind: str, delta: str) -> None:
        asyncio.run_coroutine_threadsafe(self.emit_chunk(kind, delta), self._loop)

    def emit_complete_from_worker(self, usage: Optional[Dict[str, Any]] = None) -> None:
        asyncio.run_coroutine_threadsafe(self.emit_complete(usage=usage), self._loop)

    def emit_error_from_worker(self, error: Any) -> None:
        asyncio.run_coroutine_threadsafe(self.emit_error(error), self._loop)

    async def events(self) -> AsyncIterator[Dict[str, Any]]:
        while True:
            payload = await self._queue.get()
            yield payload
            if payload["event"] in {"stream.complete", "stream.error"}:
                break

    async def wait_until_complete(self, timeout: Optional[float] = None) -> bool:
        try:
            await asyncio.wait_for(self._completed.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False


__all__ = ["ConversationHarness", "ConversationSummary"]
