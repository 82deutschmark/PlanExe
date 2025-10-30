#!/usr/bin/env python
# Author: gpt-5-codex
# Date: 2025-10-30T19:33:27Z
# PURPOSE: Standalone script to generate a concept image using PlanExe's ImageGenerationService.
#          Demonstrates the official GPT-Image-1 payload (size, quality, response format) and
#          writes the decoded PNG/JPEG/WEBP output locally for quick validation.
# SRP and DRY check: Pass. Thin CLI wrapper around ImageGenerationService without duplicating
#                    service logic; reuses existing decode helpers and configuration.

import asyncio
import base64
import os
import sys
from typing import Optional

from planexe_api.services.image_generation_service import ImageGenerationService, ImageGenerationError


def _get_arg(index: int, default: Optional[str] = None) -> Optional[str]:
    """
    Fetch a positional CLI argument if present, otherwise return default.
    Index 0 is the script name, so first real argument is index 1.
    """
    try:
        return sys.argv[index]
    except (IndexError,):
        return default


async def main() -> int:
    """
    Generate an image and save it to a file.

    Usage examples:
      - python scripts/testing/generate_concept_image.py
      - python scripts/testing/generate_concept_image.py "A cyberpunk cat coding" cyberpunk_cat.png 1024x1024
    """
    # Basic inputs with safe defaults
    prompt = _get_arg(1, "A cyberpunk cat coding") or "A cyberpunk cat coding"
    output_path = _get_arg(2, "generated_concept.png") or "generated_concept.png"
    size = _get_arg(3, "1024x1024") or "1024x1024"
    model_key = _get_arg(4, "gpt-image-1-mini") or "gpt-image-1-mini"
    quality = (_get_arg(5, "standard") or "standard").lower()
    if quality not in {"standard", "hd"}:
        print("Warning: quality must be 'standard' or 'hd'. Defaulting to 'standard'.")
        quality = "standard"

    # Sanity check for API key presence
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY is not set in environment. Set it in your .env or system env and retry.")
        return 1

    try:
        service = ImageGenerationService()
        result = await service.generate_concept_image(
            prompt=prompt,
            model_key=model_key,
            size=size,
            quality=quality,
        )

        image_b64 = result.get("image_b64")
        if not image_b64:
            print("Error: No image data returned from service.")
            return 2

        # Decode and write file
        image_bytes = base64.b64decode(image_b64)
        with open(output_path, "wb") as f:
            f.write(image_bytes)

        print("Success: Wrote image ->", os.path.abspath(output_path))
        print("Metadata:")
        print(" - model:", result.get("model"))
        print(" - size:", result.get("size"))
        print(" - format:", result.get("format"))
        print(" - prompt:", result.get("prompt"))
        return 0

    except ImageGenerationError as e:
        print(f"Image generation failed: {e}")
        return 3
    except Exception as e:
        print(f"Unexpected error: {e}")
        return 4


if __name__ == "__main__":
    # Use asyncio.run as entrypoint
    raise SystemExit(asyncio.run(main()))
