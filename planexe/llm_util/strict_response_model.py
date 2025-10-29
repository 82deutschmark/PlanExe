# Author: gpt-5-codex
# Date: 2025-10-28T00:00:00Z
# PURPOSE: Provide a reusable Pydantic base class for structured Responses API schemas that enforces runtime strictness and aligns generated JSON schemas with OpenAI requirements.
# SRP and DRY check: Pass. Centralizes schema enforcement logic so individual tasks no longer duplicate configuration or drift from the runtime policy.
"""Strict Pydantic base class for OpenAI Responses API structured outputs."""

from __future__ import annotations

from typing import Any, Dict

from pydantic import BaseModel, ConfigDict

from planexe.llm_util.simple_openai_llm import _enforce_openai_schema_requirements


class StrictResponseModel(BaseModel):
    """Base class that enforces OpenAI schema rules while tolerating runtime extras."""

    # Allow unexpected keys so Responses API drift does not crash tasks.
    # We strip extras after validation to keep persisted payloads deterministic.
    model_config = ConfigDict(extra="allow")

    def model_post_init(self, __context: Any) -> None:  # type: ignore[override]
        """Drop any runtime extras after validation so downstream dumps stay stable."""
        model_extra = getattr(self, "model_extra", None)
        if model_extra:
            object.__setattr__(self, "model_extra", {})
        super().model_post_init(__context)

    @classmethod
    def model_json_schema(cls, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        """Generate an OpenAI-compliant JSON schema for structured outputs."""
        schema = super().model_json_schema(*args, **kwargs)
        # Apply OpenAI enforcement, then ensure additionalProperties: false for strict Responses API compatibility
        enforced = _enforce_openai_schema_requirements(schema)
        if isinstance(enforced, dict):
            # Recursively force additionalProperties: false for all object types
            def _set_additional_properties_false(node: Any) -> Any:
                if isinstance(node, dict):
                    updated = dict(node)
                    if updated.get("type") == "object":
                        updated["additionalProperties"] = False
                    for key, value in list(updated.items()):
                        if key == "additionalProperties":
                            continue
                        updated[key] = _set_additional_properties_false(value)
                    return updated
                if isinstance(node, list):
                    return [_set_additional_properties_false(item) for item in node]
                return node
            return _set_additional_properties_false(enforced)
        return enforced
