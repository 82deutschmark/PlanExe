"""
Load PlanExe's .env file, containing secrets such as API keys, like: OPENROUTER_API_KEY.

PROMPT> python -m planexe.utils.planexe_dotenv
"""
from dataclasses import dataclass
import os
from pathlib import Path
from typing import Optional
from dotenv import dotenv_values
import logging
from planexe.utils.planexe_config import PlanExeConfig, PlanExeConfigError
from enum import Enum

logger = logging.getLogger(__name__)

class DotEnvKeyEnum(str, Enum):
    PATH_TO_PYTHON = "PATH_TO_PYTHON"
    PLANEXE_RUN_DIR = "PLANEXE_RUN_DIR"

@dataclass
class PlanExeDotEnv:
    dotenv_path: Path
    dotenv_dict: dict[str, str]

    @classmethod
    def load(cls):
        config = PlanExeConfig.load()
        if config.dotenv_path is None:
            raise PlanExeConfigError("Required configuration file '.env' was not found. Cannot create a PlanExeDotEnv instance.")
        dotenv_path = config.dotenv_path
        env_before = os.environ.copy()
        dotenv_dict = dotenv_values(dotenv_path=dotenv_path)
        if env_before != os.environ:
            logger.error("PlanExeDotEnv.load() The dotenv_values() modified the environment variables. My assumption is that it doesn't do that. If you see this, please report it as a bug.")
            logger.error(f"PlanExeDotEnv.load() The dotenv_values() modified the environment variables. count before: {len(env_before)}, count after: {len(os.environ)}")
            logger.error(f"PlanExeDotEnv.load() The dotenv_values() modified the environment variables. content before: {env_before!r}, content after: {os.environ!r}")
        else:
            logger.debug(f"PlanExeDotEnv.load() Great!This is what is expected. The dotenv_values() did not modify the environment variables. number of items: {len(os.environ)}")
        return cls(
            dotenv_path=dotenv_path, 
            dotenv_dict=dotenv_dict
        )

    def get(self, key: str) -> Optional[str]:
        return self.dotenv_dict.get(key)

    def get_absolute_path_to_file(self, key: str) -> Optional[Path]:
        """
        Resolves and validates the "key" variable.
        It's expected to be an absolute path to a file.
        If the key is not found, returns None.
        
        :return: A Path object if valid, otherwise None.
        """
        path_str = self.dotenv_dict.get(key)
        if path_str is None:
            logger.debug(f"{key} is not set")
            return None
            
        try:
            path_obj = Path(path_str)
        except Exception as e: # If path_str is bizarre
            logger.error(f"Invalid {key} string '{path_str!r}': {e!r}")
            return None
        if not path_obj.is_absolute():
            logger.error(f"{key} must be an absolute path: {path_obj!r}")
            return None
        if not path_obj.is_file():
            logger.error(f"{key} must be a file: {path_obj!r}")
            return None
        logger.debug(f"Using {key}: {path_obj!r}")
        return path_obj

    def get_absolute_path_to_dir(self, key: str) -> Optional[Path]:
        """
        Resolves and validates the "key" variable.
        It's expected to be an absolute path to a directory.
        If the key is not found, returns None.
        
        :return: A Path object if valid, otherwise None.
        """
        path_str = self.dotenv_dict.get(key)
        if path_str is None:
            logger.debug(f"{key} is not set")
            return None
            
        try:
            path_obj = Path(path_str)
        except Exception as e: # If path_str is bizarre
            logger.error(f"Invalid {key} string '{path_str!r}': {e!r}")
            return None
        if not path_obj.is_absolute():
            logger.error(f"{key} must be an absolute path: {path_obj!r}")
            return None
        if not path_obj.is_dir():
            logger.error(f"{key} must be a directory: {path_obj!r}")
            return None
        logger.debug(f"Using {key}: {path_obj!r}")
        return path_obj

    def __repr__(self):
        return f"PlanExeDotEnv(dotenv_path={self.dotenv_path!r}, dotenv_dict.keys()={self.dotenv_dict.keys()!r})"

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    dotenv = PlanExeDotEnv.load()
    print(dotenv)

    path_dir0 = dotenv.get_absolute_path_to_dir("SOME_DIR")
    print(f"DIR BEFORE: {path_dir0!r}")
    dotenv.dotenv_dict["SOME_DIR"] = "/tmp"
    path_dir1 = dotenv.get_absolute_path_to_dir("SOME_DIR")
    print(f"DIR AFTER: {path_dir1!r}")

    path_file0 = dotenv.get_absolute_path_to_file("SOME_FILE")
    print(f"FILE BEFORE: {path_file0!r}")
    dotenv.dotenv_dict["SOME_FILE"] = "/bin/sh"
    path_file1 = dotenv.get_absolute_path_to_file("SOME_FILE")
    print(f"FILE AFTER: {path_file1!r}")
