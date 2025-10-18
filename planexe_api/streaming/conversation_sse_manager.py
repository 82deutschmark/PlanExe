"""
Author: ChatGPT (gpt-5-codex)
Date: 2025-10-30
PURPOSE: SSE manager for conversation streams, providing heartbeat support
         and wiring harness queues into EventSourceResponse objects.
SRP and DRY check: Pass - isolates SSE response construction from service
         orchestration.
"""

import asyncio
import json
from datetime import datetime
from typing import Any, AsyncIterator, Dict

from sse_starlette import EventSourceResponse

from .conversation_harness import ConversationHarness


class ConversationSSEManager:
    """Build EventSource responses with heartbeat keepalives."""

    def __init__(self, heartbeat_interval: float = 15.0) -> None:
        self.heartbeat_interval = heartbeat_interval

    async def _event_generator(self, harness: ConversationHarness) -> AsyncIterator[Dict[str, Any]]:
        while True:
            try:
                event = await asyncio.wait_for(harness.queue.get(), timeout=self.heartbeat_interval)
                yield {
                    "event": event["event"],
                    "data": json.dumps(event["data"]),
                }
                if event["event"] in {"stream.complete", "stream.error"}:
                    break
            except asyncio.TimeoutError:
                yield {
                    "event": "heartbeat",
                    "data": json.dumps({"timestamp": datetime.utcnow().isoformat() + "Z"}),
                }

    def build_response(self, harness: ConversationHarness) -> EventSourceResponse:
        async def publisher() -> AsyncIterator[Dict[str, Any]]:
            async for payload in self._event_generator(harness):
                yield payload

        return EventSourceResponse(publisher())


__all__ = ["ConversationSSEManager"]
