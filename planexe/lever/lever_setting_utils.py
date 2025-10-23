# Author: gpt-5-codex
# Date: 2025-10-24
# PURPOSE: Provide shared helpers for normalising lever setting payloads between
#          structured LLM responses and legacy dictionary consumers.
# SRP and DRY check: Pass - isolates lever-setting coercion logic so scenario
#                    modules reuse a single, well-tested transformation.

"""Utility helpers for working with lever settings across scenario modules."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Dict


def lever_settings_to_mapping(raw: Any) -> Dict[str, str]:
    """Coerce various lever-setting payload shapes into a name → option map."""

    if raw is None:
        return {}

    if isinstance(raw, Mapping):
        return {str(key): str(value) for key, value in raw.items()}

    if isinstance(raw, Sequence) and not isinstance(raw, (str, bytes, bytearray)):
        normalized: Dict[str, str] = {}
        for item in raw:
            if item is None:
                continue
            if hasattr(item, "model_dump"):
                item_dict = item.model_dump()
            elif isinstance(item, Mapping):
                item_dict = item
            elif isinstance(item, Sequence) and len(item) == 2:
                # Accept tuples/lists like (lever_name, selected_option)
                item_dict = {"lever_name": item[0], "selected_option": item[1]}
            else:
                raise ValueError(f"Unsupported lever_settings entry: {item!r}")

            lever_name = item_dict.get("lever_name") or item_dict.get("name")
            selected_option = item_dict.get("selected_option") or item_dict.get("option")

            if lever_name is None or selected_option is None:
                raise ValueError(
                    f"Lever setting entry missing required keys: {item_dict!r}"
                )

            normalized[str(lever_name)] = str(selected_option)

        return normalized

    raise TypeError(
        "lever_settings payload must be a mapping or a sequence of lever settings"
    )

