# Author: Cascade
# Date: 2025-10-25T17:30:00Z
# PURPOSE: Convert LLM-generated pitch JSON into markdown using the centralized SimpleOpenAILLM adapter, applying formatting guards and fallbacks for missing delimiters or empty output.
# SRP and DRY check: Pass. This module encapsulates pitch-to-markdown conversion logic while delegating LLM interfacing to shared utilities.
"""
Convert the raw json pitch to a markdown document.

PROMPT> python -m planexe.pitch.convert_pitch_to_markdown
"""
import os
import json
import time
import logging
from math import ceil
from typing import Optional, Any
from dataclasses import dataclass

from planexe.format_json_for_use_in_query import format_json_for_use_in_query
from planexe.markdown_util.fix_bullet_lists import fix_bullet_lists
from planexe.llm_util.simple_openai_llm import SimpleChatMessage, SimpleMessageRole

logger = logging.getLogger(__name__)

CONVERT_PITCH_TO_MARKDOWN_SYSTEM_PROMPT = """
You are a content formatter designed to transform project pitches into compelling and easily scannable Markdown documents. Your ONLY task is to generate the Markdown document itself, and NOTHING ELSE.

# Output Requirements:
- ABSOLUTELY NO INTRODUCTORY OR CONCLUDING TEXT. Do NOT add any extra sentences or paragraphs before or after the Markdown document.
- Enclose the ENTIRE Markdown document within the following delimiters:
    - **Start Delimiter:** [START_MARKDOWN]
    - **End DelIMITER:** [END_MARKDOWN]
- Use ONLY the provided text. Do NOT add any external information.

# Markdown Formatting Instructions:
- **Headings:** Use only two levels of headings:
    - Top-level heading for the document title: `# Top Level Heading`
    - Second-level headings for section titles: `## Section Title`
    - DO NOT use any heading levels beyond these two.
- **Document Structure:**
    - The input JSON may contain minimal content or multiple topics.
    - If multiple topics are present, organize them into logical sections. Suggested section names include (but are not limited to): Introduction, Project Overview, Goals and Objectives, Risks and Mitigation Strategies, Metrics for Success, Stakeholder Benefits, Ethical Considerations, Collaboration Opportunities, and Long-term Vision.
    - If the input JSON is minimal, include only the sections that are directly supported by the provided content. Do not invent or add sections that are not referenced in the input.
- **Lists:** Format lists with Markdown bullet points using a hyphen followed by a space:
    ```markdown
    - Item 1
    - Item 2
    - Item 3
    ```
- **Strategic Bolding:** Bold key project elements, critical actions, and desired outcomes to enhance scannability. For example, bold terms such as **innovation**, **efficiency**, **sustainability**, and **collaboration**. Ensure that each section contains at least one bolded key term where applicable.
- **Expansion:** Expand on the provided content with additional explanatory paragraphs where needed, but do NOT add information that is not present in the input.
- **Delimiters Enforcement:** Ensure that the entire Markdown document is wrapped exactly within [START_MARKDOWN] and [END_MARKDOWN] with no additional text outside these delimiters.
- Ensure that all topics present in the input JSON are covered and organized in a clear, readable format.
"""

@dataclass
class ConvertPitchToMarkdown:
    system_prompt: Optional[str]
    user_prompt: str
    response: str
    markdown: str
    metadata: dict

    @classmethod
    def execute(cls, llm: Any, user_prompt: str) -> 'ConvertPitchToMarkdown':
        """
        Invoke LLM with a json document that is the raw pitch.
        """
        if not hasattr(llm, "chat") or not hasattr(llm, "metadata"):
            raise ValueError("Invalid LLM instance: missing chat() or metadata attributes.")
        if not isinstance(user_prompt, str):
            raise ValueError("Invalid query.")

        system_prompt = CONVERT_PITCH_TO_MARKDOWN_SYSTEM_PROMPT.strip()
        chat_message_list = [
            SimpleChatMessage(role=SimpleMessageRole.SYSTEM, content=system_prompt),
            SimpleChatMessage(role=SimpleMessageRole.USER, content=user_prompt),
        ]
        
        logger.debug(f"User Prompt:\n{user_prompt}")

        logger.debug("Starting LLM chat interaction.")
        start_time = time.perf_counter()
        chat_response = llm.chat(chat_message_list)
        end_time = time.perf_counter()
        duration = int(ceil(end_time - start_time))
        response_content = ""

        if isinstance(chat_response, str):
            response_content = chat_response
        elif getattr(chat_response, "message", None) and getattr(chat_response.message, "content", None) is not None:
            response_content = chat_response.message.content
        elif getattr(chat_response, "content", None) is not None:
            response_content = chat_response.content
        else:
            response_content = str(chat_response)

        response_byte_count = len(response_content.encode("utf-8"))
        logger.info(
            "LLM chat interaction completed in %s seconds. Response byte count: %s",
            duration,
            response_byte_count,
        )

        metadata = dict(llm.metadata)
        metadata["llm_classname"] = llm.class_name()
        metadata["duration"] = duration
        metadata["response_byte_count"] = response_byte_count

        start_delimiter = "[START_MARKDOWN]"
        end_delimiter = "[END_MARKDOWN]"

        start_index = response_content.find(start_delimiter)
        end_index = response_content.find(end_delimiter)

        if start_index != -1 and end_index != -1:
            markdown_content = response_content[start_index + len(start_delimiter):end_index].strip()
        else:
            markdown_content = response_content  # Use the entire content if delimiters are missing
            logger.warning("Output delimiters not found in LLM response.")

        if not markdown_content.strip():
            logger.error("LLM returned empty markdown content; using fallback summary.")
            fallback_body = user_prompt.strip()
            markdown_content = (
                "# Pitch Summary\n\n"
                "The language model returned no formatted markdown. Displaying the raw pitch content instead:\n\n"
                f"```text\n{fallback_body}\n```"
            )

        # The bullet lists are supposed to be preceded by 2 newlines. 
        # However often there is just 1 newline. 
        # This fix makes sure there are 2 newlines before bullet lists.
        markdown_content = fix_bullet_lists(markdown_content)

        json_response = {}
        json_response['response_content'] = response_content
        json_response['markdown'] = markdown_content

        result = ConvertPitchToMarkdown(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response=json_response,
            markdown=markdown_content,
            metadata=metadata,
        )
        logger.debug("CleanupPitch instance created successfully.")
        return result    

    def to_dict(self, include_metadata=True, include_system_prompt=True, include_user_prompt=True) -> dict:
        d = self.response.copy()
        d['markdown'] = self.markdown
        if include_metadata:
            d['metadata'] = self.metadata
        if include_system_prompt:
            d['system_prompt'] = self.system_prompt
        if include_user_prompt:
            d['user_prompt'] = self.user_prompt
        return d

    def save_raw(self, file_path: str) -> None:
        with open(file_path, 'w') as f:
            f.write(json.dumps(self.to_dict(), indent=2))

    def save_markdown(self, file_path: str) -> None:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(self.markdown)
    
if __name__ == "__main__":
    from planexe.llm_factory import get_llm

    basepath = os.path.join(os.path.dirname(__file__), 'test_data')

    def load_json(relative_path: str) -> dict:
        path = os.path.join(basepath, relative_path)
        print(f"loading file: {path}")
        with open(path, 'r', encoding='utf-8') as f:
            the_json = json.load(f)
        return the_json

    pitch_json = load_json('lunar_base-pitch.json')

    model_name = "ollama-llama3.1"
    # model_name = "ollama-qwen2.5-coder"
    llm = get_llm(model_name)

    query = format_json_for_use_in_query(pitch_json)
    print(f"Query: {query}")
    result = ConvertPitchToMarkdown.execute(llm, query)

    print("\nResponse:")
    json_response = result.to_dict(include_system_prompt=False, include_user_prompt=False)
    print(json.dumps(json_response, indent=2))

    print(f"\n\nMarkdown:\n{result.markdown}")
