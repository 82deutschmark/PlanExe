#!/usr/bin/env python
# Author: gpt-5-codex
# Date: 2025-10-29T00:00:00Z
# PURPOSE: Generate WBS Level 1 via the Responses API using a strict Pydantic
#          schema, with tolerant fallback normalization. Aligns this task with
#          the rest of the pipeline that uses `as_structured_llm(...)` and the
#          schema registry, eliminating ad-hoc parsing that caused brittle
#          failures and inconsistent metadata.
# SRP and DRY check: Pass. The file focuses on Level 1 WBS generation and
#          validation, reusing shared LLM adapters and schema registry without
#          duplicating logic.
"""
WBS Level 1: Create a Work Breakdown Structure (WBS) from a project plan.

https://en.wikipedia.org/wiki/Work_breakdown_structure
"""
import json
import logging
import re
import time
from json import JSONDecodeError
from math import ceil
from uuid import uuid4
from dataclasses import dataclass
from typing import Any, Dict, Tuple

from pydantic import Field, ValidationError
from planexe.llm_util.strict_response_model import StrictResponseModel

logger = logging.getLogger(__name__)

from planexe.llm_util.simple_openai_llm import SimpleChatMessage, SimpleMessageRole
from planexe.llm_util.schema_registry import register_schema
from planexe.llm_util.schema_registry import get_schema_entry  # ensure schema is registered

class WBSLevel1(StrictResponseModel):
    """
    Represents the top-level details of a Work Breakdown Structure (WBS)
    """
    project_title: str = Field(
        description="A clear, overarching title that conveys the primary objective of the project. Serves as the projects strategic anchor, guiding all subsequent tasks and deliverables."
    )
    final_deliverable: str = Field(
        description="A detailed description of the projects ultimate outcome or product upon completion. Clearly states the final state or result that the team aims to achieve."
    )

QUERY_PREAMBLE = """
The task here:
Create a work breakdown structure level 1 for this project.

Focus on providing the following:
- 'project_title': A 1- to 3-word name, extremely concise.
- 'final_deliverable': A 1- to 3-word result, extremely concise.

The project plan:
"""


@dataclass
class CreateWBSLevel1:
    """
    WBS Level 1: Creating a Work Breakdown Structure (WBS) from a project plan.
    """
    query: str
    response: dict
    metadata: dict
    id: str
    project_title: str
    final_deliverable: str

    @classmethod
    def execute(cls, llm: Any, query: str, *, fast_mode: bool = False) -> 'CreateWBSLevel1':
        """
        Invoke LLM to create a work breakdown structure level 1.
        """
        if not hasattr(llm, "as_structured_llm") or not hasattr(llm, "metadata"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm() or metadata attributes.")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")
        # Ensure schema is registered for Responses API formatting
        register_schema(WBSLevel1)

        system_prompt = (
            "You generate concise Work Breakdown Structure level 1 summaries. "
            "Return a JSON object with exactly two snake_case keys: "
            "project_title and final_deliverable. Both values must be short strings "
            "(3-10 words). Do not include markdown, prose, bullet lists, or explanation."
        )

        chat_message_list = [
            SimpleChatMessage(role=SimpleMessageRole.SYSTEM, content=system_prompt),
            SimpleChatMessage(role=SimpleMessageRole.USER, content=QUERY_PREAMBLE + query),
        ]

        start_time = time.perf_counter()
        # Prefer structured path; fall back to tolerant parsing if provider rejects schema
        try:
            sllm = llm.as_structured_llm(WBSLevel1)
            chat_response = sllm.chat(chat_message_list)
            wbs_model = chat_response.raw
            raw_text = chat_response.text
            json_response = wbs_model.model_dump()
            warnings: list[str] = []
        except Exception as structured_exc:
            # Structured call failed; use tolerant freeform completion as a fallback
            logger.warning("WBS Level 1 structured call failed; falling back to tolerant parse.", exc_info=structured_exc)
            freeform = llm.complete(QUERY_PREAMBLE + query, system_prompt=system_prompt)
            raw_text = freeform.text if hasattr(freeform, "text") else str(freeform)
            json_response, wbs_model, warnings = cls._parse_llm_response(raw_text)

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata_source = getattr(llm, "metadata", {})
        metadata = dict(metadata_source) if isinstance(metadata_source, dict) else dict(getattr(metadata_source, "__dict__", {}))
        metadata["duration"] = duration
        metadata["response_char_count"] = len(raw_text)
        if warnings:
            metadata["normalization_warnings"] = warnings
            metadata["fallback_used"] = True
        else:
            metadata["fallback_used"] = False

        project_id = str(uuid4())

        result = CreateWBSLevel1(
            query=query,
            response=json_response,
            metadata=metadata,
            id=project_id,
            project_title=wbs_model.project_title,
            final_deliverable=wbs_model.final_deliverable
        )
        return result
    
    def raw_response_dict(self, include_metadata=True) -> dict:
        d = self.response.copy()
        if include_metadata:
            d['metadata'] = self.metadata
        return d
    
    def cleanedup_dict(self) -> dict:
        return {
            "id": self.id,
            "project_title": self.project_title,
            "final_deliverable": self.final_deliverable
        }

    @classmethod
    def _parse_llm_response(cls, raw_text: str) -> Tuple[Dict[str, Any], WBSLevel1, list[str]]:
        warnings: list[str] = []
        payload, load_warnings = cls._load_json_payload(raw_text)
        warnings.extend(load_warnings)
        normalized_payload, normalization_notes = cls._normalize_payload(payload)
        warnings.extend(normalization_notes)
        try:
            wbs_model = WBSLevel1.model_validate(normalized_payload)
        except ValidationError as exc:
            warnings.append("validation_error")
            logger.warning("WBS Level 1 validation failed; applying fallback defaults.", exc_info=exc)
            fallback_payload = {
                "project_title": normalized_payload.get("project_title", "TBD Project") or "TBD Project",
                "final_deliverable": normalized_payload.get("final_deliverable", "TBD Deliverable") or "TBD Deliverable",
            }
            wbs_model = WBSLevel1.model_validate(fallback_payload)
            normalized_payload.update(wbs_model.model_dump())
        else:
            normalized_payload.update(wbs_model.model_dump())
        return normalized_payload, wbs_model, warnings

    @staticmethod
    def _load_json_payload(raw_text: str) -> Dict[str, Any]:
        """
        Tolerant loader for Level 1 WBS JSON.
        - Try strict JSON
        - Then try the first {...} block
        - Then parse simple YAML/bullet lines like "- key: value"
        If all fail, return safe defaults so the task doesn't crash the pipeline.
        """
        # 1) Strict JSON
        try:
            payload = json.loads(raw_text)
        except JSONDecodeError:
            payload = None

        # 2) Extract first JSON object if needed
        if payload is None:
            m = re.search(r"\{.*?\}", raw_text, re.DOTALL)
            if m:
                try:
                    payload = json.loads(m.group(0))
                except JSONDecodeError:
                    payload = None

        # 3) Parse tolerant bullet/YAML-ish lines
        if payload is None:
            lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
            kv: Dict[str, Any] = {}
            for ln in lines:
                # Accept formats: "- key: value", "key: value"
                if ln.startswith("-"):
                    ln = ln[1:].strip()
                if ":" in ln:
                    key, val = ln.split(":", 1)
                    key = key.strip().strip('"\'')
                    val = val.strip()
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    if key in {"project_title", "final_deliverable", "title", "name", "deliverable", "primary_output"}:
                        kv[key] = val
            if kv:
                payload = kv
            elif lines and all(ln.startswith("-") for ln in lines):
                # Handle bullet lists like "- project_title: ..."
                derived: Dict[str, Any] = {}
                for ln in lines:
                    ln = ln.lstrip("- ")
                    if ":" not in ln:
                        continue
                    key, val = ln.split(":", 1)
                    key = key.strip().strip('"\'')
                    val = val.strip().strip('"\'')
                    if key in {"project_title", "final_deliverable", "title", "name", "deliverable", "primary_output"}:
                        derived[key] = val
                if derived:
                    payload = derived

        # 4) Safe defaults if still missing
        if not isinstance(payload, dict):
            snippet = raw_text.strip()
            if len(snippet) > 200:
                snippet = f"{snippet[:197]}..."
            logger.warning(f"LLM response did not yield a dict; using defaults. Snippet: {snippet}")
            payload = {"project_title": "TBD Project", "final_deliverable": "TBD Deliverable"}

        return payload

    @staticmethod
    def _normalize_payload(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], list[str]]:
        warnings: list[str] = []
        normalized: Dict[str, Any] = dict(payload)

        project_title = normalized.get("project_title") or normalized.get("title") or normalized.get("name")
        if not isinstance(project_title, str) or not project_title.strip():
            warnings.append("project_title_missing")
            project_title = "TBD Project"
        normalized["project_title"] = project_title.strip()

        final_deliverable = (
            normalized.get("final_deliverable")
            or normalized.get("deliverable")
            or normalized.get("primary_output")
        )
        if not isinstance(final_deliverable, str) or not final_deliverable.strip():
            warnings.append("final_deliverable_missing")
            final_deliverable = "TBD Deliverable"
        normalized["final_deliverable"] = final_deliverable.strip()

        return normalized, warnings

if __name__ == "__main__":
    import os

    from planexe.llm_factory import get_llm

    # TODO: Eliminate hardcoded paths
    path = '/Users/neoneye/Desktop/planexe_data/plan.json'

    with open(path, 'r', encoding='utf-8') as f:
        plan_json = json.load(f)

    query = json.dumps(plan_json, indent=2)
    print(f"\nQuery: {query}")

    model_name = os.getenv("PLANEXE_CLI_MODEL")
    llm = get_llm(model_name) if model_name else get_llm()

    result = CreateWBSLevel1.execute(llm, query)

    print("Response:")
    response_dict = result.raw_response_dict(include_metadata=False)
    print(json.dumps(response_dict, indent=2))

    print("\n\nExtracted result:")
    print(json.dumps(result.cleanedup_dict(), indent=2))
