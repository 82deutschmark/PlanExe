# Author: gpt-5-codex
# Date: 2025-03-10T00:00:00Z
# PURPOSE: Gather expert criticism using SimpleOpenAILLM structured outputs, removing legacy llama-index dependencies.
# SRP and DRY check: Pass. Module handles expert critique generation only and leverages shared messaging helpers.
"""
PROMPT> python -m planexe.expert.expert_criticism

Ask a specific expert about something, and get criticism back or constructive feedback.
"""
import json
import time
from math import ceil
from typing import Any, Optional
from dataclasses import dataclass
from pydantic import BaseModel, Field

from planexe.llm_util.simple_openai_llm import SimpleChatMessage, SimpleMessageRole

class NegativeFeedbackItem(BaseModel):
    """Individual feedback item with lenient field handling."""
    model_config = {"extra": "ignore"}  # Ignore extra fields from creative LLMs

    feedback_index: int = Field(description="Incrementing index, such as 1, 2, 3, 4, 5.")
    feedback_title: str = Field(description="Constructive criticism. What is the problem?")
    feedback_verbose: str = Field(description="Elaborate on the criticism. Provide more context and details.")
    feedback_problem_tags: list[str] = Field(description="Short identifiers that describe the problem.")
    feedback_mitigation: str = Field(description="Mitigation plan.")
    feedback_consequence: str = Field(description="Without mitigation what are the consequences.")
    feedback_root_cause: str = Field(description="Possible root cause.")

class ExpertConsultation(BaseModel):
    """
    Expert consultation response schema with lenient field handling.
    Accepts extra fields from LLMs to prevent schema validation failures.
    """
    model_config = {"extra": "ignore"}  # Ignore extra fields, don't fail on them

    negative_feedback_list: list[NegativeFeedbackItem] = Field(description="Your negative feedback.")
    user_primary_actions: list[str] = Field(description="List of actionable steps the user MUST take.")
    user_secondary_actions: list[str] = Field(description="List of actionable steps the user should take.")
    follow_up_consultation: str = Field(description="What to talk about in the next consultation.")

EXPERT_CRITICISM_SYSTEM_PROMPT = """
You are acting as a highly experienced:
PLACEHOLDER_ROLE

Your areas of deep knowledge include:
PLACEHOLDER_KNOWLEDGE

You possess the following key skills:
PLACEHOLDER_SKILLS

From your perspective, please analyze the provided document.

The client may be off track, provide help to get back on track.

The "negative_feedback_list" must contain 3 items.

Provide a detailed list of actions that the client must take to address the issues you identify.

In the "feedback_mitigation" field, provide a mitigation plan for each issue.
How can this be improved? Who to consult? What to read? What data to provide?

Be brutally direct and provide actionable advice based on your expertise.

Be skeptical. There may be deeper unresolved problems and root causes.

Focus specifically on areas where your expertise can offer unique insights and actionable advice.
"""

@dataclass
class ExpertCriticism:
    """
    Ask an expert advise about a topic, and get criticism back.
    """
    query: str
    response: dict
    metadata: dict
    feedback_list: list[dict]
    primary_actions: list[str]
    secondary_actions: list[str]
    follow_up: str

    @classmethod
    def format_system(cls, expert: dict) -> str:
        if not isinstance(expert, dict):
            raise ValueError("Invalid expert.")

        query = EXPERT_CRITICISM_SYSTEM_PROMPT.strip()
        role = expert.get('title', 'No role specified')
        knowledge = expert.get('knowledge', 'No knowledge specified')
        skills = expert.get('skills', 'No skills specified')

        query = query.replace("PLACEHOLDER_ROLE", role)
        query = query.replace("PLACEHOLDER_KNOWLEDGE", knowledge)
        query = query.replace("PLACEHOLDER_SKILLS", skills)
        return query

    @classmethod
    def format_query(cls, document_title: str, document_content: str) -> str:
        if not isinstance(document_title, str):
            raise ValueError("Invalid document_title.")
        if not isinstance(document_content, str):
            raise ValueError("Invalid document_content.")

        query = f"""
{document_title}:
{document_content}
"""
        return query

    @classmethod
    def execute(cls, llm: Any, query: str, system_prompt: Optional[str]) -> 'ExpertCriticism':
        """
        Invoke LLM to get advise from the expert.
        """
        if not hasattr(llm, "as_structured_llm"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm().")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")

        chat_message_list = []
        if system_prompt:
            chat_message_list.append(
                SimpleChatMessage(
                    role=SimpleMessageRole.SYSTEM,
                    content=system_prompt,
                )
            )

        chat_message_user = SimpleChatMessage(
            role=SimpleMessageRole.USER,
            content=query,
        )
        chat_message_list.append(chat_message_user)

        start_time = time.perf_counter()

        sllm = llm.as_structured_llm(ExpertConsultation)
        chat_response = sllm.chat(chat_message_list)
        json_response = chat_response.raw.model_dump()

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata = dict(getattr(llm, "metadata", {}))
        metadata["llm_classname"] = getattr(llm, "class_name", lambda: llm.__class__.__name__)()
        metadata["duration"] = duration

        # Cleanup the json response from the LLM model - be lenient with missing fields
        result_feedback_list = []
        negative_feedback = json_response.get('negative_feedback_list', [])

        # Handle case where negative_feedback_list might be missing or None
        if negative_feedback is None:
            negative_feedback = []

        for item in negative_feedback:
            # Be lenient - accept dict or object, handle missing fields gracefully
            if hasattr(item, 'get'):
                # It's already a dict
                d = {
                    'title': item.get('feedback_title', ''),
                    'verbose': item.get('feedback_verbose', ''),
                    'tags': item.get('feedback_problem_tags', []),
                    'mitigation': item.get('feedback_mitigation', ''),
                    'consequence': item.get('feedback_consequence', ''),
                    'root_cause': item.get('feedback_root_cause', ''),
                }
            else:
                # It's an object, use getattr
                d = {
                    'title': getattr(item, 'feedback_title', ''),
                    'verbose': getattr(item, 'feedback_verbose', ''),
                    'tags': getattr(item, 'feedback_problem_tags', []),
                    'mitigation': getattr(item, 'feedback_mitigation', ''),
                    'consequence': getattr(item, 'feedback_consequence', ''),
                    'root_cause': getattr(item, 'feedback_root_cause', ''),
                }
            result_feedback_list.append(d)

        result = ExpertCriticism(
            query=query,
            response=json_response,
            metadata=metadata,
            feedback_list=result_feedback_list,
            primary_actions=json_response.get('user_primary_actions', []),
            secondary_actions=json_response.get('user_secondary_actions', []),
            follow_up=json_response.get('follow_up_consultation', '')
        )
        return result    

    @classmethod
    async def aexecute(cls, llm: Any, query: str, system_prompt: Optional[str]) -> 'ExpertCriticism':
        """
        Async version of execute - invoke LLM to get advise from the expert.
        """
        if not hasattr(llm, "as_structured_llm"):
            raise ValueError("Invalid LLM instance: missing as_structured_llm().")
        if not isinstance(query, str):
            raise ValueError("Invalid query.")

        chat_message_list = []
        if system_prompt:
            chat_message_list.append(
                SimpleChatMessage(
                    role=SimpleMessageRole.SYSTEM,
                    content=system_prompt,
                )
            )

        chat_message_user = SimpleChatMessage(
            role=SimpleMessageRole.USER,
            content=query,
        )
        chat_message_list.append(chat_message_user)

        start_time = time.perf_counter()

        sllm = llm.as_structured_llm(ExpertConsultation)
        # Use async chat method
        chat_response = await sllm.achat(chat_message_list)
        json_response = chat_response.raw.model_dump()

        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))

        metadata = dict(getattr(llm, "metadata", {}))
        metadata["llm_classname"] = getattr(llm, "class_name", lambda: llm.__class__.__name__)()
        metadata["duration"] = duration

        # Cleanup the json response from the LLM model - be lenient with missing fields
        result_feedback_list = []
        negative_feedback = json_response.get('negative_feedback_list', [])

        # Handle case where negative_feedback_list might be missing or None
        if negative_feedback is None:
            negative_feedback = []

        for item in negative_feedback:
            # Be lenient - accept dict or object, handle missing fields gracefully
            if hasattr(item, 'get'):
                # It's already a dict
                d = {
                    'title': item.get('feedback_title', ''),
                    'verbose': item.get('feedback_verbose', ''),
                    'tags': item.get('feedback_problem_tags', []),
                    'mitigation': item.get('feedback_mitigation', ''),
                    'consequence': item.get('feedback_consequence', ''),
                    'root_cause': item.get('feedback_root_cause', ''),
                }
            else:
                # It's an object, use getattr
                d = {
                    'title': getattr(item, 'feedback_title', ''),
                    'verbose': getattr(item, 'feedback_verbose', ''),
                    'tags': getattr(item, 'feedback_problem_tags', []),
                    'mitigation': getattr(item, 'feedback_mitigation', ''),
                    'consequence': getattr(item, 'feedback_consequence', ''),
                    'root_cause': getattr(item, 'feedback_root_cause', ''),
                }
            result_feedback_list.append(d)

        result = ExpertCriticism(
            query=query,
            response=json_response,
            metadata=metadata,
            feedback_list=result_feedback_list,
            primary_actions=json_response.get('user_primary_actions', []),
            secondary_actions=json_response.get('user_secondary_actions', []),
            follow_up=json_response.get('follow_up_consultation', '')
        )
        return result    

    def to_dict(self, include_metadata=True, include_query=True) -> dict:
        d = self.response.copy()
        if include_metadata:
            d['metadata'] = self.metadata
        if include_query:
            d['query'] = self.query
        return d
    
    def save_raw(self, file_path: str) -> None:
        with open(file_path, 'w') as f:
            f.write(json.dumps(self.to_dict(), indent=2))

if __name__ == "__main__":
    from planexe.llm_factory import get_llm
    import os

    path1 = os.path.join(os.path.dirname(__file__), 'test_data', 'solarfarm_swot_analysis.md')
    path2 = os.path.join(os.path.dirname(__file__), 'test_data', 'solarfarm_expert_list.json')

    with open(path1, 'r', encoding='utf-8') as f:
        swot_markdown = f.read()

    with open(path2, 'r', encoding='utf-8') as f:
        expert_list_json = json.load(f)

    expert = expert_list_json[5]
    expert.pop('id')
    system_prompt = ExpertCriticism.format_system(expert)
    query = ExpertCriticism.format_query("SWOT Analysis", swot_markdown)

    llm = get_llm("ollama-llama3.1")
    # llm = get_llm("deepseek-chat")

    print(f"System: {system_prompt}")
    print(f"\n\nQuery: {query}")
    result = ExpertCriticism.execute(llm, query, system_prompt)

    print("\n\nResponse:")
    print(json.dumps(result.to_dict(include_query=False), indent=2))

    print("\n\nFeedback:")
    print(json.dumps(result.feedback_list, indent=2))
