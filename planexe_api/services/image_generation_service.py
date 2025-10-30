# Author: gpt-5-codex
# Date: 2025-10-29T20:39:49Z
# PURPOSE: Centralise OpenAI gpt-image-1-mini usage for both generation and editing, aligning with current API semantics.
# SRP and DRY check: Pass. Maintains single responsibility for image orchestration with reusable validation and retries.

"""
Image generation service for PlanExe concept visualization.

Provides robust image generation using OpenAI's gpt-image-1-mini model with
multiple fallback strategies and comprehensive error handling.
"""
import base64
import os
import asyncio
from typing import Optional, Dict, Any, Tuple

import httpx

from planexe.utils.planexe_llmconfig import PlanExeLLMConfig


class ImageGenerationError(Exception):
    """Custom exception for image generation failures."""
    pass


class ImageGenerationService:
    """Service for generating concept images using OpenAI's image generation APIs."""

    DEFAULT_MODEL = "gpt-image-1-mini"
    DEFAULT_ALLOWED_SIZES = ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"]
    DEFAULT_TIMEOUT_SECONDS = 60.0
    DEFAULT_MAX_RETRIES = 2
    GENERATE_URL = "https://api.openai.com/v1/images/generations"
    EDIT_URL = "https://api.openai.com/v1/images/edits"

    def __init__(self):
        """Initialize the image generation service."""
        self.llm_config = PlanExeLLMConfig.load()
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.organization = os.getenv("OPENAI_ORG_ID") or os.getenv("OPENAI_ORGANIZATION")
        
        if not self.api_key:
            raise ImageGenerationError("OPENAI_API_KEY not configured")

    def _get_image_defaults(self, model_config: Dict[str, Any]) -> Dict[str, Any]:
        """Retrieve image-specific defaults from the model configuration."""
        return model_config.get("image_defaults", {})

    def _resolve_model(self, model_key: Optional[str]) -> Tuple[str, Dict[str, Any]]:
        """Resolve the image generation model from configuration."""
        if model_key and model_key in self.llm_config.llm_config_dict:
            config = self.llm_config.llm_config_dict[model_key]
            if "image_generation" in config.get("capabilities", []):
                return model_key, config

        # Find first available image generation model
        for model_id, config in self.llm_config.llm_config_dict.items():
            if "image_generation" in config.get("capabilities", []):
                return model_id, config

        # Default fallback
        return self.DEFAULT_MODEL, self.llm_config.llm_config_dict.get(self.DEFAULT_MODEL, {})

    def _resolve_size(self, requested_size: Optional[str], model_config: Dict[str, Any]) -> str:
        """Validate and resolve image size using configuration defaults."""
        defaults = self._get_image_defaults(model_config)
        allowed_sizes = defaults.get("allowed_sizes") or self.DEFAULT_ALLOWED_SIZES
        default_size = defaults.get("default_size") or self.DEFAULT_ALLOWED_SIZES[2]

        normalized_requested = (requested_size or "").strip()
        if normalized_requested and normalized_requested in allowed_sizes:
            return normalized_requested

        if default_size in allowed_sizes:
            return default_size

        return allowed_sizes[0]
    
    def _build_headers(self, content_type: Optional[str] = "application/json") -> Dict[str, str]:
        """Build HTTP headers for OpenAI API requests."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }
        if content_type:
            headers["Content-Type"] = content_type
        if self.organization:
            headers["OpenAI-Organization"] = self.organization
        return headers

    def _resolve_optional_setting(
        self,
        key: str,
        defaults: Dict[str, Any],
        override: Optional[Any],
    ) -> Optional[Any]:
        """Resolve optional payload settings, prioritising explicit overrides."""

        if override is not None:
            if isinstance(override, str):
                stripped = override.strip()
                return stripped or None
            return override

        value = defaults.get(key)
        if isinstance(value, str):
            value = value.strip() or None
        return value

    def _decode_base64_image(self, encoded: str, label: str) -> bytes:
        """Decode base64 image data and raise descriptive errors when invalid."""

        try:
            return base64.b64decode(encoded, validate=True)
        except Exception as exc:  # pragma: no cover - defensive
            raise ImageGenerationError(f"Invalid base64 data provided for {label}") from exc

    async def _fetch_image_from_url(self, url: str, timeout: float = 30.0) -> Tuple[str, str]:
        """Fetch an image from a URL and convert to base64, returning the data and a format label."""

        try:
            return base64.b64decode(encoded, validate=True)
        except Exception as exc:  # pragma: no cover - defensive
            raise ImageGenerationError(f"Invalid base64 data provided for {label}") from exc

                image_bytes = response.content
                return base64.b64encode(image_bytes).decode("utf-8"), "base64_from_url"
        except httpx.TimeoutException:
            raise ImageGenerationError("Timeout while fetching image from URL")
        except Exception as exc:  # pragma: no cover - defensive
            raise ImageGenerationError(f"Error fetching image from URL: {str(exc)}") from exc

    async def _generate_with_images_api(
        self,
        payload: Dict[str, Any],
        timeout: float = 60.0,
    ) -> Tuple[str, str, str]:
        """Generate an image using the JSON Images API."""

        headers = self._build_headers()

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.GENERATE_URL,
                    headers=headers,
                    json=payload,
                )

            if response.status_code >= 400:
                detail = response.text
                raise ImageGenerationError(f"OpenAI API error ({response.status_code}): {detail}")

            data = response.json()
            images = data.get("data") or []
            if not images:
                raise ImageGenerationError("No image data returned from OpenAI")

            image_entry = images[0] or {}
            image_b64 = image_entry.get("b64_json")

            if image_b64:
                revised_prompt = image_entry.get("revised_prompt") or payload.get("prompt")
                return image_b64, revised_prompt, "base64"

            image_url = image_entry.get("url")
            if image_url:
                fetched_b64, format_label = await self._fetch_image_from_url(image_url, timeout=timeout)
                revised_prompt = image_entry.get("revised_prompt") or payload.get("prompt")
                return fetched_b64, revised_prompt, format_label

            raise ImageGenerationError("No base64 or URL data returned from OpenAI Images API")

        except httpx.TimeoutException:
            raise ImageGenerationError("Timeout while generating image")
        except ImageGenerationError:
            raise
        except Exception as e:  # pragma: no cover - defensive
            raise ImageGenerationError(f"Unexpected error during image generation: {str(e)}") from e

    async def _edit_with_images_api(
        self,
        data: Dict[str, Any],
        files: Dict[str, Tuple[str, bytes, str]],
        timeout: float,
    ) -> Tuple[str, str]:
        """Submit an edit request to the Images API using multipart form data."""

        headers = self._build_headers(content_type=None)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.EDIT_URL,
                    headers=headers,
                    data=data,
                    files=files,
                )

            if response.status_code >= 400:
                detail = response.text
                raise ImageGenerationError(f"OpenAI edit API error ({response.status_code}): {detail}")

            data = response.json()
            images = data.get("data") or []
            if not images:
                raise ImageGenerationError("No image data returned from OpenAI edit API")

            image_entry = images[0] or {}
            image_b64 = image_entry.get("b64_json")
            if image_b64:
                revised_prompt = image_entry.get("revised_prompt") or data.get("prompt")
                return image_b64, revised_prompt

            raise ImageGenerationError("No base64 data returned from OpenAI edit API")

        except httpx.TimeoutException:
            raise ImageGenerationError("Timeout while editing image")
        except ImageGenerationError:
            raise
        except Exception as e:  # pragma: no cover - defensive
            raise ImageGenerationError(f"Unexpected error during image editing: {str(e)}") from e

    def _resolve_timeout_and_retries(
        self,
        defaults: Dict[str, Any],
        timeout_override: Optional[float],
        retries_override: Optional[int]
    ) -> Tuple[float, int]:
        """Resolve timeout and retry settings using configuration defaults."""
        timeout_seconds = float(defaults.get("timeout_seconds", self.DEFAULT_TIMEOUT_SECONDS))
        max_retries_config = int(defaults.get("max_retries", self.DEFAULT_MAX_RETRIES))

        effective_timeout = float(timeout_override) if timeout_override is not None else timeout_seconds
        effective_retries = int(retries_override) if retries_override is not None else max_retries_config

        if effective_timeout <= 0:
            effective_timeout = self.DEFAULT_TIMEOUT_SECONDS
        if effective_retries < 0:
            effective_retries = self.DEFAULT_MAX_RETRIES

        return effective_timeout, effective_retries

    async def generate_concept_image(
        self,
        prompt: str,
        model_key: Optional[str] = None,
        size: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        quality: Optional[str] = None,
        style: Optional[str] = None,
        background: Optional[str] = None,
        negative_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a concept image and return base64 data with metadata.
        
        Args:
            prompt: The text prompt for image generation
            model_key: Optional model identifier, will resolve from config if not provided
            size: Optional image size, will validate and default if invalid
            timeout: Optional request timeout in seconds
            max_retries: Optional maximum number of retry attempts
            
        Returns:
            Dictionary containing:
            - image_b64: Base64 encoded image data
            - model: The model used for generation
            - size: The actual size used
            - format: "base64"
            - prompt: The final prompt accepted by the API (may include revisions)

        Raises:
            ImageGenerationError: If image generation fails after all retries
        """
        if not prompt or not prompt.strip():
            raise ImageGenerationError("Prompt is required and cannot be empty")

        clean_prompt = prompt.strip()
        model, model_config = self._resolve_model(model_key)
        defaults = self._get_image_defaults(model_config)
        actual_size = self._resolve_size(size, model_config)
        actual_quality = self._resolve_optional_setting("quality", defaults, quality)
        actual_style = self._resolve_optional_setting("style", defaults, style)
        actual_background = self._resolve_optional_setting("background", defaults, background)
        actual_negative = self._resolve_optional_setting("negative_prompt", defaults, negative_prompt)
        timeout_seconds, retries = self._resolve_timeout_and_retries(defaults, timeout, max_retries)

        payload: Dict[str, Any] = {
            "model": model,
            "prompt": clean_prompt,
            "size": actual_size,
            "response_format": "b64_json",
            "n": 1,
        }
        optional_map = {
            "quality": actual_quality,
            "style": actual_style,
            "background": actual_background,
            "negative_prompt": actual_negative,
        }
        for key, value in optional_map.items():
            if value:
                payload[key] = value

        last_error = None
        for attempt in range(retries + 1):
            try:
                result_b64, applied_prompt, format_label = await self._generate_with_images_api(
                    payload,
                    timeout_seconds,
                )

                return {
                    "image_b64": result_b64,
                    "model": model,
                    "size": actual_size,
                    "format": format_label,
                    "prompt": applied_prompt or clean_prompt,
                }

            except ImageGenerationError as e:
                last_error = e
                if attempt < retries:
                    # Brief backoff before retry
                    await asyncio.sleep(1.0)
                    continue
                break

        raise ImageGenerationError(f"Image generation failed after {retries + 1} attempts: {str(last_error)}")

    async def edit_concept_image(
        self,
        prompt: str,
        base_image_b64: str,
        model_key: Optional[str] = None,
        size: Optional[str] = None,
        mask_b64: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        quality: Optional[str] = None,
        style: Optional[str] = None,
        background: Optional[str] = None,
        negative_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Apply edits to an existing concept image."""

        if not prompt or not prompt.strip():
            raise ImageGenerationError("Prompt is required and cannot be empty")
        if not base_image_b64 or not base_image_b64.strip():
            raise ImageGenerationError("Base image data is required for edits")

        clean_prompt = prompt.strip()
        model, model_config = self._resolve_model(model_key)
        defaults = self._get_image_defaults(model_config)
        actual_size = self._resolve_size(size, model_config)
        actual_quality = self._resolve_optional_setting("quality", defaults, quality)
        actual_style = self._resolve_optional_setting("style", defaults, style)
        actual_background = self._resolve_optional_setting("background", defaults, background)
        actual_negative = self._resolve_optional_setting("negative_prompt", defaults, negative_prompt)
        timeout_seconds, retries = self._resolve_timeout_and_retries(defaults, timeout, max_retries)

        image_bytes = self._decode_base64_image(base_image_b64, "base image")
        files: Dict[str, Tuple[str, bytes, str]] = {
            "image": ("image.png", image_bytes, "image/png"),
        }
        if mask_b64:
            mask_bytes = self._decode_base64_image(mask_b64, "mask")
            files["mask"] = ("mask.png", mask_bytes, "image/png")

        data: Dict[str, Any] = {
            "model": model,
            "prompt": clean_prompt,
            "size": actual_size,
            "response_format": "b64_json",
            "n": "1",
        }
        optional_map = {
            "quality": actual_quality,
            "style": actual_style,
            "background": actual_background,
            "negative_prompt": actual_negative,
        }
        for key, value in optional_map.items():
            if value:
                data[key] = value

        last_error = None
        for attempt in range(retries + 1):
            try:
                result_b64, applied_prompt = await self._edit_with_images_api(
                    data,
                    files,
                    timeout_seconds,
                )

                return {
                    "image_b64": result_b64,
                    "model": model,
                    "size": actual_size,
                    "format": "base64",
                    "prompt": applied_prompt or clean_prompt,
                }

            except ImageGenerationError as e:
                last_error = e
                if attempt < retries:
                    await asyncio.sleep(1.0)
                    continue
                break

        raise ImageGenerationError(f"Image edit failed after {retries + 1} attempts: {str(last_error)}")
