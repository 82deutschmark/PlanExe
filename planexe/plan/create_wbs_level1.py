# Author: Cascade
# Date: 2025-10-25T17:30:00Z
# PURPOSE: Generate WBS Level 1 using the centralized SimpleOpenAILLM adapter. Builds prompts from plan JSON, normalizes responses with UUIDs, and keeps CLI entry compatible with factory-driven configuration.
# SRP and DRY check: Pass. Module remains scoped to WBS Level 1 creation while delegating shared concerns (LLM creation, formatting) to existing utilities without duplication.
"""
WBS Level 1: Create a Work Breakdown Structure (WBS) from a project plan.

https://en.wikipedia.org/wiki/Work_breakdown_structure
"""
import json
import time
import logging
from math import ceil
from uuid import uuid4
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from planexe.llm_util.simple_openai_llm import SimpleChatMessage, SimpleMessageRole, StructuredLLMResponse
from planexe.llm_util.schema_registry import register_schema

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
    def execute(cls, llm: Any, query: str, *, fast_mode: bool = False) -> 'CreateWBSLevel1':
        """
        Invoke LLM to create a work breakdown structure level 1.
        """
        if not hasattr(llm, "as_structured_llm") or not hasattr(llm, "metadata"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm() or metadata attributes.")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")

        system_prompt = (
            "You generate concise Work Breakdown Structure level 1 summaries. "
            "Return valid JSON with snake_case keys: project_title and final_deliverable. "
            "Both values must be short strings (3-10 words)."
        )

        register_schema(WBSLevel1)

        chat_messages = [
            SimpleChatMessage(role=SimpleMessageRole.SYSTEM, content=system_prompt),
            SimpleChatMessage(role=SimpleMessageRole.USER, content=f"{QUERY_PREAMBLE.strip()}\n\n{query}"),
        ]

        sllm = llm.as_structured_llm(WBSLevel1)
        reasoning_effort = "low" if fast_mode else "medium"
        start_time = time.perf_counter()
        fallback_used = False
        try:
            structured_response: StructuredLLMResponse = sllm.chat(
                chat_messages,
                reasoning_effort=reasoning_effort,
            )
            parsed = structured_response.raw
            raw_text = structured_response.text
            usage = getattr(structured_response, "token_usage", None)
        except Exception as exc:
            fallback_used = True
            raw_text = json.dumps({
                "project_title": "tbd",
                "final_deliverable": "tbd"
            })
            parsed = WBSLevel1(project_title="tbd", final_deliverable="tbd")
            usage = None
            logger.warning("CreateWBSLevel1 fallback triggered due to error: %s", exc)

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata = dict(getattr(llm, "metadata", {}))
        metadata["duration"] = duration
        metadata["fallback_used"] = fallback_used
        metadata["reasoning_effort"] = reasoning_effort
        if usage:
            metadata["token_usage"] = usage

        project_id = str(uuid4())
        json_response = parsed.model_dump()

        result = CreateWBSLevel1(
            query=query,
            response=json_response,
            metadata=metadata,
            id=project_id,
            project_title=json_response['project_title'],
            final_deliverable=json_response['final_deliverable']
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
