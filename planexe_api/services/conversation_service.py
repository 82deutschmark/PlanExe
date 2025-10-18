/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-31T00:00:00Z
 * PURPOSE: Service orchestrating real Responses API conversations, managing
 *          session lifecycle, OpenAI streaming, and SSE harness emission without
 *          relying on local mocks.
 * SRP and DRY check: Pass - centralises conversation orchestration while
 *          delegating queue management to streaming helpers and keeping API
 *          routes lightweight.
 */

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from openai import APIError

from planexe.llm_factory import get_llm, get_llm_names_by_priority, is_valid_llm_name
from planexe.llm_util.simple_openai_llm import SimpleOpenAILLM
from planexe_api.models import (
    ConversationFinalizeRequest,
    CreatePlanRequest,
    SpeedVsDetail,
)
from planexe_api.streaming.conversation_event_handler import ConversationEventHandler
from planexe_api.streaming.conversation_harness import ConversationHarness, ConversationSummary

LOGGER = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are PlanExe's planning strategist. Interview the user, clarify goals, and "
    "return a refined execution brief that can seed a Luigi planning pipeline."
)
DEFAULT_MAX_OUTPUT_TOKENS = 4096

SPEED_CONFIG: Dict[str, Dict[str, Any]] = {
    SpeedVsDetail.FAST_BUT_SKIP_DETAILS.value: {
        "temperature": 0.7,
        "reasoning_effort": "medium",
        "reasoning_summary": "brief",
        "text_verbosity": "low",
        "max_output_tokens": 2048,
    },
    SpeedVsDetail.BALANCED_SPEED_AND_DETAIL.value: {
        "temperature": 0.6,
        "reasoning_effort": "high",
        "reasoning_summary": "concise",
        "text_verbosity": "medium",
        "max_output_tokens": DEFAULT_MAX_OUTPUT_TOKENS,
    },
    SpeedVsDetail.ALL_DETAILS_BUT_SLOW.value: {
        "temperature": 0.4,
        "reasoning_effort": "high",
        "reasoning_summary": "detailed",
        "text_verbosity": "high",
        "max_output_tokens": 6144,
    },
}


@dataclass
class ConversationTurn:
    role: str
    content: str
    metadata: Dict[str, Any]
    created_at: datetime
    reasoning: Optional[str] = None
    json_chunks: List[str] = field(default_factory=list)
    response_id: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None


@dataclass
class ConversationSession:
    conversation_id: str
    prompt: str
    created_at: datetime
    response_id: str
    model_key: str
    tags: List[str] = field(default_factory=list)
    speed_vs_detail: str = SpeedVsDetail.BALANCED_SPEED_AND_DETAIL.value
    openrouter_api_key: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    harness: ConversationHarness = field(init=False)
    history: List[ConversationTurn] = field(default_factory=list)
    expires_at: datetime = field(init=False)
    status: str = field(default="created")
    previous_openai_response_id: Optional[str] = None
    stream_task: Optional[asyncio.Task] = None
    last_summary: Optional[ConversationSummary] = None

    def __post_init__(self) -> None:
        self.expires_at = self.created_at + timedelta(minutes=15)
        self.harness = ConversationHarness(self.conversation_id, self.response_id, self.model_key)

    def to_metadata(self) -> Dict[str, Any]:
        return {
            "conversationId": self.conversation_id,
            "responseId": self.response_id,
            "modelKey": self.model_key,
            "createdAt": self.created_at.replace(tzinfo=timezone.utc).isoformat(),
            "prompt": self.prompt,
            "status": self.status,
        }

    def append_user_turn(self, content: str, metadata: Optional[Dict[str, Any]]) -> None:
        self.history.append(
            ConversationTurn(
                role="user",
                content=content,
                metadata=dict(metadata or {}),
                created_at=datetime.utcnow(),
            )
        )

    def append_assistant_turn(self, summary: ConversationSummary, response_id: Optional[str]) -> None:
        self.history.append(
            ConversationTurn(
                role="assistant",
                content=summary.text,
                metadata={},
                created_at=datetime.utcnow(),
                reasoning=summary.reasoning,
                json_chunks=summary.json_chunks,
                response_id=response_id,
                usage=summary.usage,
            )
        )


class ConversationService:
    """Manage conversation sessions and OpenAI streaming."""

    def __init__(self, ttl_minutes: int = 15) -> None:
        self._sessions: Dict[str, ConversationSession] = {}
        self._lock = asyncio.Lock()
        self._ttl = ttl_minutes

    async def create_session(
        self,
        prompt: str,
        tags: Optional[List[str]] = None,
        model_override: Optional[str] = None,
        speed_vs_detail: str = SpeedVsDetail.BALANCED_SPEED_AND_DETAIL.value,
        openrouter_api_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        previous_response_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        model_key = self._resolve_model_key(model_override)
        conversation_id = uuid.uuid4().hex
        response_id = uuid.uuid4().hex

        session = ConversationSession(
            conversation_id=conversation_id,
            prompt=prompt,
            created_at=datetime.utcnow(),
            response_id=response_id,
            model_key=model_key,
            tags=list(tags or []),
            speed_vs_detail=speed_vs_detail or SpeedVsDetail.BALANCED_SPEED_AND_DETAIL.value,
            openrouter_api_key=openrouter_api_key,
            metadata=dict(metadata or {}),
        )
        session.previous_openai_response_id = previous_response_id
        session.append_user_turn(prompt, metadata)

        async with self._lock:
            self._sessions[conversation_id] = session

        LOGGER.info("Conversation %s created with model %s", conversation_id, model_key)
        return session.to_metadata()

    async def append_message(
        self,
        conversation_id: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        async with self._lock:
            session = self._sessions.get(conversation_id)
            if not session:
                raise ValueError("Conversation session not found")
            if session.stream_task and not session.stream_task.done():
                raise ValueError("Conversation response still streaming")

            session.response_id = uuid.uuid4().hex
            session.harness.reset_for_response(session.response_id, session.model_key)
            session.status = "created"
            session.append_user_turn(message, metadata)
            session.expires_at = datetime.utcnow() + timedelta(minutes=self._ttl)

        LOGGER.debug("Conversation %s appended new user turn", conversation_id)
        return session.to_metadata()

    async def get_harness(self, conversation_id: str) -> ConversationHarness:
        async with self._lock:
            session = self._sessions.get(conversation_id)
            if not session:
                raise ValueError("Conversation session not found")

            should_start = (
                session.status in {"created", "streaming"}
                and (session.stream_task is None or session.stream_task.done())
            )
            harness = session.harness
            if should_start:
                harness.reset_for_response(session.response_id, session.model_key)
                session.status = "streaming"
                session.stream_task = asyncio.create_task(self._run_responses_stream(session))

        return harness

    async def finalize(self, conversation_id: str, request: ConversationFinalizeRequest) -> Dict[str, Any]:
        async with self._lock:
            session = self._sessions.get(conversation_id)
            if not session:
                raise ValueError("Conversation session not found")
            if session.response_id != request.response_id:
                raise ValueError("Response ID does not match latest conversation state")
            summary = session.last_summary or session.harness.summary

        summary_payload = request.summary
        text_payload = summary_payload.text or (summary.text if summary else session.prompt)
        reasoning_payload = summary_payload.reasoning or (summary.reasoning if summary else None)
        json_chunks_payload = summary_payload.json_chunks or (summary.json_chunks if summary else [])
        usage_payload = summary.usage if summary else {}

        plan_prompt = text_payload.strip() or request.prompt or session.prompt
        speed_value = request.speed_vs_detail.value if request.speed_vs_detail else session.speed_vs_detail
        model_key = request.model_override or session.model_key

        plan_request = CreatePlanRequest(
            prompt=plan_prompt,
            llm_model=model_key,
            speed_vs_detail=SpeedVsDetail(speed_value),
            openrouter_api_key=request.openrouter_api_key or session.openrouter_api_key,
        )

        return {
            "conversationId": conversation_id,
            "responseId": request.response_id,
            "planRequest": plan_request,
            "summary": {
                "text": text_payload,
                "reasoning": reasoning_payload,
                "jsonChunks": json_chunks_payload,
            },
            "usage": usage_payload or {},
        }

    async def prune_expired_sessions(self) -> None:
        async with self._lock:
            now = datetime.utcnow()
            expired = [key for key, session in self._sessions.items() if session.expires_at < now]
            for key in expired:
                LOGGER.debug("Pruning expired conversation %s", key)
                self._sessions.pop(key, None)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _resolve_model_key(self, override: Optional[str]) -> str:
        if override:
            if not is_valid_llm_name(override):
                raise ValueError(f"Invalid model override: {override}")
            return override

        preferred = get_llm_names_by_priority()
        if not preferred:
            raise ValueError("No LLM models configured for conversation streaming")
        return preferred[0]

    async def _run_responses_stream(self, session: ConversationSession) -> None:
        llm = self._prepare_llm(session.model_key)
        handler = ConversationEventHandler(session.harness)
        handler.handle_init_sync()

        request_args = llm._request_args(  # pylint: disable=protected-access
            self._build_messages(session),
            schema_entry=None,
            stream=True,
        )

        speed_config = SPEED_CONFIG.get(session.speed_vs_detail, SPEED_CONFIG[SpeedVsDetail.BALANCED_SPEED_AND_DETAIL.value])
        request_args["reasoning"]["effort"] = speed_config["reasoning_effort"]
        request_args["reasoning"]["summary"] = speed_config["reasoning_summary"]
        request_args["text"]["verbosity"] = speed_config["text_verbosity"]
        request_args["max_output_tokens"] = speed_config["max_output_tokens"]
        request_args["temperature"] = speed_config["temperature"]

        if session.previous_openai_response_id:
            request_args["previous_response_id"] = session.previous_openai_response_id

        try:
            final_payload = await asyncio.to_thread(
                self._stream_worker,
                llm,
                request_args,
                handler,
            )
            await session.harness.wait_until_complete()
            summary = session.harness.summary
            if summary:
                session.last_summary = summary
                session.append_assistant_turn(summary, final_payload.get("id") if final_payload else None)
            session.status = "completed"
            session.previous_openai_response_id = final_payload.get("id") if final_payload else session.previous_openai_response_id
        except Exception as error:  # pragma: no cover - defensive logging
            session.status = "error"
            session.last_summary = session.harness.summary
            LOGGER.exception("Conversation %s streaming failed: %s", session.conversation_id, error)
        finally:
            session.stream_task = None

    def _stream_worker(
        self,
        llm: SimpleOpenAILLM,
        request_args: Dict[str, Any],
        handler: ConversationEventHandler,
    ) -> Dict[str, Any]:
        final_payload: Dict[str, Any] = {}
        try:
            with llm._client.responses.stream(**request_args) as stream:  # pylint: disable=protected-access
                for event in stream:
                    event_type = self._event_type(event)
                    if event_type in {
                        "response.output_text.delta",
                        "response.text.delta",
                        "response.content_part.delta",
                        "response.content_part.added",
                    }:
                        text_delta = self._extract_text_delta(event)
                        if text_delta:
                            handler.handle_output_delta_sync(text_delta)
                    elif "reasoning" in event_type and "delta" in event_type:
                        reasoning_delta = self._extract_reasoning_delta(event)
                        if reasoning_delta:
                            handler.handle_reasoning_delta_sync(reasoning_delta)
                    elif event_type in {
                        "response.output_json.delta",
                        "response.output_parsed.delta",
                    }:
                        json_delta = self._extract_json_delta(event)
                        if json_delta:
                            handler.handle_json_delta_sync(json_delta)
                    elif event_type in {"response.failed", "response.error"}:
                        handler.handle_error_sync(self._extract_error(event))
                        raise RuntimeError(f"Streaming error: {self._extract_error(event)}")

                final_response = self._extract_final_response(stream)
                if final_response is not None:
                    final_payload = llm._payload_to_dict(final_response)  # pylint: disable=protected-access

            usage = self._extract_usage(final_payload)
            handler.handle_complete_sync(usage)
        except APIError as api_error:
            handler.handle_error_sync({"message": getattr(api_error, "message", str(api_error))})
            raise
        except Exception as error:
            handler.handle_error_sync({"message": str(error)})
            raise

        return final_payload

    def _prepare_llm(self, model_key: str) -> SimpleOpenAILLM:
        try:
            return get_llm(model_key)
        except Exception as error:  # pragma: no cover - validated in config tests
            LOGGER.error("Unable to load LLM %s: %s", model_key, error)
            raise

    def _build_messages(self, session: ConversationSession) -> List[Dict[str, Any]]:
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": [{"type": "text", "text": DEFAULT_SYSTEM_PROMPT}]},
        ]
        for turn in session.history:
            content_segments: List[Dict[str, Any]] = []
            if turn.content:
                content_segments.append({"type": "text", "text": turn.content})
            if turn.metadata:
                metadata_text = json.dumps(turn.metadata, indent=2, sort_keys=True)
                content_segments.append({"type": "text", "text": f"Metadata:\n{metadata_text}"})
            if turn.role == "assistant" and turn.json_chunks:
                for chunk in turn.json_chunks:
                    content_segments.append({"type": "text", "text": f"JSON Chunk:\n{chunk}"})
            if turn.role == "assistant" and turn.reasoning:
                content_segments.append({"type": "text", "text": f"Reasoning:\n{turn.reasoning}"})
            messages.append({"role": turn.role, "content": content_segments or [{"type": "text", "text": ""}]})
        return messages

    @staticmethod
    def _event_type(event: Any) -> str:
        event_type = getattr(event, "type", None)
        if event_type is None and isinstance(event, dict):
            event_type = event.get("type")
        return str(event_type or "")

    @staticmethod
    def _extract_text_delta(event: Any) -> Optional[str]:
        part = getattr(event, "part", None)
        if part is None and isinstance(event, dict):
            part = event.get("part")
        if isinstance(part, dict):
            part_type = str(part.get("type", "")).lower()
            if "parsed" in part_type or "json" in part_type:
                return None
            text_value = part.get("text") or part.get("content") or part.get("value")
            if isinstance(text_value, list):
                return "".join(str(item) for item in text_value if item)
            if isinstance(text_value, str):
                return text_value
        delta = getattr(event, "delta", None)
        if delta is None and isinstance(event, dict):
            delta = event.get("delta") or event.get("text")
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
    def _extract_reasoning_delta(event: Any) -> Optional[str]:
        delta = getattr(event, "delta", None)
        if delta is None and isinstance(event, dict):
            delta = event.get("delta") or event.get("reasoning")
        if isinstance(delta, dict):
            text_value = delta.get("text") or delta.get("value")
            if isinstance(text_value, list):
                return "".join(str(item) for item in text_value if item)
            if isinstance(text_value, str):
                return text_value
        elif isinstance(delta, str):
            return delta
        return None

    @staticmethod
    def _extract_json_delta(event: Any) -> Optional[str]:
        delta = getattr(event, "delta", None)
        if delta is None and isinstance(event, dict):
            delta = event.get("delta") or event.get("parsed")
        if isinstance(delta, dict):
            return json.dumps(delta, sort_keys=True)
        if isinstance(delta, list):
            return json.dumps(delta, sort_keys=True)
        if isinstance(delta, str) and delta.strip():
            return delta
        return None

    @staticmethod
    def _extract_error(event: Any) -> Dict[str, Any]:
        if isinstance(event, dict):
            return event.get("error") or event
        return {"message": str(event)}

    @staticmethod
    def _extract_final_response(stream: Any) -> Optional[Any]:  # pragma: no cover - passthrough to SDK internals
        final_response_attr = getattr(stream, "final_response", None)
        if callable(final_response_attr):
            return final_response_attr()
        if final_response_attr is not None:
            return final_response_attr
        getter = getattr(stream, "get_final_response", None)
        if callable(getter):
            return getter()
        return None

    @staticmethod
    def _extract_usage(payload: Dict[str, Any]) -> Dict[str, Any]:
        return payload.get("usage") or {}


__all__ = ["ConversationService"]
