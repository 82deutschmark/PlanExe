"""Utility for relaying conversation streaming events over SSE."""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, Dict, Optional


class ConversationSSEManager:
    """Bridge conversation harness events to Server-Sent Events."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[Optional[Dict[str, str]]] = asyncio.Queue()
        self._loop = asyncio.get_event_loop()
        self._closed = False

    def push(self, event: str, data: Dict[str, Any]) -> None:
        """Schedule a single event to be emitted over SSE."""

        if not event:
            return
        payload = {
            "event": event,
            "data": json.dumps(data),
        }
        asyncio.run_coroutine_threadsafe(self._queue.put(payload), self._loop)

    def complete(self) -> None:
        """Signal that no more events will be emitted."""

        asyncio.run_coroutine_threadsafe(self._queue.put(None), self._loop)

    async def stream(self) -> AsyncGenerator[Dict[str, str], None]:
        """Yield events suitable for EventSourceResponse."""

        while True:
            item = await self._queue.get()
            if item is None:
                break
            yield item

    async def close(self) -> None:
        if not self._closed:
            self._closed = True
            await self._queue.put(None)
