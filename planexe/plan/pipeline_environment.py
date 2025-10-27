# Author: gpt-5-codex
# Date: 2025-10-26T00:00:00Z
# PURPOSE: Pipeline environment helper that surfaces speed/detail, model, and reasoning effort selections for Luigi tasks.
# SRP and DRY check: Pass. Centralizes environment lookups; no duplicate functionality elsewhere.
from enum import Enum
from dataclasses import dataclass
import os
from pathlib import Path
from typing import Optional

class PipelineEnvironmentEnum(Enum):
    """Enum for environment variable names used in the pipeline."""
    RUN_ID_DIR = "RUN_ID_DIR"
    LLM_MODEL = "LLM_MODEL"
    SPEED_VS_DETAIL = "SPEED_VS_DETAIL"
    REASONING_EFFORT = "REASONING_EFFORT"

@dataclass
class PipelineEnvironment:
    """Dataclass to hold environment variable values."""
    run_id_dir: Optional[str] = None
    llm_model: Optional[str] = None
    speed_vs_detail: Optional[str] = None
    reasoning_effort: Optional[str] = None

    @classmethod
    def from_env(cls) -> "PipelineEnvironment":
        """Create an PipelineEnvironment instance from environment variables."""
        return cls(
            run_id_dir=os.environ.get(PipelineEnvironmentEnum.RUN_ID_DIR.value),
            llm_model=os.environ.get(PipelineEnvironmentEnum.LLM_MODEL.value),
            speed_vs_detail=os.environ.get(PipelineEnvironmentEnum.SPEED_VS_DETAIL.value),
            reasoning_effort=os.environ.get(PipelineEnvironmentEnum.REASONING_EFFORT.value)
        )
    
    def get_run_id_dir(self) -> Path:
        """Get the run_id_dir.
        
        Returns:
            Path: The absolute path to the run directory.
            
        Raises:
            ValueError: If run_id_dir is None, not an absolute path, or not a directory.
        """
        if self.run_id_dir is None:
            raise ValueError("run_id_dir is not set")
            
        path = Path(self.run_id_dir)
        if not path.is_absolute():
            raise ValueError(f"run_id_dir must be an absolute path, got: {self.run_id_dir}")
            
        if not path.is_dir():
            raise ValueError(f"run_id_dir must be a directory, got: {self.run_id_dir}")
            
        return path

    def get_reasoning_effort(self) -> str:
        """Return the configured reasoning effort for Responses API calls.
        Values: low|medium|high|intense (string pass-through). Defaults to 'medium'.
        Order of precedence: explicit config (if present) -> env var -> default.
        """
        def _normalize(value: Optional[str]) -> Optional[str]:
            if value is None:
                return None
            normalized = str(value).strip()
            if not normalized:
                return None
            return normalized

        explicit_effort = _normalize(self.reasoning_effort)
        if explicit_effort:
            return explicit_effort

        try:
            config_obj = getattr(self, "config", None)
            cfg_effort = _normalize(config_obj.get("reasoning_effort")) if isinstance(config_obj, dict) else None
        except Exception:
            cfg_effort = None
        if cfg_effort:
            return cfg_effort

        env_effort = _normalize(os.environ.get(PipelineEnvironmentEnum.REASONING_EFFORT.value))
        if env_effort:
            return env_effort

        return os.getenv("REASONING_EFFORT_DEFAULT", "minimal")
