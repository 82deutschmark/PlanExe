"""FastAPI application exposing PlanExe services."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, Field

from .services import ImageGenerationError, ImageGenerationService

app = FastAPI(title="PlanExe API", version="0.1.0")
_image_generation_service = ImageGenerationService()


class ImageGenerationRequest(BaseModel):
    """Payload for the image generation endpoint."""

    prompt: str = Field(..., min_length=1, description="Text prompt describing the desired image.")
    model: str | None = Field(
        default=None,
        description="Override the default model used by the provider.",
    )
    size: str | None = Field(
        default=None,
        description="Requested image size in WIDTHxHEIGHT format (for example 1024x1024).",
    )
    user: str | None = Field(
        default=None,
        description="Optional user identifier forwarded to the provider for rate limiting.",
    )


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Simple endpoint used for readiness and liveness probes."""

    return {"status": "ok"}


@app.post(
    "/v1/images:generate",
    status_code=status.HTTP_201_CREATED,
    tags=["Images"],
)
async def generate_image(request: ImageGenerationRequest) -> Response:
    """Generate an image using the configured provider and return it as binary data."""

    try:
        result = await _image_generation_service.generate_image(
            prompt=request.prompt,
            model=request.model,
            size=request.size,
            user=request.user,
        )
    except ImageGenerationError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    headers = {
        "X-Image-Model": result.model,
        "X-Image-Size": result.size,
    }
    return Response(content=result.image_bytes, media_type=result.mime_type, headers=headers)


@app.on_event("shutdown")
async def _shutdown() -> None:
    await _image_generation_service.aclose()
