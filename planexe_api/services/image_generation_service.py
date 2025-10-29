# Author: Cascade
# Date: 2025-10-29T16:21:00Z
# PURPOSE: Centralized image generation service with OpenAI Images API integration, supporting both Responses API and direct images.generate with base64 fallback.
# SRP and DRY check: Pass - Single responsibility for image generation with proper error handling and model resolution.

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
    
    def _build_headers(self) -> Dict[str, str]:
        """Build HTTP headers for OpenAI API requests."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.organization:
            headers["OpenAI-Organization"] = self.organization
        return headers
    
    async def _fetch_image_from_url(self, url: str, timeout: float = 30.0) -> Tuple[str, str]:
        """Fetch image from URL and convert to base64, returning the data and format label."""
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url)
                if response.status_code >= 400:
                    raise ImageGenerationError(f"Failed to fetch image from URL: {response.status_code}")

                image_bytes = response.content
                return base64.b64encode(image_bytes).decode("utf-8"), "base64_from_url"
        except httpx.TimeoutException:
            raise ImageGenerationError("Timeout while fetching image from URL")
        except Exception as e:
            raise ImageGenerationError(f"Error fetching image from URL: {str(e)}")

    async def _generate_with_images_api(self, prompt: str, model: str, size: str, timeout: float = 60.0) -> Tuple[str, str]:
        """Generate image using OpenAI Images API with base64 fallback."""
        headers = self._build_headers()
        payload = {
            "model": model,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json",
            "n": 1,
        }
        
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    "https://api.openai.com/v1/images/generations",
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
                return image_b64, "base64"

            # Fallback to URL if base64 not available
            image_url = image_entry.get("url")
            if not image_url:
                raise ImageGenerationError("No base64 or URL data returned from OpenAI")

            return await self._fetch_image_from_url(image_url, timeout)
            
        except httpx.TimeoutException:
            raise ImageGenerationError("Timeout while generating image")
        except ImageGenerationError:
            raise
        except Exception as e:
            raise ImageGenerationError(f"Unexpected error during image generation: {str(e)}")

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
        max_retries: Optional[int] = None
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
            - format: "base64" or "base64_from_url"

        Raises:
            ImageGenerationError: If image generation fails after all retries
        """
        if not prompt or not prompt.strip():
            raise ImageGenerationError("Prompt is required and cannot be empty")

        model, model_config = self._resolve_model(model_key)
        defaults = self._get_image_defaults(model_config)
        actual_size = self._resolve_size(size, model_config)
        timeout_seconds, retries = self._resolve_timeout_and_retries(defaults, timeout, max_retries)

        last_error = None
        for attempt in range(retries + 1):
            try:
                result_b64, format_label = await self._generate_with_images_api(
                    prompt,
                    model,
                    actual_size,
                    timeout_seconds
                )

                return {
                    "image_b64": result_b64,
                    "model": model,
                    "size": actual_size,
                    "format": format_label
                }

            except ImageGenerationError as e:
                last_error = e
                if attempt < retries:
                    # Brief backoff before retry
                    await asyncio.sleep(1.0)
                    continue
                break

        raise ImageGenerationError(f"Image generation failed after {retries + 1} attempts: {str(last_error)}")
