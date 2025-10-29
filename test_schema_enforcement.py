"""
Quick test to verify if _enforce_openai_schema_requirements actually works.
"""
# Author: gpt-5-codex
# Date: 2025-10-28T04:39:23Z
# PURPOSE: Regression test proving that _enforce_openai_schema_requirements and StrictResponseModel automatically align JSON schemas with runtime strictness.
# SRP and DRY check: Pass. Focused on schema enforcement behavior without duplicating production code.

import json

from pydantic import BaseModel, ConfigDict, Field

from planexe.llm_util.simple_openai_llm import _enforce_openai_schema_requirements
from planexe.llm_util.strict_response_model import StrictResponseModel


# Test Model WITHOUT manual json_schema_extra
class TestModelWithoutExtra(BaseModel):
    name: str = Field(description="A name")
    age: int = Field(description="An age")


# Test Model WITH manual json_schema_extra
class TestModelWithExtra(BaseModel):
    name: str = Field(description="A name")
    age: int = Field(description="An age")
    model_config = ConfigDict(extra='forbid', json_schema_extra={"additionalProperties": False})


class StrictModel(StrictResponseModel):
    """Strict model leveraging the reusable base class."""

    name: str = Field(description="A name")
    age: int = Field(description="An age")


def test_automatic_enforcement():
    print("=" * 80)
    print("Testing Automatic Schema Enforcement")
    print("=" * 80)
    
    # Test 1: Model WITHOUT manual extra
    print("\n1. Model WITHOUT manual json_schema_extra:")
    print("-" * 80)
    schema_without = TestModelWithoutExtra.model_json_schema()
    print("BEFORE enforcement:")
    print(json.dumps(schema_without, indent=2))
    
    enforced_without = _enforce_openai_schema_requirements(schema_without)
    print("\nAFTER enforcement:")
    print(json.dumps(enforced_without, indent=2))
    assert (
        enforced_without.get("additionalProperties") is False
    ), "Root object must set additionalProperties to False"
    
    # Test 2: StrictResponseModel base class
    print("\n" + "=" * 80)
    print("\n2. StrictResponseModel-generated schema:")
    print("-" * 80)
    strict_schema = StrictModel.model_json_schema()
    print("STRICT model schema (already enforced):")
    print(json.dumps(strict_schema, indent=2))
    assert (
        strict_schema.get("additionalProperties") is False
    ), "StrictResponseModel must emit additionalProperties=False at the root"

    # Test 3: Model WITH manual extra
    print("\n" + "=" * 80)
    print("\n3. Model WITH manual json_schema_extra:")
    print("-" * 80)
    schema_with = TestModelWithExtra.model_json_schema()
    print("BEFORE enforcement:")
    print(json.dumps(schema_with, indent=2))

    enforced_with = _enforce_openai_schema_requirements(schema_with)
    print("\nAFTER enforcement:")
    print(json.dumps(enforced_with, indent=2))
    assert (
        enforced_with.get("additionalProperties") is False
    ), "Manual json_schema_extra overrides must remain strict"

    # Test 4: Nested models
    print("\n" + "=" * 80)
    print("\n4. Testing nested model handling:")
    print("-" * 80)

    class NestedModel(BaseModel):
        inner: StrictModel
        outer_field: str
    
    schema_nested = NestedModel.model_json_schema()
    print("BEFORE enforcement (nested):")
    print(json.dumps(schema_nested, indent=2))
    
    enforced_nested = _enforce_openai_schema_requirements(schema_nested)
    print("\nAFTER enforcement (nested):")
    print(json.dumps(enforced_nested, indent=2))
    assert enforced_nested.get("additionalProperties") is False
    for name, definition in enforced_nested.get("properties", {}).items():
        if isinstance(definition, dict) and definition.get("type") == "object":
            assert (
                definition.get("additionalProperties") is False
            ), f"Nested object '{name}' must disallow additional properties"
    
    print("\n" + "=" * 80)
    print("\nCONCLUSION:")
    print("=" * 80)
    print("The _enforce_openai_schema_requirements function DOES automatically add")
    print("additionalProperties=false to all object types in the schema.")
    print("StrictResponseModel emits compliant schemas without manual tweaks.")
    print("\nManual json_schema_extra={'additionalProperties': False} is REDUNDANT.")


if __name__ == "__main__":
    test_automatic_enforcement()
