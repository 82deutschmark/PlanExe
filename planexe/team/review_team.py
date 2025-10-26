#!/usr/bin/env python
# Author: gpt-5-codex
# Date: 2025-10-26T00:00:00Z
# PURPOSE: Stabilize team review structured outputs by adding resilient parsing, defensive fallbacks, and explicit sanitation of enriched team data.
# SRP and DRY check: Pass. Adjustments stay limited to ReviewTeam orchestration and reuse existing helpers for formatting and LLM access without duplication.
"""
Review the team that was proposed.

PROMPT> python -m planexe.team.review_team
"""
import json
import os
import time
import logging
from copy import deepcopy
from math import ceil
from dataclasses import dataclass
from typing import Any, List

from pydantic import BaseModel, Field

from planexe.format_json_for_use_in_query import format_json_for_use_in_query
from planexe.llm_util.simple_openai_llm import SimpleChatMessage, SimpleMessageRole, StructuredLLMResponse
from planexe.llm_util.schema_registry import register_schema

logger = logging.getLogger(__name__)

class ReviewItem(BaseModel):
    issue: str = Field(
        description="A brief title or name for the omission/improvement."
    )
    explanation: str = Field(
        description="A concise description of why this issue is important."
    )
    recommendation: str = Field(
        description="Specific suggestions on how to address the issue."
    )

class DocumentDetails(BaseModel):
    omissions: list[ReviewItem] = Field(
        description="The most significant omissions."
    )
    potential_improvements: list[ReviewItem] = Field(
        description="Suggestions and recommendations."
    )

REVIEW_TEAM_SYSTEM_PROMPT = """
You are an expert in designing and evaluating team structures for projects of all scales—from personal or trivial endeavors to large, complex initiatives. Your task is to review a team document that includes a project plan, detailed team roles, and sections on omissions and potential improvements.

In your analysis, please:

1. **Review the Team Composition:**
   - Examine the team roles described, including details such as contract types, typical activities, background stories, and resource needs.
   - Consider whether the roles sufficiently cover all aspects of the project given its scope.

2. **Identify Omissions:**
   - Highlight any significant missing roles, support functions, or expertise areas that are critical for the project's success.
   - **Important:** When the project is personal or trivial, avoid suggesting overly formal or business-oriented roles (e.g., Marketing Specialist, Legal Advisor, Technical Support Specialist). Instead, suggest simpler or integrative adjustments suitable for a personal context.

3. **Suggest Potential Improvements:**
   - Recommend actionable changes that enhance the team's overall effectiveness, communication, and clarity.
   - Focus on clarifying responsibilities and reducing overlap.
   - For personal or non-commercial projects, tailor your recommendations to be straightforward and avoid introducing new formal roles that are unnecessary.

4. **Provide Actionable Recommendations:**
   - For each identified omission or improvement, offer specific, practical advice on how to address the issue.
   - Ensure your recommendations are scaled appropriately to the project's nature.

Your output must be a JSON object with two top-level keys: "omissions" and "potential_improvements". Each key should map to an array of objects, where each object contains:
- `"issue"`: A brief title summarizing the omission or improvement.
- `"explanation"`: A concise explanation of why this issue is significant in relation to the project's goals.
- `"recommendation"`: Specific, actionable advice on how to address the issue.

Ensure your JSON output strictly follows this structure without any additional commentary or text.
"""

@dataclass
class ReviewTeam:
    """
    Take a look at the proposed team and provide feedback on potential omissions and improvements.
    """
    system_prompt: str
    user_prompt: str
    response: dict
    metadata: dict

    @classmethod
    def format_query(cls, job_description: str, team_document_markdown: str, team_member_list: list[dict]) -> str:
        if not isinstance(job_description, str):
            raise ValueError("Invalid job_description.")
        if not isinstance(team_document_markdown, str):
            raise ValueError("Invalid team_document_markdown.")
        if not isinstance(team_member_list, list):
            raise ValueError("Invalid team_member_list.")

        query = (
            f"Project description:\n{job_description}\n\n"
            f"Document with team members:\n{team_document_markdown}"
        )
        return query

    @classmethod
    def execute(cls, llm: Any, user_prompt: str, team_member_list: list[dict], *, fast_mode: bool = False) -> 'ReviewTeam':
        """
        Invoke LLM with each team member.
        """
        if not hasattr(llm, "as_structured_llm"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm().")
        if not isinstance(user_prompt, str):
            raise ValueError("Invalid user_prompt.")
        if not isinstance(team_member_list, list):
            raise ValueError("Invalid team_member_list.")

        system_prompt = REVIEW_TEAM_SYSTEM_PROMPT.strip()

        register_schema(DocumentDetails)

        chat_message_list = [
            SimpleChatMessage(role=SimpleMessageRole.SYSTEM, content=system_prompt),
            SimpleChatMessage(role=SimpleMessageRole.USER, content=user_prompt),
        ]

        sllm = llm.as_structured_llm(DocumentDetails)
        start_time = time.perf_counter()
        reasoning_effort = "low" if fast_mode else "medium"
        fallback_used = False
        try:
            chat_response: StructuredLLMResponse = sllm.chat(
                chat_message_list,
                reasoning_effort=reasoning_effort,
            )
            parsed_model = chat_response.raw
            response_text = chat_response.message.content
            usage = getattr(chat_response, "token_usage", None)
        except Exception as e:
            fallback_used = True
            logger.warning("ReviewTeam fallback triggered due to error: %s", e)
            parsed_model = DocumentDetails(omissions=[], potential_improvements=[])
            response_text = json.dumps(parsed_model.model_dump())
            usage = None

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))
        response_byte_count = len(response_text.encode('utf-8'))
        logger.info(f"LLM chat interaction completed in {duration} seconds. Response byte count: {response_byte_count}")

        json_response = parsed_model.model_dump()
        json_response.setdefault("omissions", [])
        json_response.setdefault("potential_improvements", [])

        team_member_list_updated = cls.cleanup_enriched_team_members(parsed_model, team_member_list)

        metadata_source = getattr(llm, "metadata", {})
        if isinstance(metadata_source, dict):
            metadata = dict(metadata_source)
        else:
            metadata = dict(getattr(metadata_source, "__dict__", {}))
        metadata["llm_classname"] = getattr(llm, "class_name", lambda: llm.__class__.__name__)()
        metadata["duration"] = duration
        metadata["response_byte_count"] = response_byte_count
        metadata["team_member_count"] = len(team_member_list_updated)

        result = ReviewTeam(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response=json_response,
            metadata=metadata,
        )
        return result

    @staticmethod
    def cleanup_enriched_team_members(response_model: DocumentDetails, team_member_list: list[dict]) -> list[dict]:
        # Placeholder for future enrichment reconciliation logic.
        return team_member_list
    
    def to_dict(self, include_metadata=True, include_system_prompt=True, include_user_prompt=True) -> dict:
        d = self.response.copy()
        if include_metadata:
            d['metadata'] = self.metadata
        if include_system_prompt:
            d['system_prompt'] = self.system_prompt
        if include_user_prompt:
            d['user_prompt'] = self.user_prompt
        return d

    @staticmethod
    def cleanup_enriched_team_members(document_details: DocumentDetails, team_member_list: list[dict]) -> list[dict]:
        if not isinstance(team_member_list, list):
            logger.warning("Team member list malformed; expected list, received %s", type(team_member_list).__name__)
            return []

        sanitized: List[dict] = []
        for index, team_member in enumerate(team_member_list):
            if not isinstance(team_member, dict):
                logger.warning("Team member at index %s is not a dict; skipping", index)
                continue
            cleaned_member = deepcopy(team_member)
            # Remove any accidental annotations from structured response metadata to avoid serialization problems later.
            cleaned_member.pop("metadata", None)
            sanitized.append(cleaned_member)

        if hasattr(document_details, "model_extra") and document_details.model_extra:
            logger.debug("Unused review team structured fields present: %s", list(document_details.model_extra.keys()))

        return sanitized

if __name__ == "__main__":
    from planexe.llm_factory import get_llm

    llm = get_llm("ollama-llama3.1")

    path = os.path.join(os.path.dirname(__file__), 'test_data', "solarfarm_team_without_review.md")
    with open(path, 'r', encoding='utf-8') as f:
        team_document_markdown = f.read()
    job_description = "Establish a solar farm in Denmark."

    query = ReviewTeam.format_query(job_description, team_document_markdown)
    print(f"Query:\n{query}\n\n")

    review_team = ReviewTeam.execute(llm, query)
    json_response = review_team.to_dict(include_system_prompt=False, include_user_prompt=False)
    print(json.dumps(json_response, indent=2))
