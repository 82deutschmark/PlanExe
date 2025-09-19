# Run Plan Pipeline Documentation

## Overview

The `run_plan_pipeline.py` file is the core component of the PlanExe system that orchestrates the entire planning process. It defines a comprehensive pipeline using the Luigi task framework to generate detailed project plans from initial prompts.

## Key Components

### PlanTask Base Class

The `PlanTask` class is the foundation for all pipeline tasks. It extends `luigi.Task` and provides:

- **run_id_dir**: Path to the current run directory
- **speedvsdetail**: Controls the level of detail in processing (ALL_DETAILS_BUT_SLOW or FAST_BUT_SKIP_DETAILS)
- **llm_models**: List of LLM models to try in order of priority
- **LLMExecutor**: Handles LLM interactions with fallback mechanisms
- **Pipeline stopping mechanism**: Graceful handling of user interruptions

### Pipeline Tasks

The pipeline consists of multiple sequential and parallel tasks:

1. **Initial Analysis Tasks**
   - RedlineGateTask: Checks for sensitive content
   - PremiseAttackTask: Validates plan assumptions
   - IdentifyPurposeTask: Determines plan type (business/personal/other)
   - PlanTypeTask: Identifies if plan requires physical locations

2. **Strategic Planning Tasks**
   - PotentialLeversTask: Identifies adjustable factors
   - DeduplicateLeversTask: Removes redundant levers
   - EnrichLeversTask: Adds details to levers
   - FocusOnVitalFewLeversTask: Applies 80/20 principle
   - StrategicDecisionsMarkdownTask: Creates human-readable lever documentation

3. **Scenario Planning Tasks**
   - CandidateScenariosTask: Generates scenario combinations
   - SelectScenarioTask: Chooses the best scenario
   - ScenariosMarkdownTask: Documents scenarios

4. **Contextual Analysis Tasks**
   - PhysicalLocationsTask: Identifies required locations
   - CurrencyStrategyTask: Determines currency for financial planning
   - IdentifyRisksTask: Assesses potential risks

5. **Assumption Management Tasks**
   - MakeAssumptionsTask: Generates plan assumptions
   - DistillAssumptionsTask: Refines assumptions
   - ReviewAssumptionsTask: Validates assumptions
   - ConsolidateAssumptionsMarkdownTask: Combines assumption documents

6. **Project Planning Tasks**
   - PreProjectAssessmentTask: Evaluates project feasibility
   - ProjectPlanTask: Creates detailed project plan

7. **Governance Tasks**
   - GovernancePhase1-6 Tasks: Comprehensive governance framework
   - ConsolidateGovernanceTask: Combines governance documents

8. **Resource Planning Tasks**
   - RelatedResourcesTask: Identifies similar projects
   - Team Planning Tasks: Builds project team structure
   - SWOTAnalysisTask: Strengths, Weaknesses, Opportunities, Threats
   - ExpertReviewTask: Gets expert feedback

9. **Documentation Tasks**
   - DataCollectionTask: Determines required data
   - Document identification and filtering tasks
   - Drafting tasks for documents to create/find

10. **Work Breakdown Structure (WBS) Tasks**
    - CreateWBSLevel1-3 Tasks: Hierarchical task breakdown
    - WBSProject Tasks: Combines WBS levels
    - Task dependency and duration estimation

11. **Planning Output Tasks**
    - CreateScheduleTask: Generates project schedule
    - ReviewPlanTask: Final plan review
    - ExecutiveSummaryTask: High-level overview
    - QuestionsAndAnswersTask: Addresses key questions
    - PremortemTask: Identifies potential failures
    - ReportTask: Generates final HTML report

12. **Pipeline Control**
    - FullPlanPipeline: Orchestrates all tasks
    - ExecutePipeline: Manages pipeline execution

## Key Features

### LLM Resilience
- Multiple LLM models can be specified with fallback mechanisms
- Automatic retry with different models if one fails
- Graceful error handling and reporting

### Progress Tracking
- Real-time progress percentage calculation
- Callback mechanism for task completion
- Detailed logging to file and console

### Pipeline Control
- Speed vs Detail settings for development vs production
- Graceful stopping mechanism
- Resume capability for interrupted runs

### Output Management
- Structured file naming conventions
- Multiple output formats (JSON, Markdown, HTML, CSV)
- Comprehensive error handling

## Potential Pitfalls for Developers

### 1. LLM Dependency Issues

**Problem**: The pipeline heavily depends on LLM responses. If models are not properly configured or are unavailable, tasks will fail.

**Solution**: 
- Ensure `llm_config.json` is properly configured
- Test with multiple model providers
- Implement proper error handling in custom tasks
- Monitor LLM response quality and adjust prompts as needed

### 2. Task Dependency Complexity

**Problem**: The pipeline has complex task dependencies that can be difficult to understand and modify.

**Solution**:
- Use the Luigi visualization tools to understand dependencies
- Make incremental changes to task dependencies
- Test thoroughly after any dependency changes
- Document any custom task additions

### 3. Performance Considerations

**Problem**: The pipeline can be very slow with `ALL_DETAILS_BUT_SLOW` setting due to many LLM calls.

**Solution**:
- Use `FAST_BUT_SKIP_DETAILS` during development
- Implement caching for expensive operations
- Monitor execution time for each task
- Consider parallelizing independent tasks

### 4. File System Dependencies

**Problem**: The pipeline expects specific files in the run directory structure.

**Solution**:
- Ensure `START_TIME` and `INITIAL_PLAN` files exist before pipeline start
- Follow the established file naming conventions
- Handle file I/O errors gracefully
- Clean up temporary files appropriately

### 5. Memory Usage

**Problem**: Large JSON objects and multiple LLM contexts can consume significant memory.

**Solution**:
- Monitor memory usage during execution
- Process large data in chunks when possible
- Release unused resources promptly
- Consider using generators for large datasets

### 6. Error Recovery

**Problem**: When a task fails, it can be difficult to determine the root cause.

**Solution**:
- Implement detailed logging in custom tasks
- Use the `TRACK_ACTIVITY_JSONL` file for debugging
- Check the `log.txt` file in the run directory
- Implement proper exception handling with meaningful messages

### 7. Resume Functionality

**Problem**: Resuming an interrupted pipeline can be tricky.

**Solution**:
- Remove the `999-pipeline_complete.txt` file to resume a completed run
- Ensure all required input files are still present
- Check Luigi's built-in resume capabilities
- Monitor for partial/incomplete output files

### 8. Custom Task Development

**Problem**: Adding new tasks to the pipeline requires understanding of the existing structure.

**Solution**:
- Follow the existing task patterns
- Properly define task dependencies
- Implement both `run_with_llm` and `run_inner` methods as appropriate
- Add appropriate output file definitions
- Test new tasks in isolation before integrating

## Best Practices

1. **Task Implementation**:
   - Extend `PlanTask` for all new tasks
   - Implement appropriate `requires()` method
   - Define clear output files
   - Handle both success and failure cases

2. **LLM Interaction**:
   - Use the provided `LLMExecutor` for resilience
   - Format prompts clearly with context
   - Handle LLM response parsing carefully
   - Implement timeouts for LLM calls

3. **File Management**:
   - Use the `FilenameEnum` for consistent naming
   - Handle file I/O errors gracefully
   - Clean up temporary files
   - Validate file contents before processing

4. **Progress Tracking**:
   - Implement callback methods for long-running tasks
   - Provide meaningful progress messages
   - Update progress percentage accurately

5. **Error Handling**:
   - Catch specific exceptions when possible
   - Provide meaningful error messages
   - Log errors with appropriate detail
   - Implement recovery mechanisms where possible

## Debugging Tips

1. Check the `log.txt` file in the run directory for detailed logs
2. Use Luigi's visualization tools to understand task dependencies
3. Monitor the `TRACK_ACTIVITY_JSONL` file for LLM interactions
4. Verify all required input files are present
5. Check LLM model configurations in `llm_config.json`
6. Use development mode (`FAST_BUT_SKIP_DETAILS`) for faster iteration

## Extending the Pipeline

To add new functionality to the pipeline:

1. Create a new task class extending `PlanTask`
2. Implement the required methods (`requires`, `output`, `run_with_llm` or `run_inner`)
3. Add the task to the `FullPlanPipeline.requires()` method
4. Update the `ReportTask` to include any new output in the final report
5. Test thoroughly with both speed settings

## Configuration

Key environment variables:
- `RUN_ID_DIR`: Path to the current run directory
- `SPEED_VS_DETAIL`: Processing speed setting
- `LLM_MODEL`: Primary LLM model to use

Ensure these are properly set before running the pipeline.
