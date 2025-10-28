"""
Cycle through multiple LLMs, if one fails, try the next one.

I want all LLM invocations to go through this class.

It happens that the json output of the LLM doesn't match the expected schema.
When I inspect the raw response, I can see that the json comes close to the expected schema,
with tiny mistakes here and there. I guess with a more fuzzy json parser than Pydantic, 
the json could be extracted.

It happens that an LLM provider is unavailable. Where a model used to be available, and have been removed from the provider.
Or the LLM server has to be started by the developer on the local machine.

Having multiple LLMs available is a good idea, because it increases the chances of success.
If one fails, then the next one may be able to respond.
If all of them fails, then the exception is raised. Exhausted all LLMs.

This is the class that `PlanTask` is using, the root class of all tasks in the pipeline.
Subtasks such as `ReviewPlan` are also using this class to invoke the LLM.

IDEA: Scheduling strategy: randomize the order of LLMs.
IDEA: Scheduling strategy: cycle through the LLM list twice, so there are two chances to succeed.
IDEA: Measure the number of tokens used by each LLM.
IDEA: Measure the duration of each LLM.
IDEA: Measure the number of times each LLM was used.
IDEA: Measure the number of times each LLM failed. Is there a common reason for failure.
IDEA: track stats about token usage
IDEA: track what LLM was succeeded
IDEA: track if the LLM failed and why
"""
import time
import logging
import inspect
import typing
import asyncio
import os
from uuid import uuid4
from typing import Any, Callable, Optional, List
from dataclasses import dataclass
from llama_index.core.instrumentation.dispatcher import instrument_tags
from planexe.llm_factory import get_llm

logger = logging.getLogger(__name__)

class PipelineStopRequested(RuntimeError):
    """
    Raised when the pipeline execution is requested to stop by `should_stop_callback` after a task succeeds.

    This exception happens when the user presses Ctrl-C or closes the browser tab,
    so there is no point in continuing wasting resources on a 30 minute task.

    The PlanTask.run() method intercepts the PipelineStopRequested exception and create a the PIPELINE_STOP_REQUESTED_FLAG file,
    signaling that the pipeline was stopped by the user. So in post-mortem, it's fast to determine if the pipeline was stopped with this exception.
    """
    pass

class LLMModelBase:
    def create_llm(self) -> Any:
        raise NotImplementedError("Subclasses must implement this method")

class LLMModelFromName(LLMModelBase):
    def __init__(self, name: str, reasoning_effort: str = "medium"):
        self.name = name
        self.reasoning_effort = reasoning_effort

    def create_llm(self) -> Any:
        return get_llm(self.name, reasoning_effort=self.reasoning_effort)
    
    def __repr__(self) -> str:
        return f"LLMModelFromName(name='{self.name}', reasoning_effort='{self.reasoning_effort}')"

    @classmethod
    def from_names(cls, names: list[str], reasoning_effort: str = "medium") -> list['LLMModelBase']:
        return [cls(name, reasoning_effort) for name in names]

class LLMModelWithInstance(LLMModelBase):
    def __init__(self, llm: Any):
        self.llm = llm

    def create_llm(self) -> Any:
        return self.llm
    
    def __repr__(self) -> str:
        return f"LLMModelWithInstance(llm={self.llm.__class__.__name__})"

    @classmethod
    def from_instances(cls, llms: list[Any]) -> list['LLMModelBase']:
        return [cls(llm) for llm in llms]

@dataclass
class LLMAttempt:
    """
    Stores the result of a single LLM attempt.

    Includes token usage tracking for cost analysis and monitoring.
    Token counts are optional and may not be available for all LLM providers.
    """
    stage: str
    llm_model: LLMModelBase
    success: bool
    duration: float
    result: Optional[Any] = None
    exception: Optional[Exception] = None
    # Token usage tracking (optional, for cost analysis)
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

@dataclass
class ShouldStopCallbackParameters:
    """Parameters passed to the should_stop_callback after each attempt."""
    last_attempt: LLMAttempt
    total_duration: float
    attempt_index: int
    total_attempts: int

class LLMExecutor:
    """
    Cycle through multiple LLMs, falling back to the next on failure.
    A callback can be used to abort execution after any attempt.
    """
    def __init__(self, llm_models: list[LLMModelBase], should_stop_callback: Optional[Callable[[ShouldStopCallbackParameters], None]] = None):
        """
        Args:
            llm_models: A list of LLM models to try.
            should_stop_callback: A function that will be called after each attempt.
                If the callback raises PipelineStopRequested, the execution will be aborted. This is the only exception that is allowed to be raised by the callback, that doesn't indicate a problem.
                If the callback raises any other exception, the execution will be aborted. This indicates a problem with the callback.
                If the callback returns None, the execution will continue.
                If no callback is provided, the execution will continue until all LLMs are exhausted.
        """
        if not llm_models:
            raise ValueError("No LLMs provided")
        
        if should_stop_callback is not None and not callable(should_stop_callback):
            raise TypeError("should_stop_callback must be a function that can raise PipelineStopRequested to stop execution")
        
        self.llm_models = llm_models
        self.should_stop_callback = should_stop_callback
        self.attempts: List[LLMAttempt] = []

    @property
    def attempt_count(self) -> int:
        return len(self.attempts)

    def get_last_attempt(self) -> Optional[LLMAttempt]:
        """
        Get the last attempt metadata.

        Returns:
            The last LLMAttempt or None if no attempts have been made yet.
        """
        return self.attempts[-1] if self.attempts else None

    def set_last_attempt_tokens(self, input_tokens: int, output_tokens: int, total_tokens: Optional[int] = None) -> None:
        """
        Update token counts for the last successful attempt.

        This method should be called after execute_function completes when token
        information is available from the LLM response.

        Args:
            input_tokens: Number of input tokens consumed
            output_tokens: Number of output tokens generated
            total_tokens: Total tokens (defaults to input + output if not provided)

        Example:
            llm_executor = self.create_llm_executor()
            result = llm_executor.run(lambda llm: MyTask.execute(llm, prompt))
            # Extract token counts from result if available
            if hasattr(result, 'token_usage'):
                llm_executor.set_last_attempt_tokens(
                    result.token_usage.input_tokens,
                    result.token_usage.output_tokens
                )
        """
        if not self.attempts:
            logger.warning("set_last_attempt_tokens: No attempts recorded yet")
            return

        last_attempt = self.attempts[-1]
        if not last_attempt.success:
            logger.warning(f"set_last_attempt_tokens: Last attempt was not successful (stage={last_attempt.stage})")
            return

        last_attempt.input_tokens = input_tokens
        last_attempt.output_tokens = output_tokens
        last_attempt.total_tokens = total_tokens if total_tokens is not None else (input_tokens + output_tokens)
        logger.debug(f"Token usage recorded: input={input_tokens}, output={output_tokens}, total={last_attempt.total_tokens}")

    def run(self, execute_function: Callable[[Any], Any]):
        self._validate_execute_function(execute_function)

        # Reset attempts for each new run
        self.attempts = []
        overall_start_time = time.perf_counter()

        for index, llm_model in enumerate(self.llm_models):
            # Attempt invoking the execute_function with one LLM.
            attempt = self._try_one_attempt(llm_model, execute_function)
            self.attempts.append(attempt)

            # Check if the callback wants to abort execution.
            self._check_stop_callback(attempt, overall_start_time, index)

            # If the attempt succeeded and we weren't told to abort, we are done.
            if attempt.success:
                return attempt.result

        # If we get here, all attempts have failed.
        self._raise_final_exception()

    async def run_async(self, execute_function: Callable[[Any], Any]):
        """
        Async version of the run method that executes the function with async LLM calls.
        
        Args:
            execute_function: A callable that accepts an LLM instance and returns a result.
                             The callable should use async LLM methods (achat, acomplete).
        
        Returns:
            The result from the successful execute_function call.
        """
        self._validate_execute_function(execute_function)

        # Reset attempts for each new run
        self.attempts = []
        overall_start_time = time.perf_counter()

        for index, llm_model in enumerate(self.llm_models):
            # Attempt invoking the execute_function with one LLM.
            attempt = await self._try_one_attempt_async(llm_model, execute_function)
            self.attempts.append(attempt)

            # Check if the callback wants to abort execution.
            self._check_stop_callback(attempt, overall_start_time, index)

            # If the attempt succeeded and we weren't told to abort, we are done.
            if attempt.success:
                return attempt.result

        # If we get here, all attempts have failed.
        self._raise_final_exception()

    async def run_batch_async(self, execute_functions: List[Callable[[Any], Any]]) -> List[Any]:
        """
        Run multiple execute functions concurrently using asyncio.gather with concurrency limiting.

        Args:
            execute_functions: List of callables that each accept an LLM instance.
                              Each callable should use async LLM methods.

        Returns:
            List of results from the successful execute_function calls OR exceptions.
            Caller must check isinstance(result, Exception) to handle partial failures.
            This allows graceful degradation when some but not all tasks fail.
        """
        if not execute_functions:
            return []

        # Validate all execute functions
        for func in execute_functions:
            self._validate_execute_function(func)

        # Get concurrency limit from environment variable
        max_concurrent = int(os.environ.get('PLANEXE_MAX_CONCURRENT_LLM', '5'))

        # Create semaphore to limit concurrent executions
        semaphore = asyncio.Semaphore(max_concurrent)

        async def run_with_semaphore(func):
            async with semaphore:
                return await self.run_async(func)

        # Create tasks with concurrency limiting
        tasks = [run_with_semaphore(func) for func in execute_functions]

        # Execute all tasks concurrently and wait for completion
        # Return exceptions as results for the caller to handle gracefully
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Log exceptions but don't raise - allow partial success
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(f"Batch execution failed for function {i}: {result}", exc_info=result)

        return results

    def _validate_execute_function(self, execute_function: Callable[[Any], Any]) -> None:
        """
        Validate that the execute_function is callable with exactly one positional parameter.
        Also check if it's an async coroutine function for proper handling.
        """
        if not callable(execute_function):
            raise TypeError("execute_function must be callable")

        # Validate function signature
        sig = inspect.signature(execute_function)
        params = list(sig.parameters.values())
        if len(params) != 1:
            raise TypeError("execute_function must accept exactly one argument")
        
        # Check if function is async for first-class citizen treatment
        is_async = inspect.iscoroutinefunction(execute_function)
        if not is_async:
            logger.debug(f"execute_function {execute_function.__name__} is not async, will be wrapped")

    def _try_one_attempt(self, llm_model: LLMModelBase, execute_function: Callable[[Any], Any]) -> LLMAttempt:
        """
        Performs a single, complete attempt with one LLM, returning a detailed result.
        
        Args:
            llm_model: The LLM model to try.
            execute_function: The callback to execute with the llm. The callback must not raise the PipelineStopRequested exception, since that interferes with the `ExecutePipeline.stopped_by_callback` property.

        Returns:
            A detailed result of the attempt.
        """
        attempt_start_time = time.perf_counter()
        try:
            llm = llm_model.create_llm()
        except Exception as e:
            duration = time.perf_counter() - attempt_start_time
            logger.error(f"Error creating LLM {llm_model!r}: {e!r}")
            return LLMAttempt(stage='create', llm_model=llm_model, success=False, duration=duration, exception=e)

        llm_executor_uuid = str(uuid4())
        try:
            logger.debug(f"LLMExecutor will invoke execute_function. LLM {llm_model!r}. llm_executor_uuid: {llm_executor_uuid!r}")
            with instrument_tags({"llm_executor_uuid": llm_executor_uuid}):
                result = execute_function(llm)
            duration = time.perf_counter() - attempt_start_time
            logger.info(f"LLMExecutor did invoke execute_function. LLM {llm_model!r}. llm_executor_uuid: {llm_executor_uuid!r}. Duration: {duration:.2f} seconds")
            return LLMAttempt(stage='execute', llm_model=llm_model, success=True, duration=duration, result=result)
        except PipelineStopRequested as e:
            logger.info(f"LLMExecutor: Stopping because the execute_function callback raised PipelineStopRequested: {e!r}")
            raise
        except Exception as e:
            duration = time.perf_counter() - attempt_start_time
            logger.error(f"LLMExecutor: error when invoking execute_function. LLM {llm_model!r} and llm_executor_uuid: {llm_executor_uuid!r}: {e!r}")
            return LLMAttempt(stage='execute', llm_model=llm_model, success=False, duration=duration, exception=e)

    async def _try_one_attempt_async(self, llm_model: LLMModelBase, execute_function: Callable[[Any], Any]) -> LLMAttempt:
        """
        Async version of _try_one_attempt that performs a single attempt with async LLM calls.
        
        Args:
            llm_model: The LLM model to try.
            execute_function: The async callback to execute with the llm.

        Returns:
            A detailed result of the attempt.
        """
        attempt_start_time = time.perf_counter()
        logger.info(f"Starting async attempt with LLM {llm_model!r}")
        
        try:
            llm = llm_model.create_llm()
        except Exception as e:
            duration = time.perf_counter() - attempt_start_time
            logger.error(f"Error creating LLM {llm_model!r} after {duration:.2f}s: {e!r}")
            return LLMAttempt(stage='create', llm_model=llm_model, success=False, duration=duration, exception=e)

        llm_executor_uuid = str(uuid4())
        try:
            logger.debug(f"LLMExecutor will invoke async execute_function. LLM {llm_model!r}. llm_executor_uuid: {llm_executor_uuid!r}")
            with instrument_tags({"llm_executor_uuid": llm_executor_uuid}):
                result = await execute_function(llm)
            duration = time.perf_counter() - attempt_start_time
            logger.info(f"LLMExecutor did invoke async execute_function. LLM {llm_model!r}. llm_executor_uuid: {llm_executor_uuid!r}. Duration: {duration:.2f} seconds")
            return LLMAttempt(stage='execute', llm_model=llm_model, success=True, duration=duration, result=result)
        except PipelineStopRequested as e:
            logger.info(f"LLMExecutor: Stopping because the async execute_function callback raised PipelineStopRequested: {e!r}")
            raise
        except Exception as e:
            duration = time.perf_counter() - attempt_start_time
            logger.error(f"LLMExecutor: error when invoking async execute_function. LLM {llm_model!r} and llm_executor_uuid: {llm_executor_uuid!r}: {e!r}")
            return LLMAttempt(stage='execute', llm_model=llm_model, success=False, duration=duration, exception=e)

    def _check_stop_callback(self, last_attempt: LLMAttempt, start_time: float, attempt_index: int) -> None:
        """Checks the callback, if it exists, to see if execution should stop."""
        if self.should_stop_callback is None:
            return
        
        parameters = ShouldStopCallbackParameters(
            last_attempt=last_attempt,
            total_duration=time.perf_counter() - start_time,
            attempt_index=attempt_index,
            total_attempts=len(self.llm_models)
        )
        
        try:
            self.should_stop_callback(parameters)
        except PipelineStopRequested as e:
            logger.warning(f"Callback raised PipelineStopRequested. Aborting execution after attempt {attempt_index}: {e}")
            raise

    def _raise_final_exception(self) -> None:
        """Raise the final exception when no attempt succeeds."""
        rows = []
        for attempt_index, attempt in enumerate(self.attempts):
            status = "success" if attempt.success else "failed"
            rows.append(f" - Attempt {attempt_index} with {attempt.llm_model!r} {status} during '{attempt.stage}' stage: {attempt.exception!r}")
        error_summary = "\n".join(rows)
        raise Exception(f"Failed to run. Exhausted all LLMs. Failure summary:\n{error_summary}")
