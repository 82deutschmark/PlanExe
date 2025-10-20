"""Map OpenAI Responses streaming events onto ConversationHarness actions."""

from __future__ import annotations

from typing import Any, Dict, Optional

from .conversation_harness import ConversationHarness


class ConversationEventHandler:
    """Translate Responses event payloads into harness updates."""

    def __init__(self, harness: ConversationHarness) -> None:
        self._harness = harness
        self._response_id: Optional[str] = None

    @property
    def response_id(self) -> Optional[str]:
        """Most recent response identifier observed from the stream."""

        return self._response_id

    def handle(self, event: Dict[str, Any]) -> None:
        """Process a streaming event and update the harness."""

        event_type = event.get("type")
        if not event_type:
            return

        if event_type == "response.created":
            self._response_id = self._extract_response_id(event)
            self._harness.on_created(self._response_id)
            remote_conversation = self._extract_conversation_id(event)
            if remote_conversation:
                self._harness.set_remote_conversation_id(remote_conversation)
        elif event_type == "response.output_text.delta":
            delta = self._extract_text_delta(event)
            if delta:
                self._harness.append_content(delta)
        elif event_type == "response.reasoning_summary_text.delta":
            delta = self._extract_reasoning_delta(event)
            if delta:
                self._harness.append_reasoning(delta)
        elif event_type == "response.output_json.delta":
            delta = self._extract_json_delta(event)
            if delta is not None:
                self._harness.append_json(delta)
        elif event_type in {"response.completed"}:
            self._harness.mark_completed(event)
        elif event_type in {"response.error", "response.failed"}:
            message = self._extract_error_message(event)
            self._harness.mark_error(message)

    @staticmethod
    def _extract_response_id(event: Dict[str, Any]) -> Optional[str]:
        response = event.get("response") or event.get("data")
        if isinstance(response, dict):
            response_id = response.get("id")
            if isinstance(response_id, str) and response_id:
                return response_id
        candidate = event.get("id")
        if isinstance(candidate, str) and candidate:
            return candidate
        return None

    @staticmethod
    def _extract_conversation_id(event: Dict[str, Any]) -> Optional[str]:
        response = event.get("response") or event.get("data")
        if isinstance(response, dict):
            conversation_id = response.get("conversation_id") or response.get("conversation")
            if isinstance(conversation_id, str) and conversation_id:
                return conversation_id
        payload = event.get("conversation")
        if isinstance(payload, dict):
            candidate = payload.get("id")
            if isinstance(candidate, str) and candidate:
                return candidate
        return None

    @staticmethod
    def _extract_text_delta(event: Dict[str, Any]) -> Optional[str]:
        delta = event.get("delta")
        if isinstance(delta, dict):
            text_value = delta.get("text") or delta.get("value") or delta.get("content")
            if isinstance(text_value, list):
                return "".join(str(item) for item in text_value if item)
            if isinstance(text_value, str):
                return text_value
        elif isinstance(delta, str):
            return delta
        return None

    @staticmethod
    def _extract_reasoning_delta(event: Dict[str, Any]) -> Optional[str]:
        delta = event.get("delta")
        if isinstance(delta, dict):
            reasoning_value = delta.get("text") or delta.get("value") or delta.get("summary")
            if isinstance(reasoning_value, list):
                return "".join(str(item) for item in reasoning_value if item)
            if isinstance(reasoning_value, str):
                return reasoning_value
        elif isinstance(delta, str):
            return delta
        return None

    @staticmethod
    def _extract_json_delta(event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        delta = event.get("delta") or event.get("parsed")
        if isinstance(delta, dict):
            return delta
        return None

    @staticmethod
    def _extract_error_message(event: Dict[str, Any]) -> str:
        for key in ("message", "error", "detail"):
            value = event.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return "Conversation stream failed"
