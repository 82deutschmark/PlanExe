#!/usr/bin/env python
# Author: Cascade using `whatever model the user has selected`
# Date: 2025-10-24
# PURPOSE: Uses OpenAI stored prompt from Prompt Library.
# SRP and DRY check: Pass - Single responsibility of prompt templates.
#                    Used only by conversation_service.py intake flow.

import os
from openai import OpenAI

# Initialize client with API key from environment (lazy initialization)
_client = None

def _get_client():
    """Get or create OpenAI client with lazy initialization."""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("Warning: OPENAI_API_KEY not available, prompt fetching will be skipped")
            return None
        _client = OpenAI(api_key=api_key)
    return _client

# Fetch the prompt from OpenAI's Prompt Library (lazy loading)
_prompt_content = None

def _fetch_prompt():
    """Fetch latest prompt content from OpenAI Prompt Library."""
    global _prompt_content
    if _prompt_content is not None:
        return _prompt_content

    try:
        client = _get_client()
        if client is None:
            # Fallback if no API key available
            _prompt_content = ""
            return _prompt_content

        prompt_response = client.prompts.retrieve(
            prompt_id="pmpt_68fbc7f583b08197aad356efbad8ffc40058b0cabe36a964"
            # Omitting version parameter fetches the latest version
        )
        # Extract the actual prompt text/instructions from the response
        _prompt_content = prompt_response.instructions or prompt_response.content or ""
        return _prompt_content
    except Exception as e:
        # Fallback to empty string if prompt fetch fails
        print(f"Warning: Failed to fetch prompt from OpenAI: {e}")
        _prompt_content = ""
        return _prompt_content

# Export the prompt content for conversation_service.py to use (lazy loading)
class _LazyPrompt:
    """Lazy loading wrapper for the prompt content."""

    def __init__(self):
        self._content = None
        self._loaded = False

    def _load(self):
        """Load the prompt content when first accessed."""
        if self._loaded:
            return

        try:
            client = _get_client()
            if client is None:
                # Fallback if no API key available
                self._content = ""
            else:
                prompt_response = client.prompts.retrieve(
                    prompt_id="pmpt_68fbc7f583b08197aad356efbad8ffc40058b0cabe36a964"
                    # Omitting version parameter fetches the latest version
                )
                # Extract the actual prompt text/instructions from the response
                self._content = prompt_response.instructions or prompt_response.content or ""
        except Exception as e:
            # Fallback to empty string if prompt fetch fails
            print(f"Warning: Failed to fetch prompt from OpenAI: {e}")
            self._content = ""

        self._loaded = True

    def __str__(self):
        self._load()
        return self._content

    def __bool__(self):
        self._load()
        return bool(self._content)

# Create lazy prompt instance
INTAKE_CONVERSATION_SYSTEM_PROMPT = _LazyPrompt()