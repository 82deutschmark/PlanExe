/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-30
 * PURPOSE: Pydantic models for API request/response schemas - ensures type
 *          safety and validation across the PlanExe surface area.
 * SRP and DRY check: Pass - continues to centralise request/response typing
 *          without duplicating schema definitions.
 */
"""
Author: Claude Code (claude-opus-4-1-20250805)
Date: 2025-09-19
PURPOSE: Pydantic models for API request/response schemas - ensures type safety and validation
SRP and DRY check: Pass - Single responsibility of data validation, DRY approach to schema definitions
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class PlanStatus(str, Enum):
    """Status of a plan generation job"""
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class SpeedVsDetail(str, Enum):
    """Speed vs detail trade-off options"""
    ALL_DETAILS_BUT_SLOW = "all_details_but_slow"
    BALANCED_SPEED_AND_DETAIL = "balanced_speed_and_detail"  # Will map to detailed mode in pipeline
    FAST_BUT_SKIP_DETAILS = "fast_but_skip_details"


class CreatePlanRequest(BaseModel):
    """Request to create a new plan"""
    prompt: str = Field(..., description="The planning prompt/idea", min_length=1, max_length=10000)
    llm_model: Optional[str] = Field(None, description="LLM model ID to use")
    speed_vs_detail: SpeedVsDetail = Field(SpeedVsDetail.ALL_DETAILS_BUT_SLOW, description="Speed vs detail preference")
    openrouter_api_key: Optional[str] = Field(None, description="OpenRouter API key for paid models")


class PlanResponse(BaseModel):
    """Response when creating or retrieving a plan"""
    plan_id: str = Field(..., description="Unique plan identifier")
    status: PlanStatus = Field(..., description="Current status of the plan")
    created_at: datetime = Field(..., description="When the plan was created")
    prompt: str = Field(..., description="The original planning prompt")
    llm_model: Optional[str] = Field(None, description="LLM model used for this plan")
    progress_percentage: int = Field(0, description="Completion percentage (0-100)")
    progress_message: str = Field("", description="Current progress description")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    output_dir: Optional[str] = Field(None, description="Path to output directory")


class PlanProgressEvent(BaseModel):
    """Server-sent event for plan progress updates"""
    plan_id: str
    status: PlanStatus
    progress_percentage: int
    progress_message: str
    timestamp: datetime
    error_message: Optional[str] = None


class LLMModel(BaseModel):
    """Available LLM model information"""
    id: str = Field(..., description="Model identifier")
    label: str = Field(..., description="Human-readable model name")
    comment: str = Field(..., description="Model description/capabilities")
    priority: int = Field(0, description="Priority/ordering (lower = higher priority)")
    requires_api_key: bool = Field(False, description="Whether this model requires an API key")


class PromptExample(BaseModel):
    """Example prompt from the catalog"""
    uuid: str = Field(..., description="Unique prompt identifier")
    prompt: str = Field(..., description="The example prompt text")
    title: Optional[str] = Field(None, description="Short prompt title")


class PlanFilesResponse(BaseModel):
    """Response listing files in a completed plan"""
    plan_id: str
    files: List[str] = Field(..., description="List of generated filenames")
    has_report: bool = Field(..., description="Whether HTML report is available")


class PlanArtefact(BaseModel):
    """Detail for plan_content artefacts exposed via API"""
    filename: str = Field(..., description="Canonical filename")
    content_type: str = Field(..., description="Content type recorded by the pipeline")
    stage: Optional[str] = Field(None, description="Pipeline stage reported by the task")
    size_bytes: int = Field(0, description="Approximate size in bytes")
    created_at: datetime = Field(..., description="Timestamp when the artefact was stored")
    description: Optional[str] = Field(None, description="Human readable display label")
    task_name: Optional[str] = Field(None, description="Associated Luigi task name if available")
    order: Optional[int] = Field(None, description="Sort key derived from filename prefix")


class PlanArtefactListResponse(BaseModel):
    """Response listing database-backed artefacts for a plan"""
    plan_id: str
    artefacts: List[PlanArtefact] = Field(..., description="Artefacts sourced from plan_content")


class APIError(BaseModel):
    """Standard API error response"""
    error: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.now)


class PipelineDetailsResponse(BaseModel):
    """Response for pipeline details endpoint"""
    plan_id: str
    run_directory: str
    pipeline_stages: List[Dict[str, Any]]
    pipeline_log: str
    generated_files: List[Dict[str, Any]]
    total_files: int


class StreamStatusResponse(BaseModel):
    """Response for stream status endpoint"""
    status: str
    ready: bool


class HealthResponse(BaseModel):
    """API health check response"""
    status: str = Field("healthy", description="API status")
    version: str = Field(..., description="API version")
    planexe_version: str = Field(..., description="PlanExe version")
    available_models: int = Field(..., description="Number of available LLM models")
class ReportSection(BaseModel):
    """Recovered section from plan_content for fallback report assembly"""
    filename: str = Field(..., description="Original filename persisted by the pipeline")
    stage: Optional[str] = Field(None, description="Pipeline stage that produced the content")
    content_type: str = Field(..., description="Content type stored in plan_content")
    content: str = Field(..., description="Raw content retrieved from plan_content")


class MissingSection(BaseModel):
    """Metadata describing a section we expected but could not recover"""
    filename: str = Field(..., description="Expected filename that is missing from plan_content")
    stage: Optional[str] = Field(None, description="Pipeline stage expected to create this content")
    reason: str = Field(..., description="Explanation for why this section is unavailable")


class FallbackReportResponse(BaseModel):
    """API response for the fallback report assembler"""
    plan_id: str = Field(..., description="Plan identifier")
    generated_at: datetime = Field(..., description="Timestamp when the fallback report was assembled")
    completion_percentage: float = Field(..., description="Percentage of expected sections recovered from plan_content")
    sections: List[ReportSection] = Field(..., description="Sections successfully recovered from plan_content")
    missing_sections: List[MissingSection] = Field(..., description="Sections that could not be recovered")
    assembled_html: str = Field(..., description="HTML fallback report assembled from available content")


class ReasoningEffort(str, Enum):
    """Reasoning effort levels supported by the Responses API."""

    minimal = "minimal"
    medium = "medium"
    high = "high"


class AnalysisStreamRequest(BaseModel):
    """Request payload for initializing a streaming analysis session."""

    model_config = ConfigDict(populate_by_name=True)

    task_id: str = Field(..., description="Identifier for the analysis task or plan context")
    model_key: str = Field(..., description="LLM configuration key to execute the analysis")
    prompt: str = Field(..., min_length=1, max_length=8000, description="Primary analysis instructions")
    context: Optional[str] = Field(None, description="Supplementary context to prepend to the prompt")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional caller metadata for auditing")
    temperature: Optional[float] = Field(0.2, ge=0.0, le=2.0, description="Sampling temperature override")
    max_output_tokens: Optional[int] = Field(
        4096,
        ge=512,
        le=32768,
        description="Maximum tokens budget allocated to the response",
    )
    reasoning_effort: ReasoningEffort = Field(
        ReasoningEffort.high, description="Reasoning effort level for the Responses API"
    )
    reasoning_summary: str = Field("detailed", description="Reasoning summary granularity")
    text_verbosity: str = Field("high", description="Text verbosity configuration for streaming deltas")
    schema_name: Optional[str] = Field(
        None, description="Optional schema label when requesting structured output"
    )
    output_schema: Optional[Dict[str, Any]] = Field(
        None,
        alias="schema",
        description="Optional JSON schema to request structured responses",
    )
    previous_response_id: Optional[str] = Field(
        None, description="Responses API conversation chaining identifier"
    )
    system_prompt: Optional[str] = Field(
        None, description="Override for the default analysis system instructions"
    )
    stage: Optional[str] = Field(
        None, description="Logical stage identifier used for persistence/telemetry"
    )

    @field_validator("reasoning_effort")
    @classmethod
    def ensure_reasoning_not_minimal(cls, value: ReasoningEffort) -> ReasoningEffort:
        if value == ReasoningEffort.minimal:
            raise ValueError("reasoning_effort must be medium or high for streaming analyses")
        return value


class AnalysisStreamSessionResponse(BaseModel):
    """Handshake response containing session metadata for SSE connection."""

    session_id: str = Field(..., description="Opaque session identifier for SSE upgrade")
    task_id: str = Field(..., description="Task identifier echoed from the request")
    model_key: str = Field(..., description="Model key echoed from the request")
    expires_at: datetime = Field(..., description="Expiry timestamp for the cached payload")
    ttl_seconds: int = Field(..., description="Time-to-live for the session in seconds")

class ConversationCreateRequest(BaseModel):
    """Initialization payload for conversation-first flow."""

    prompt: str = Field(..., min_length=1, max_length=8000)
    tags: Optional[List[str]] = Field(default=None, description="Lightweight context tags")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Arbitrary metadata from the client")
    model_override: Optional[str] = Field(default=None, description="Override model key")
    speed_vs_detail: Optional[SpeedVsDetail] = Field(
        default=None, description="Preferred balance between speed and depth"
    )
    openrouter_api_key: Optional[str] = Field(default=None, description="Optional OpenRouter key")
    previous_response_id: Optional[str] = Field(default=None, description="Chained response identifier")


class ConversationMessageRequest(BaseModel):
    """Payload for conversation follow-up messages."""

    message: str = Field(..., min_length=1, max_length=6000)
    metadata: Optional[Dict[str, Any]] = Field(default=None)


class ConversationSummaryPayload(BaseModel):
    """Summary container returned alongside SSE completion."""

    model_config = ConfigDict(populate_by_name=True)

    text: str = Field("", description="Aggregated assistant text")
    reasoning: Optional[str] = Field(default=None)
    json_chunks: List[str] = Field(default_factory=list, alias="jsonChunks")


class ConversationFinalizeRequest(BaseModel):
    """Finalize payload when user accepts the streamed response."""

    model_config = ConfigDict(populate_by_name=True)

    response_id: str = Field(..., alias="response_id")
    prompt: str = Field(..., min_length=1, max_length=8000)
    summary: ConversationSummaryPayload
    tags: Optional[List[str]] = Field(default=None)
    speed_vs_detail: Optional[SpeedVsDetail] = Field(default=None)
    openrouter_api_key: Optional[str] = Field(default=None)
    model_override: Optional[str] = Field(default=None)


class ConversationSessionResponse(BaseModel):
    """Metadata returned after conversation session initialization."""

    model_config = ConfigDict(populate_by_name=True)

    conversation_id: str = Field(..., alias="conversationId")
    response_id: str = Field(..., alias="responseId")
    model_key: str = Field(..., alias="modelKey")
    created_at: datetime = Field(..., alias="createdAt")
    prompt: str
    status: str


class ConversationFinalizeResponse(BaseModel):
    """Response body for finalize endpoint."""

    model_config = ConfigDict(populate_by_name=True)

    conversation_id: str = Field(..., alias="conversationId")
    response_id: str = Field(..., alias="responseId")
    plan_request: CreatePlanRequest = Field(..., alias="planRequest")
    summary: ConversationSummaryPayload
    usage: Dict[str, Any] = Field(default_factory=dict)
