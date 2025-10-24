#!/usr/bin/env python
# Author: Mark Barney
# Date: 2025-10-24
# PURPOSE: Uses OpenAI stored prompt from Prompt Library.
# SRP and DRY check: Pass - Single responsibility of prompt templates.
#                    Used only by conversation_service.py intake flow.

import os
from openai import OpenAI

# Initialize client with API key from environment
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Fetch the prompt from OpenAI's Prompt Library
# This retrieves the prompt content at module import time
def _fetch_prompt():
    """Fetch latest prompt content from OpenAI Prompt Library."""
    try:
        prompt_response = client.prompts.retrieve(
            prompt_id="pmpt_68fbc7f583b08197aad356efbad8ffc40058b0cabe36a964"
            # Omitting version parameter fetches the latest version
        )
        # Extract the actual prompt text/instructions from the response
        return prompt_response.instructions or prompt_response.content or ""
    except Exception as e:
        # Fallback to empty string if prompt fetch fails
        print(f"Warning: Failed to fetch prompt from OpenAI: {e}")
        return ""

# Export the prompt content for conversation_service.py to use
INTAKE_CONVERSATION_SYSTEM_PROMPT = _fetch_prompt()