"""
Author: ChatGPT gpt-5-codex
Date: 2025-10-18
PURPOSE: Regression coverage for the schema registry that feeds Responses API structured calls.
SRP and DRY check: Pass - isolates registry behavior without touching Luigi pipeline code.
"""

from __future__ import annotations

from pydantic import BaseModel

from planexe.llm_util.schema_registry import get_all_registered_schemas, get_schema_entry, sanitize_schema_label


class _ExampleModel(BaseModel):
    field_a: str
    field_b: int


def test_register_schema_is_idempotent() -> None:
    entry_first = get_schema_entry(_ExampleModel)
    entry_second = get_schema_entry(_ExampleModel)

    assert entry_first is entry_second
    assert entry_first.schema["properties"]["field_a"]["type"] == "string"
    assert entry_first.schema["properties"]["field_b"]["type"] == "integer"


def test_registry_export_includes_registered_model() -> None:
    _ = get_schema_entry(_ExampleModel)
    registry = get_all_registered_schemas()

    key = f"{_ExampleModel.__module__}.{_ExampleModel.__name__}"
    assert key in registry
    assert registry[key].qualified_name == key
    # sanitized_name now uses just the class name, not the full module path
    assert registry[key].sanitized_name == "_ExampleModel"


def test_sanitize_schema_label_basic_functionality() -> None:
    """Test that schema labels are sanitized according to OpenAI API requirements."""
    # Test case 1: Name with dots (invalid chars) should be replaced with underscores
    name_with_dots = "planexe.lever.MyModel"
    assert sanitize_schema_label(name_with_dots, "fallback") == "planexe_lever_MyModel"

    # Test case 2: Clean name should pass through
    clean_name = "BatchCharacterizationResult"
    assert sanitize_schema_label(clean_name, "fallback") == "BatchCharacterizationResult"

    # Test case 3: Fallback when raw_name is None
    assert sanitize_schema_label(None, "MyFallback") == "MyFallback"

    # Test case 4: Empty string should use fallback
    assert sanitize_schema_label("", "MyFallback") == "MyFallback"

    # Test case 5: Name with various invalid chars
    name_with_special = "My@Model#Name!"
    assert sanitize_schema_label(name_with_special, "fallback") == "My_Model_Name"


def test_schema_registry_uses_class_name_not_full_path() -> None:
    """Verify that sanitized_name uses just the class name to avoid hitting 64-char OpenAI limit."""
    from planexe.lever.enrich_potential_levers import BatchCharacterizationResult

    entry = get_schema_entry(BatchCharacterizationResult)

    # qualified_name should still be the full path (for registry lookups)
    assert entry.qualified_name == "planexe.lever.enrich_potential_levers.BatchCharacterizationResult"

    # sanitized_name should be just the class name (for OpenAI API calls)
    assert entry.sanitized_name == "BatchCharacterizationResult"
    assert len(entry.sanitized_name) < 64  # Well under the limit
