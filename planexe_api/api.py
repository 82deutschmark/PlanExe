# Author: gpt-5-codex
# Date: 2025-10-30T00:00:00Z
# PURPOSE: FastAPI entrypoint orchestrating PlanExe plan execution, resume controls,
#          conversation streaming, and image utilities while delegating heavy logic to
#          specialised services.
# SRP and DRY check: Pass. Route handlers coordinate validation and service calls
#          without reimplementing pipeline, database, or WebSocket behaviour handled
#          in dedicated modules.

import asyncio
import hashlib
import json
import os
import threading
import uuid
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Dict, Optional, List

import httpx
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from sse_starlette import EventSourceResponse

from planexe.plan.filenames import FilenameEnum
from planexe.plan.generate_run_id import generate_run_id
from planexe.plan.pipeline_environment import PipelineEnvironmentEnum
from planexe.plan.speedvsdetail import SpeedVsDetailEnum
from planexe.prompt.prompt_catalog import PromptCatalog
from planexe.utils.planexe_config import PlanExeConfig
from planexe.utils.planexe_dotenv import PlanExeDotEnv, DotEnvKeyEnum
from planexe.llm_factory import LLMInfo
from planexe.utils.planexe_llmconfig import PlanExeLLMConfig

from planexe_api.config import (
    RESPONSES_STREAMING_CONTROLS,
    RESPONSES_CONVERSATION_CONTROLS,
)
from planexe_api.models import (
    AnalysisStreamRequest,
    AnalysisStreamSessionResponse,
    ConfigResponse,
    ConversationCreateRequest,
    ConversationCreateResponse,
    ConversationFinalizeResponse,
    ConversationRequestResponse,
    ConversationTurnRequest,
    ImageEditRequest,
    ImageGenerationRequest,
    ImageGenerationResponse,
    CreatePlanRequest,
    FallbackReportResponse,
    HealthResponse,
    LLMModel,
    MissingSection,
    PlanArtefact,
    PlanArtefactListResponse,
    PlanFilesResponse,
    PipelineDetailsResponse,
    PlanResponse,
    PlanStatus,
    PromptExample,
    ReasoningEffortValidation,
    ReportSection,
    StreamStatusResponse,
    SpeedVsDetail,
)
from planexe_api.database import (
    get_database, get_database_service, create_tables, DatabaseService, Plan, LLMInteraction,
    PlanFile, PlanMetrics, PlanContent, SessionLocal
)
from planexe_api.services.pipeline_execution_service import PipelineExecutionService
from planexe_api.services.conversation_service import ConversationService
from planexe_api.services.image_generation_service import ImageGenerationService, ImageGenerationError
from planexe_api.websocket_manager import websocket_manager
from planexe_api.streaming import (
    AnalysisStreamSessionStore,
    AnalysisStreamService,
    ConversationSessionStore,
)

# Mapping between stored PlanContent content_type values and HTTP media types
DB_CONTENT_TYPE_TO_MEDIA: Dict[str, str] = {
    "json": "application/json; charset=utf-8",
    "markdown": "text/markdown; charset=utf-8",
    "html": "text/html; charset=utf-8",
    "csv": "text/csv; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
}


def _infer_media_type(content_type: Optional[str], filename: str, default: str = "text/plain; charset=utf-8") -> str:
    """Infer an HTTP media type from a stored PlanContent content_type value."""

    if content_type:
        normalized = content_type.strip().lower()
        media = DB_CONTENT_TYPE_TO_MEDIA.get(normalized)
        if media:
            return media

    # Fall back to basic heuristics using file extension when content_type is missing/unknown.
    extension = Path(filename).suffix.lstrip(".").lower()
    if extension == "html":
        return DB_CONTENT_TYPE_TO_MEDIA["html"]
    if extension == "json":
        return DB_CONTENT_TYPE_TO_MEDIA["json"]
    if extension == "csv":
        return DB_CONTENT_TYPE_TO_MEDIA["csv"]
    if extension in {"md", "markdown"}:
        return DB_CONTENT_TYPE_TO_MEDIA["markdown"]
    return default


# Initialize FastAPI app
app = FastAPI(
    title="PlanExe API",
    description="REST API for PlanExe - Transform ideas into detailed plans using AI",
    version="1.0.0",
)

# Environment detection
IS_DEVELOPMENT = os.environ.get("PLANEXE_CLOUD_MODE", "false").lower() != "true"

def _resolve_streaming_flag() -> bool:
    """Resolve streaming feature flag with safe defaults."""

    streaming_env_keys = (
        "STREAMING_ENABLED",
        "PLANEXE_STREAMING_ENABLED",
        "NEXT_PUBLIC_STREAMING_ENABLED",
    )

    for key in streaming_env_keys:
        value = os.environ.get(key)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "false"}:
                return normalized == "true"

    # Default to enabled so production matches the frontend build configuration
    # unless explicitly disabled via environment variables.
    return True


STREAMING_ENABLED = _resolve_streaming_flag()

# CORS configuration - enable for both development and production
if IS_DEVELOPMENT:
    print("Development mode: CORS enabled for localhost:3000 and localhost:3001")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Production mode: Enable CORS for Railway production domain and allow API access
    production_origins = [
        "https://planexe-production.up.railway.app",
        "https://*.railway.app",  # Allow all Railway subdomains
    ]
    print(f"Production mode: CORS enabled for {production_origins}")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=production_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
        allow_origin_regex=r"https://.*\.railway\.app",  # Regex pattern for Railway domains
    )

STATIC_UI_DIR: Optional[Path] = Path("/app/ui_static") if not IS_DEVELOPMENT else None

# Initialize cloud-native configuration system
print("=== PlanExe API Initialization ===")
planexe_config = PlanExeConfig.load()
RUN_DIR = "run"

if planexe_config.cloud_mode:
    print("Cloud environment detected - using cloud-native configuration")
else:
    print("Local development environment - using file-based configuration")

# Load environment variables with hybrid approach (cloud-native)
print("Loading environment configuration...")
planexe_dotenv = PlanExeDotEnv.load()  # Automatically uses hybrid loading in cloud mode
print(f"Configuration loaded from: {planexe_dotenv.dotenv_path}")

# CRITICAL: Ensure environment variables are available in os.environ for Luigi subprocess
print("Merging configuration into system environment...")
planexe_dotenv.update_os_environ()

# Validate API keys are available
api_keys_to_check = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
available_keys = []
for key in api_keys_to_check:
    value = os.environ.get(key)
    if value:
        available_keys.append(key)
        print(f"  [OK] {key}: Available")
    else:
        print(f"  [MISSING] {key}: Not available")

print(f"Environment validation complete - {len(available_keys)} API keys available")

# Set up paths
planexe_project_root = Path(__file__).parent.parent.absolute()
override_run_dir = planexe_dotenv.get_absolute_path_to_dir(DotEnvKeyEnum.PLANEXE_RUN_DIR.value)
if isinstance(override_run_dir, Path):
    run_dir = override_run_dir
else:
    run_dir = planexe_project_root / RUN_DIR

# Initialize services
prompt_catalog = PromptCatalog()
prompt_catalog.load_simple_plan_prompts()
llm_info = LLMInfo.obtain_info()
llm_config = PlanExeLLMConfig.load()
pipeline_service = PipelineExecutionService(planexe_project_root)

analysis_session_store = AnalysisStreamSessionStore(ttl_seconds=45)
analysis_stream_service = AnalysisStreamService(session_store=analysis_session_store)
conversation_session_store = ConversationSessionStore(ttl_seconds=60)
conversation_service = ConversationService(session_store=conversation_session_store)
image_generation_service = ImageGenerationService()

if STREAMING_ENABLED:
    print("Streaming analysis enabled - Responses SSE harness ready")
else:
    print("Streaming analysis disabled - set STREAMING_ENABLED=true to enable")

# Database initialization
create_tables()


# Application lifecycle events
@app.on_event("startup")
async def startup_event():
    """Initialize services on application startup"""
    await websocket_manager.start_heartbeat_task()
    print("FastAPI application started - WebSocket manager initialized")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up services on application shutdown"""
    await websocket_manager.shutdown()
    print("FastAPI application shutdown - WebSocket manager cleaned up")


def execute_plan_async(plan_id: str, request: CreatePlanRequest, resume: bool = False) -> None:
    """Execute Luigi pipeline asynchronously using the dedicated service with WebSocket support."""
    import asyncio

    async def run_pipeline():
        db = SessionLocal()
        try:
            db_service = DatabaseService(db)
            await pipeline_service.execute_plan(plan_id, request, db_service, resume=resume)
        except Exception as e:
            print(f"Exception in plan execution: {e}")
        finally:
            try:
                db.close()
            except Exception:
                pass

    # Create new event loop for the thread
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(run_pipeline())
    except Exception as e:
        print(f"Failed to execute pipeline for plan {plan_id}: {e}")
    finally:
        try:
            loop.close()
        except Exception:
            pass


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        version="1.0.0",
        planexe_version="2025.5.20",
        available_models=len(llm_config.llm_config_dict)
    )


@app.get("/ping")
async def ping():
    """Ultra simple ping endpoint"""
    return {
        "ping": "pong",
        "timestamp": "2025-09-27T16:01:00Z",
        "railway_deployment_test": "latest_code_deployed",
        "api_routes_working": True
    }


@app.post("/api/conversations", response_model=ConversationCreateResponse)
async def create_conversation_endpoint(request: ConversationCreateRequest):
    """Create or reuse an OpenAI conversation and return its identifier."""

    if not STREAMING_ENABLED:
        raise HTTPException(status_code=403, detail="STREAMING_DISABLED")

    conversation_id = await conversation_service.ensure_conversation(
        model_key=request.model_key,
        conversation_id=request.conversation_id,
    )
    created = request.conversation_id is None or request.conversation_id != conversation_id
    return ConversationCreateResponse(
        conversation_id=conversation_id,
        model_key=request.model_key,
        created=created,
    )


@app.post("/api/conversations/{conversation_id}/requests", response_model=ConversationRequestResponse)
async def create_conversation_request_endpoint(
    conversation_id: str,
    request: ConversationTurnRequest,
):
    """Initialize a streaming turn for the specified conversation."""

    if not STREAMING_ENABLED:
        raise HTTPException(status_code=403, detail="STREAMING_DISABLED")

    cached = await conversation_service.create_session(
        conversation_id=conversation_id,
        request=request,
    )
    ttl_seconds = int(max(0, round((cached.expires_at - cached.created_at).total_seconds())))
    return ConversationRequestResponse(
        token=cached.token,
        conversation_id=cached.conversation_id,
        model_key=request.model_key,
        expires_at=cached.expires_at,
        ttl_seconds=ttl_seconds,
    )


@app.get("/api/conversations/{conversation_id}/stream")
async def stream_conversation_endpoint(
    conversation_id: str,
    token: str = Query(..., alias="token"),
    model_key: str = Query(..., alias="modelKey"),
):
    """Relay Responses API events over SSE for the given conversation."""

    if not STREAMING_ENABLED:
        raise HTTPException(status_code=403, detail="STREAMING_DISABLED")

    async def event_generator():
        async for event in conversation_service.stream(
            conversation_id=conversation_id,
            model_key=model_key,
            token=token,
        ):
            yield event

    return EventSourceResponse(event_generator(), ping=10000)


@app.post("/api/conversations/{conversation_id}/finalize", response_model=ConversationFinalizeResponse)
async def finalize_conversation_endpoint(conversation_id: str):
    """Return the server-side summary for the specified conversation."""

    if not STREAMING_ENABLED:
        raise HTTPException(status_code=403, detail="STREAMING_DISABLED")

    return await conversation_service.finalize(conversation_id)


@app.post("/api/conversations/{conversation_id}/followups", response_model=ConversationFinalizeResponse)
async def create_conversation_followup_endpoint(
    conversation_id: str,
    request: ConversationTurnRequest,
):
    """Execute a non-streaming follow-up turn and return the consolidated response."""

    if not STREAMING_ENABLED:
        raise HTTPException(status_code=403, detail="STREAMING_DISABLED")

    return await conversation_service.followup(conversation_id=conversation_id, request=request)


@app.post("/api/images/generate", response_model=ImageGenerationResponse)
async def generate_image_endpoint(request: ImageGenerationRequest):
    """Generate a concept image using the OpenAI Images API."""

    try:
        result = await image_generation_service.generate_concept_image(
            prompt=request.prompt,
            model_key=request.model_key,
            size=request.size,
            quality=request.quality,
            style=request.style,
            background=request.background,
            negative_prompt=request.negative_prompt,
            output_format=request.output_format,
            output_compression=request.output_compression,
        )

        return ImageGenerationResponse(
            conversation_id=request.conversation_id,
            image_b64=result["image_b64"],
            prompt=result.get("prompt", request.prompt),
            model=result["model"],
            size=result["size"],
            format=result["format"],
            compression=result.get("compression"),
        )

    except ImageGenerationError as e:
        error_message = str(e)
        # Parse error type from message if present (format: "error_type - message")
        error_type = "image_generation_error"
        if " - " in error_message:
            parts = error_message.split(" - ", 1)
            if len(parts) == 2 and ":" in parts[0]:
                # Extract error type from "OpenAI API error (status): type - message"
                error_type = parts[0].split(":")[-1].strip()

        raise HTTPException(
            status_code=500,
            detail={
                "error": "Image generation failed",
                "error_type": error_type,
                "message": error_message,
                "context": {
                    "model": request.model_key,
                    "size": request.size,
                    "prompt_length": len(request.prompt) if request.prompt else 0,
                }
            }
        )
    except Exception as e:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Image generation failed",
                "error_type": "unexpected_error",
                "message": str(e),
                "context": {
                    "model": request.model_key,
                    "size": request.size,
                }
            }
        ) from e


@app.post("/api/images/edit", response_model=ImageGenerationResponse)
async def edit_image_endpoint(request: ImageEditRequest):
    """Apply edits to an existing concept image using the OpenAI Images API."""

    try:
        result = await image_generation_service.edit_concept_image(
            prompt=request.prompt,
            base_image_b64=request.base_image_b64,
            mask_b64=request.mask_b64,
            model_key=request.model_key,
            size=request.size,
            quality=request.quality,
            style=request.style,
            background=request.background,
            negative_prompt=request.negative_prompt,
            output_format=request.output_format,
            output_compression=request.output_compression,
        )

        return ImageGenerationResponse(
            conversation_id=request.conversation_id,
            image_b64=result["image_b64"],
            prompt=result.get("prompt", request.prompt),
            model=result["model"],
            size=result["size"],
            format=result["format"],
            compression=result.get("compression"),
        )

    except ImageGenerationError as e:
        error_message = str(e)
        # Parse error type from message if present (format: "error_type - message")
        error_type = "image_edit_error"
        if " - " in error_message:
            parts = error_message.split(" - ", 1)
            if len(parts) == 2 and ":" in parts[0]:
                # Extract error type from "OpenAI edit API error (status): type - message"
                error_type = parts[0].split(":")[-1].strip()

        raise HTTPException(
            status_code=500,
            detail={
                "error": "Image edit failed",
                "error_type": error_type,
                "message": error_message,
                "context": {
                    "model": request.model_key,
                    "size": request.size,
                    "prompt_length": len(request.prompt) if request.prompt else 0,
                }
            }
        )
    except Exception as e:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Image edit failed",
                "error_type": "unexpected_error",
                "message": str(e),
                "context": {
                    "model": request.model_key,
                    "size": request.size,
                }
            }
        ) from e


@app.post("/api/stream/analyze", response_model=AnalysisStreamSessionResponse)
async def create_analysis_stream_endpoint(
    request: AnalysisStreamRequest,
):
    """Cache streaming payloads before upgrading to SSE."""

    if not STREAMING_ENABLED:
        raise HTTPException(status_code=403, detail="STREAMING_DISABLED")

    cached = await analysis_stream_service.create_session(request)
    ttl_seconds = int(max(0, round((cached.expires_at - cached.created_at).total_seconds())))
    return AnalysisStreamSessionResponse(
        session_id=cached.session_id,
        task_id=cached.task_id,
        model_key=cached.model_key,
        expires_at=cached.expires_at,
        ttl_seconds=ttl_seconds,
    )


@app.get("/api/stream/analyze/{task_id}/{model_key}/{session_id}")
async def stream_analysis_endpoint(task_id: str, model_key: str, session_id: str):
    """Upgrade cached analysis payload into an SSE stream."""

    if not STREAMING_ENABLED:
        raise HTTPException(status_code=403, detail="STREAMING_DISABLED")

    async def event_generator():
        async for event in analysis_stream_service.stream(
            task_id=task_id,
            model_key=model_key,
            session_id=session_id,
        ):
            yield event

    return EventSourceResponse(event_generator(), ping=10000)


# LLM models endpoint
@app.get("/api/models", response_model=List[LLMModel])
async def get_models():
    """Get available LLM models"""
    try:
        prioritized_items: List[LLMModel] = []
        sorted_configs = sorted(
            llm_config.llm_config_dict.items(),
            key=lambda item: (item[1].get("priority", 999), item[0]),
        )
        for model_id, config in sorted_configs:
            label = config.get("label") or model_id
            comment = config.get("comment", "")
            priority = config.get("priority", 999)
            provider = str(config.get("provider", "")).lower()
            requires_api_key = provider not in {"ollama", "local"}
            prioritized_items.append(
                LLMModel(
                    id=model_id,
                    label=label,
                    comment=comment,
                    priority=priority,
                    requires_api_key=requires_api_key,
                )
            )
        return prioritized_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get models: {str(e)}")


# Railway debugging endpoint for models
@app.get("/api/models/debug")
async def debug_models():
    """Debug endpoint to check LLM configuration on Railway"""
    debug_info = {
        "railway_environment": os.getenv("PLANEXE_CLOUD_MODE", "false") == "true",
        "llm_config_available": False,
        "llm_info_available": False,
        "config_items_count": 0,
        "config_dict_keys": [],
        "raw_llm_info_items": 0,
        "error_details": None
    }
    
    try:
        # Check if llm_config is available
        if llm_config:
            debug_info["llm_config_available"] = True
            config_keys = list(llm_config.llm_config_dict.keys())
            debug_info["config_dict_keys"] = config_keys
            debug_info["config_items_count"] = len(config_keys)
        
        # Check if llm_info is available  
        if llm_info:
            debug_info["llm_info_available"] = True
            debug_info["raw_llm_info_items"] = len(llm_info.llm_config_items)
            
    except Exception as e:
        debug_info["error_details"] = str(e)
    
    return debug_info


# Prompt examples endpoint
@app.get("/api/prompts", response_model=List[PromptExample])
async def get_prompts():
    """Get example prompts"""
    try:
        examples = []
        for i, prompt in enumerate(prompt_catalog._catalog.values()):
            example = PromptExample(
                uuid=prompt.id,  # Use the prompt's existing ID as UUID
                prompt=prompt.prompt,
                title=prompt.extras.get('title', prompt.id)  # Use title from extras or ID as fallback
            )
            examples.append(example)
        return examples
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get prompts: {str(e)}")


# Frontend configuration endpoint
@app.get("/api/config", response_model=ConfigResponse)
async def get_frontend_config():
    """Get frontend configuration values from backend"""
    return ConfigResponse(
        reasoning_effort_streaming_default=RESPONSES_STREAMING_CONTROLS.reasoning_effort,
        reasoning_effort_conversation_default=RESPONSES_CONVERSATION_CONTROLS.reasoning_effort,
        reasoning_summary_default=RESPONSES_STREAMING_CONTROLS.reasoning_summary,
        text_verbosity_default=RESPONSES_STREAMING_CONTROLS.text_verbosity,
        max_output_tokens_default=RESPONSES_STREAMING_CONTROLS.max_output_tokens,
        streaming_enabled=STREAMING_ENABLED,
        version="1.0.0",
    )


@app.post("/api/plans", response_model=PlanResponse)
async def create_plan(request: CreatePlanRequest):
    """Create a new plan and start background processing"""
    try:
        # Resolve/validate requested model id against configured models
        resolved_llm_model: Optional[str] = None
        try:
            configured = PlanExeLLMConfig.load().llm_config_dict
            if request.llm_model and request.llm_model in configured:
                resolved_llm_model = request.llm_model
            else:
                # choose first by priority when available
                if configured:
                    sorted_items = sorted(
                        configured.items(), key=lambda item: (item[1].get("priority", 999), item[0])
                    )
                    resolved_llm_model = sorted_items[0][0]
                else:
                    resolved_llm_model = None  # fall back to pipeline default
        except Exception:
            # On any error, let pipeline default decide
            resolved_llm_model = request.llm_model

        # Generate unique plan ID and directory
        start_time = datetime.utcnow()
        plan_id = generate_run_id("PlanExe", start_time)

        # Create run directory
        run_id_dir = run_dir / plan_id
        run_id_dir.mkdir(parents=True, exist_ok=True)
        print(f"DEBUG: Directory created successfully")

        # Create plan in database
        plan_data = {
            "plan_id": plan_id,
            "prompt": request.prompt,
            "llm_model": resolved_llm_model,
            "speed_vs_detail": request.speed_vs_detail.value,
            "status": PlanStatus.pending.value,
            "progress_percentage": 0,
            "progress_message": "Plan queued for processing...",
            "output_dir": str(run_id_dir)
        }

        db = get_database_service()
        try:
            plan = db.create_plan(plan_data)
        finally:
            db.close()
        print(f"DEBUG: Plan created in database")

        # Build an effective request with validated model id for the pipeline
        effective_request = CreatePlanRequest(
            prompt=request.prompt,
            llm_model=resolved_llm_model,
            speed_vs_detail=request.speed_vs_detail,
            reasoning_effort=request.reasoning_effort,
            enriched_intake=request.enriched_intake,
        )

        # Start background execution using threading (Windows compatibility)
        thread = threading.Thread(
            target=execute_plan_async,
            args=(plan_id, effective_request),
            name=f"PlanExecution-{plan_id}",
            daemon=True
        )
        thread.start()
        print(f"DEBUG: Thread started: {thread.name}")

        # Convert database model to response
        enriched_intake_str = None
        if request.enriched_intake:
            # Serialize enriched_intake for response (database stores it separately)
            enriched_intake_str = request.enriched_intake if isinstance(request.enriched_intake, dict) else None

        return PlanResponse(
            plan_id=plan.plan_id,
            status=PlanStatus(plan.status),
            created_at=plan.created_at,
            prompt=plan.prompt,
            llm_model=resolved_llm_model,
            speed_vs_detail=SpeedVsDetail(request.speed_vs_detail.value),
            reasoning_effort=request.reasoning_effort,
            progress_percentage=0,
            progress_message="Plan queued for processing...",
            error_message=None,
            output_dir=str(run_id_dir),
            enriched_intake=enriched_intake_str
        )

    except Exception as e:
        print(f"Error creating plan: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create plan: {str(e)}")


# Resume existing plan endpoint
@app.post("/api/plans/{plan_id}/resume", response_model=PlanResponse)
async def resume_plan(plan_id: str):
    """Resume a failed plan using the existing run directory so only incomplete tasks rerun."""

    db = get_database_service()
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        if plan.status not in {PlanStatus.failed.value, PlanStatus.cancelled.value}:
            raise HTTPException(status_code=409, detail="Plan is not in a resumable state")

        if not plan.output_dir:
            raise HTTPException(status_code=409, detail="Plan output directory is missing")

        run_id_dir = Path(plan.output_dir)
        if not run_id_dir.exists():
            raise HTTPException(status_code=409, detail="Plan output directory not found; cannot resume")

        try:
            speed_vs_detail = SpeedVsDetail(plan.speed_vs_detail)
        except ValueError:
            speed_vs_detail = SpeedVsDetail.ALL_DETAILS_BUT_SLOW

        effective_request = CreatePlanRequest(
            prompt=plan.prompt,
            llm_model=plan.llm_model,
            speed_vs_detail=speed_vs_detail,
            reasoning_effort=RESPONSES_STREAMING_CONTROLS.reasoning_effort,
            enriched_intake=None,
        )

        updated_plan = db.update_plan(plan_id, {
            "status": PlanStatus.pending.value,
            "progress_message": "Plan queued for resume...",
            "error_message": None,
        })

        response_payload = PlanResponse(
            plan_id=plan.plan_id,
            status=PlanStatus(updated_plan.status if updated_plan else plan.status),
            created_at=plan.created_at,
            prompt=plan.prompt,
            llm_model=plan.llm_model,
            speed_vs_detail=speed_vs_detail,
            reasoning_effort=effective_request.reasoning_effort,
            progress_percentage=updated_plan.progress_percentage if updated_plan else plan.progress_percentage,
            progress_message=updated_plan.progress_message if updated_plan else plan.progress_message,
            error_message=None,
            output_dir=plan.output_dir,
            enriched_intake=None,
        )
    finally:
        db.close()

    thread = threading.Thread(
        target=execute_plan_async,
        args=(plan_id, effective_request, True),
        name=f"PlanExecution-{plan_id}-resume",
        daemon=True,
    )
    thread.start()

    return response_payload


# Map retryable task keys to the output filenames they own. Luigi will re-run tasks whose outputs are missing.
RETRY_TASK_OUTPUTS: Dict[str, List[str]] = {
    # Governance extras
    "governance_phase6_extra": [
        FilenameEnum.GOVERNANCE_PHASE6_EXTRA_RAW.value,
        FilenameEnum.GOVERNANCE_PHASE6_EXTRA_MARKDOWN.value,
    ],
    # Backward-compatible alias used in some DB rows
    "governance_phase6": [
        FilenameEnum.GOVERNANCE_PHASE6_EXTRA_RAW.value,
        FilenameEnum.GOVERNANCE_PHASE6_EXTRA_MARKDOWN.value,
    ],
}


@app.post("/api/plans/{plan_id}/tasks/{task_key}/retry", response_model=PlanResponse)
async def retry_task(plan_id: str, task_key: str):
    """
    Retry a specific task by deleting its outputs and resuming the pipeline.

    Notes:
    - Preserves database records (audit). Luigi uses filesystem targets to determine completeness.
    - Removes only task-owned output files in the run directory.
    - Triggers resume so Luigi regenerates missing outputs and any downstream dependents.
    """
    db = get_database_service()
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        if not plan.output_dir:
            raise HTTPException(status_code=409, detail="Plan output directory is missing")

        outputs = RETRY_TASK_OUTPUTS.get(task_key)
        if not outputs:
            raise HTTPException(status_code=422, detail=f"Unknown or unsupported task_key: {task_key}")

        run_id_dir = Path(plan.output_dir)
        if not run_id_dir.exists():
            raise HTTPException(status_code=409, detail="Plan output directory not found; cannot retry task")

        deleted: List[str] = []
        for fname in outputs:
            file_path = run_id_dir / fname
            try:
                if file_path.exists():
                    file_path.unlink()
                    deleted.append(fname)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed deleting '{fname}': {e}")

        # Build an effective request for resume
        try:
            speed_vs_detail = SpeedVsDetail(plan.speed_vs_detail)
        except ValueError:
            speed_vs_detail = SpeedVsDetail.ALL_DETAILS_BUT_SLOW

        effective_request = CreatePlanRequest(
            prompt=plan.prompt,
            llm_model=plan.llm_model,
            speed_vs_detail=speed_vs_detail,
            reasoning_effort=RESPONSES_STREAMING_CONTROLS.reasoning_effort,
            enriched_intake=None,
        )

        updated_plan = db.update_plan(plan_id, {
            "status": PlanStatus.pending.value,
            "progress_message": f"Retrying task '{task_key}' (deleted {len(deleted)} files)...",
            "error_message": None,
        })

        response_payload = PlanResponse(
            plan_id=plan.plan_id,
            status=PlanStatus(updated_plan.status if updated_plan else plan.status),
            created_at=plan.created_at,
            prompt=plan.prompt,
            llm_model=plan.llm_model,
            speed_vs_detail=speed_vs_detail,
            reasoning_effort=effective_request.reasoning_effort,
            progress_percentage=updated_plan.progress_percentage if updated_plan else plan.progress_percentage,
            progress_message=updated_plan.progress_message if updated_plan else plan.progress_message,
            error_message=None,
            output_dir=plan.output_dir,
            enriched_intake=None,
        )
    finally:
        db.close()

    # Fire-and-forget resume
    thread = threading.Thread(
        target=execute_plan_async,
        args=(plan_id, effective_request, True),
        name=f"PlanExecution-{plan_id}-retry-{task_key}",
        daemon=True,
    )
    thread.start()

    return response_payload


# Database artefact endpoint
@app.get("/api/plans/{plan_id}/artefacts", response_model=PlanArtefactListResponse)
async def list_plan_artefacts(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Return artefacts persisted in plan_content for the given plan."""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        content_records = db.get_plan_content(plan_id)
        artefacts: List[PlanArtefact] = []

        for record in content_records:
            size_bytes = record.content_size_bytes
            if size_bytes is None:
                size_bytes = len(record.content.encode('utf-8')) if record.content else 0

            description = record.filename
            if '-' in description:
                description = description.split('-', 1)[1]
            if '.' in description:
                description = description.rsplit('.', 1)[0]
            description = description.replace('_', ' ').replace('-', ' ').strip().title() or record.filename

            try:
                order = int(record.filename.split('-', 1)[0])
            except (ValueError, IndexError):
                order = None

            artefacts.append(
                PlanArtefact(
                    filename=record.filename,
                    content_type=record.content_type,
                    stage=record.stage,
                    size_bytes=size_bytes,
                    created_at=record.created_at or datetime.utcnow(),
                    description=description,
                    task_name=record.stage or description,
                    order=order,
                )
            )

        artefacts.sort(key=lambda entry: ((entry.order if entry.order is not None else 9999), entry.filename))

        return PlanArtefactListResponse(
            plan_id=plan_id,
            artefacts=artefacts
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch plan artefacts: {exc}")



# Plan details endpoint
@app.get("/api/plans/{plan_id}", response_model=PlanResponse)
async def get_plan(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Get plan details"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        return PlanResponse(
            plan_id=plan.plan_id,
            status=PlanStatus(plan.status),
            created_at=plan.created_at,
            prompt=plan.prompt,
            llm_model=plan.llm_model,
            speed_vs_detail=SpeedVsDetail(plan.speed_vs_detail),
            reasoning_effort=RESPONSES_STREAMING_CONTROLS.reasoning_effort,
            progress_percentage=plan.progress_percentage,
            progress_message=plan.progress_message,
            error_message=plan.error_message,
            output_dir=plan.output_dir,
            enriched_intake=None  # Not returned in get_plan for simplicity
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get plan: {str(e)}")


# DEPRECATED SSE endpoint - replaced with WebSocket for thread-safety
@app.get("/api/plans/{plan_id}/stream")
async def stream_plan_progress_deprecated(plan_id: str, db: DatabaseService = Depends(get_database)):
    """
    DEPRECATED: SSE stream has been replaced with WebSocket for thread-safety
    Use WebSocket endpoint: ws://localhost:8080/ws/plans/{plan_id}/progress
    """
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=410,  # Gone
        content={
            "error": "SSE endpoint deprecated due to thread safety issues",
            "message": "Please migrate to WebSocket endpoint for real-time progress",
            "websocket_url": f"ws://localhost:8080/ws/plans/{plan_id}/progress",
            "migration_guide": {
                "old": f"GET /api/plans/{plan_id}/stream",
                "new": f"WebSocket ws://localhost:8080/ws/plans/{plan_id}/progress",
                "reason": "Thread-safe WebSocket architecture replaces broken SSE global dictionaries"
            }
        }
    )


# WebSocket endpoint for real-time progress (replaces unreliable SSE)
@app.websocket("/ws/plans/{plan_id}/progress")
async def websocket_plan_progress(websocket: WebSocket, plan_id: str):
    """
    WebSocket endpoint for real-time Luigi pipeline progress updates.

    This replaces the unreliable SSE endpoint and fixes:
    - Global dictionary race conditions
    - Thread safety violations
    - Memory leaks from abandoned connections
    - Poor error handling
    - Connection reliability issues
    """
    await websocket.accept()

    client_id = None
    try:
        # Add connection to WebSocket manager
        client_id = await websocket_manager.add_connection(websocket, plan_id)

        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connection",
            "status": "connected",
            "plan_id": plan_id,
            "client_id": client_id,
            "message": "Connected to Luigi pipeline progress stream"
        })

        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from client (heartbeat responses, commands, etc.)
                data = await websocket.receive_json()

                # Handle heartbeat responses
                if data.get("type") == "heartbeat_response":
                    # Update heartbeat timestamp
                    pass

                # Handle other client messages (future expansion)
                elif data.get("type") == "command":
                    # Could be used for pause/resume pipeline, etc.
                    pass

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket error for plan {plan_id}, client {client_id}: {e}")
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket connection error for plan {plan_id}: {e}")
    finally:
        # Clean up connection
        if client_id:
            await websocket_manager.remove_connection(client_id)
            print(f"WebSocket disconnected: plan_id={plan_id}, client_id={client_id}")


# Plan content endpoint (Option 3: retrieve from database)
@app.get("/api/plans/{plan_id}/content/{filename}")
async def get_plan_content_file(plan_id: str, filename: str, db: DatabaseService = Depends(get_database)):
    """Get specific plan file content from database (Option 3 fix)"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Try to get content from database first (persistent)
        content_record = db.get_plan_content_by_filename(plan_id, filename)
        if content_record:
            # Return content from database
            content_type_map = {
                'json': 'application/json',
                'markdown': 'text/markdown',
                'html': 'text/html',
                'csv': 'text/csv',
                'txt': 'text/plain',
                'unknown': 'application/octet-stream'
            }
            media_type = content_type_map.get(content_record.content_type, 'text/plain')
            
            return Response(
                content=content_record.content,
                media_type=media_type,
                headers={"Content-Disposition": f'inline; filename="{filename}"'}
            )
        
        # Fallback: try filesystem (ephemeral, may not exist after restart)
        file_path = Path(plan.output_dir) / filename
        if file_path.exists():
            return FileResponse(file_path)
        
        raise HTTPException(status_code=404, detail="File not found in database or filesystem")
        
    except Exception as e:
        print(f"Error retrieving plan content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Plan files endpoint
@app.get("/api/plans/{plan_id}/files", response_model=PlanFilesResponse)
async def get_plan_files(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Get list of files generated by a plan"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        artefact_response = await list_plan_artefacts(plan_id, db)
        report_filename = FilenameEnum.REPORT.value
        has_report = any(entry.filename == report_filename for entry in artefact_response.artefacts)
        if not has_report:
            report_path = Path(plan.output_dir) / report_filename
            has_report = report_path.exists()

        # Build rich file entries. Prefer DB artefacts, fall back to FS if needed.
        files: list = []
        artefacts = artefact_response.artefacts

        # Use artefacts first (already normalized in list_plan_artefacts)
        for a in artefacts:
            files.append({
                "filename": a.filename,
                "content_type": a.content_type,
                "stage": getattr(a, "stage", None),
                "size_bytes": getattr(a, "size_bytes", 0),
                "created_at": getattr(a, "created_at", None),
                "description": getattr(a, "description", None),
                "task_name": getattr(a, "task_name", None),
                "order": getattr(a, "order", None),
            })

        # Optionally include any additional files present on disk but not in DB
        try:
            if plan and plan.output_dir:
                for p in Path(plan.output_dir).glob("*"):
                    if p.is_file():
                        name = p.name
                        if not any(f["filename"] == name for f in files):
                            files.append({
                                "filename": name,
                                "content_type": "application/octet-stream",
                                "stage": None,
                                "size_bytes": p.stat().st_size if hasattr(p, 'stat') else 0,
                                "created_at": None,
                                "description": None,
                                "task_name": None,
                                "order": None,
                            })
        except Exception:
            # Non-fatal; continue with DB-derived list
            pass

        return PlanFilesResponse(
            plan_id=plan_id,
            files=files,
            has_report=has_report
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get plan files: {str(e)}")


# Database artefact endpoint
@app.get("/api/plans/{plan_id}/artefacts", response_model=PlanArtefactListResponse)
async def list_plan_artefacts(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Return artefacts persisted in plan_content for the given plan."""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        content_records = db.get_plan_content(plan_id)
        artefacts: List[PlanArtefact] = []

        for record in content_records:
            size_bytes = record.content_size_bytes
            if size_bytes is None:
                size_bytes = len(record.content.encode('utf-8')) if record.content else 0

            description = record.filename
            if '-' in description:
                description = description.split('-', 1)[1]
            if '.' in description:
                description = description.rsplit('.', 1)[0]
            description = description.replace('_', ' ').replace('-', ' ').strip().title() or record.filename

            try:
                order = int(record.filename.split('-', 1)[0])
            except (ValueError, IndexError):
                order = None

            artefacts.append(
                PlanArtefact(
                    filename=record.filename,
                    content_type=record.content_type,
                    stage=record.stage,
                    size_bytes=size_bytes,
                    created_at=record.created_at or datetime.utcnow(),
                    description=description,
                    task_name=record.stage or description,
                    order=order,
                )
            )

        artefacts.sort(key=lambda entry: ((entry.order if entry.order is not None else 9999), entry.filename))

        return PlanArtefactListResponse(
            plan_id=plan_id,
            artefacts=artefacts
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch plan artefacts: {exc}")



# Plan details endpoint
@app.get("/api/plans/{plan_id}/details", response_model=PipelineDetailsResponse)
async def get_plan_details(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Get detailed pipeline information for a plan"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Read pipeline stage files and logs
        plan_dir = Path(plan.output_dir)

        # Get pipeline stages (simplified - would need to read actual stage files)
        pipeline_stages = []
        if plan_dir.exists():
            stage_files = list(plan_dir.glob("*.json"))
            for stage_file in sorted(stage_files):
                try:
                    with open(stage_file, 'r') as f:
                        stage_data = json.loads(f.read())
                        pipeline_stages.append({
                            "stage": stage_file.stem,
                            "status": "completed" if stage_file.exists() else "pending",
                            "data": stage_data
                        })
                except:
                    pass

        # Read pipeline log
        log_file = plan_dir / "log.txt"
        pipeline_log = ""
        if log_file.exists():
            try:
                with open(log_file, 'r') as f:
                    pipeline_log = f.read()
            except Exception as exc:
                print(f"WARNING: Failed to read log file for plan {plan_id}: {exc}")
        else:
            # Fall back to database copy when the run directory is missing.
            try:
                log_record = db.get_plan_content_by_filename(plan_id, "log.txt")
            except Exception as exc:
                print(f"WARNING: Database lookup for log.txt failed on plan {plan_id}: {exc}")
                log_record = None

            if log_record and log_record.content:
                pipeline_log = log_record.content

        # Get generated files
        files = db.get_plan_files(plan_id)
        generated_files = [
            {
                "filename": f.filename,
                "file_type": getattr(f, 'file_type', 'unknown'),
                "size": getattr(f, 'file_size_bytes', 0),
                "created_at": getattr(f, 'created_at', None)
            }
            for f in files
        ]

        return PipelineDetailsResponse(
            plan_id=plan_id,
            run_directory=str(plan.output_dir),
            pipeline_stages=pipeline_stages,
            pipeline_log=pipeline_log,
            generated_files=generated_files,
            total_files=len(files)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get plan details: {str(e)}")


# Stream status endpoint
@app.get("/api/plans/{plan_id}/stream-status", response_model=StreamStatusResponse)
async def get_stream_status(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Check if SSE stream is ready for a plan"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Check if SSE stream is ready based on plan status
        is_ready = plan.status in ['running', 'completed', 'failed']

        return StreamStatusResponse(
            status="ready" if is_ready else "not_ready",
            ready=is_ready
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stream status: {str(e)}")


# Helper utilities for fallback report assembly
EXPECTED_REPORT_FILENAMES = [
    member.value
    for member in FilenameEnum
    if "{}" not in member.value
]


def _infer_stage_from_filename(filename: str) -> Optional[str]:
    try:
        return FilenameEnum(filename).name.lower()
    except ValueError:
        return None


def _normalise_content_type(content_type: Optional[str]) -> str:
    return (content_type or "text/plain").lower()


def _render_section_html(section: ReportSection) -> str:
    content_type = _normalise_content_type(section.content_type)
    if content_type in ("html", "text/html"):
        body_html = section.content
    elif content_type in ("markdown", "md", "text/markdown"):
        body_html = f"<pre class='content-block markdown'>{escape(section.content)}</pre>"
    elif content_type in ("json", "application/json"):
        body_html = f"<pre class='content-block json'>{escape(section.content)}</pre>"
    elif content_type in ("csv", "text/csv"):
        body_html = f"<pre class='content-block csv'>{escape(section.content)}</pre>"
    else:
        body_html = f"<pre class='content-block plain'>{escape(section.content)}</pre>"

    title_text = escape(section.stage or section.filename)
    filename_text = escape(section.filename)
    
    # Create a safe anchor ID from the title
    import re
    anchor_id = re.sub(r'[^a-zA-Z0-9\s-]', '', title_text).strip()
    anchor_id = re.sub(r'[-\s]+', '-', anchor_id).lower()
    anchor_id = f"section-{anchor_id}" if anchor_id else f"section-{section.filename}"

    return (
        f"<section id='{anchor_id}' class='plan-section'>"
        f"<h2>{title_text}</h2>"
        f"<p class='filename'>{filename_text}</p>"
        f"{body_html}"
        "</section>"
    )


def _render_missing_sections_html(missing_sections: List[MissingSection]) -> str:
    if not missing_sections:
        return (
            "<section class='missing'>"
            "<h2>Further Research Required</h2>"
            "<p>All expected sections were recovered.</p>"
            "</section>"
        )

    items = []
    for missing in missing_sections:
        stage_text = missing.stage or "-"
        items.append(
            "<li>"
            f"<strong>{escape(stage_text)}</strong> "
            f"<span class='filename'>{escape(missing.filename)}</span> - "
            f"{escape(missing.reason)}"
            "</li>"
        )

    return (
        "<section class='missing'>"
        "<h2>Further Research Required</h2>"
        "<ul>" + "".join(items) + "</ul>"
        "</section>"
    )


def _build_fallback_html(
    plan_id: str,
    generated_at: datetime,
    completion_percentage: float,
    recovered_expected: int,
    total_expected: int,
    sections: List[ReportSection],
    missing_sections: List[MissingSection],
) -> str:
    header_html = (
        "<header class='report-header'>"
        f"<h1>Recovered Plan Report: {escape(plan_id)}</h1>"
        f"<p>Generated at {escape(generated_at.isoformat() + 'Z')}</p>"
        f"<p>Recovered {recovered_expected} of {total_expected} expected sections ("
        f"{completion_percentage:.2f}% complete).</p>"
        "</header>"
    )

    missing_html = _render_missing_sections_html(missing_sections)
    
    # Generate table of contents for fallback report
    toc_html = ""
    if sections:
        toc_html = "<nav class='table-of-contents'><h3>Table of Contents</h3><ul>"
        for section in sections:
            title_text = escape(section.stage or section.filename)
            # Create a safe anchor ID from the title
            import re
            anchor_id = re.sub(r'[^a-zA-Z0-9\s-]', '', title_text).strip()
            anchor_id = re.sub(r'[-\s]+', '-', anchor_id).lower()
            anchor_id = f"section-{anchor_id}" if anchor_id else f"section-{section.filename}"
            toc_html += f"<li><a href='#{anchor_id}'>{title_text}</a></li>"
        toc_html += "</ul></nav>"
    
    sections_html = "".join(_render_section_html(section) for section in sections)

    return f"""<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<title>Recovered Plan Report - {escape(plan_id)}</title>
<style>
body {{ font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f9fafb; color: #111827; margin: 2rem; }}
header.report-header {{ background: #111827; color: #f9fafb; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; box-shadow: 0 10px 30px rgba(17, 24, 39, 0.25); }}
header.report-header h1 {{ margin: 0 0 0.5rem 0; font-size: 1.8rem; }}
header.report-header p {{ margin: 0.25rem 0; }}
section.missing {{ background: #fef3c7; border: 1px solid #f59e0b; padding: 1.25rem; border-radius: 10px; margin-bottom: 2rem; }}
section.missing ul {{ margin: 0.75rem 0 0 1.25rem; }}
section.missing li {{ margin-bottom: 0.5rem; }}
section.plan-section {{ background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; padding: 1.5rem; margin-bottom: 1.75rem; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08); }}
section.plan-section h2 {{ margin-top: 0; margin-bottom: 0.75rem; font-size: 1.4rem; color: #0f172a; }}
section.plan-section .filename {{ color: #475569; font-size: 0.9rem; margin-bottom: 1rem; }}
pre.content-block {{ background: #f1f5f9; padding: 1rem; border-radius: 8px; overflow-x: auto; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }}
pre.content-block.markdown {{ background: #eef2ff; }}
pre.content-block.json {{ background: #ecfeff; }}
pre.content-block.csv {{ background: #fef9c3; }}
.table-of-contents {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; }}
.table-of-contents h3 {{ margin: 0 0 1rem 0; color: #1e293b; font-size: 1.2rem; }}
.table-of-contents ul {{ list-style: none; padding: 0; margin: 0; }}
.table-of-contents li {{ margin-bottom: 0.5rem; }}
.table-of-contents a {{ color: #3b82f6; text-decoration: none; padding: 0.25rem 0.5rem; border-radius: 4px; transition: background-color 0.2s ease; }}
.table-of-contents a:hover {{ background-color: #eff6ff; text-decoration: underline; }}
section.plan-section {{ scroll-margin-top: 2rem; }}
</style>
</head>
<body>
{header_html}
{toc_html}
{missing_html}
{sections_html}
</body>
</html>
"""


def _assemble_fallback_report(plan_id: str, plan: Plan, plan_contents: List[PlanContent]) -> FallbackReportResponse:
    """
    Assemble a rich HTML report using ReportGenerator - same as ReportTask.
    Uses existing files from plan.output_dir if available, otherwise creates temp files from database.
    """
    import tempfile
    import shutil
    from planexe.report.report_generator import ReportGenerator

    generated_at = datetime.utcnow()
    records_by_filename = {record.filename: record for record in plan_contents if record.filename}

    # Determine base path: use existing output_dir or create temp directory
    use_temp_dir = False
    if plan.output_dir and Path(plan.output_dir).exists():
        base_path = Path(plan.output_dir)
    else:
        base_path = Path(tempfile.mkdtemp(prefix=f"plan_report_{plan_id}_"))
        use_temp_dir = True

        # Write all plan_content records to temp files
        for record in plan_contents:
            if not record.content:
                continue
            file_path = base_path / record.filename
            file_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                file_path.write_text(record.content, encoding='utf-8')
            except Exception as e:
                print(f"Warning: Failed to write temp file {record.filename}: {e}")

    try:
        # Initialize ReportGenerator
        rg = ReportGenerator()

        # Add concept image if available from database
        try:
            image_record = records_by_filename.get("000-concept_image.png")
            if image_record and image_record.content:
                caption = "Concept visualization generated during planning intake"
                # Try to get metadata for better caption
                metadata_record = records_by_filename.get("000-concept_image_metadata.json")
                if metadata_record and metadata_record.content:
                    try:
                        import json
                        metadata = json.loads(metadata_record.content)
                        prompt = metadata.get("prompt", "")
                        if prompt:
                            caption = f"Concept: {prompt}"
                    except Exception:
                        pass

                rg.append_base64_image(
                    'Concept Visualization',
                    image_record.content,
                    caption=caption
                )
        except Exception as e:
            print(f"Warning: Could not include concept image in fallback report: {e}")

        # Add sections in same order as ReportTask (run_plan_pipeline.py:5834-5879)
        # Executive Summary
        exec_summary_path = base_path / FilenameEnum.EXECUTIVE_SUMMARY_MARKDOWN.value
        if exec_summary_path.exists():
            rg.append_markdown('Executive Summary', exec_summary_path)

        # Gantt charts
        mermaid_gantt_path = base_path / FilenameEnum.SCHEDULE_GANTT_MERMAID_HTML.value
        if mermaid_gantt_path.exists():
            rg.append_html('Gantt Overview', mermaid_gantt_path)

        dhtmlx_gantt_path = base_path / FilenameEnum.SCHEDULE_GANTT_DHTMLX_HTML.value
        if dhtmlx_gantt_path.exists():
            rg.append_html('Gantt Interactive', dhtmlx_gantt_path)

        # Pitch
        pitch_path = base_path / FilenameEnum.PITCH_MARKDOWN.value
        if pitch_path.exists():
            rg.append_markdown('Pitch', pitch_path)

        # Project Plan
        project_plan_path = base_path / FilenameEnum.PROJECT_PLAN_MARKDOWN.value
        if project_plan_path.exists():
            rg.append_markdown('Project Plan', project_plan_path)

        # Strategic Decisions
        strategic_path = base_path / FilenameEnum.STRATEGIC_DECISIONS_MARKDOWN.value
        if strategic_path.exists():
            rg.append_markdown('Strategic Decisions', strategic_path)

        # Scenarios
        scenarios_path = base_path / FilenameEnum.SCENARIOS_MARKDOWN.value
        if scenarios_path.exists():
            rg.append_markdown('Scenarios', scenarios_path)

        # Assumptions
        assumptions_path = base_path / FilenameEnum.CONSOLIDATE_ASSUMPTIONS_FULL_MARKDOWN.value
        if assumptions_path.exists():
            rg.append_markdown('Assumptions', assumptions_path)

        # Governance
        governance_path = base_path / FilenameEnum.CONSOLIDATE_GOVERNANCE_MARKDOWN.value
        if governance_path.exists():
            rg.append_markdown('Governance', governance_path)

        # Related Resources
        resources_path = base_path / FilenameEnum.RELATED_RESOURCES_MARKDOWN.value
        if resources_path.exists():
            rg.append_markdown('Related Resources', resources_path)

        # Data Collection
        data_collection_path = base_path / FilenameEnum.DATA_COLLECTION_MARKDOWN.value
        if data_collection_path.exists():
            rg.append_markdown('Data Collection', data_collection_path)

        # Documents to Create and Find
        documents_path = base_path / FilenameEnum.DOCUMENTS_TO_CREATE_AND_FIND_MARKDOWN.value
        if documents_path.exists():
            rg.append_markdown('Documents to Create and Find', documents_path)

        # SWOT Analysis
        swot_path = base_path / FilenameEnum.SWOT_MARKDOWN.value
        if swot_path.exists():
            rg.append_markdown('SWOT Analysis', swot_path)

        # Team
        team_path = base_path / FilenameEnum.TEAM_MARKDOWN.value
        if team_path.exists():
            rg.append_markdown('Team', team_path)

        # Expert Criticism
        expert_path = base_path / FilenameEnum.EXPERT_CRITICISM_MARKDOWN.value
        if expert_path.exists():
            rg.append_markdown('Expert Criticism', expert_path)

        # Work Breakdown Structure
        wbs_csv_path = base_path / FilenameEnum.WBS_PROJECT_LEVEL1_AND_LEVEL2_AND_LEVEL3_CSV.value
        wbs_level1_path = base_path / FilenameEnum.WBS_LEVEL1.value
        if wbs_csv_path.exists():
            rg.append_csv('Work Breakdown Structure', wbs_csv_path)
        elif wbs_level1_path.exists():
            rg.append_json('Work Breakdown Structure (Level 1)', wbs_level1_path)

        # Review Plan
        review_plan_path = base_path / FilenameEnum.REVIEW_PLAN_MARKDOWN.value
        if review_plan_path.exists():
            rg.append_markdown('Review Plan', review_plan_path)

        # Questions & Answers
        qa_html_path = base_path / FilenameEnum.QUESTIONS_AND_ANSWERS_HTML.value
        if qa_html_path.exists():
            rg.append_html('Questions & Answers', qa_html_path)

        # Premortem
        premortem_path = base_path / FilenameEnum.PREMORTEM_MARKDOWN.value
        if premortem_path.exists():
            rg.append_markdown_with_tables('Premortem', premortem_path)

        # Initial Prompt Vetted (composite section)
        setup_path = base_path / FilenameEnum.INITIAL_PLAN.value
        redline_path = base_path / FilenameEnum.REDLINE_GATE_MARKDOWN.value
        premise_path = base_path / FilenameEnum.PREMISE_ATTACK_MARKDOWN.value
        if setup_path.exists() and redline_path.exists() and premise_path.exists():
            rg.append_initial_prompt_vetted(
                document_title='Initial Prompt Vetted',
                initial_prompt_file_path=setup_path,
                redline_gate_markdown_file_path=redline_path,
                premise_attack_markdown_file_path=premise_path,
            )

        # Get project title for report header
        title = "PlanExe Report (Recovered)"
        wbs_title_path = base_path / FilenameEnum.WBS_LEVEL1_PROJECT_TITLE.value
        if wbs_title_path.exists():
            try:
                title_data = json.loads(wbs_title_path.read_text(encoding='utf-8'))
                if isinstance(title_data, dict) and 'title' in title_data:
                    title = title_data['title']
                elif isinstance(title_data, str):
                    title = title_data
            except:
                pass

        # Generate rich HTML using ReportGenerator (same as ReportTask)
        assembled_html = rg.generate_html_report(
            title=title,
            execute_plan_section_hidden=True
        )

        # Build metadata about what was recovered
        missing_sections: List[MissingSection] = []
        sections: List[ReportSection] = []
        recovered_expected = 0

        for expected_filename in EXPECTED_REPORT_FILENAMES:
            record = records_by_filename.get(expected_filename)
            if record:
                sections.append(
                    ReportSection(
                        filename=record.filename,
                        stage=record.stage,
                        content_type=record.content_type,
                        content=record.content,
                    )
                )
                recovered_expected += 1
            else:
                missing_sections.append(
                    MissingSection(
                        filename=expected_filename,
                        stage=_infer_stage_from_filename(expected_filename),
                        reason="Missing from plan_content table",
                    )
                )

        total_expected = len(EXPECTED_REPORT_FILENAMES)
        completion_percentage = round((recovered_expected / total_expected) * 100, 2) if total_expected else 0.0

        return FallbackReportResponse(
            plan_id=plan_id,
            generated_at=generated_at,
            completion_percentage=completion_percentage,
            sections=sections,
            missing_sections=missing_sections,
            assembled_html=assembled_html,
        )
    finally:
        # Clean up temp directory if we created one
        if use_temp_dir:
            try:
                shutil.rmtree(base_path, ignore_errors=True)
            except:
                pass


@app.get("/api/plans/{plan_id}/fallback-report", response_model=FallbackReportResponse)
async def get_fallback_report(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Assemble a rich HTML report using ReportGenerator - same as ReportTask."""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        plan_contents = db.get_plan_content(plan_id)
        if not plan_contents:
            raise HTTPException(status_code=404, detail="No plan content found for this plan")

        return _assemble_fallback_report(plan_id, plan, plan_contents)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to assemble fallback report: {exc}")


@app.get("/api/plans/{plan_id}/assembled-document")
async def get_assembled_plan_document(plan_id: str, db: DatabaseService = Depends(get_database)):
    """
    Assemble the plan document from completed task outputs.
    Returns structured sections with content in markdown format for the live plan document viewer.
    """
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        plan_contents = db.get_plan_content(plan_id)
        if not plan_contents:
            return {
                "plan_id": plan_id,
                "sections": [],
                "markdown": "",
                "word_count": 0,
                "section_count": 0,
                "last_updated": None,
            }

        sections = []
        markdown_parts = []

        # Sort by created_at to maintain chronological order
        sorted_contents = sorted(plan_contents, key=lambda c: c.created_at)

        for content in sorted_contents:
            # Extract text content from content_json
            text_content = None
            if content.content_json:
                # Try to get markdown, text, or any string content
                if isinstance(content.content_json, dict):
                    text_content = (
                        content.content_json.get("markdown")
                        or content.content_json.get("text")
                        or content.content_json.get("content")
                    )
                elif isinstance(content.content_json, str):
                    text_content = content.content_json

            # Fallback to raw content if available
            if not text_content and content.content:
                try:
                    text_content = content.content if isinstance(content.content, str) else content.content.decode('utf-8')
                except:
                    text_content = None

            section = {
                "id": str(content.id),
                "task_name": content.task_name or "Unknown Task",
                "stage": content.stage or "unknown",
                "content": text_content or "",
                "created_at": content.created_at.isoformat() if content.created_at else datetime.utcnow().isoformat(),
                "is_final": content.is_final or False,
            }
            sections.append(section)

            # Build markdown document
            if text_content:
                markdown_parts.append(f"## {section['task_name']}\n\n{text_content}\n\n")

        full_markdown = "\n".join(markdown_parts)
        word_count = len(full_markdown.split()) if full_markdown else 0

        last_updated = None
        if sorted_contents:
            last_updated = sorted_contents[-1].created_at.isoformat()

        return {
            "plan_id": plan_id,
            "sections": sections,
            "markdown": full_markdown,
            "word_count": word_count,
            "section_count": len(sections),
            "last_updated": last_updated,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to assemble plan document: {exc}")


# File download endpoints
@app.get("/api/plans/{plan_id}/report")
async def download_plan_report(plan_id: str, request: Request, db: DatabaseService = Depends(get_database)):
    """Download the final HTML report for a plan, or return JSON if requested"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Check if JSON format is requested
        if request.headers.get("accept") == "application/json":
            plan_contents = db.get_plan_content(plan_id)
            sections = []
            for content in plan_contents:
                sections.append({
                    "id": content.filename,
                    "title": content.filename.replace('.json', '').replace('-', ' ').title(),
                    "stage": content.stage,
                    "content": content.content,
                    "content_type": content.content_type,
                    "filename": content.filename
                })
            
            return {
                "plan_id": plan_id,
                "generated_at": plan.updated_at or datetime.utcnow(),
                "sections": sections,
                "source": "database"
            }

        try:
            report_record = db.get_plan_content_by_filename(plan_id, FilenameEnum.REPORT.value)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to query stored report: {exc}") from exc

        if report_record and report_record.content:
            media_type = _infer_media_type(report_record.content_type, FilenameEnum.REPORT.value, "text/html; charset=utf-8")
            headers = {"Content-Disposition": f'attachment; filename="{plan_id}-report.html"'}
            return Response(content=report_record.content, media_type=media_type, headers=headers)

        if plan.output_dir:
            report_path = Path(plan.output_dir) / FilenameEnum.REPORT.value
            if report_path.exists():
                return FileResponse(
                    path=str(report_path),
                    filename=f"{plan_id}-report.html",
                    media_type="text/html",
                )

        raise HTTPException(status_code=404, detail="Report not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download report: {str(e)}")


@app.get("/api/plans/{plan_id}/files/{filename}")
async def download_plan_file(plan_id: str, filename: str, db: DatabaseService = Depends(get_database)):
    """Download a specific file from a plan"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        file_path = Path(plan.output_dir) / filename

        if file_path.exists():
            return FileResponse(
                path=str(file_path),
                filename=filename
            )

        # Attempt to serve from the database when the filesystem file is missing.
        try:
            content_record = db.get_plan_content_by_filename(plan_id, filename)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to query stored file: {exc}") from exc

        if not content_record or content_record.content is None:
            raise HTTPException(status_code=404, detail="File not found")

        media_type = _infer_media_type(content_record.content_type, filename)
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return Response(content=content_record.content, media_type=media_type, headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")


# Plan management endpoints
@app.delete("/api/plans/{plan_id}")
async def delete_plan(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Delete a plan, terminate running processes, and clean up all associated resources"""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Terminate running pipeline process if exists
        try:
            terminated = pipeline_service.terminate_plan_execution(plan_id)
            if terminated:
                print(f"Terminated running pipeline for plan {plan_id}")
        except Exception as e:
            print(f"Warning: Failed to terminate pipeline for plan {plan_id}: {e}")

        # Clean up WebSocket connections for this plan
        try:
            await websocket_manager.cleanup_plan_connections(plan_id)
            print(f"Cleaned up WebSocket connections for plan {plan_id}")
        except Exception as e:
            print(f"Warning: Failed to cleanup WebSocket connections for plan {plan_id}: {e}")

        # Delete files from filesystem
        output_dir = Path(plan.output_dir)
        if output_dir.exists():
            import shutil
            shutil.rmtree(output_dir)

        # Delete from database
        db.delete_plan(plan_id)

        return {"message": f"Plan {plan_id} deleted successfully with full resource cleanup"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete plan: {str(e)}")


@app.get("/api/plans", response_model=List[PlanResponse])
async def list_plans(db: DatabaseService = Depends(get_database)):
    """Get list of all plans"""
    try:
        plans = db.list_plans()

        return [
            PlanResponse(
                plan_id=plan.plan_id,
                status=PlanStatus(plan.status),
                created_at=plan.created_at,
                prompt=plan.prompt,
                llm_model=plan.llm_model,
                speed_vs_detail=SpeedVsDetail(plan.speed_vs_detail),
                reasoning_effort=RESPONSES_STREAMING_CONTROLS.reasoning_effort,
                progress_percentage=plan.progress_percentage,
                progress_message=plan.progress_message,
                error_message=plan.error_message,
                output_dir=plan.output_dir
            )
            for plan in plans
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get plans: {str(e)}")

# Mount static frontend after all API routes are registered (production only)
if not IS_DEVELOPMENT:
    if STATIC_UI_DIR and STATIC_UI_DIR.exists():
        app.mount("/", StaticFiles(directory=str(STATIC_UI_DIR), html=True), name="static")
        print(f"Serving static UI from: {STATIC_UI_DIR}")
    else:
        missing_dir = STATIC_UI_DIR or Path("/app/ui_static")
        print(f"Warning: Static UI directory not found: {missing_dir}")
        print("   This is expected in local development mode or before frontend build")



# Plan artefact listing endpoint (database-backed)
@app.get("/api/plans/{plan_id}/artefacts", response_model=PlanArtefactListResponse)
async def list_plan_artefacts(plan_id: str, db: DatabaseService = Depends(get_database)):
    """Return artefacts persisted in plan_content for the given plan."""
    try:
        plan = db.get_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        content_records = db.get_plan_content(plan_id)
        artefacts: List[PlanArtefact] = []

        for record in content_records:
            size_bytes = record.content_size_bytes
            if size_bytes is None:
                size_bytes = len(record.content.encode('utf-8')) if record.content else 0

            description = record.filename
            if '-' in description:
                description = description.split('-', 1)[1]
            if '.' in description:
                description = description.rsplit('.', 1)[0]
            description = description.replace('_', ' ').replace('-', ' ').strip().title() or record.filename

            try:
                order = int(record.filename.split('-', 1)[0])
            except (ValueError, IndexError):
                order = None

            artefacts.append(
                PlanArtefact(
                    filename=record.filename,
                    content_type=record.content_type,
                    stage=record.stage,
                    size_bytes=size_bytes,
                    created_at=record.created_at or datetime.utcnow(),
                    description=description,
                    task_name=record.stage or description,
                    order=order,
                )
            )

        artefacts.sort(key=lambda entry: ((entry.order if entry.order is not None else 9999), entry.filename))

        return PlanArtefactListResponse(plan_id=plan_id, artefacts=artefacts)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch plan artefacts: {exc}")


@app.get("/api/conversations/{conversation_id}/debug")
async def debug_conversation_chaining(conversation_id: str, db: DatabaseService = Depends(get_database)):
    """Debug endpoint for conversation response chaining verification."""
    try:
        # Get all interactions for this conversation
        interactions = db.get_plan_interactions(conversation_id)
        if not interactions:
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Find completed interactions with response IDs
        response_ids = []
        last_updated_at = None

        for interaction in sorted(interactions, key=lambda x: x.created_at, reverse=True):
            if (interaction.status == "completed" and
                interaction.response_metadata and
                interaction.response_metadata.get("response_id")):
                response_ids.append(interaction.response_metadata["response_id"])
                if last_updated_at is None:
                    last_updated_at = interaction.created_at

        if not response_ids:
            return {
                "conversation_id": conversation_id,
                "last_response_id": None,
                "chain_length": 0,
                "last_updated_at": None,
                "total_interactions": len(interactions),
            }

        return {
            "conversation_id": conversation_id,
            "last_response_id": response_ids[0],
            "chain_length": len(response_ids),
            "last_updated_at": last_updated_at.isoformat() if last_updated_at else None,
            "total_interactions": len(interactions),
            "all_response_ids": response_ids,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to debug conversation chaining: {str(e)}")


@app.post("/api/validate-reasoning-effort")
def validate_reasoning_effort(reasoning_effort: str) -> ReasoningEffortValidation:
    """
    Validate reasoning effort and provide streaming compatibility information.
    
    This endpoint helps the UI inform users about streaming limitations
    when they select minimal reasoning effort.
    """
    valid_values = ["minimal", "low", "medium", "high"]
    
    if reasoning_effort not in valid_values:
        raise HTTPException(
            status_code=422, 
            detail=f"reasoning_effort must be one of {valid_values}, got '{reasoning_effort}'"
        )
    
    # Determine streaming compatibility
    streaming_compatible = reasoning_effort in ["medium", "high"]
    recommended_for_streaming = reasoning_effort == "medium"
    
    streaming_warning = None
    if reasoning_effort == "minimal":
        streaming_warning = (
            "Minimal reasoning effort is fastest but does not support real-time streaming. "
            "You'll see results after the entire plan completes. Use 'medium' for streaming."
        )
    elif reasoning_effort == "low":
        streaming_warning = (
            "Low reasoning effort has limited streaming support. "
            "Use 'medium' or 'high' for the best streaming experience."
        )
    
    return ReasoningEffortValidation(
        reasoning_effort=reasoning_effort,
        streaming_compatible=streaming_compatible,
        streaming_warning=streaming_warning,
        recommended_for_streaming=recommended_for_streaming
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)

