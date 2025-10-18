"""
Author: ChatGPT (gpt-5-codex)
Date: 2025-10-31T00:00:00Z
PURPOSE: Domain-specific adapter that converts Responses API callbacks into
         harness operations for conversation streaming. Adds synchronous
         wrappers so worker threads can emit deltas without blocking the
         event loop.
SRP and DRY check: Pass - provides a thin translation layer without coupling
         higher-level services to queue mechanics.
"""

import asyncio
from typing import Any, Dict, Optional

from .conversation_harness import ConversationHarness


class ConversationEventHandler:
    """Translate OpenAI Responses-style events to harness actions."""

    def __init__(self, harness: ConversationHarness) -> None:
        self._harness = harness
        self._loop = asyncio.get_event_loop()

    async def handle_output_delta(self, delta: str) -> None:
        await self._harness.emit_chunk("text", delta)

    async def handle_reasoning_delta(self, delta: str) -> None:
        await self._harness.emit_chunk("reasoning", delta)

    async def handle_json_delta(self, delta: Any) -> None:
        await self._harness.emit_chunk("json", delta if isinstance(delta, str) else json_dumps(delta))

    async def handle_init(self) -> None:
        await self._harness.emit_init()

    async def handle_complete(self, usage: Optional[Dict[str, Any]] = None) -> None:
        await self._harness.emit_complete(usage=usage)

    async def handle_error(self, error: Any) -> None:
        await self._harness.emit_error(error)

    def handle_init_sync(self) -> None:
        asyncio.run_coroutine_threadsafe(self.handle_init(), self._loop)

    def handle_output_delta_sync(self, delta: str) -> None:
        asyncio.run_coroutine_threadsafe(self.handle_output_delta(delta), self._loop)

    def handle_reasoning_delta_sync(self, delta: str) -> None:
        asyncio.run_coroutine_threadsafe(self.handle_reasoning_delta(delta), self._loop)

    def handle_json_delta_sync(self, delta: Any) -> None:
        asyncio.run_coroutine_threadsafe(self.handle_json_delta(delta), self._loop)

    def handle_complete_sync(self, usage: Optional[Dict[str, Any]] = None) -> None:
        asyncio.run_coroutine_threadsafe(self.handle_complete(usage), self._loop)

    def handle_error_sync(self, error: Any) -> None:
        asyncio.run_coroutine_threadsafe(self.handle_error(error), self._loop)


def json_dumps(payload: Dict[str, Any]) -> str:
    import json

    return json.dumps(payload, sort_keys=True)


__all__ = ["ConversationEventHandler"]
