# Author: gpt-5-codex
# Date: 2025-10-28T00:00:00Z
# PURPOSE: Provide a reusable Pydantic base class for structured Responses API schemas that enforces runtime strictness and aligns generated JSON schemas with OpenAI requirements.
# SRP and DRY check: Pass. Centralizes schema enforcement logic so individual tasks no longer duplicate configuration or drift from the runtime policy.
"""Strict Pydantic base class for OpenAI Responses API structured outputs."""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Dict, Iterable, Optional, Sequence
from typing import get_args, get_origin

from pydantic import BaseModel, ConfigDict, ValidationError
from pydantic_core import PydanticUndefined

from planexe.llm_util.schema_registry import get_schema_policy
from planexe.llm_util.simple_openai_llm import _enforce_openai_schema_requirements

logger = logging.getLogger(__name__)


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
        enforced = _enforce_openai_schema_requirements(schema, model=cls)
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

    @classmethod
    def _coerce_mapping(cls, obj: Any) -> Optional[Dict[str, Any]]:
        if isinstance(obj, dict):
            return dict(obj)
        if isinstance(obj, BaseModel):
            return obj.model_dump()
        return None

    @staticmethod
    def _clone(value: Any) -> Any:
        if isinstance(value, list):
            return list(value)
        if isinstance(value, dict):
            return dict(value)
        if isinstance(value, set):
            return set(value)
        return value

    @classmethod
    def _unwrap_optional(cls, annotation: Any) -> Any:
        origin = get_origin(annotation)
        if origin is None:
            return annotation
        from typing import Union as TypingUnion  # local import to avoid circular refs

        if origin is TypingUnion:
            args = [arg for arg in get_args(annotation) if arg is not type(None)]
            if args:
                return cls._unwrap_optional(args[0])
            return type(None)
        return annotation

    @classmethod
    def _derive_default(cls, field_name: str) -> Any:
        field = cls.model_fields.get(field_name)
        if field is None:
            return None

        if field.default is not PydanticUndefined:
            default = field.default
            if callable(default):
                try:
                    return default()
                except TypeError:
                    return default
            return default

        if field.default_factory is not None:
            try:
                return field.default_factory()
            except TypeError:
                return None

        annotation = cls._unwrap_optional(field.annotation)
        try:
            if isinstance(annotation, type) and issubclass(annotation, Enum):
                members = list(annotation)
                if members:
                    return members[0]
        except TypeError:
            pass

        origin = get_origin(annotation)
        if origin in (list, set, tuple):
            return []
        if origin in (dict,):
            return {}

        if annotation is str:
            return "TBD"
        if annotation is int:
            return 0
        if annotation is float:
            return 0.0
        if annotation is bool:
            return False

        return None

    @classmethod
    def _inject_defaults(
        cls,
        data: Dict[str, Any],
        *,
        field_names: Optional[Iterable[str]] = None,
    ) -> Dict[str, Any]:
        policy = get_schema_policy(cls)
        hydrated = dict(data)
        targets = list(field_names) if field_names is not None else list(cls.model_fields.keys())

        for name in targets:
            if name in hydrated:
                continue

            if name in policy.default_overrides:
                hydrated[name] = cls._clone(policy.default_overrides[name])
                continue

            derived = cls._derive_default(name)
            if derived is not None:
                hydrated[name] = cls._clone(derived)

        return hydrated

    @classmethod
    def _collect_missing(cls, exc: ValidationError) -> Sequence[str]:
        missing: list[str] = []
        for error in exc.errors():
            if error.get("type") != "missing":
                continue
            location = error.get("loc")
            if not location:
                continue
            field_name = location[0]
            if isinstance(field_name, str) and field_name not in missing:
                missing.append(field_name)
        return missing

    @classmethod
    def model_validate(cls, obj: Any, *args: Any, **kwargs: Any) -> "StrictResponseModel":
        policy = get_schema_policy(cls)
        mapping = cls._coerce_mapping(obj)
        prepared: Any
        if mapping is not None and policy.default_overrides:
            prepared = cls._inject_defaults(mapping, field_names=policy.default_overrides.keys())
        else:
            prepared = mapping if mapping is not None else obj

        try:
            return super().model_validate(prepared, *args, **kwargs)
        except ValidationError as exc:
            if not policy.allow_missing:
                raise

            missing_fields = cls._collect_missing(exc)
            if not missing_fields or mapping is None:
                raise

            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(
                    "Missing fields %s detected on %s; applying lenient defaults.",
                    missing_fields,
                    cls.__name__,
                )

            patched = cls._inject_defaults(mapping, field_names=missing_fields)
            return super().model_validate(patched, *args, **kwargs)
