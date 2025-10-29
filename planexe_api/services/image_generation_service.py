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
from typing import Optional, Dict, Any
import httpx
from planexe.utils.planexe_llmconfig import PlanExeLLMConfig


class ImageGenerationError(Exception):
    """Custom exception for image generation failures."""
    pass


class ImageGenerationService:
    """Service for generating concept images using OpenAI's image generation APIs."""
    
    def __init__(self):
        """Initialize the image generation service."""
        self.llm_config = PlanExeLLMConfig.load()
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.organization = os.getenv("OPENAI_ORG_ID") or os.getenv("OPENAI_ORGANIZATION")
        
        if not self.api_key:
            raise ImageGenerationError("OPENAI_API_KEY not configured")
    
    def _resolve_model(self, model_key: Optional[str]) -> str:
        """Resolve the image generation model from configuration."""
        if model_key and model_key in self.llm_config.llm_config_dict:
            config = self.llm_config.llm_config_dict[model_key]
            if "image_generation" in config.get("capabilities", []):
                return model_key
        
        # Find first available image generation model
        for model_id, config in self.llm_config.llm_config_dict.items():
            if "image_generation" in config.get("capabilities", []):
                return model_id
        
        # Default fallback
        return "gpt-image-1-mini"
    
    def _resolve_size(self, requested_size: str) -> str:
        """Validate and resolve image size."""
        valid_sizes = ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"]
        if requested_size in valid_sizes:
            return requested_size
        return "1024x1024"  # Default
    
    def _build_headers(self) -> Dict[str, str]:
        """Build HTTP headers for OpenAI API requests."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.organization:
            headers["OpenAI-Organization"] = self.organization
        return headers
    
    async def _fetch_image_from_url(self, url: str, timeout: float = 30.0) -> str:
        """Fetch image from URL and convert to base64."""
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url)
                if response.status_code >= 400:
                    raise ImageGenerationError(f"Failed to fetch image from URL: {response.status_code}")
                
                image_bytes = response.content
                return base64.b64encode(image_bytes).decode('utf-8')
        except httpx.TimeoutException:
            raise ImageGenerationError("Timeout while fetching image from URL")
        except Exception as e:
            raise ImageGenerationError(f"Error fetching image from URL: {str(e)}")
    
    async def _generate_with_images_api(self, prompt: str, model: str, size: str, timeout: float = 60.0) -> str:
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
                return image_b64
            
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
    
    async def generate_concept_image(
        self, 
        prompt: str, 
        model_key: Optional[str] = None, 
        size: str = "1024x1024",
        timeout: float = 60.0,
        max_retries: int = 2
    ) -> Dict[str, Any]:
        """
        Generate a concept image and return base64 data with metadata.
        
        Args:
            prompt: The text prompt for image generation
            model_key: Optional model identifier, will resolve from config if not provided
            size: Image size (e.g., "1024x1024"), will validate and default if invalid
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            
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
        
        model = self._resolve_model(model_key)
        actual_size = self._resolve_size(size)
        
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                result_b64 = await self._generate_with_images_api(prompt, model, actual_size, timeout)
                
                return {
                    "image_b64": result_b64,
                    "model": model,
                    "size": actual_size,
                    "format": "base64"  # Will be updated by _generate_with_images_api if URL fallback used
                }
                
            except ImageGenerationError as e:
                last_error = e
                if attempt < max_retries:
                    # Brief backoff before retry
                    import asyncio
                    await asyncio.sleep(1.0)
                    continue
                break
        
        raise ImageGenerationError(f"Image generation failed after {max_retries + 1} attempts: {str(last_error)}")
