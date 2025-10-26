#!/usr/bin/env python
# Author: gpt-5-codex
# Date: 2025-10-26T00:00:00Z
# PURPOSE: Harden WBS Level 1 generation by validating LLM output, normalizing fallback values, and preserving compatibility with the factory-driven configuration pipeline.
# SRP and DRY check: Pass. Enhancements stay scoped to WBS Level 1 parsing while reusing shared utilities and avoiding duplicated logic already present elsewhere in the project.
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

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)

class WBSLevel1(BaseModel):
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
    def execute(cls, llm: Any, query: str) -> 'CreateWBSLevel1':
        """
        Invoke LLM to create a work breakdown structure level 1.
        """
        if not hasattr(llm, "complete") or not hasattr(llm, "metadata"):
            raise ValueError("Invalid LLM instance: missing complete() or metadata attributes.")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")

        start_time = time.perf_counter()

        response = llm.complete(QUERY_PREAMBLE + query)
        raw_text = response.text if hasattr(response, "text") else str(response)
        json_response, wbs_model, warnings = cls._parse_llm_response(raw_text)

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata_source = getattr(llm, "metadata", {})
        if isinstance(metadata_source, dict):
            metadata = dict(metadata_source)
        else:
            metadata = dict(getattr(metadata_source, "__dict__", {}))
        metadata["duration"] = duration
        metadata["response_char_count"] = len(raw_text)
        if warnings:
            metadata["normalization_warnings"] = warnings

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
        payload = cls._load_json_payload(raw_text)
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
        try:
            payload = json.loads(raw_text)
        except JSONDecodeError:
            match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if not match:
                snippet = raw_text.strip()
                if len(snippet) > 200:
                    snippet = f"{snippet[:197]}..."
                raise ValueError(f"LLM response did not contain JSON: {snippet}")
            try:
                payload = json.loads(match.group(0))
            except JSONDecodeError as exc:
                snippet = match.group(0)
                if len(snippet) > 200:
                    snippet = f"{snippet[:197]}..."
                raise ValueError(f"Unable to parse JSON from LLM response: {snippet}") from exc
        if not isinstance(payload, dict):
            raise ValueError("LLM response JSON must be an object.")
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
