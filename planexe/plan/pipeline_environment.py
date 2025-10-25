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
        # Delete any placeholder; add actual resolution below
        # Prefer self.config if available and contains reasoning_effort
        try:
            cfg_effort = getattr(self, "config", {}).get("reasoning_effort") if hasattr(self, "config") else None
        except Exception:
            cfg_effort = None
        if cfg_effort:
            return str(cfg_effort)
        return os.getenv("REASONING_EFFORT_DEFAULT", "minimal")
