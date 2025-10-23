# Author: gpt-5-codex
# Date: 2025-10-23
# PURPOSE: Validate OpenAI schema normalization helpers, ensuring message coercion and schema formatting remain compliant with Responses API expectations.
# SRP and DRY check: Pass - focuses solely on unit coverage for normalization utilities without duplicating test logic found elsewhere.
import os
import unittest

from planexe.llm_util.simple_openai_llm import (
    SimpleOpenAILLM,
    _normalize_content,
)
from planexe.llm_util.schema_registry import get_schema_entry


class BuildTextFormatTests(unittest.TestCase):
    def test_inlines_defs_and_sets_required_properties(self) -> None:
        previous = os.environ.get("PLANEXE_CLOUD_MODE")
        os.environ["PLANEXE_CLOUD_MODE"] = "1"
        try:
            from planexe.lever.candidate_scenarios import ScenarioAnalysisResult

            entry = get_schema_entry(ScenarioAnalysisResult)
            text_format = SimpleOpenAILLM._build_text_format(entry)
        finally:
            if previous is None:
                os.environ.pop("PLANEXE_CLOUD_MODE", None)
            else:
                os.environ["PLANEXE_CLOUD_MODE"] = previous

        schema = text_format.get("schema", {})
        self.assertNotIn("$defs", schema)

        def assert_no_refs(node):
            if isinstance(node, dict):
                self.assertNotIn("$ref", node)
                for value in node.values():
                    assert_no_refs(value)
            elif isinstance(node, list):
                for value in node:
                    assert_no_refs(value)

        assert_no_refs(schema)

        scenarios_schema = schema.get("properties", {}).get("scenarios", {})
        items_schema = scenarios_schema.get("items", {})
        properties = items_schema.get("properties", {})
        required = items_schema.get("required", [])
        self.assertTrue(properties)
        self.assertEqual(set(required), set(properties.keys()))


class NormalizeContentTests(unittest.TestCase):
    def test_string_becomes_input_text_segment(self) -> None:
        self.assertEqual(
            _normalize_content("hello world"),
            [{"type": "input_text", "text": "hello world"}],
        )

    def test_text_alias_dict_converted_to_input_text(self) -> None:
        result = _normalize_content([{"type": "text", "text": "payload"}])
        self.assertEqual(result, [{"type": "input_text", "text": "payload"}])

    def test_missing_text_field_uses_content_value(self) -> None:
        result = _normalize_content([{"type": "text", "content": "from content"}])
        self.assertEqual(result, [{"type": "input_text", "text": "from content"}])

    def test_existing_input_text_segment_preserved(self) -> None:
        result = _normalize_content([{"type": "input_text", "text": "ok"}])
        self.assertEqual(result, [{"type": "input_text", "text": "ok"}])

    def test_non_text_supported_types_pass_through(self) -> None:
        payload = [{"type": "input_image", "image_url": "https://example.com"}]
        self.assertEqual(_normalize_content(payload), payload)


class NormalizeMessagesTests(unittest.TestCase):
    def test_text_type_segments_are_coerced(self) -> None:
        messages = [{"role": "user", "content": [{"type": "text", "text": "payload"}]}]
        normalized = SimpleOpenAILLM.normalize_input_messages(messages)
        self.assertEqual(
            normalized,
            [{"role": "user", "content": [{"type": "input_text", "text": "payload"}]}],
        )

    def test_string_content_converted_to_input_text(self) -> None:
        normalized = SimpleOpenAILLM.normalize_input_messages(
            [{"role": "system", "content": "System guidance"}]
        )
        self.assertEqual(
            normalized,
            [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": "System guidance"}],
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
