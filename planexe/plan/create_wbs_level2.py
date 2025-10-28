# Author: gpt-5-codex
# Date: 2025-10-28T04:39:23Z
# PURPOSE: Structured LLM response schemas for planexe.plan.create_wbs_level2 consumed by the Luigi pipeline when invoking OpenAI Responses API tasks.
# SRP and DRY check: Pass. Schema definitions remain localized to this task and avoid duplication across the codebase.

# Author: Cascade
# Date: 2025-10-25T17:30:00Z
# PURPOSE: Generate WBS Level 2 using the centralized SimpleOpenAILLM adapter. Formats queries from plan JSON plus WBS L1 context, invokes the LLM through the factory, and normalizes responses with UUIDs for phases and tasks for both pipeline and CLI use.
# SRP and DRY check: Pass. The module remains focused on WBS Level 2 generation while delegating shared helpers (query formatting, LLM factory) to existing utilities with no duplicated logic.
"""
WBS Level 2: Create a Work Breakdown Structure (WBS) from a project plan.

https://en.wikipedia.org/wiki/Work_breakdown_structure

Focus is on the "Process style". 
Focus is not on the "product style".
"""
import json
import time
import logging
from math import ceil
from uuid import uuid4
from dataclasses import dataclass
from typing import Any, Optional

from pydantic import Field
from planexe.llm_util.strict_response_model import StrictResponseModel

from planexe.format_json_for_use_in_query import format_json_for_use_in_query
from planexe.llm_factory import get_llm
from planexe.llm_util.simple_openai_llm import SimpleChatMessage, SimpleMessageRole, StructuredLLMResponse
from planexe.llm_util.schema_registry import register_schema

logger = logging.getLogger(__name__)

class SubtaskDetails(StrictResponseModel):
    subtask_wbs_number: str = Field(
        description="The unique identifier assigned to each subtask. Example: ['1.', '2.', '3.', '6.2.2', '6.2.3', '6.2.4', 'Subtask 5:', 'Subtask 6:', 'S3.', 'S4.']."
    )
    subtask_title: str = Field(
        description="Start with a verb to clearly indicate the action required. Example: ['Secure funding', 'Obtain construction permits', 'Electrical installation', 'Commissioning and handover']."
    )

class MajorPhaseDetails(StrictResponseModel):
    """
    A major phase in the project decomposed into smaller tasks.
    """
    major_phase_wbs_number: str = Field(
        description="The unique identifier assigned to each major phase. Example: ['1.', '2.', '3.', 'Phase 1:', 'Phase 2:', 'P1.', 'P2.']."
    )
    major_phase_title: str = Field(
        description="Action-oriented title of this primary phase of the project. Example: ['Project Initiation', 'Procurement', 'Construction', 'Operation and Maintenance']."
    )
    subtasks: list[SubtaskDetails] = Field(
        description="List of the subtasks or activities."
    )

class WorkBreakdownStructure(StrictResponseModel):
    """
    The Work Breakdown Structure (WBS) is a hierarchical decomposition of the total scope of work to accomplish project objectives.
    It organizes the project into smaller, more manageable components.
    """
    major_phase_details: list[MajorPhaseDetails] = Field(
        description="List with each major phase broken down into subtasks or activities."
    )

QUERY_PREAMBLE = """
Create a work breakdown structure level 2 for this project.

A task can always be broken down into smaller, more manageable subtasks.

"""

@dataclass
class CreateWBSLevel2:
    """
    WBS Level 2: Creating a Work Breakdown Structure (WBS) from a project plan.
    """
    query: str
    response: dict
    metadata: dict
    major_phases_with_subtasks: list[dict]
    major_phases_uuids: list[str]
    task_uuids: list[str]

    @classmethod
    def format_query(cls, plan_json: dict, wbs_level1_json: dict) -> str:
        """
        Format the query for creating a Work Breakdown Structure (WBS) level 2.
        """
        if not isinstance(plan_json, dict):
            raise ValueError("Invalid plan_json.")
        if not isinstance(wbs_level1_json, dict):
            raise ValueError("Invalid wbs_level1_json.")
        
        # Having a uuid in the WBS Level 1 data trend to confuse the LLM, causing the LLM to attempt to insert all kinds of ids in the response.
        # Removing the id from the WBS Level 1 data, and there is less confusion about what the LLM should do.
        wbs_level1_json_without_id = wbs_level1_json.copy()
        wbs_level1_json_without_id.pop("id", None)

        query = f"""
The project plan:
{format_json_for_use_in_query(plan_json)}

WBS Level 1:
{format_json_for_use_in_query(wbs_level1_json_without_id)}
"""
        return query
    
    @classmethod
    def execute(
        cls,
        llm: Any,
        query: str,
        *,
        fast_mode: bool = False,
        reasoning_effort: Optional[str] = None,
    ) -> 'CreateWBSLevel2':
        """
        Invoke LLM to create a Work Breakdown Structure (WBS) from a json representation of a project plan.
        """
        if not hasattr(llm, "as_structured_llm"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm().")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")

        register_schema(WorkBreakdownStructure)

        system_prompt = (
            "You expand project plans into Work Breakdown Structure level 2. "
            "Return JSON with snake_case keys matching the provided schema."
        )

        if fast_mode and len(query) > 8000:
            query = query[:8000] + "\n\n... [truncated for FAST_BUT_SKIP_DETAILS]"

        chat_messages = [
            SimpleChatMessage(role=SimpleMessageRole.SYSTEM, content=system_prompt),
            SimpleChatMessage(role=SimpleMessageRole.USER, content=QUERY_PREAMBLE + query),
        ]

        sllm = llm.as_structured_llm(WorkBreakdownStructure)
        resolved_reasoning_effort = reasoning_effort or ("low" if fast_mode else "medium")
        start_time = time.perf_counter()
        fallback_used = False
        try:
            structured_response: StructuredLLMResponse = sllm.chat(
                chat_messages,
                reasoning_effort=resolved_reasoning_effort,
            )
            parsed = structured_response.raw
            response_text = structured_response.text
            usage = getattr(structured_response, "token_usage", None)
        except Exception as exc:
            fallback_used = True
            parsed = WorkBreakdownStructure(major_phase_details=[])
            response_text = json.dumps(parsed.model_dump())
            usage = None
            logger.warning("CreateWBSLevel2 fallback triggered due to error: %s", exc)

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata = dict(getattr(llm, "metadata", {}))
        metadata["duration"] = duration
        metadata["fallback_used"] = fallback_used
        metadata["reasoning_effort"] = resolved_reasoning_effort
        if usage:
            metadata["token_usage"] = usage

        # Cleanup the json response from the LLM model, assign unique ids to each activity.
        result_major_phases_with_subtasks = []
        result_major_phases_uuids = []
        result_task_uuids = []
        json_response = parsed.model_dump()
        for major_phase_detail in json_response.get('major_phase_details', []):
            subtask_list = []
            for subtask in major_phase_detail['subtasks']:
                subtask_title = subtask['subtask_title']
                uuid = str(uuid4())
                subtask_item = {
                    "id": uuid,
                    "description": subtask_title,
                }
                subtask_list.append(subtask_item)
                result_task_uuids.append(uuid)

            uuid = str(uuid4())
            major_phase_item = {
                "id": uuid,
                "major_phase_title": major_phase_detail['major_phase_title'],
                "subtasks": subtask_list,
            }
            result_major_phases_with_subtasks.append(major_phase_item)
            result_major_phases_uuids.append(uuid)

        result = CreateWBSLevel2(
            query=query,
            response=json_response,
            metadata=metadata,
            major_phases_with_subtasks=result_major_phases_with_subtasks,
            major_phases_uuids=result_major_phases_uuids,
            task_uuids=result_task_uuids
        )
        return result

    def raw_response_dict(self, include_metadata=True, include_query=True) -> dict:
        d = self.response.copy()
        if include_metadata:
            d['metadata'] = self.metadata
        if include_query:
            d['query'] = self.query
        return d
    
if __name__ == "__main__":
    import os
    import sys
    from pathlib import Path
    from planexe.plan.filenames import FilenameEnum
    from planexe.plan.pipeline_environment import PipelineEnvironment

    def _discover_plan_path() -> Path:
        # 1) CLI arg wins
        if len(sys.argv) > 1:
            candidate = Path(sys.argv[1]).expanduser().resolve()
            if candidate.is_file():
                return candidate
            raise FileNotFoundError(f"Provided plan path does not exist: {candidate}")

        # 2) RUN_ID_DIR with common filenames
        try:
            run_dir = PipelineEnvironment.from_env().get_run_id_dir()
        except Exception:
            run_dir = None

        possible_names = [
            FilenameEnum.PROJECT_PLAN_RAW.value,   # 005-1-project_plan_raw.json
            "002-project_plan.json",              # legacy/dev sample
            "project-plan.json",                  # common alt
            "plan.json",                          # generic
        ]
        search_roots = [p for p in [run_dir, Path.cwd()] if p is not None]
        for root in search_roots:
            for name in possible_names:
                candidate = (root / name)
                if candidate.is_file():
                    return candidate

        raise FileNotFoundError(
            "Could not locate a plan JSON. Provide a path as an argument or set RUN_ID_DIR to a run folder containing one of: "
            + ", ".join(possible_names)
        )

    path = _discover_plan_path()

    wbs_level1_json = {
        "id": "d0169227-bf29-4a54-a898-67d6ff4d1193",
        "project_title": "Establish a solar farm in Denmark",
        "final_deliverable": "Solar farm operational",
    }

    print(f"file: {path}")
    with open(path, 'r', encoding='utf-8') as f:
        plan_json = json.load(f)

    query = CreateWBSLevel2.format_query(plan_json, wbs_level1_json)

    model_name = os.getenv("PLANEXE_CLI_MODEL")
    llm = get_llm(model_name) if model_name else get_llm()

    print(f"Query: {query}")
    result = CreateWBSLevel2.execute(llm, query)

    print("Response:")
    response_dict = result.raw_response_dict(include_query=False)
    print(json.dumps(response_dict, indent=2))

    print("\n\nExtracted result:")
    print(json.dumps(result.major_phases_with_subtasks, indent=2))
