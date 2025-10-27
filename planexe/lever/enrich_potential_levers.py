# Author: OpenAI Codex CLI (o3)
# Date: 2025-10-23T00:00:00Z
# PURPOSE: Enrich deduplicated strategic levers with description, synergy_text, and conflict_text using structured LLM calls. Writes results during execution and supports filesystem + DB outputs via callers.
# SRP and DRY check: Pass. Implements only lever-enrichment logic and serialization. No overlap with other modules; complements `deduplicate_levers.py` and feeds `focus_on_vital_few_levers.py` which consumes `characterized_levers`.

"""
Enrich the potential levers with fields such as: "description", "synergy_text", "conflict_text".

- Input: deduplicated levers from `deduplicate_levers.py`.
- Output: characterized levers consumed by downstream tasks (e.g., FocusOnVitalFewLeversTask).

PROMPT> python -m planexe.lever.enrich_potential_levers
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import List, Dict, Any

from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.llms.llm import LLM
from pydantic import BaseModel, Field, ValidationError

from planexe.llm_util.llm_executor import LLMExecutor, PipelineStopRequested

logger = logging.getLogger(__name__)

# The number of levers to process per LLM batch
BATCH_SIZE = 5


# --- Pydantic models ---
class InputLever(BaseModel):
    lever_id: str
    name: str
    consequences: str
    options: List[str]
    review: str
    deduplication_justification: str


class LeverCharacterization(BaseModel):
    lever_id: str = Field(description="The uuid of the lever")
    description: str = Field(description="80-100 word description of the lever's purpose, scope, metrics.")
    synergy_text: str = Field(description="40-60 words on positive interactions; name specific levers.")
    conflict_text: str = Field(description="40-60 words on conflicts/trade-offs; name specific levers.")


class BatchCharacterizationResult(BaseModel):
    characterizations: List[LeverCharacterization]


class CharacterizedLever(BaseModel):
    lever_id: str
    name: str
    consequences: str
    options: List[str]
    review: str
    deduplication_justification: str
    description: str
    synergy_text: str
    conflict_text: str


# --- Prompt ---
ENRICH_LEVERS_SYSTEM_PROMPT = """
You are an expert systems analyst and strategist. Your task is to enrich a list of strategic levers by characterizing their role within the broader system of all levers for a project.

Goal: For each lever provided in the current batch, generate a description, a synergy_text, and a conflict_text.

Full Context: You will be given the overall project plan and the FULL list of ALL levers for context. Analyze each lever in the batch against this full list.

Output Requirements (for each lever in the batch):
1) description (80–100 words)
2) synergy_text (40–60 words; name specific levers)
3) conflict_text (40–60 words; name specific levers)

Respond with a single JSON object that strictly adheres to the BatchCharacterizationResult schema. Provide a full characterization for every lever in the batch.
""".strip()


@dataclass
class EnrichPotentialLevers:
    characterized_levers: List[CharacterizedLever]
    metadata: List[Dict[str, Any]]

    @classmethod
    def execute(
        cls,
        llm_executor: LLMExecutor,
        project_context: str,
        raw_levers_list: list[dict],
        reasoning_effort: str,
    ) -> "EnrichPotentialLevers":
        try:
            input_levers = [InputLever(**lever) for lever in raw_levers_list]
        except ValidationError as e:
            raise ValueError(f"Invalid input lever data: {e}")

        if not input_levers:
            raise ValueError("The list of levers to characterize cannot be empty.")

        logger.info(f"Characterizing {len(input_levers)} levers in batches of {BATCH_SIZE}.")

        # Map lever_id -> initial dict (to be enriched)
        enriched_levers_map: Dict[str, Dict[str, Any]] = {
            lever.lever_id: lever.model_dump() for lever in input_levers
        }

        # Full list context for cross-references
        all_levers_for_context = [lever.model_dump() for lever in input_levers]
        all_metadata: List[Dict[str, Any]] = []

        # Build batches
        for i in range(0, len(input_levers), BATCH_SIZE):
            batch = input_levers[i : i + BATCH_SIZE]

            # Build user prompt JSON payload
            batch_payload = json.dumps(
                {
                    "project_plan": project_context,
                    "all_levers": all_levers_for_context,
                    "batch": [lever.model_dump() for lever in batch],
                },
                indent=2,
            )

            chat_message_list = [
                ChatMessage(role=MessageRole.SYSTEM, content=ENRICH_LEVERS_SYSTEM_PROMPT),
                ChatMessage(role=MessageRole.USER, content=batch_payload),
            ]

            def execute_function(llm: LLM) -> dict:
                sllm = llm.as_structured_llm(BatchCharacterizationResult)
                chat_response = sllm.chat(chat_message_list)
                metadata = dict(llm.metadata)
                metadata["llm_classname"] = llm.class_name()
                return {"chat_response": chat_response, "metadata": metadata}

            try:
                result = llm_executor.run(execute_function)
                batch_result: BatchCharacterizationResult = result["chat_response"].raw
                all_metadata.append(result["metadata"])

                # Merge results
                for char in batch_result.characterizations:
                    if char.lever_id in enriched_levers_map:
                        enriched_levers_map[char.lever_id].update(
                            {
                                "description": char.description,
                                "synergy_text": char.synergy_text,
                                "conflict_text": char.conflict_text,
                            }
                        )
                    else:
                        logger.warning(
                            f"LLM returned characterization for an unknown lever_id: '{char.lever_id}'"
                        )
            except PipelineStopRequested:
                raise
            except Exception as e:
                lever_ids = [lever.lever_id for lever in batch]
                logger.error(
                    f"LLM batch interaction failed for levers {lever_ids}.",
                    exc_info=True,
                )
                raise ValueError("LLM batch interaction failed.") from e

        final_characterized_levers: List[CharacterizedLever] = []
        for lever_id, data in enriched_levers_map.items():
            missing = [k for k in ("description", "synergy_text", "conflict_text") if k not in data]
            if missing:
                logger.error(
                    f"Characterization incomplete for lever '{lever_id}' (missing: {missing}). Skipping."
                )
                continue
            try:
                final_characterized_levers.append(CharacterizedLever(**data))
            except ValidationError as e:
                logger.error(
                    f"Pydantic validation failed for characterized lever '{lever_id}'. Error: {e}"
                )

        # v0.4.5: Validate that at least some levers were successfully characterized
        if not final_characterized_levers:
            raise ValueError(
                f"All lever characterizations failed. "
                f"Expected {len(enriched_levers_map)} levers but got 0. "
                f"Check LLM batch interaction logs for errors. "
                f"Batches processed: {len(all_metadata)}"
            )

        return cls(characterized_levers=final_characterized_levers, metadata=all_metadata)

    def to_dict(self, include_metadata: bool = True) -> dict:
        # Align key with downstream readers and tests
        data = {"characterized_levers": [lever.model_dump() for lever in self.characterized_levers]}
        if include_metadata:
            data["metadata"] = self.metadata
        return data

    def to_clean_json(self) -> str:
        return json.dumps([lever.model_dump() for lever in self.characterized_levers], indent=2)

    def save_raw(self, file_path: str) -> None:
        output_data = {
            "metadata": self.metadata,
            "characterized_levers": [lever.model_dump() for lever in self.characterized_levers],
        }
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2)


if __name__ == "__main__":
    # Lightweight manual runner (expects test data prepared by prior step)
    import os
    from planexe.llm_util.llm_executor import LLMModelFromName
    from planexe.prompt.prompt_catalog import PromptCatalog

    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

    prompt_catalog = PromptCatalog()
    prompt_catalog.load_simple_plan_prompts()

    prompt_id = "19dc0718-3df7-48e3-b06d-e2c664ecc07d"
    prompt_item = prompt_catalog.find(prompt_id)
    if not prompt_item:
        raise ValueError("Prompt item not found.")
    project_plan = prompt_item.prompt

    input_file = os.path.join(os.path.dirname(__file__), "test_data", f"deduplicate_levers_{prompt_id}.json")
    output_file = f"enrich_potential_levers_{prompt_id}.json"

    if not os.path.exists(input_file):
        logger.error(f"Input data file not found at: {input_file}")
        raise SystemExit(1)

    with open(input_file, "r", encoding="utf-8") as f:
        input_levers = json.load(f)

    model_names = ["ollama-llama3.1"]
    llm_models = LLMModelFromName.from_names(model_names)
    llm_executor = LLMExecutor(llm_models=llm_models)

    result = EnrichPotentialLevers.execute(
        llm_executor=llm_executor,
        project_context=project_plan,
        raw_levers_list=input_levers,
    )

    print(f"\nSuccessfully processed. Characterized {len(result.characterized_levers)} out of {len(input_levers)} levers.")
    if not result.characterized_levers:
        raise ValueError("No levers were successfully characterized.")

    result.save_raw(output_file)
    logger.info(
        f"Full list of {len(result.characterized_levers)} characterized levers saved to '{output_file}'."
    )

