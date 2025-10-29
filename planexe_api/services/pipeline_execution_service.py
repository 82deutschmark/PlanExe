# Author: Cascade
# Date: 2025-10-29T18:05:00Z
# PURPOSE: Manage Luigi pipeline execution, streaming telemetry to WebSocket clients,
#          coordinating subprocess lifecycle, and preparing run directories.
# SRP and DRY check: Pass – centralises execution orchestration without duplicating
#          WebSocket, database, or preflight file preparation logic that exists in
#          dedicated helpers elsewhere in the project.

"""Luigi pipeline execution service with streaming-aware telemetry forwarding.

The service extends the baseline execution flow to surface Responses API deltas to the
WebSocket clients without requiring additional subprocess hooks. It maintains the single
execution service design while layering stream-aware parsing on top of the existing
broadcast loop, building on contributions from Codex (GPT-4o CLI, 2025-10-02) and Claude
Code (Sonnet 4, 2025-09-27).
"""
import json
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple
import platform

from planexe_api.database import DatabaseService, PlanFile as DBPlanFile
from planexe_api.models import CreatePlanRequest, PlanStatus
from planexe_api.websocket_manager import websocket_manager
from planexe.plan.pipeline_environment import PipelineEnvironmentEnum
from planexe.plan.speedvsdetail import SpeedVsDetailEnum
from planexe.plan.filenames import FilenameEnum
from planexe.plan.start_time import StartTime
from planexe.plan.plan_file import PlanFile


def _utcnow() -> datetime:
    """Return a timezone-aware UTC datetime."""

    return datetime.now(timezone.utc)


def _utcnow_iso() -> str:
    """Return an ISO8601 string with timezone information."""

    return _utcnow().isoformat()

# Thread-safe process management (replaces global dictionary)
class ProcessRegistry:
    """Thread-safe registry for running subprocess references"""

    def __init__(self):
        self._processes: Dict[str, subprocess.Popen] = {}
        self._lock = threading.RLock()

    def register(self, plan_id: str, process: subprocess.Popen) -> None:
        with self._lock:
            self._processes[plan_id] = process

    def unregister(self, plan_id: str) -> Optional[subprocess.Popen]:
        with self._lock:
            return self._processes.pop(plan_id, None)

    def get(self, plan_id: str) -> Optional[subprocess.Popen]:
        with self._lock:
            return self._processes.get(plan_id)

# Thread-safe process registry (replaces global dictionary)
process_registry = ProcessRegistry()

# Pipeline configuration
MODULE_PATH_PIPELINE = "planexe.plan.run_plan_pipeline"


class PipelineExecutionService:
    """Service responsible for executing Luigi pipelines in background threads"""

    def __init__(self, planexe_project_root: Path):
        self.planexe_project_root = planexe_project_root

    @staticmethod
    def _normalise_speed_vs_detail(value: Optional[str]) -> str:
        """Coerce legacy or aliased speed/detail inputs to Luigi-compatible values."""

        if isinstance(value, SpeedVsDetailEnum):
            return value.value

        if value is None:
            return SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value

        token = str(value).strip()
        if not token:
            return SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value

        canonical_key = token.lower().replace("-", "_").replace(" ", "_")

        alias_map = {
            SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value: SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value,
            "all_details": SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value,
            "detailed": SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value,
            "slow": SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value,
            "balanced": SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value,
            "balanced_speed": SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value,
            "balanced_speed_and_detail": SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value,
            SpeedVsDetailEnum.FAST_BUT_SKIP_DETAILS.value: SpeedVsDetailEnum.FAST_BUT_SKIP_DETAILS.value,
            "fast": SpeedVsDetailEnum.FAST_BUT_SKIP_DETAILS.value,
            "fast_mode": SpeedVsDetailEnum.FAST_BUT_SKIP_DETAILS.value,
            "fastmode": SpeedVsDetailEnum.FAST_BUT_SKIP_DETAILS.value,
        }

        return alias_map.get(canonical_key, SpeedVsDetailEnum.ALL_DETAILS_BUT_SLOW.value)

    async def execute_plan(self, plan_id: str, request: CreatePlanRequest, db_service: DatabaseService) -> None:
        """
        Execute Luigi pipeline in background thread with WebSocket progress streaming

        Args:
            plan_id: Unique plan identifier
            request: Plan creation request with prompt and configuration
            db_service: Database service for persistence
        """
        print(f"DEBUG: Starting pipeline execution for plan_id: {plan_id}")

        try:
            # Get plan from database
            plan = db_service.get_plan(plan_id)
            if not plan:
                print(f"DEBUG: Plan not found in database: {plan_id}")
                return

            run_id_dir = Path(plan.output_dir)

            # Set up execution environment
            environment = self._setup_environment(plan_id, request, run_id_dir)

            # CRITICAL FIX: Delete ALL filesystem files before pipeline start
            # Luigi checks filesystem targets to determine task completion. If old output files
            # exist from previous runs, Luigi marks tasks as "already complete" and skips them,
            # causing instant pipeline completion without actually running any tasks.
            # This MUST happen before database reset to ensure both filesystem and DB are clean.
            try:
                if run_id_dir.exists():
                    file_count = len(list(run_id_dir.glob("*")))
                    print(f"DEBUG: Deleting {file_count} files from {run_id_dir} before rerun")
                    # Delete all files in the directory
                    for item in run_id_dir.glob("*"):
                        if item.is_file():
                            item.unlink()
                        elif item.is_dir():
                            shutil.rmtree(item)
                    print(f"DEBUG: Filesystem cleanup complete for {run_id_dir}")
                else:
                    print(f"DEBUG: Directory {run_id_dir} does not exist yet, will be created")
            except Exception as exc:
                error_msg = f"CRITICAL: Failed to clean filesystem for plan {plan_id}: {exc}"
                print(f"ERROR: {error_msg}")
                logger.error(error_msg)
                # Update plan status to failed
                try:
                    db_service.db.rollback()
                    db_service.update_plan(plan_id, {
                        "status": PlanStatus.failed.value,
                        "error_message": error_msg,
                    })
                except Exception as update_exc:
                    print(f"ERROR: Failed to update plan status: {update_exc}")
                # Broadcast failure via WebSocket
                await websocket_manager.broadcast_to_plan(plan_id, {
                    "type": "status",
                    "status": "failed",
                    "message": error_msg,
                    "timestamp": _utcnow_iso(),
                })
                return  # DO NOT START LUIGI - old files will cause instant completion

            # Reset database artefacts after filesystem is clean
            # CRITICAL: This MUST succeed or Luigi will find old DB content and think tasks are complete
            try:
                db_service.reset_plan_run_state(plan_id)
                print(f"DEBUG: Cleared database artefacts for plan {plan_id} before rerun")
            except Exception as exc:
                error_msg = f"CRITICAL: Failed to reset stored artefacts for plan {plan_id}: {exc}"
                print(f"ERROR: {error_msg}")
                logger.error(error_msg)
                # Update plan status to failed
                try:
                    db_service.db.rollback()
                    db_service.update_plan(plan_id, {
                        "status": PlanStatus.failed.value,
                        "error_message": error_msg,
                    })
                except Exception as update_exc:
                    print(f"ERROR: Failed to update plan status: {update_exc}")
                # Broadcast failure via WebSocket
                await websocket_manager.broadcast_to_plan(plan_id, {
                    "type": "status",
                    "status": "failed",
                    "message": error_msg,
                    "timestamp": _utcnow_iso(),
                })
                return  # DO NOT START LUIGI - old content will cause instant completion

            # Safety check: verify database connectivity before spawning Luigi
            db_url = environment.get("DATABASE_URL")
            if not db_url or not self._verify_database_connectivity(db_url):
                error_msg = "Database connectivity check failed before starting pipeline"
                print(f"ERROR DB: {error_msg}")
                db_service.update_plan(plan_id, {
                    "status": PlanStatus.failed.value,
                    "error_message": error_msg,
                })
                await websocket_manager.broadcast_to_plan(plan_id, {
                    "type": "status",
                    "status": "failed",
                    "message": error_msg,
                    "timestamp": _utcnow_iso(),
                })
                return

            # Write pipeline input files
            self._write_pipeline_inputs(plan_id, run_id_dir, request, db_service)

            # Update plan status to running and broadcast
            db_service.update_plan(plan_id, {
                "status": PlanStatus.running.value,
                "progress_percentage": 0,
                "progress_message": "Starting plan generation pipeline...",
                "started_at": _utcnow()
            })

            # Broadcast initial status via WebSocket
            await websocket_manager.broadcast_to_plan(plan_id, {
                "type": "status",
                "status": "running",
                "message": "Starting plan generation pipeline...",
                "progress_percentage": 0,
                "timestamp": _utcnow_iso()
            })

            # Start Luigi subprocess
            process = self._start_luigi_subprocess(plan_id, environment, db_service)
            if not process:
                return

            # Monitor process execution with WebSocket streaming
            await self._monitor_process_execution(plan_id, process, run_id_dir, db_service)

        except Exception as e:
            print(f"DEBUG: Pipeline execution failed for {plan_id}: {e}")
            db_service.update_plan(plan_id, {
                "status": PlanStatus.failed.value,
                "error_message": f"Pipeline execution failed: {str(e)}"
            })
            # Broadcast error via WebSocket
            await websocket_manager.broadcast_to_plan(plan_id, {
                "type": "status",
                "status": "failed",
                "message": f"Pipeline execution failed: {str(e)}",
                "timestamp": _utcnow_iso()
            })
        finally:
            # Clean up resources
            await self._cleanup_execution(plan_id)

    def _setup_environment(self, plan_id: str, request: CreatePlanRequest, run_id_dir: Path) -> Dict[str, str]:
        """Set up environment variables for Luigi pipeline execution"""
        print(f"DEBUG ENV: Starting environment setup for plan {plan_id}")

        # CRITICAL: Validate required API keys BEFORE subprocess creation
        required_keys = {
            "OPENAI_API_KEY": "OpenAI API calls",
        }

        # Start from current environment so we can augment with request-supplied credentials
        environment = os.environ.copy()

        available_keys = []
        missing_keys = []
        for key, purpose in required_keys.items():
            value = environment.get(key)
            if not value:
                missing_keys.append(f"{key} (needed for {purpose})")
                print(f"  [MISSING] {key}: NOT FOUND in execution environment")
            else:
                available_keys.append(key)
                print(f"  [OK] {key}: Available (length: {len(value)})")

        if not available_keys:
            error_msg = "No API keys available. OPENAI_API_KEY is required for plan execution."
            print(f"ERROR ENV: {error_msg}")
            raise ValueError(error_msg)

        print(f"INFO ENV: {len(available_keys)} API provider(s) available: {', '.join(available_keys)}")

        # Check API keys in current environment
        api_keys_to_check = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
        print("DEBUG ENV: API keys in execution environment:")
        for key in api_keys_to_check:
            value = environment.get(key)
            if value:
                print(f"  {key}: {'*' * 10}...{value[-4:] if len(value) > 4 else '****'}")
            else:
                print(f"  {key}: NOT FOUND")

        # Ensure Python runs UTF-8 to prevent Unicode console crashes on Windows
        environment['PYTHONIOENCODING'] = environment.get('PYTHONIOENCODING', 'utf-8')
        environment['PYTHONUTF8'] = environment.get('PYTHONUTF8', '1')
        # Enable verbose OpenAI client logging unless explicitly disabled
        environment['OPENAI_LOG'] = environment.get('OPENAI_LOG', 'debug')

        # CRITICAL: Configure HOME/cache paths appropriately per OS
        system_name = platform.system()
        if system_name == "Windows":
            # Prefer USERPROFILE, fallback to TEMP, then C:\\Temp
            home_dir = os.environ.get('USERPROFILE') or os.environ.get('TEMP') or 'C:\\Temp'
            cache_dir = str(Path(os.environ.get('TEMP') or home_dir) / '.cache' / 'openai')
            luigi_cfg = str(Path(os.environ.get('TEMP') or home_dir) / '.luigi')
            try:
                Path(cache_dir).mkdir(parents=True, exist_ok=True)
                Path(luigi_cfg).mkdir(parents=True, exist_ok=True)
            except Exception as e:
                print(f"WARNING ENV: Failed to create Windows cache/config dirs: {e}")
            environment['HOME'] = home_dir
            environment['OPENAI_CACHE_DIR'] = cache_dir
            environment['LUIGI_CONFIG_PATH'] = luigi_cfg
            print(f"DEBUG ENV: Windows HOME={home_dir} OPENAI_CACHE_DIR={cache_dir} LUIGI_CONFIG_PATH={luigi_cfg}")
        else:
            # Railway/Linux: use /tmp which is writable at runtime
            environment['HOME'] = '/tmp'
            environment['OPENAI_CACHE_DIR'] = '/tmp/.cache/openai'
            environment['LUIGI_CONFIG_PATH'] = '/tmp/.luigi'
            print(f"DEBUG ENV: Set HOME=/tmp for SDK cache writes (Linux/Railway)")
        
        environment[PipelineEnvironmentEnum.RUN_ID_DIR.value] = str(run_id_dir)

        # Map API enum values to Luigi pipeline enum values (Source of Truth: planexe/plan/speedvsdetail.py)
        # Luigi only has 2 values: "all_details_but_slow" and "fast_but_skip_details"
        # API's "balanced_speed_and_detail" maps to "all_details_but_slow" per models.py line 25
        requested_speed = getattr(request.speed_vs_detail, "value", request.speed_vs_detail)
        normalised_speed = self._normalise_speed_vs_detail(requested_speed)
        if str(requested_speed).lower() != normalised_speed:
            print(
                f"DEBUG ENV: Normalised speed_vs_detail '{requested_speed}' -> '{normalised_speed}' for Luigi"
            )
        else:
            print(f"DEBUG ENV: speed_vs_detail resolved to '{normalised_speed}'")

        environment[PipelineEnvironmentEnum.SPEED_VS_DETAIL.value] = normalised_speed
        # Set reasoning effort from request (fallback to minimal if not specified)
        environment[PipelineEnvironmentEnum.REASONING_EFFORT.value] = getattr(request, 'reasoning_effort', 'minimal')
        # Only set LLM_MODEL if it's not None (subprocess environment requires all values to be strings)
        if request.llm_model:
            environment[PipelineEnvironmentEnum.LLM_MODEL.value] = request.llm_model
        
        # EXPLICIT: Re-add API keys to ensure they're in subprocess env
        for key in required_keys.keys():
            value = environment.get(key)
            if value:
                environment[key] = value
                print(f"DEBUG ENV: Explicitly set {key} in subprocess environment")

        # Enforce Luigi worker default of 10
        default_workers = 10
        workers_env = environment.get('LUIGI_WORKERS')
        workers_value = default_workers
        if workers_env:
            try:
                parsed_workers = int(workers_env)
                if parsed_workers < default_workers:
                    print(
                        f"DEBUG ENV: LUIGI_WORKERS={workers_env} below minimum; overriding to {default_workers}"
                    )
                else:
                    workers_value = parsed_workers
            except Exception:
                print(
                    f"DEBUG ENV: Invalid LUIGI_WORKERS='{workers_env}'; using default {default_workers}"
                )
        environment['LUIGI_WORKERS'] = str(max(default_workers, workers_value))

        # CRITICAL: Add DATABASE_URL for Luigi database writes
        database_url = environment.get("DATABASE_URL") or os.environ.get("DATABASE_URL")
        if database_url:
            environment["DATABASE_URL"] = database_url
            print(f"DEBUG ENV: Explicitly set DATABASE_URL in subprocess environment")
            # Log masked host info for telemetry
            masked_url = database_url.split('@')[-1] if '@' in database_url else database_url
            print(f"INFO ENV: Database target: {masked_url}")
        else:
            error_msg = "DATABASE_URL is required for plan execution but not found in environment"
            print(f"ERROR ENV: {error_msg}")
            raise RuntimeError(error_msg)

        print(f"DEBUG ENV: Pipeline environment configured with {len(environment)} variables")
        return environment

    def _verify_database_connectivity(self, database_url: str) -> bool:
        """Verify that the database connection is working before spawning Luigi"""
        try:
            from sqlalchemy import create_engine, text
            print(f"DEBUG DB: Testing connectivity to: {database_url.split('@')[-1] if '@' in database_url else database_url}")
            
            # Create a temporary engine to test connectivity
            test_engine = create_engine(database_url, connect_args={"connect_timeout": 10})
            with test_engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                print(f"DEBUG DB: Database connectivity test passed")
                return True
        except Exception as e:
            print(f"ERROR DB: Database connectivity test failed: {e}")
            return False

    def _write_pipeline_inputs(
        self,
        plan_id: str,
        run_id_dir: Path,
        request: CreatePlanRequest,
        db_service: DatabaseService,
    ) -> None:
        """Write input files required by Luigi pipeline."""
        # CRITICAL FIX: ALWAYS delete run directory before each plan to prevent Luigi from skipping tasks
        # Luigi checks if output files exist, and if they do, it considers tasks "already complete"
        # This was causing the production issue where Luigi would hang without executing tasks
        import shutil
        import os as os_module
        import logging
        logger = logging.getLogger(__name__)
        
        # Use logger.error() to ensure these messages appear in Railway logs (print() gets lost)
        logger.error(f"[PIPELINE] _write_pipeline_inputs() CALLED for: {run_id_dir}")
        logger.error(f"[PIPELINE] Directory exists? {run_id_dir.exists()}")
        print(f"[PIPELINE] _write_pipeline_inputs() called for run_id_dir: {run_id_dir}")
        print(f"[PIPELINE] run_id_dir.exists() = {run_id_dir.exists()}")
        
        if run_id_dir.exists():
            existing_files = list(run_id_dir.iterdir())
            logger.error(f"[PIPELINE][PIPELINE][PIPELINE] Directory EXISTS with {len(existing_files)} files - WILL DELETE!")
            print(f"[PIPELINE] CRITICAL: Run directory EXISTS with {len(existing_files)} files!")
            if len(existing_files) > 0:
                print(f"[PIPELINE] First 10 files: {[f.name for f in existing_files[:10]]}")
                print(f"[PIPELINE] Leftover files would cause Luigi to skip all tasks (thinks they're complete)")
            print(f"[PIPELINE] DELETING entire run directory: {run_id_dir}")
            try:
                shutil.rmtree(run_id_dir)
                logger.error(f"[PIPELINE][PIPELINE][PIPELINE] Directory DELETED successfully")
                print(f"[PIPELINE] [OK] Run directory DELETED successfully")
            except Exception as e:
                logger.error(f"[PIPELINE][PIPELINE][PIPELINE] ERROR deleting directory: {e}")
                print(f"[PIPELINE] [ERROR] ERROR deleting run directory: {e}")
                raise
        else:
            logger.error(f"[PIPELINE][PIPELINE][PIPELINE] Directory does NOT exist (fresh plan)")
            print(f"[PIPELINE] Run directory does NOT exist (fresh plan)")
        
        logger.error(f"[PIPELINE][PIPELINE][PIPELINE] Creating directory: {run_id_dir}")
        print(f"[PIPELINE] Creating clean run directory: {run_id_dir}")
        run_id_dir.mkdir(parents=True, exist_ok=True)
        logger.error(f"[PIPELINE][PIPELINE][PIPELINE] Directory created - writing input files...")
        print(f"[PIPELINE] [OK] Run directory created successfully")

        # PROOF OF CLEANUP: Write a marker file that Luigi can read to prove cleanup ran
        cleanup_marker = run_id_dir / "CLEANUP_RAN.txt"
        with open(cleanup_marker, "w", encoding="utf-8") as f:
            f.write(f"Directory cleanup executed at {_utcnow_iso()}\n")
            f.write(f"Directory existed: {run_id_dir.exists()}\n")
            f.write(f"Cleanup function called from FastAPI process\n")
        logger.error(f"[PIPELINE][PIPELINE][PIPELINE] Wrote cleanup marker file: {cleanup_marker}")

        # Write start time using canonical schema to satisfy downstream readers
        localized_now = datetime.now().astimezone()
        start_time_file = run_id_dir / FilenameEnum.START_TIME.value
        start_time_payload = StartTime.create(localized_now)
        start_time_payload.save(str(start_time_file))
        print(f"[PIPELINE] Created {start_time_file.name}")

        # Write initial plan prompt with legacy PlanFile formatting
        initial_plan_file = run_id_dir / FilenameEnum.INITIAL_PLAN.value
        plan_file_payload = PlanFile.create(request.prompt, localized_now)
        plan_file_payload.save(str(initial_plan_file))
        print(f"[PIPELINE] Created {initial_plan_file.name}")

        # Write enriched intake data if provided (from conversation)
        if request.enriched_intake:
            enriched_intake_file = run_id_dir / "enriched_intake.json"
            with open(enriched_intake_file, "w", encoding="utf-8") as f:
                json.dump(request.enriched_intake, f, indent=2, default=str)
            print(f"[PIPELINE] Created enriched_intake.json ({len(str(request.enriched_intake))} bytes)")
        else:
            print(f"[PIPELINE] No enriched_intake provided - using standard pipeline")

        # DIAGNOSTIC: Verify only expected files exist
        all_files = list(run_id_dir.iterdir())
        print(f"[PIPELINE] Run directory now contains {len(all_files)} files: {[f.name for f in all_files]}")

    def _start_luigi_subprocess(self, plan_id: str, environment: Dict[str, str], db_service: DatabaseService) -> Optional[subprocess.Popen]:
        """Start Luigi pipeline subprocess"""
        import sys
        import platform

        python_executable = sys.executable
        system_name = platform.system()
        
        print(f"DEBUG: Python executable: {python_executable}")
        print(f"DEBUG: Python version: {sys.version}")
        print(f"DEBUG: System: {system_name}")
        
        luigi_workers = environment.get('LUIGI_WORKERS', '10')
        try:
            parsed_workers = int(luigi_workers)
            if parsed_workers < 10:
                parsed_workers = 10
        except Exception:
            parsed_workers = 10
        environment['LUIGI_WORKERS'] = str(parsed_workers)

        # CRITICAL: Always use list format, NEVER shell=True to avoid encoding crashes
        # PERFORMANCE: Enable multiple workers for parallel task execution
        # This allows independent tasks to run simultaneously, providing 3-5x speedup
        # HYGIENE: Add worker hygiene flags to prevent stale scheduler locks and improve reliability
        command = [
            python_executable, "-m", MODULE_PATH_PIPELINE,
            "--workers", str(parsed_workers),
            "--worker-pool-threads", str(parsed_workers),
            "--worker-id", f"plan-{plan_id}",  # Unique worker identifier
            "--worker-timeout", "160",  # Worker timeout in seconds
            "--scheduler-disable-remove-delay", "5",  # Remove delay for stalled workers
            "--retry-count", "2",  # Number of retries for failed tasks
            "--retry-delay", "3",  # Delay between retries in seconds
            "--scheduler-host", "localhost"  # Ensure proper scheduler communication
        ]
        use_shell = False

        print(f"DEBUG: Starting subprocess with command: {command}")
        print(f"DEBUG: Working directory: {self.planexe_project_root}")
        print(f"DEBUG: RUN_ID_DIR env var: {environment.get('RUN_ID_DIR')}")

        # use_shell defined above per OS

        try:
            # Sanity: show which API keys we are passing (masked)
            try:
                oa = environment.get('OPENAI_API_KEY')
                print(f"DEBUG ENV: OPENAI_API_KEY present? {bool(oa)} len={len(oa) if oa else 0}")
            except Exception:
                pass

            # DEBUG: Validate all environment variables are strings
            non_string_vars = []
            for key, value in environment.items():
                if not isinstance(value, str):
                    non_string_vars.append(f"{key}={type(value).__name__}:{repr(value)}")
            
            if non_string_vars:
                print(f"DEBUG ENV ERROR: Found {len(non_string_vars)} non-string environment variables:")
                for var in non_string_vars[:10]:  # Show first 10
                    print(f"  - {var}")
            
            # CRITICAL FIX: On Windows, avoid console encoding crashes (exit code 3221225794)
            # Match Gradio's working approach: merge stderr into stdout, use text mode
            popen_kwargs = {
                'cwd': str(self.planexe_project_root),
                'env': environment,
                'stdout': subprocess.PIPE,
                'stderr': subprocess.STDOUT,  # Merge stderr into stdout like Gradio
                'text': True,  # Text mode works when stderr is merged
                'bufsize': 1,
                'shell': use_shell
            }
            
            if system_name == "Windows":
                # Prevent console window creation
                popen_kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
            process = subprocess.Popen(command, **popen_kwargs)
            print(f"DEBUG: Subprocess started with PID: {process.pid}")

            # Test if subprocess actually started
            if process.poll() is not None:
                raise subprocess.SubprocessError(f"Subprocess failed to start, exit code: {process.returncode}")

            # Store process reference in thread-safe registry
            process_registry.register(plan_id, process)
            return process

        except Exception as e:
            print(f"DEBUG: Subprocess creation failed: {e}")
            db_service.update_plan(plan_id, {
                "status": PlanStatus.failed.value,
                "error_message": f"Failed to start subprocess: {str(e)}"
            })
            return None

    async def _monitor_process_execution(self, plan_id: str, process: subprocess.Popen,
                                        run_id_dir: Path, db_service: DatabaseService) -> None:
        """Monitor Luigi process execution and stream progress via WebSocket"""
        import asyncio

        async def read_stdout():
            """Stream Luigi pipeline logs via WebSocket (includes stderr since merged)"""
            if process.stdout:
                for line in iter(process.stdout.readline, ''):
                    line = line.strip()
                    if not line:
                        continue

                    if line.startswith("LLM_STREAM|"):
                        _, _, payload_text = line.partition("|")
                        try:
                            stream_payload = json.loads(payload_text)
                        except json.JSONDecodeError:
                            stream_payload = {
                                "type": "log",
                                "message": f"[LLM_STREAM PARSE ERROR] {payload_text}",
                                "timestamp": _utcnow_iso(),
                            }
                        if isinstance(stream_payload, dict):
                            stream_payload.setdefault("timestamp", _utcnow_iso())
                            stream_payload.setdefault("type", "llm_stream")
                            try:
                                await websocket_manager.broadcast_to_plan(plan_id, stream_payload)
                            except Exception as e:
                                print(f"WebSocket stream payload error for plan {plan_id}: {e}")
                        continue

                    # Broadcast log line via WebSocket
                    log_data = {
                        "type": "log",
                        "message": line,
                        "timestamp": _utcnow_iso()
                    }

                    try:
                        await websocket_manager.broadcast_to_plan(plan_id, log_data)
                    except Exception as e:
                        print(f"WebSocket broadcast error for plan {plan_id}: {e}")

                    print(f"Luigi: {line}")

                # Signal stdout completion
                completion_data = {
                    "type": "status",
                    "status": "stdout_closed",
                    "message": "Pipeline stdout stream closed",
                    "timestamp": _utcnow_iso()
                }
                try:
                    await websocket_manager.broadcast_to_plan(plan_id, completion_data)
                except Exception:
                    pass

                process.stdout.close()

        async def monitor_progress():
            """Periodically calculate and broadcast progress based on completed tasks"""
            # Use configurable values with sensible defaults
            total_tasks = int(os.getenv('PLANEXE_TOTAL_TASKS', '61'))
            update_interval = float(os.getenv('PLANEXE_UPDATE_INTERVAL', '3.0'))
            stall_threshold = int(os.getenv('PLANEXE_STALL_THRESHOLD', '2'))
            
            last_progress = 0
            stall_count = 0

            while process.poll() is None:  # While process is still running
                try:
                    await asyncio.sleep(update_interval)

                    # Query database to count completed tasks
                    # Each task writes to plan_content, so count unique task entries
                    completed_count = db_service.count_plan_content_entries(plan_id)

                    # Calculate progress percentage, capping at 99% until final completion
                    # (Final 100% is set in _finalize_plan_status)
                    progress_percentage = min(int((completed_count / total_tasks) * 100), 99)

                    # Check for stall detection
                    if progress_percentage == last_progress:
                        stall_count += 1
                        if stall_count >= stall_threshold:
                            # Send stall warning
                            stall_warning = {
                                "type": "status",
                                "status": "running",
                                "message": f"Pipeline appears stalled (no progress for {stall_threshold * update_interval}s). {completed_count}/{total_tasks} tasks completed.",
                                "progress_percentage": progress_percentage,
                                "timestamp": _utcnow_iso(),
                                "stall_warning": True
                            }
                            await websocket_manager.broadcast_to_plan(plan_id, stall_warning)
                            print(f"[PROGRESS] STALL WARNING: Plan {plan_id} no progress for {stall_count * update_interval}s")
                    else:
                        stall_count = 0  # Reset stall counter on progress

                    # Only broadcast if progress has changed or we have a stall warning
                    if progress_percentage != last_progress or stall_count >= stall_threshold:
                        last_progress = progress_percentage

                        # Update database
                        db_service.update_plan(plan_id, {
                            "progress_percentage": progress_percentage,
                            "progress_message": f"Processing... {completed_count}/{total_tasks} tasks completed"
                        })

                        # Broadcast progress update via WebSocket
                        progress_data = {
                            "type": "status",
                            "status": "running",
                            "message": f"Processing... {completed_count}/{total_tasks} tasks completed",
                            "progress_percentage": progress_percentage,
                            "timestamp": _utcnow_iso()
                        }
                        await websocket_manager.broadcast_to_plan(plan_id, progress_data)
                        print(f"[PROGRESS] Plan {plan_id}: {progress_percentage}% ({completed_count}/{total_tasks} tasks)")

                except Exception as e:
                    print(f"Progress monitoring error for plan {plan_id}: {e}")
                    # Continue monitoring even if there's an error

        # stderr is merged into stdout, so only need one monitoring task
        # Start monitoring tasks
        stdout_task = asyncio.create_task(read_stdout())
        progress_task = asyncio.create_task(monitor_progress())

        # Wait for process completion in executor (blocking operation)
        loop = asyncio.get_event_loop()
        return_code = await loop.run_in_executor(None, process.wait)
        print(f"DEBUG: Luigi process completed with return code: {return_code}")

        # Cancel progress monitoring since process completed
        progress_task.cancel()
        try:
            await progress_task
        except asyncio.CancelledError:
            pass

        # Wait for monitoring task to complete
        try:
            await asyncio.wait_for(stdout_task, timeout=5.0)
        except asyncio.TimeoutError:
            print(f"Warning: Monitoring task for plan {plan_id} timed out")
            stdout_task.cancel()

        # Update final plan status based on results
        await self._finalize_plan_status(plan_id, return_code, run_id_dir, db_service)

    async def _finalize_plan_status(self, plan_id: str, return_code: int, run_id_dir: Path,
                                  db_service: DatabaseService) -> None:
        """Update final plan status, index generated files, and broadcast via WebSocket"""

        files_synced = 0
        content_bytes_synced = 0
        if run_id_dir.exists():
            try:
                files_synced, content_bytes_synced = self._sync_run_directory_to_database(
                    plan_id, run_id_dir, db_service
                )
            except Exception as exc:
                print(f"WARNING: Failed to sync run directory for plan {plan_id}: {exc}")
        else:
            print(f"WARNING: Run directory {run_id_dir} missing for plan {plan_id}; attempting DB fallback only")

        if return_code == 0:
            # Treat database artefacts as authoritative to avoid misclassifying successes
            final_output_file = run_id_dir / FilenameEnum.REPORT.value
            has_local_report = final_output_file.exists()
            has_database_report = False

            try:
                has_database_report = (
                    db_service.get_plan_content_by_filename(plan_id, FilenameEnum.REPORT.value)
                    is not None
                )
            except Exception as exc:
                print(f"WARNING: Failed to query database for report content for plan {plan_id}: {exc}")

            if not has_local_report and has_database_report:
                print(
                    f"INFO: Plan {plan_id} report missing on filesystem; serving from database copy instead."
                )

            if has_local_report or has_database_report:
                # Success - broadcast completion message
                progress_message = f"Plan generation completed! {files_synced} files persisted to database."
                if not has_local_report and has_database_report:
                    progress_message += " Local report copy unavailable; continuing with database artefact."

                success_data = {
                    "type": "status",
                    "status": "completed",
                    "message": "[OK] Pipeline completed successfully! Final report stored in database.",
                    "progress_percentage": 100,
                    "timestamp": _utcnow_iso()
                }
                try:
                    await websocket_manager.broadcast_to_plan(plan_id, success_data)
                except Exception as e:
                    print(f"WebSocket success broadcast failed for plan {plan_id}: {e}")

                db_service.update_plan(plan_id, {
                    "status": PlanStatus.completed.value,
                    "progress_percentage": 100,
                    "progress_message": progress_message,
                    "completed_at": _utcnow()
                })
            else:
                # Pipeline completed but no final output
                failure_data = {
                    "type": "status",
                    "status": "failed",
                    "message": "[ERROR] Pipeline completed but final report not found in filesystem or database",
                    "timestamp": _utcnow_iso()
                }
                try:
                    await websocket_manager.broadcast_to_plan(plan_id, failure_data)
                except Exception as e:
                    print(f"WebSocket failure broadcast failed for plan {plan_id}: {e}")

                db_service.update_plan(plan_id, {
                    "status": PlanStatus.failed.value,
                    "error_message": "Pipeline did not complete successfully"
                })
        else:
            # Attempt agent-style minimal fallback to avoid leaving the user stuck
            if os.environ.get("PLANEXE_ENABLE_AGENT_FALLBACK", "true").lower() == "true":
                try:
                    await websocket_manager.broadcast_to_plan(plan_id, {
                        "type": "status",
                        "status": "fallback",
                        "message": "Luigi failed. Switching to minimal agent fallback...",
                        "timestamp": _utcnow_iso()
                    })

                    if self._run_fallback_minimal_report(plan_id, run_id_dir, db_service):
                        # Fallback produced a minimal final report; mark completed
                        await websocket_manager.broadcast_to_plan(plan_id, {
                            "type": "status",
                            "status": "completed",
                            "message": "[OK] Fallback completed. Minimal report generated.",
                            "progress_percentage": 100,
                            "timestamp": _utcnow_iso()
                        })

                        db_service.update_plan(plan_id, {
                            "status": PlanStatus.completed.value,
                            "progress_percentage": 100,
                            "progress_message": "Plan completed via fallback (minimal report)",
                            "completed_at": _utcnow()
                        })

                        # End stream and cleanup
                        end_data = {
                            "type": "stream_end",
                            "message": "Pipeline execution completed - closing connections",
                            "timestamp": _utcnow_iso()
                        }
                        try:
                            await websocket_manager.broadcast_to_plan(plan_id, end_data)
                            await websocket_manager.cleanup_plan_connections(plan_id)
                        except Exception:
                            pass
                        return
                except Exception as e:
                    print(f"Fallback error for plan {plan_id}: {e}")

            # Existing failure behavior if fallback not enabled or failed
            failure_data = {
                "type": "status",
                "status": "failed",
                "message": f"[ERROR] Pipeline failed with exit code {return_code}",
                "timestamp": _utcnow_iso()
            }
            try:
                await websocket_manager.broadcast_to_plan(plan_id, failure_data)
            except Exception as e:
                print(f"WebSocket failure broadcast failed for plan {plan_id}: {e}")

            db_service.update_plan(plan_id, {
                "status": PlanStatus.failed.value,
                "error_message": f"Pipeline process failed with exit code {return_code}"
            })

        # Signal end of stream and cleanup connections
        end_data = {
            "type": "stream_end",
            "message": "Pipeline execution completed - closing connections",
            "timestamp": _utcnow_iso()
        }
        try:
            await websocket_manager.broadcast_to_plan(plan_id, end_data)
            await websocket_manager.cleanup_plan_connections(plan_id)
        except Exception as e:
            print(f"WebSocket end stream broadcast failed for plan {plan_id}: {e}")

    # --- New helper: minimal fallback report generator ---
    def _run_fallback_minimal_report(self, plan_id: str, run_id_dir: Path, db_service: DatabaseService) -> bool:
        """
        Generate a minimal final report when Luigi fails, so the UI can still display results.
        Does not invoke Luigi; produces a Plan Lite HTML using the user's prompt.
        Returns True on success.
        """
        try:
            prompt_text = ""
            try:
                prompt_text = (run_id_dir / FilenameEnum.INITIAL_PLAN.value).read_text(encoding='utf-8')
            except Exception:
                prompt_text = "(initial prompt unavailable)"

            now_iso = _utcnow_iso()
            html = f"""
<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <title>PlanExe Report (Fallback)</title>
    <style>
      body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 2rem; }}
      .badge {{ display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; background: #ffe9a8; color: #7a5d00; font-weight: 600; margin-bottom: 1rem; }}
      pre {{ background: #f5f5f5; padding: 1rem; border-radius: 6px; white-space: pre-wrap; }}
    </style>
  </head>
  <body>
    <div class=\"badge\">Fallback Report</div>
    <h1>PlanExe Minimal Report</h1>
    <p>Luigi pipeline failed. A minimal fallback report was generated to avoid blocking your workflow.</p>
    <h2>Initial Prompt</h2>
    <pre>{prompt_text}</pre>
    <h2>Status</h2>
    <ul>
      <li>Generation mode: agent fallback (minimal)</li>
      <li>Timestamp (UTC): {now_iso}</li>
      <li>Plan ID: {plan_id}</li>
    </ul>
    <p style=\"margin-top:2rem;color:#666\">You can re-run later to produce the full 61-task plan once Luigi is healthy.</p>
  </body>
</html>
            """

            report_path = run_id_dir / FilenameEnum.REPORT.value
            report_path.write_text(html, encoding='utf-8')

            # Persist to database (Option 3 path) so the UI can fetch content
            try:
                db_service.create_plan_content({
                    "plan_id": plan_id,
                    "filename": FilenameEnum.REPORT.value,
                    "stage": "reporting",
                    "content_type": "html",
                    "content": html,
                    "content_size_bytes": len(html.encode('utf-8'))
                })
            except Exception as e:
                print(f"WARNING: Could not persist fallback report to DB for plan {plan_id}: {e}")

            return True
        except Exception as e:
            print(f"Fallback generation failed for plan {plan_id}: {e}")
            return False

    async def _cleanup_execution(self, plan_id: str) -> None:
        """Clean up execution resources and WebSocket connections"""
        # Remove process reference from thread-safe registry
        process = process_registry.unregister(plan_id)
        if process:
            print(f"DEBUG: Removed process reference for plan {plan_id}")

        # Ensure all WebSocket connections are cleaned up
        await websocket_manager.cleanup_plan_connections(plan_id)

        print(f"DEBUG: Cleaned up execution resources for {plan_id}")

    def get_process(self, plan_id: str) -> Optional[subprocess.Popen]:
        """Get subprocess reference for a plan (thread-safe)"""
        return process_registry.get(plan_id)

    def _sync_run_directory_to_database(self, plan_id: str, run_id_dir: Path,
                                        db_service: DatabaseService) -> Tuple[int, int]:
        """Persist files from the run directory into plan_files and plan_content tables."""

        files_synced = 0
        content_bytes_synced = 0

        if not run_id_dir.exists():
            return files_synced, content_bytes_synced

        content_type_map = {
            'json': 'json',
            'md': 'markdown',
            'markdown': 'markdown',
            'html': 'html',
            'csv': 'csv',
            'txt': 'txt',
            '': 'txt'
        }

        for file_path in sorted(run_id_dir.iterdir()):
            if not file_path.is_file():
                continue

            try:
                file_size = file_path.stat().st_size
            except OSError as exc:
                print(f"WARNING: Could not stat {file_path} for plan {plan_id}: {exc}")
                continue

            # Sync plan_files metadata with basic upsert semantics.
            try:
                existing_file = db_service.db.query(DBPlanFile).filter(
                    DBPlanFile.plan_id == plan_id,
                    DBPlanFile.filename == file_path.name
                ).one_or_none()

                if existing_file:
                    existing_file.file_size_bytes = file_size
                    existing_file.file_path = str(file_path)
                    if not existing_file.generated_by_stage:
                        existing_file.generated_by_stage = "pipeline_complete"
                    db_service.db.commit()
                else:
                    db_service.create_plan_file({
                        "plan_id": plan_id,
                        "filename": file_path.name,
                        "file_type": file_path.suffix.lstrip('.') or 'unknown',
                        "file_size_bytes": file_size,
                        "file_path": str(file_path),
                        "generated_by_stage": "pipeline_complete"
                    })
            except Exception as exc:
                print(f"WARNING: Could not sync plan file metadata for {file_path.name}: {exc}")

            try:
                try:
                    content = file_path.read_text(encoding='utf-8')
                except UnicodeDecodeError:
                    content = file_path.read_bytes().decode('utf-8', errors='replace')
                content_size = len(content.encode('utf-8'))
            except Exception as exc:
                print(f"WARNING: Could not read {file_path.name} for database persistence: {exc}")
                continue

            ext = file_path.suffix.lstrip('.').lower()
            content_type = content_type_map.get(ext, 'unknown')

            stage = None
            if '-' in file_path.stem:
                parts = file_path.stem.split('-', 1)
                if len(parts) == 2 and parts[1]:
                    stage = parts[1]

            try:
                existing_content = db_service.get_plan_content_by_filename(plan_id, file_path.name)
                if existing_content:
                    existing_content.stage = stage
                    existing_content.content_type = content_type
                    existing_content.content = content
                    existing_content.content_size_bytes = content_size
                    existing_content.created_at = _utcnow()
                    db_service.db.commit()
                else:
                    db_service.create_plan_content({
                        "plan_id": plan_id,
                        "filename": file_path.name,
                        "stage": stage,
                        "content_type": content_type,
                        "content": content,
                        "content_size_bytes": content_size
                    })

                files_synced += 1
                content_bytes_synced += content_size
                print(f"DEBUG: Synced {file_path.name} to database ({content_size} bytes)")
            except Exception as exc:
                print(f"WARNING: Could not persist {file_path.name} content to DB: {exc}")

        return files_synced, content_bytes_synced

    def terminate_plan_execution(self, plan_id: str) -> bool:
        """Terminate a running plan execution (thread-safe)"""
        process = process_registry.get(plan_id)
        if process and process.poll() is None:  # Process is still running
            try:
                process.terminate()
                print(f"Terminated process for plan {plan_id}")
                return True
            except Exception as e:
                print(f"Failed to terminate process for plan {plan_id}: {e}")
                return False
        return False
