# Author: Cascade
# Date: 2025-10-25T18:05:00Z
# PURPOSE: Structured schema and execution helpers for estimating WBS task durations via SimpleOpenAILLM responses, removing llama_index dependencies.
# SRP and DRY check: Pass. This module encapsulates duration estimation logic used by EstimateTaskDurationsTask; functionality not duplicated elsewhere.
"""
https://en.wikipedia.org/wiki/Work_breakdown_structure
https://en.wikipedia.org/wiki/Program_evaluation_and_review_technique
"""
import os
import json
import time
from math import ceil
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from planexe.format_json_for_use_in_query import format_json_for_use_in_query
from planexe.llm_factory import get_llm

class TaskTimeEstimateDetail(BaseModel):
    """
    Details about a task duration, lower/upper bounds. Potential risks impacting the duration. 
    """
    task_id: str = Field(
        description="UUID that uniquely identifies the task."
    )
    delay_risks: str = Field(
        description="Possible issues that may delay the task. Example: ['Weather-related disruptions', 'Third-party vendors might fail to deliver on time', 'Key team members might be unavailable']. **This field MUST be filled with a meaningful description. Do not leave it empty.**"
    )
    mitigation_strategy: str = Field(
        description="Actions or strategies to minimize the risk of delays. Example: ['Engage backup vendors', 'Schedule regular progress reviews', 'Establish clear communication channels']. **This field MUST be filled with a meaningful and specific strategy. Do not leave it empty.**"
    )
    days_min: int = Field(
        description="Number of days, the best case scenario. If not applicable use minus 1."
    )
    days_max: int = Field(
        description="Number of days, the worst case scenario. If not applicable use minus 1."
    )
    days_realistic: int = Field(
        description="Number of days, in the realistic scenario. If not applicable use minus 1."
    )

class TimeEstimates(BaseModel):
    """
    Estimating realistic durations for each task and appropriately assigning resources 
    ensures that the project stays on schedule and within budget.
    """
    task_details: list[TaskTimeEstimateDetail] = Field(
        default_factory=list,
        description="List with tasks with time estimates."
    )

QUERY_PREAMBLE = """
Assign estimated durations for each task and subtask.
Ensure a consistent voice and phrasing across tasks.

**For each task, you MUST provide a meaningful description for both 'delay_risks' and 'mitigation_strategy'. Do not leave these fields as empty strings.**

**Example of good 'delay_risks' and 'mitigation_strategy':**
For the task of "Define project scope and objectives":
- delay_risks: "Lack of clear initial requirements from stakeholders, potential for scope creep later in the project."
- mitigation_strategy: "Conduct thorough initial meetings with all key stakeholders to gather requirements, establish a clear change management process."

"""

@dataclass
class EstimateWBSTaskDurations:
    """
    Enrich an existing Work Breakdown Structure (WBS) with task duration estimates.
    """
    query: str
    response: dict
    metadata: dict

    @classmethod
    def format_query(cls, plan_json: dict, wbs_level2_json: list, task_ids: list[str]) -> str:
        if not isinstance(plan_json, dict):
            raise ValueError("Invalid plan_json.")
        if not isinstance(wbs_level2_json, list):
            raise ValueError("Invalid wbs_level1_json.")
        if not isinstance(task_ids, list):
            raise ValueError("Invalid task_ids.")

        """
        Wrap the task ids in quotes, so it looks like this:
        "0ca58751-3abd-44d0-b24b-ebcf14c794e7"
        "86f0ed30-ba23-46e4-83d9-ef53d95ff054"
        "58d5dcc3-7385-4919-adc1-e1f84727e9d2"
        """
        task_ids_in_quotes = [f'"{task_id}"' for task_id in task_ids]
        task_id_strings = "\n".join(task_ids_in_quotes)

        query = f"""
The project plan:
{format_json_for_use_in_query(plan_json)}

The Work Breakdown Structure (WBS):
{format_json_for_use_in_query(wbs_level2_json)}

Only estimate these {len(task_ids)} tasks:
{task_id_strings}
"""
        return query
    
    @classmethod
    def execute(cls, llm: Any, query: str) -> 'EstimateWBSTaskDurations':
        """
        Invoke LLM to estimate task durations from a json representation of a project plan and Work Breakdown Structure (WBS).

        Executing with too many task_ids may result in a timeout, where the LLM cannot complete the task within a reasonable time.
        Split the task_ids into smaller chunks of around 3 task_ids each, and process them one at a time.
        """
        if not hasattr(llm, "as_structured_llm"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm().")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")

        start_time = time.perf_counter()

        sllm = llm.as_structured_llm(TimeEstimates)
        response = sllm.complete(QUERY_PREAMBLE + query)
        json_response = json.loads(response.text)

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata = dict(getattr(llm, "metadata", {}))
        metadata["llm_classname"] = getattr(llm, "class_name", lambda: llm.__class__.__name__)()
        metadata["duration"] = duration

        result = EstimateWBSTaskDurations(
            query=query,
            response=json_response,
            metadata=metadata,
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
    # TODO: Eliminate hardcoded paths
    basepath = '/Users/neoneye/Desktop/planexe_data'

    def load_json(relative_path: str) -> dict:
        path = os.path.join(basepath, relative_path)
        print(f"loading file: {path}")
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)

    plan_json = load_json('002-project_plan.json')
    wbs_level2_json = load_json(FilenameEnum.WBS_LEVEL2.value)

    task_ids = [
        "c6a249af-b8d3-4d4c-b3ef-8a5caa8793d4",
        "622fa6f1-6252-445e-8b5a-2a5c75683a80",
        "fdaa706e-3d3b-4166-9730-7ea3e238d0cf"
    ]

    query = EstimateWBSTaskDurations.format_query(plan_json, wbs_level2_json, task_ids)

    llm = get_llm()

    print(f"Query: {query}")
    result = EstimateWBSTaskDurations.execute(llm, query)

    print("\n\nResponse:")
    response_dict = result.raw_response_dict(include_query=False)
    print(json.dumps(response_dict, indent=2))
