# Author: Cascade
# Date: 2025-10-25T17:50:00Z
# PURPOSE: Identify WBS task dependencies via SimpleOpenAILLM structured outputs without llama_index imports.
# SRP and DRY check: Pass. Module focuses on dependency extraction while reusing shared formatting and adapter utilities.
"""
Identified dependencies, that serves as a foundation for task sequencing.
https://en.wikipedia.org/wiki/Work_breakdown_structure

IDEA: I'm not happy about have two separate arrays for the task_ids and the explanations.
There should be 1 task id and 1 explanation per dependency.
Currently there can be N task ids and M explanations, where N != M. This is not good.

IDEA: Label each dependency with its type (FS, SS, FF, SF).
- Finish-to-Start (FS): Task B cannot start until Task A is finished (most common).
- Start-to-Start (SS): Task B cannot start until Task A starts.
- Finish-to-Finish (FF): Task B cannot finish until Task A is finished.
- Start-to-Finish (SF): Task B cannot finish until Task A starts (least common).

IDEA: Missing Dependencies.
I asked Gemini to check the json file containing the dependencies, and it did spot some missing dependencies.
So I need an extra LLM that can go identify if there are more missing dependencies.
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
from planexe.plan.filenames import FilenameEnum

class TaskDependencyDetail(BaseModel):
    """
    model_config = {'extra': 'allow'}
    Details about the prerequisites for a task.
    """
    dependent_task_id: str = Field(
        description="UUID that uniquely identifies a major phase or a subtask."
    )

    depends_on_task_id_list: list[str] = Field(
        description="List of UUIDs that are prerequisites for this task."
    )

    depends_on_task_explanation_list: list[str] = Field(
        description="List of explanations why these tasks must be completed before this task."
    )

class DependencyMapping(BaseModel):
    """
    Understanding the dependencies between tasks is crucial for effective project scheduling and 
    ensuring that prerequisites are met before commencing subsequent activities.
    """
    task_dependency_details: list[TaskDependencyDetail] = Field(
        description="List with dependency mappings between tasks."
    )

QUERY_PREAMBLE = """
Find the 10 most critical important task dependencies. Don't attempt making an exhaustive list.

Understanding how tasks relate to each other is crucial for accurate timeline planning. 
Dependencies determine the sequence in which tasks must be completed.

Types of Dependencies:
    •	Finish-to-Start (FS): Task B cannot start until Task A is finished.
    •	Start-to-Start (SS): Task B cannot start until Task A starts.
    •	Finish-to-Finish (FF): Task B cannot finish until Task A finishes.
    •	Start-to-Finish (SF): Task B cannot finish until Task A starts (rarely used).

Example Dependencies:
    •	Land Acquisition must be completed before Permitting and Approvals can begin.
    •	Permitting and Approvals must be completed before Design and Engineering starts.
    •	Procurement of materials can begin once Design and Engineering is underway.

"""

@dataclass
class IdentifyWBSTaskDependencies:
    """
    Enrich an existing Work Breakdown Structure (WBS) with details about dependencies between tasks.
    """
    query: str
    response: dict
    metadata: dict

    @classmethod
    def format_query(cls, plan_json: dict, wbs_level2_json: list) -> str:
        """
        Format the query for creating a Work Breakdown Structure (WBS) level 2.
        """
        if not isinstance(plan_json, dict):
            raise ValueError("Invalid plan_json.")
        if not isinstance(wbs_level2_json, list):
            raise ValueError("Invalid wbs_list.")

        query = f"""
The project plan:
{format_json_for_use_in_query(plan_json)}

The Work Breakdown Structure (WBS):
{format_json_for_use_in_query(wbs_level2_json)}
"""
        return query

    @classmethod
    def execute(cls, llm: Any, query: str) -> 'IdentifyWBSTaskDependencies':
        """
        Invoke LLM to identify task dependencies from a json representation of a project plan and Work Breakdown Structure (WBS).
        """
        if not hasattr(llm, "as_structured_llm"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm().")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")

        start_time = time.perf_counter()

        sllm = llm.as_structured_llm(DependencyMapping)
        response = sllm.complete(QUERY_PREAMBLE + query)
        json_response = json.loads(response.text)

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata = dict(getattr(llm, "metadata", {}))
        metadata["llm_classname"] = getattr(llm, "class_name", lambda: llm.__class__.__name__)()
        metadata["duration"] = duration

        result = IdentifyWBSTaskDependencies(
            query=query,
            response=json_response,
            metadata=metadata
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
            the_json = json.load(f)
        return the_json

    plan_json = load_json('002-project_plan.json')
    wbs_json = load_json(FilenameEnum.WBS_LEVEL2.value)

    query = IdentifyWBSTaskDependencies.format_query(plan_json, wbs_json)

    llm = get_llm()

    print(f"Query: {query}")
    result = IdentifyWBSTaskDependencies.execute(llm, query)

    print("Response:")
    response_dict = result.raw_response_dict(include_query=False)
    print(json.dumps(response_dict, indent=2))
