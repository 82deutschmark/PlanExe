"""Service layer for managing Responses API conversations and SSE streaming."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import HTTPException
from openai import APIError

from planexe_api.database import DatabaseService, SessionLocal, LLMInteraction
from planexe_api.models import (
    ConversationCreateRequest,
    ConversationFinalizeResponse,
    ConversationTurnRequest,
)
from planexe_api.streaming import (
    CachedConversationSession,
    ConversationEventHandler,
    ConversationHarness,
    ConversationSSEManager,
    ConversationSessionStore,
    ConversationSummary,
)
from planexe.llm_factory import get_llm, is_valid_llm_name
from planexe.llm_util.simple_openai_llm import SimpleOpenAILLM


INTAKE_STAGE = "intake_conversation"

ALLOWED_STREAM_EVENTS = {
    "response.created",
    "response.output_text.delta",
    "response.reasoning_summary_text.delta",
    "response.output_json.delta",
    "response.completed",
    "response.error",
    "response.failed",
}


@dataclass
class ConversationRecord:
    """Metadata associated with a durable conversation thread."""

    conversation_id: str
    created_at: datetime
    model_key: str
    store: bool
    metadata: Dict[str, Any]


class ConversationService:
    """Coordinate Conversations API handshakes, streaming, and persistence."""

    def __init__(self, *, session_store: ConversationSessionStore) -> None:
        self._sessions = session_store
        self._summaries: Dict[str, ConversationFinalizeResponse] = {}
        self._conversations: Dict[str, ConversationRecord] = {}
        self._lock = asyncio.Lock()

    async def create_conversation(
        self, request: ConversationCreateRequest
    ) -> ConversationRecord:
        """Create a durable OpenAI conversation and cache its metadata."""

        if not is_valid_llm_name(request.model_key):
            raise HTTPException(status_code=422, detail="MODEL_UNAVAILABLE")

        llm = get_llm(request.model_key)

        try:
            response = llm._client.conversations.create(  # pylint: disable=protected-access
                metadata=request.metadata or {}
            )
        except APIError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        conversation_id = getattr(response, "id", None)
        if not isinstance(conversation_id, str) or not conversation_id:
            conversation_id = self._generate_remote_conversation_id()

        created_at_value = getattr(response, "created_at", None)
        if isinstance(created_at_value, (int, float)):
            created_at = datetime.fromtimestamp(created_at_value, tz=timezone.utc)
        elif isinstance(created_at_value, datetime):
            created_at = created_at_value.astimezone(timezone.utc)
        else:
            created_at = datetime.now(timezone.utc)

        record = ConversationRecord(
            conversation_id=conversation_id,
            created_at=created_at,
            model_key=request.model_key,
            store=request.store,
            metadata=request.metadata or {},
        )

        async with self._lock:
            self._conversations[conversation_id] = record

        return record

    async def create_request(
        self,
        *,
        conversation_id: str,
        request: ConversationTurnRequest,
    ) -> CachedConversationSession:
        """Validate a turn request and cache it until the SSE connection is established."""

        if not is_valid_llm_name(request.model_key):
            raise HTTPException(status_code=422, detail="MODEL_UNAVAILABLE")

        record = await self._ensure_conversation_record(conversation_id, request)
        llm = get_llm(request.model_key)

        payload = {
            "request": request.model_dump(mode="python"),
            "conversation_id": record.conversation_id,
            "model": llm.model,
            "store": request.store,
        }

        cached = await self._sessions.create_session(
            conversation_id=record.conversation_id,
            model_key=request.model_key,
            payload=payload,
        )
        return cached

    async def _ensure_conversation_record(
        self, conversation_id: str, request: ConversationTurnRequest
    ) -> ConversationRecord:
        """Ensure we have metadata cached for the provided conversation id."""

        async with self._lock:
            record = self._conversations.get(conversation_id)
            if record:
                if record.model_key != request.model_key:
                    record.model_key = request.model_key
                record.store = request.store
                if request.metadata:
                    record.metadata.update(request.metadata)
                return record

        # If we reach here, assume the identifier refers to a remote conversation
        # created outside of this process and seed a local record.
        seeded = ConversationRecord(
            conversation_id=conversation_id,
            created_at=datetime.now(timezone.utc),
            model_key=request.model_key,
            store=request.store,
            metadata=request.metadata or {},
        )

        async with self._lock:
            self._conversations[conversation_id] = seeded

        return seeded

    async def stream(
        self,
        *,
        conversation_id: str,
        token: str,
    ) -> AsyncGenerator[Dict[str, str], None]:
        """Upgrade a cached session into a live SSE stream."""

        try:
            cached = await self._sessions.pop_session(
                conversation_id=conversation_id,
                session_id=token,
            )
        except KeyError as exc:
            detail = exc.args[0] if exc.args else "SESSION_ERROR"
            raise HTTPException(status_code=404, detail=detail)

        request = ConversationTurnRequest.model_validate(cached.payload["request"])
        metadata = dict(request.metadata or {})
        if request.previous_response_id:
            metadata.setdefault("previous_response_id", request.previous_response_id)

        record = await self._ensure_conversation_record(conversation_id, request)

        harness = ConversationHarness(
            conversation_id=record.conversation_id,
            model_key=request.model_key,
            session_id=cached.session_id,
            metadata=metadata,
        )
        manager = ConversationSSEManager()
        handler = ConversationEventHandler(harness)

        stream_task = asyncio.create_task(
            self._run_stream(
                request=request,
                handler=handler,
                harness=harness,
                manager=manager,
                store=bool(cached.payload.get("store", True)),
            )
        )

        try:
            async for event in manager.stream():
                yield event
        finally:
            await manager.close()
            await asyncio.gather(stream_task, return_exceptions=True)

    async def finalize(self, conversation_id: str) -> ConversationFinalizeResponse:
        """Return the last known summary for a conversation."""

        async with self._lock:
            if conversation_id in self._summaries:
                return self._summaries[conversation_id]

        db = SessionLocal()
        try:
            interaction = (
                db.query(LLMInteraction)
                .filter(
                    LLMInteraction.plan_id == conversation_id,
                    LLMInteraction.stage == INTAKE_STAGE,
                )
                .order_by(LLMInteraction.started_at.desc())
                .first()
            )
            if not interaction:
                raise HTTPException(status_code=404, detail="CONVERSATION_NOT_FOUND")
            metadata = interaction.response_metadata or {}
            completed_at = metadata.get("completed_at")
            if isinstance(completed_at, str):
                try:
                    completed_at = datetime.fromisoformat(completed_at)
                except ValueError:
                    completed_at = None
            summary = ConversationFinalizeResponse(
                conversation_id=conversation_id,
                response_id=metadata.get("response_id"),
                model_key=interaction.llm_model,
                aggregated_text=(interaction.response_text or ""),
                reasoning_text=metadata.get("reasoning_text", ""),
                json_chunks=metadata.get("json_chunks", []),
                usage=metadata.get("usage", {}),
                completed_at=completed_at,
            )
            async with self._lock:
                self._summaries[conversation_id] = summary
            return summary
        finally:
            db.close()

    async def _run_stream(
        self,
        *,
        request: ConversationTurnRequest,
        handler: ConversationEventHandler,
        harness: ConversationHarness,
        manager: ConversationSSEManager,
    ) -> None:
        llm = get_llm(request.model_key)
        request_args = self._build_request_args(
            llm_model=llm.model,
            conversation_id=harness.conversation_id,
            request=request,
        )

        db = SessionLocal()
        db_service = DatabaseService(db)
        start_time = datetime.now(timezone.utc)
        interaction = db_service.create_llm_interaction(
            {
                "plan_id": harness.conversation_id,
                "stage": INTAKE_STAGE,
                "llm_model": llm.model,
                "prompt_text": request.user_message,
                "prompt_metadata": {
                    "conversation_id": harness.conversation_id,
                    "metadata": request.metadata,
                    "previous_response_id": request.previous_response_id,
                    "instructions": request.instructions,
                    "store": store,
                },
                "status": "running",
                "started_at": start_time,
            }
        )

        try:
            final_payload = await asyncio.to_thread(
                self._execute_stream,
                llm,
                request_args,
                handler,
                manager,
            )
            remote_conversation = final_payload.get("conversation_id")
            if (
                isinstance(remote_conversation, str)
                and remote_conversation
                and "remote_conversation_id" not in harness.metadata
            ):
                harness.metadata["remote_conversation_id"] = remote_conversation
            usage = SimpleOpenAILLM._normalize_usage(final_payload.get("usage"))
            harness.set_usage(usage)
            summary = harness.complete()
            summary.metadata.setdefault("response_id", handler.response_id)
            if summary.completed_at:
                summary.metadata.setdefault("completed_at", summary.completed_at.isoformat())

            await self._persist_summary(
                summary=summary,
                response_id=handler.response_id,
                model_key=llm.model,
            )

            duration = None
            if summary.completed_at:
                duration = (summary.completed_at - start_time).total_seconds()

            db_service.update_llm_interaction(
                interaction.id,
                {
                    "status": "completed",
                    "completed_at": summary.completed_at,
                    "duration_seconds": duration,
                    "response_text": summary.content_text,
                    "response_metadata": {
                        "reasoning_text": summary.reasoning_text,
                        "json_chunks": summary.json_chunks,
                        "usage": usage,
                        "metadata": summary.metadata,
                        "response_id": handler.response_id,
                        "completed_at": summary.completed_at.isoformat()
                        if summary.completed_at
                        else None,
                    },
                    "input_tokens": usage.get("input_tokens"),
                    "output_tokens": usage.get("output_tokens"),
                    "total_tokens": usage.get("total_tokens"),
                },
            )
        except Exception as exc:  # pylint: disable=broad-except
            message = str(exc)
            harness.mark_error(message)
            summary = harness.complete()
            manager.complete()
            try:
                await self._persist_summary(
                    summary=summary,
                    response_id=handler.response_id,
                    model_key=llm.model,
                )
            except Exception as persist_exc:  # pylint: disable=broad-except
                print(
                    "[ConversationService] Failed to persist error summary:",
                    persist_exc,
                )
            db_service.update_llm_interaction(
                interaction.id,
                {
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc),
                    "error_message": message,
                },
            )
            return
        finally:
            try:
                db.close()
            except Exception:  # pragma: no cover
                pass

    def _execute_stream(
        self,
        llm: SimpleOpenAILLM,
        request_args: Dict[str, Any],
        handler: ConversationEventHandler,
        manager: ConversationSSEManager,
    ) -> Dict[str, Any]:
        final_payload: Dict[str, Any] = {}
        try:
            with llm._client.responses.stream(**request_args) as stream:  # pylint: disable=protected-access
                for event in stream:
                    event_dict = SimpleOpenAILLM._payload_to_dict(event)
                    event_type = event_dict.get("type")
                    if not event_type or event_type not in ALLOWED_STREAM_EVENTS:
                        continue
                    handler.handle(event_dict)
                    manager.push(event_type, event_dict)
                final_response = self._resolve_final_response(stream)
            if final_response is not None:
                final_payload = SimpleOpenAILLM._payload_to_dict(final_response)
                manager.push("final", {"response": final_payload})
                manager.complete()
        except APIError as api_error:
            error_event = {
                "type": "response.error",
                "message": getattr(api_error, "message", str(api_error)),
            }
            handler.handle(error_event)
            manager.push("response.error", error_event)
            manager.complete()
            raise
        return final_payload

    @staticmethod
    def _resolve_final_response(stream: Any) -> Any:
        for attr in ("final_response", "get_final_response"):
            candidate = getattr(stream, attr, None)
            if callable(candidate):
                try:
                    result = candidate()
                    if result is not None:
                        return result
                except TypeError:  # pragma: no cover - defensive
                    continue
            elif candidate is not None:
                return candidate
        return None

    async def _persist_summary(
        self,
        *,
        summary: ConversationSummary,
        response_id: Optional[str],
        model_key: str,
    ) -> None:
        finalize = ConversationFinalizeResponse(
            conversation_id=summary.conversation_id,
            response_id=response_id,
            model_key=model_key,
            aggregated_text=summary.content_text,
            reasoning_text=summary.reasoning_text,
            json_chunks=summary.json_chunks,
            usage=summary.usage,
            completed_at=summary.completed_at,
        )
        async with self._lock:
            self._summaries[summary.conversation_id] = finalize

    @staticmethod
    def _build_request_args(
        *,
        llm_model: str,
        conversation_id: str,
        request: ConversationTurnRequest,
        store: bool,
    ) -> Dict[str, Any]:
        input_segments = [{"role": "user", "content": [{"type": "text", "text": request.user_message}]}]
        payload: Dict[str, Any] = {
            "model": llm_model,
            "input": input_segments,
            "text": {"verbosity": request.text_verbosity},
            "reasoning": {
                "effort": request.reasoning_effort.value if hasattr(request.reasoning_effort, "value") else request.reasoning_effort,
                "summary": request.reasoning_summary,
            },
            "store": store,
        }
        if ConversationService._should_forward_conversation_id(conversation_id):
            payload["conversation"] = conversation_id
        if request.instructions:
            payload["instructions"] = request.instructions
        if request.previous_response_id:
            payload["previous_response_id"] = request.previous_response_id
        if request.metadata:
            payload["metadata"] = request.metadata
        return payload

    @staticmethod
    def _should_forward_conversation_id(conversation_id: Optional[str]) -> bool:
        if not conversation_id:
            return False
        normalized = str(conversation_id)
        return normalized.startswith("conv_")

    @staticmethod
    def _generate_local_conversation_id() -> str:
        return f"local-{uuid.uuid4()}"

    @staticmethod
    def _generate_remote_conversation_id() -> str:
        return f"conv_local-{uuid.uuid4()}"
