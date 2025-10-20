"""Domain harness for streaming conversation buffers and SSE-ready events."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class ConversationSummary:
    """Aggregated result for a streamed conversation."""

    conversation_id: str
    model_key: str
    session_id: str
    reasoning_text: str
    content_text: str
    json_chunks: List[Dict[str, Any]] = field(default_factory=list)
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    usage: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        """Return a JSON-serializable representation of the summary."""

        return {
            "conversation_id": self.conversation_id,
            "model_key": self.model_key,
            "session_id": self.session_id,
            "reasoning_text": self.reasoning_text,
            "content_text": self.content_text,
            "json_chunks": self.json_chunks,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "usage": self.usage,
            "error": self.error,
            "metadata": self.metadata,
        }


class ConversationHarness:
    """Buffer and normalize conversation streaming payloads."""

    def __init__(
        self,
        *,
        conversation_id: str,
        model_key: str,
        session_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.conversation_id = conversation_id
        self.model_key = model_key
        self.session_id = session_id
        self.started_at = datetime.now(timezone.utc)
        self.metadata = metadata or {}

        self._reasoning_parts: List[str] = []
        self._content_parts: List[str] = []
        self._json_chunks: List[Dict[str, Any]] = []
        self._usage: Dict[str, Any] = {}
        self._error: Optional[str] = None
        self._completed_at: Optional[datetime] = None

    def on_created(self, response_id: Optional[str]) -> None:
        """Record metadata once the stream is acknowledged."""

        if response_id:
            self.metadata.setdefault("response_id", response_id)

    def append_reasoning(self, delta: str) -> None:
        """Append a reasoning delta."""

        if delta:
            self._reasoning_parts.append(delta)

    def append_content(self, delta: str) -> None:
        """Append an assistant text delta."""

        if delta:
            self._content_parts.append(delta)

    def append_json(self, chunk: Dict[str, Any]) -> None:
        """Persist a structured output delta."""

        if chunk:
            self._json_chunks.append(chunk)

    def set_remote_conversation_id(self, conversation_id: str) -> None:
        """Persist the upstream conversation identifier when provided."""

        if conversation_id and "remote_conversation_id" not in self.metadata:
            self.metadata["remote_conversation_id"] = conversation_id

    def mark_error(self, message: str) -> None:
        """Record an error state."""

        self._error = message

    def mark_completed(self, event: Dict[str, Any]) -> None:
        """Record completion metadata from the terminal event."""

        completed_at = event.get("timestamp") or event.get("completed_at")
        if isinstance(completed_at, (int, float)):
            self._completed_at = datetime.fromtimestamp(completed_at, tz=timezone.utc)
        elif isinstance(completed_at, str):
            try:
                self._completed_at = datetime.fromisoformat(completed_at)
            except ValueError:
                self._completed_at = datetime.now(timezone.utc)
        else:
            self._completed_at = datetime.now(timezone.utc)

    def set_usage(self, usage: Dict[str, Any]) -> None:
        """Attach token usage or billing information to the harness."""

        self._usage = usage

    def complete(self) -> ConversationSummary:
        """Finalize the harness and produce a conversation summary."""

        if not self._completed_at:
            self._completed_at = datetime.now(timezone.utc)
        summary = ConversationSummary(
            conversation_id=self.conversation_id,
            model_key=self.model_key,
            session_id=self.session_id,
            reasoning_text="".join(self._reasoning_parts),
            content_text="".join(self._content_parts),
            json_chunks=list(self._json_chunks),
            started_at=self.started_at,
            completed_at=self._completed_at,
            usage=dict(self._usage),
            error=self._error,
            metadata=self.metadata,
        )
        return summary

    def snapshot(self) -> Dict[str, Any]:
        """Provide a lightweight snapshot without completing the stream."""

        return {
            "conversation_id": self.conversation_id,
            "model_key": self.model_key,
            "session_id": self.session_id,
            "reasoning_text": "".join(self._reasoning_parts),
            "content_text": "".join(self._content_parts),
            "json_chunks": list(self._json_chunks),
            "usage": dict(self._usage),
            "error": self._error,
            "metadata": self.metadata,
            "started_at": self.started_at.isoformat(),
            "completed_at": self._completed_at.isoformat() if self._completed_at else None,
        }
