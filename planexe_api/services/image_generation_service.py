"""Utilities for generating images via external providers."""

from __future__ import annotations

import base64
import binascii
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx


class ImageGenerationError(RuntimeError):
    """Raised when the remote image generation provider fails."""


@dataclass(slots=True)
class ImageGenerationResult:
    """Represents an image returned from the provider."""

    image_bytes: bytes
    mime_type: str
    model: str
    prompt: str
    size: str
    raw_response: Dict[str, Any]


class ImageGenerationService:
    """Service responsible for orchestrating image generation requests."""

    _DEFAULT_MODEL = "gpt-image-1"
    _DEFAULT_SIZE = "1024x1024"
    _DEFAULT_TIMEOUT = 60.0
    _DEFAULT_URL = "https://api.openai.com/v1/images/generations"

    def __init__(
        self,
        *,
        client: Optional[httpx.AsyncClient] = None,
        api_url: Optional[str] = None,
        default_model: Optional[str] = None,
        default_size: Optional[str] = None,
        timeout: float | None = None,
    ) -> None:
        self._client = client
        self._api_url = api_url or self._DEFAULT_URL
        self._default_model = default_model or self._DEFAULT_MODEL
        self._default_size = default_size or self._DEFAULT_SIZE
        self._timeout = timeout or self._DEFAULT_TIMEOUT

    async def aclose(self) -> None:
        """Close the underlying HTTP client if it was created by the service."""

        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def generate_image(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        size: Optional[str] = None,
        user: Optional[str] = None,
        response_format: str = "b64_json",
    ) -> ImageGenerationResult:
        """Generate an image using the configured provider."""

        if not prompt or not prompt.strip():
            raise ImageGenerationError("Prompt must be a non-empty string.")

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ImageGenerationError(
                "OPENAI_API_KEY environment variable is required for image generation."
            )

        payload = {
            "prompt": prompt,
            "model": model or self._default_model,
            "size": size or self._default_size,
            "response_format": response_format,
        }
        if user:
            payload["user"] = user

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        client = self._client
        if client is None:
            client = httpx.AsyncClient(timeout=self._timeout)
            self._client = client

        try:
            response = await client.post(self._api_url, json=payload, headers=headers)
        except httpx.HTTPError as exc:  # pragma: no cover - network level errors
            raise ImageGenerationError("Failed to reach the image generation provider.") from exc

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = self._build_error_detail(exc.response)
            raise ImageGenerationError(detail) from exc

        try:
            response_data = response.json()
        except json.JSONDecodeError:
            image_bytes = response.content
            mime_type = response.headers.get("content-type", "image/png")
            return ImageGenerationResult(
                image_bytes=image_bytes,
                mime_type=mime_type,
                model=payload["model"],
                prompt=prompt,
                size=payload["size"],
                raw_response={"binary_response": True},
            )

        image_bytes, mime_type = self._extract_image_bytes(response_data)
        return ImageGenerationResult(
            image_bytes=image_bytes,
            mime_type=mime_type,
            model=payload["model"],
            prompt=prompt,
            size=payload["size"],
            raw_response=response_data,
        )

    @staticmethod
    def _build_error_detail(response: httpx.Response) -> str:
        try:
            data = response.json()
        except json.JSONDecodeError:
            return f"Provider returned {response.status_code}: {response.text.strip()}"

        if isinstance(data, dict):
            error = data.get("error")
            if isinstance(error, dict):
                message = error.get("message")
                if isinstance(message, str):
                    return message
            if "detail" in data and isinstance(data["detail"], str):
                return data["detail"]
        return f"Provider returned {response.status_code}: {data!r}"

    @staticmethod
    def _extract_image_bytes(response_data: Dict[str, Any]) -> tuple[bytes, str]:
        if not isinstance(response_data, dict):
            raise ImageGenerationError(
                "Unexpected payload from image generation provider."
            )

        data = response_data.get("data")
        if not isinstance(data, list) or not data:
            raise ImageGenerationError("No image data returned by the provider.")

        first_item = data[0]
        if not isinstance(first_item, dict):
            raise ImageGenerationError("Malformed image data returned by the provider.")

        image_base64 = first_item.get("b64_json")
        if not isinstance(image_base64, str):
            raise ImageGenerationError("Image payload missing base64 data.")

        try:
            image_bytes = base64.b64decode(image_base64)
        except (ValueError, binascii.Error) as exc:  # pragma: no cover - defensive
            raise ImageGenerationError("Unable to decode base64 image data.") from exc
        mime_type = first_item.get("mime_type")
        if not isinstance(mime_type, str) or not mime_type:
            mime_type = "image/png"
        return image_bytes, mime_type
