# Author: Cascade
# Date: 2025-10-25T18:15:00Z
# PURPOSE: Review generated team proposals using SimpleOpenAILLM structured outputs, removing llama_index dependencies while preserving metadata.
# SRP and DRY check: Pass. Module remains focused on team review logic and reuses shared adapters/formatting utilities.
"""
Review the team that was proposed.

PROMPT> python -m planexe.team.review_team
"""
import json
import time
import logging
from math import ceil
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from planexe.format_json_for_use_in_query import format_json_for_use_in_query
from planexe.llm_util.simple_openai_llm import SimpleChatMessage, SimpleMessageRole

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
    def execute(cls, llm: Any, user_prompt: str, team_member_list: list[dict]) -> 'ReviewTeam':
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

        chat_message_list = [
            SimpleChatMessage(role=SimpleMessageRole.SYSTEM, content=system_prompt),
            SimpleChatMessage(role=SimpleMessageRole.USER, content=user_prompt),
        ]

        sllm = llm.as_structured_llm(DocumentDetails)
        start_time = time.perf_counter()
        try:
            chat_response = sllm.chat(chat_message_list)
        except Exception as e:
            logger.debug(f"LLM chat interaction failed: {e}")
            logger.error("LLM chat interaction failed.", exc_info=True)
            raise ValueError("LLM chat interaction failed.") from e

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))
        response_byte_count = len(chat_response.message.content.encode('utf-8'))
        logger.info(f"LLM chat interaction completed in {duration} seconds. Response byte count: {response_byte_count}")

        json_response = chat_response.raw.model_dump()

        team_member_list_updated = cls.cleanup_enriched_team_members(chat_response.raw, team_member_list)

        metadata = dict(getattr(llm, "metadata", {}))
        metadata["llm_classname"] = getattr(llm, "class_name", lambda: llm.__class__.__name__)()
        metadata["duration"] = duration
        metadata["response_byte_count"] = response_byte_count

        result = ReviewTeam(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response=json_response,
            metadata=metadata,
        )
        return result
    
    def to_dict(self, include_metadata=True, include_system_prompt=True, include_user_prompt=True) -> dict:
        d = self.response.copy()
        if include_metadata:
            d['metadata'] = self.metadata
        if include_system_prompt:
            d['system_prompt'] = self.system_prompt
        if include_user_prompt:
            d['user_prompt'] = self.user_prompt
        return d

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
