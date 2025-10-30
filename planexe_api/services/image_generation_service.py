# Author: Cascade using `Cascade`
# Date: 2025-10-30T19:53:00Z
# PURPOSE: Centralize OpenAI gpt-image-1-mini usage for generation/edit flows with validated payload defaults, quality/size normalization,
#          retries, and URL fallback handling. Integrates with PlanExeLLMConfig (llm_config.json) to resolve defaults and constraints.
#          This service is used by FastAPI endpoints to provide concept image generation and editing and returns base64 data plus metadata.
# SRP and DRY check: Pass. Single responsibility for image orchestration; avoids duplicate HTTP/OpenAI logic elsewhere and reuses shared config.

"""
Image generation service for PlanExe concept visualization.

Provides robust image generation using OpenAI's gpt-image-1-mini model with
multiple fallback strategies and comprehensive error handling.
"""
import base64
import io
import logging
import os
import asyncio
from typing import Optional, Dict, Any, Tuple, List

import httpx
from openai import OpenAI, APIError, APIStatusError, APITimeoutError

from planexe.utils.planexe_llmconfig import PlanExeLLMConfig

logger = logging.getLogger(__name__)


class ImageGenerationError(Exception):
    """Custom exception for image generation failures."""
    pass


class ImageGenerationService:
    """Service for generating concept images using OpenAI's image generation APIs."""

    DEFAULT_MODEL = "gpt-image-1-mini"
    DEFAULT_ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024"]
    DEFAULT_ALLOWED_FORMATS = ["png", "jpeg", "webp"]
    DEFAULT_TIMEOUT_SECONDS = 60.0
    DEFAULT_MAX_RETRIES = 2

    def __init__(self):
        """Initialize the image generation service."""
        self.llm_config = PlanExeLLMConfig.load()
        self.api_key = os.getenv("OPENAI_API_KEY")

        if not self.api_key:
            raise ImageGenerationError("OPENAI_API_KEY not configured")

        # Instantiate an OpenAI client so platform headers (project/org) are handled centrally.
        self.client = OpenAI(api_key=self.api_key)

    def _entry_get(self, entry: Any, key: str) -> Any:
        """Safely get a field from an SDK object or dict.
        The Images SDK may return entries with attribute access (e.g., entry.b64_json)
        rather than a dict. This helper supports both forms.
        """
        if entry is None:
            return None
        if isinstance(entry, dict):
            return entry.get(key)
        return getattr(entry, key, None)

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
        default_size = defaults.get("default_size") or self.DEFAULT_ALLOWED_SIZES[0]

        normalized_requested = (requested_size or "").strip()
        # Never forward 'auto' to the Images API; map to default
        if normalized_requested.lower() == "auto":
            normalized_requested = ""
        if normalized_requested and normalized_requested in allowed_sizes:
            return normalized_requested

        if default_size in allowed_sizes:
            return default_size

        return allowed_sizes[0]
    
    def _normalise_quality(
        self,
        requested_quality: Optional[str],
        defaults: Dict[str, Any],
    ) -> Optional[str]:
        """Resolve the `quality` parameter using configuration defaults and allowed values."""

        allowed: List[str] = []
        configured = defaults.get("allowed_qualities")
        if isinstance(configured, list):
            allowed = [str(item).strip().lower() for item in configured if str(item).strip()]
        # If not configured, fall back to the current documented OpenAI set
        if not allowed:
            allowed = ["low", "medium", "high", "auto"]

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
        if resolved_requested:
            return resolved_requested

        default_quality = defaults.get("quality")
        resolved_default = _clean(default_quality)
        if resolved_default:
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
        """Generate an image using the OpenAI SDK."""

        logger.info(
            f"Requesting image generation: model={payload.get('model')}, "
            f"size={payload.get('size')}, prompt='{payload.get('prompt', '')[:100]}...'"
        )

        client = self.client.with_options(timeout=timeout)

        try:
            result = await asyncio.to_thread(client.images.generate, **payload)
        except APITimeoutError as exc:
            logger.error(f"Image generation timeout after {timeout}s")
            raise ImageGenerationError(f"Timeout while generating image (after {timeout}s)") from exc
        except APIStatusError as exc:
            logger.error(
                "OpenAI Images API error",
                extra={
                    "status": getattr(exc, "status_code", None),
                    "model": payload.get("model"),
                    "size": payload.get("size"),
                },
            )
            response = getattr(exc, "response", None)
            error_type = "unknown"
            error_message = str(exc)
            if response is not None:
                try:
                    error_json = response.json()
                    if isinstance(error_json, dict):
                        error_obj = error_json.get("error", {})
                        if isinstance(error_obj, dict):
                            error_type = error_obj.get("type", error_type)
                            error_message = error_obj.get("message", error_message)
                except Exception:  # pragma: no cover - defensive parse guard
                    logger.error("Failed to parse error payload from OpenAI response")
            raise ImageGenerationError(
                f"OpenAI API error ({getattr(exc, 'status_code', 'unknown')}): {error_type} - {error_message}"
            ) from exc
        except APIError as exc:  # pragma: no cover - defensive catch-all from SDK
            logger.error(f"OpenAI API error during image generation: {exc}")
            raise ImageGenerationError(str(exc)) from exc
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"Unexpected error during image generation: {exc}", exc_info=True)
            raise ImageGenerationError(f"Unexpected error during image generation: {exc}") from exc

        images = getattr(result, "data", None) or []
        if not images:
            logger.error("No image data in OpenAI response")
            raise ImageGenerationError("No image data returned from OpenAI")

        image_entry = images[0] or {}
        image_b64 = self._entry_get(image_entry, "b64_json")

        if image_b64:
            revised_prompt = self._entry_get(image_entry, "revised_prompt") or payload.get("prompt")
            # Base64 responses are PNG by default
            format_hint = "png"
            logger.info(
                f"Image generation successful: format={format_hint}, "
                f"prompt='{revised_prompt[:100]}...'"
            )
            return image_b64, revised_prompt, format_hint

        image_url = self._entry_get(image_entry, "url")
        if image_url:
            fetched_b64, format_label = await self._fetch_image_from_url(image_url, timeout=timeout)
            revised_prompt = self._entry_get(image_entry, "revised_prompt") or payload.get("prompt")
            logger.info(
                f"Image generation successful via URL: format={format_label}, "
                f"prompt='{revised_prompt[:100]}...'"
            )
            return fetched_b64, revised_prompt, format_label

        logger.error("No base64 or URL in OpenAI image response")
        raise ImageGenerationError("No base64 or URL data returned from OpenAI Images API")

    async def _edit_with_images_api(
        self,
        data: Dict[str, Any],
        files: Dict[str, Tuple[str, bytes, str]],
        timeout: float,
    ) -> Tuple[str, str, str]:
        """Submit an edit request to the Images API using the OpenAI SDK."""

        logger.info(
            f"Requesting image edit: model={data.get('model')}, "
            f"size={data.get('size')}, prompt='{data.get('prompt', '')[:100]}...'"
        )

        client = self.client.with_options(timeout=timeout)

        image_name, image_bytes, _ = files["image"]
        image_stream = io.BytesIO(image_bytes)
        image_stream.name = image_name

        mask_stream = None
        if "mask" in files:
            mask_name, mask_bytes, _ = files["mask"]
            mask_stream = io.BytesIO(mask_bytes)
            mask_stream.name = mask_name

        sdk_kwargs: Dict[str, Any] = {
            "model": data.get("model"),
            "prompt": data.get("prompt"),
            "size": data.get("size"),
            "n": int(data.get("n", 1)),
            "image": image_stream,
        }

        # Optional fields supported by the Images edit API
        for optional_key in ("quality", "style", "background"):
            if optional_key in data and data[optional_key] is not None:
                sdk_kwargs[optional_key] = data[optional_key]

        if mask_stream is not None:
            sdk_kwargs["mask"] = mask_stream

        try:
            result = await asyncio.to_thread(client.images.edit, **sdk_kwargs)
        except APITimeoutError as exc:
            logger.error(f"Image edit timeout after {timeout}s")
            raise ImageGenerationError(f"Timeout while editing image (after {timeout}s)") from exc
        except APIStatusError as exc:
            logger.error(
                "OpenAI edit API error",
                extra={
                    "status": getattr(exc, "status_code", None),
                    "model": data.get("model"),
                    "size": data.get("size"),
                },
            )
            response = getattr(exc, "response", None)
            error_type = "unknown"
            error_message = str(exc)
            if response is not None:
                try:
                    error_json = response.json()
                    if isinstance(error_json, dict):
                        error_obj = error_json.get("error", {})
                        if isinstance(error_obj, dict):
                            error_type = error_obj.get("type", error_type)
                            error_message = error_obj.get("message", error_message)
                except Exception:  # pragma: no cover - defensive parse guard
                    logger.error("Failed to parse error payload from OpenAI edit response")
            raise ImageGenerationError(
                f"OpenAI edit API error ({getattr(exc, 'status_code', 'unknown')}): {error_type} - {error_message}"
            ) from exc
        except APIError as exc:  # pragma: no cover - defensive catch-all from SDK
            logger.error(f"OpenAI API error during image editing: {exc}")
            raise ImageGenerationError(str(exc)) from exc
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"Unexpected error during image editing: {exc}", exc_info=True)
            raise ImageGenerationError(f"Unexpected error during image editing: {exc}") from exc

        images = getattr(result, "data", None) or []
        if not images:
            logger.error("No image data in OpenAI edit response")
            raise ImageGenerationError("No image data returned from OpenAI edit API")

        image_entry = images[0] or {}
        image_b64 = self._entry_get(image_entry, "b64_json")
        if image_b64:
            revised_prompt = self._entry_get(image_entry, "revised_prompt") or data.get("prompt")
            # Base64 responses are PNG by default
            format_hint = "png"
            logger.info(f"Image edit successful: format={format_hint}")
            return image_b64, revised_prompt, format_hint

        logger.error("No base64 data in OpenAI edit response")
        raise ImageGenerationError("No base64 data returned from OpenAI edit API")

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
            # Pass through validated quality including low/medium/high/auto
            "quality": actual_quality,
            "background": self._resolve_background(actual_background, actual_format),
        }
        for key, value in optional_map.items():
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
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
            "n": 1,
        }
        # For edits, allow background (e.g., transparent) alongside the quality hint.
        # Do NOT send style/negative_prompt/output_format/output_compression (not supported by API).
        optional_map = {
            # Pass through validated quality including low/medium/high/auto
            "quality": actual_quality,
            "background": self._resolve_background(actual_background, actual_format),
        }
        for key, value in optional_map.items():
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            data[key] = value

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
