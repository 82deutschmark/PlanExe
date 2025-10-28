#!/usr/bin/env python3

from planexe.lever.select_scenario import ScenarioSelectionResult
import json

# Get the JSON schema
schema = ScenarioSelectionResult.model_json_schema()

# Check plan_characteristics specifically
plan_char_schema = schema['properties']['plan_characteristics']
print("plan_characteristics schema:")
print(json.dumps(plan_char_schema, indent=2))

# Check if additionalProperties is set correctly
if 'additionalProperties' in plan_char_schema:
    print(f"\nadditionalProperties: {plan_char_schema['additionalProperties']}")
else:
    print("\nadditionalProperties: NOT SET (this is the problem!)")
