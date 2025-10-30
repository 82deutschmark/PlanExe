# Author: gpt-5-codex
# Date: 2025-10-30T02:29:32Z
# PURPOSE: Centralise OpenAI gpt-image-1-mini usage for generation/edit flows, ensuring robust payload defaults and URL fallbacks.
# SRP and DRY check: Pass. Service keeps single responsibility for image orchestration without duplicating HTTP fetch logic elsewhere.

"""
Image generation service for PlanExe concept visualization.

Provides robust image generation using OpenAI's gpt-image-1-mini model with
multiple fallback strategies and comprehensive error handling.
"""
import base64
import json
import logging
import os
import asyncio
from typing import Optional, Dict, Any, Tuple

import httpx

from planexe.utils.planexe_llmconfig import PlanExeLLMConfig

logger = logging.getLogger(__name__)


class ImageGenerationError(Exception):
    """Custom exception for image generation failures."""
    pass


class ImageGenerationService:
    """Service for generating concept images using OpenAI's image generation APIs."""

    DEFAULT_MODEL = "gpt-image-1-mini"
    DEFAULT_ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024"]
    DEFAULT_ALLOWED_FORMATS = ["png", "jpeg", "webp"]
    DEFAULT_TIMEOUT_SECONDS = 60.0
    DEFAULT_MAX_RETRIES = 2
    GENERATE_URL = "https://api.openai.com/v1/images/generations"
    EDIT_URL = "https://api.openai.com/v1/images/edits"

    def __init__(self):
        """Initialize the image generation service."""
        self.llm_config = PlanExeLLMConfig.load()
        self.api_key = os.getenv("OPENAI_API_KEY")

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
        # Never forward 'auto' to the Images API; map to default
        if normalized_requested.lower() == "auto":
            normalized_requested = ""
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
        return headers

    def _normalise_quality(
        self,
        requested_quality: Optional[str],
        defaults: Dict[str, Any],
    ) -> Optional[str]:
        """Resolve the `quality` parameter using configuration defaults and allowed values."""

        allowed = []
        configured = defaults.get("allowed_qualities")
        if isinstance(configured, list):
            allowed = [str(item).strip().lower() for item in configured if str(item).strip()]

        def _clean(value: Optional[str]) -> Optional[str]:
            if value is None:
                return None
            cleaned = str(value).strip().lower()
            if not cleaned:
                return None
            if allowed:
                return cleaned if cleaned in allowed else None
            return cleaned

        resolved_requested = _clean(requested_quality)
        if resolved_requested and resolved_requested != "auto":
            return resolved_requested

        default_quality = defaults.get("quality")
        resolved_default = _clean(default_quality)
        if resolved_default and resolved_default != "auto":
            return resolved_default

        return allowed[0] if allowed else None

    def _normalise_output_format(
        self,
        requested_format: Optional[str],
        defaults: Dict[str, Any],
    ) -> Optional[str]:
        """Resolve output format preferences using configuration defaults."""

        allowed = []
        configured = defaults.get("allowed_output_formats")
        if isinstance(configured, list):
            allowed = [str(item).strip().lower() for item in configured if str(item).strip()]
        if not allowed:
            allowed = self.DEFAULT_ALLOWED_FORMATS

        def _clean(value: Optional[str]) -> Optional[str]:
            if value is None:
                return None
            cleaned = str(value).strip().lower()
            if not cleaned:
                return None
            return cleaned if cleaned in allowed else None

        resolved_requested = _clean(requested_format)
        if resolved_requested:
            return resolved_requested

        default_format = defaults.get("default_output_format")
        resolved_default = _clean(default_format)
        if resolved_default:
            return resolved_default

        return allowed[0]

    def _normalise_output_compression(
        self,
        requested_compression: Optional[int],
        output_format: Optional[str],
        defaults: Dict[str, Any],
    ) -> Optional[int]:
        """Resolve compression hints ensuring compatibility with the selected format."""

        def _clean(value: Optional[int]) -> Optional[int]:
            if value is None:
                return None
            try:
                int_value = int(value)
            except (TypeError, ValueError):  # pragma: no cover - defensive
                return None
            if 0 <= int_value <= 100:
                return int_value
            return None

        allowed_formats = {"jpeg", "webp"}
        if output_format not in allowed_formats:
            return None

        resolved_requested = _clean(requested_compression)
        if resolved_requested is not None:
            return resolved_requested

        default_value = defaults.get("default_output_compression")
        resolved_default = _clean(default_value)
        if resolved_default is not None:
            return resolved_default

        return None

    def _resolve_background(
        self,
        requested_background: Optional[str],
        output_format: Optional[str],
    ) -> Optional[str]:
        """Ensure transparent backgrounds are only applied to supported formats."""

        if requested_background is None:
            return None

        cleaned = str(requested_background).strip()
        if not cleaned:
            return None

        normalised = cleaned.lower()
        if normalised == "transparent" and output_format not in {"png", "webp", None}:
            return None

        return cleaned

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
        """Fetch an image from a URL and convert it to base64 along with a best-effort format label."""

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url)
        except httpx.TimeoutException:
            raise ImageGenerationError("Timeout while fetching image from URL")
        except httpx.RequestError as exc:  # pragma: no cover - network defensive
            raise ImageGenerationError(f"Network error fetching image from URL: {str(exc)}") from exc

        if response.status_code >= 400:
            detail = response.text
            raise ImageGenerationError(
                f"Failed to fetch image from URL ({response.status_code}): {detail}"
            )

        image_bytes = response.content
        if not image_bytes:
            raise ImageGenerationError("Fetched image response contained no data")

        content_type = response.headers.get("content-type", "")
        if "image/" in content_type:
            format_label = content_type.split("/")[-1].split(";")[0].strip() or "binary"
        else:
            format_label = "binary"

        return base64.b64encode(image_bytes).decode("utf-8"), format_label

    async def _generate_with_images_api(
        self,
        payload: Dict[str, Any],
        timeout: float = 60.0,
    ) -> Tuple[str, str, str]:
        """Generate an image using the JSON Images API."""

        headers = self._build_headers()

        logger.info(
            f"Requesting image generation: model={payload.get('model')}, "
            f"size={payload.get('size')}, prompt='{payload.get('prompt', '')[:100]}...'"
        )

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.GENERATE_URL,
                    headers=headers,
                    json=payload,
                )

            if response.status_code >= 400:
                logger.error(
                    f"OpenAI Images API error: status={response.status_code}, "
                    f"model={payload.get('model')}, size={payload.get('size')}, "
                    f"prompt_length={len(payload.get('prompt', ''))}"
                )

                # Try to parse structured error response
                error_detail = response.text
                error_type = "unknown"
                error_message = error_detail

                try:
                    error_json = response.json()
                    if isinstance(error_json, dict):
                        error_obj = error_json.get("error", {})
                        if isinstance(error_obj, dict):
                            error_type = error_obj.get("type", "unknown")
                            error_message = error_obj.get("message", error_detail)
                            error_code = error_obj.get("code")
                            error_param = error_obj.get("param")

                            logger.error(
                                f"OpenAI error details: type={error_type}, code={error_code}, "
                                f"param={error_param}, message={error_message}"
                            )
                except Exception:
                    # If JSON parsing fails, use text response
                    logger.error(f"Raw error response: {error_detail[:500]}")

                raise ImageGenerationError(
                    f"OpenAI API error ({response.status_code}): {error_type} - {error_message}"
                )

            data = response.json()
            images = data.get("data") or []
            if not images:
                logger.error("No image data in OpenAI response")
                raise ImageGenerationError("No image data returned from OpenAI")

            image_entry = images[0] or {}
            image_b64 = image_entry.get("b64_json")

            if image_b64:
                revised_prompt = image_entry.get("revised_prompt") or payload.get("prompt")
                # Base64 responses are PNG by default
                format_hint = "png"
                logger.info(
                    f"Image generation successful: format={format_hint}, "
                    f"prompt='{revised_prompt[:100]}...'"
                )
                return image_b64, revised_prompt, format_hint

            image_url = image_entry.get("url")
            if image_url:
                fetched_b64, format_label = await self._fetch_image_from_url(image_url, timeout=timeout)
                revised_prompt = image_entry.get("revised_prompt") or payload.get("prompt")
                logger.info(
                    f"Image generation successful via URL: format={format_label}, "
                    f"prompt='{revised_prompt[:100]}...'"
                )
                return fetched_b64, revised_prompt, format_label

            logger.error("No base64 or URL in OpenAI image response")
            raise ImageGenerationError("No base64 or URL data returned from OpenAI Images API")

        except httpx.TimeoutException as e:
            logger.error(f"Image generation timeout after {timeout}s")
            raise ImageGenerationError(f"Timeout while generating image (after {timeout}s)") from e
        except ImageGenerationError:
            raise
        except Exception as e:  # pragma: no cover - defensive
            logger.error(f"Unexpected error during image generation: {str(e)}", exc_info=True)
            raise ImageGenerationError(f"Unexpected error during image generation: {str(e)}") from e

    async def _edit_with_images_api(
        self,
        data: Dict[str, Any],
        files: Dict[str, Tuple[str, bytes, str]],
        timeout: float,
    ) -> Tuple[str, str, str]:
        """Submit an edit request to the Images API using multipart form data."""

        headers = self._build_headers(content_type=None)

        logger.info(
            f"Requesting image edit: model={data.get('model')}, "
            f"size={data.get('size')}, prompt='{data.get('prompt', '')[:100]}...'"
        )

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.EDIT_URL,
                    headers=headers,
                    data=data,
                    files=files,
                )

            if response.status_code >= 400:
                logger.error(
                    f"OpenAI Edit API error: status={response.status_code}, "
                    f"model={data.get('model')}, size={data.get('size')}"
                )

                # Try to parse structured error response
                error_detail = response.text
                error_type = "unknown"
                error_message = error_detail

                try:
                    error_json = response.json()
                    if isinstance(error_json, dict):
                        error_obj = error_json.get("error", {})
                        if isinstance(error_obj, dict):
                            error_type = error_obj.get("type", "unknown")
                            error_message = error_obj.get("message", error_detail)
                            error_code = error_obj.get("code")
                            error_param = error_obj.get("param")

                            logger.error(
                                f"OpenAI edit error details: type={error_type}, code={error_code}, "
                                f"param={error_param}, message={error_message}"
                            )
                except Exception:
                    logger.error(f"Raw error response: {error_detail[:500]}")

                raise ImageGenerationError(
                    f"OpenAI edit API error ({response.status_code}): {error_type} - {error_message}"
                )

            response_data = response.json()
            images = response_data.get("data") or []
            if not images:
                logger.error("No image data in OpenAI edit response")
                raise ImageGenerationError("No image data returned from OpenAI edit API")

            image_entry = images[0] or {}
            image_b64 = image_entry.get("b64_json")
            if image_b64:
                revised_prompt = image_entry.get("revised_prompt") or data.get("prompt")
                # Base64 responses are PNG by default
                format_hint = "png"
                logger.info(f"Image edit successful: format={format_hint}")
                return image_b64, revised_prompt, format_hint

            logger.error("No base64 data in OpenAI edit response")
            raise ImageGenerationError("No base64 data returned from OpenAI edit API")

        except httpx.TimeoutException as e:
            logger.error(f"Image edit timeout after {timeout}s")
            raise ImageGenerationError(f"Timeout while editing image (after {timeout}s)") from e
        except ImageGenerationError:
            raise
        except Exception as e:  # pragma: no cover - defensive
            logger.error(f"Unexpected error during image editing: {str(e)}", exc_info=True)
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
        output_format: Optional[str] = None,
        output_compression: Optional[int] = None,
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
        actual_quality = self._normalise_quality(quality, defaults)
        actual_background = self._resolve_optional_setting("background", defaults, background)
        actual_format = self._normalise_output_format(output_format, defaults)
        actual_compression = self._normalise_output_compression(output_compression, actual_format, defaults)
        timeout_seconds, retries = self._resolve_timeout_and_retries(defaults, timeout, max_retries)

        payload: Dict[str, Any] = {
            "model": model,
            "prompt": clean_prompt,
            "size": actual_size,
            "n": 1,
        }
        # Only include fields supported by the Images Generations API.
        # Do NOT send style/negative_prompt/output_format/output_compression as they are unsupported here.
        optional_map = {
            "quality": actual_quality if actual_quality in {"low", "medium", "high"} else None,
            "background": self._resolve_background(actual_background, actual_format),
        }
        for key, value in optional_map.items():
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            payload[key] = value

        print("DEBUG: OpenAI image generation payload ->", payload)

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
                    "format": format_label or "png",
                    "compression": actual_compression,
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
        output_format: Optional[str] = None,
        output_compression: Optional[int] = None,
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
        actual_quality = self._normalise_quality(quality, defaults)
        actual_background = self._resolve_optional_setting("background", defaults, background)
        actual_format = self._normalise_output_format(output_format, defaults)
        actual_compression = self._normalise_output_compression(output_compression, actual_format, defaults)
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
            "n": "1",
        }
        # For edits, allow background (e.g., transparent) alongside the quality hint.
        # Do NOT send style/negative_prompt/output_format/output_compression (not supported by API).
        optional_map = {
            "quality": actual_quality if actual_quality in {"low", "medium", "high"} else None,
            "background": self._resolve_background(actual_background, actual_format),
        }
        for key, value in optional_map.items():
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            data[key] = value

        print("DEBUG: OpenAI image edit payload ->", data)

        last_error = None
        for attempt in range(retries + 1):
            try:
                result_b64, applied_prompt, format_label = await self._edit_with_images_api(
                    data,
                    files,
                    timeout_seconds,
                )

                return {
                    "image_b64": result_b64,
                    "model": model,
                    "size": actual_size,
                    "format": format_label or "png",
                    "compression": actual_compression,
                    "prompt": applied_prompt or clean_prompt,
                }

            except ImageGenerationError as e:
                last_error = e
                if attempt < retries:
                    await asyncio.sleep(1.0)
                    continue
                break

        raise ImageGenerationError(f"Image edit failed after {retries + 1} attempts: {str(last_error)}")
