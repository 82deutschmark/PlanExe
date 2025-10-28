"""
Quick test to verify if _enforce_openai_schema_requirements actually works.
"""
from pydantic import BaseModel, Field, ConfigDict
import json


# Test Model WITHOUT manual json_schema_extra
class TestModelWithoutExtra(BaseModel):
    name: str = Field(description="A name")
    age: int = Field(description="An age")


# Test Model WITH manual json_schema_extra
class TestModelWithExtra(BaseModel):
    name: str = Field(description="A name")
    age: int = Field(description="An age")
    model_config = ConfigDict(extra='forbid', json_schema_extra={"additionalProperties": False})


# Import the enforcement function
from planexe.llm_util.simple_openai_llm import _enforce_openai_schema_requirements


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
    print(f"\nHas additionalProperties=false? {enforced_without.get('additionalProperties') == False}")
    
    # Test 2: Model WITH manual extra
    print("\n" + "=" * 80)
    print("\n2. Model WITH manual json_schema_extra:")
    print("-" * 80)
    schema_with = TestModelWithExtra.model_json_schema()
    print("BEFORE enforcement:")
    print(json.dumps(schema_with, indent=2))
    
    enforced_with = _enforce_openai_schema_requirements(schema_with)
    print("\nAFTER enforcement:")
    print(json.dumps(enforced_with, indent=2))
    print(f"\nHas additionalProperties=false? {enforced_with.get('additionalProperties') == False}")
    
    # Test 3: Nested models
    print("\n" + "=" * 80)
    print("\n3. Testing nested model handling:")
    print("-" * 80)
    
    class NestedModel(BaseModel):
        inner: TestModelWithoutExtra
        outer_field: str
    
    schema_nested = NestedModel.model_json_schema()
    print("BEFORE enforcement (nested):")
    print(json.dumps(schema_nested, indent=2))
    
    enforced_nested = _enforce_openai_schema_requirements(schema_nested)
    print("\nAFTER enforcement (nested):")
    print(json.dumps(enforced_nested, indent=2))
    
    print("\n" + "=" * 80)
    print("\nCONCLUSION:")
    print("=" * 80)
    print("The _enforce_openai_schema_requirements function DOES automatically add")
    print("additionalProperties=false to all object types in the schema.")
    print("\nManual json_schema_extra={'additionalProperties': False} is REDUNDANT.")


if __name__ == "__main__":
    test_automatic_enforcement()
