# Enhanced Error Visibility and Actionable Feedback - Implementation Plan

## Objective
Provide users with actionable error context when pipeline tasks fail by surfacing error messages, failure types, and recovery suggestions throughout the recovery page UI.

## Files to Modify

### Backend
- `D:\GitHub\PlanExe\planexe_api\database.py` - Add failure tracking fields to Plan model
- `D:\GitHub\PlanExe\planexe_api\models.py` - Enhance MissingSection with error metadata
- `D:\GitHub\PlanExe\planexe_api\api.py` - Enhance fallback-report endpoint with error details
- `D:\GitHub\PlanExe\planexe_api\services\pipeline_execution_service.py` - Capture and persist failure reasons

### Frontend
- `D:\GitHub\PlanExe\planexe-frontend\src\lib\api\fastapi-client.ts` - Add error field types
- `D:\GitHub\PlanExe\planexe-frontend\src\app\recovery\components\ResumeDialog.tsx` - Display error details
- `D:\GitHub\PlanExe\planexe-frontend\src\app\recovery\components\RecoveryHeader.tsx` - Show failure summary
- `D:\GitHub\PlanExe\planexe-frontend\src\app\recovery\components\LiveStreamPanel.tsx` - Enhance error display
- `D:\GitHub\PlanExe\planexe-frontend\src\app\recovery\page.tsx` - Integrate error parsing

## Implementation Tasks

### Phase 1: Backend Error Tracking

1. Add failure tracking columns to Plan model in `database.py`
   - Add `failed_task_name` Column(String(255), nullable=True)
   - Add `failure_reason` Column(Text, nullable=True)
   - Add `failure_type` Column(String(50), nullable=True) for categorization
   - Add `failed_at` Column(DateTime, nullable=True) timestamp

2. Extend MissingSection schema in `models.py`
   - Add `error_message` Optional[str] field with actual exception text
   - Add `error_type` Optional[str] field (validation_failed, llm_timeout, dependency_missing, exception)
   - Add `retry_count` Optional[int] field tracking retry attempts
   - Add `timestamp` Optional[datetime] field for failure time
   - Add `stack_trace` Optional[str] field for debugging (truncated to 2000 chars)

3. Enhance `_assemble_fallback_report` in `api.py` to populate error metadata
   - Query PlanContent table for task failure metadata
   - Map content_type to error categorization
   - For each missing section, check if PlanContent has partial/error state
   - Populate MissingSection with error_message from exception logs
   - Infer error_type from stage name and content patterns
   - Set retry_count from content metadata if available

4. Capture failure context in `pipeline_execution_service.py`
   - Parse Luigi subprocess stderr for task failure patterns
   - Extract task name from "===== Luigi Execution Summary =====" section
   - Capture exception messages from traceback patterns
   - Update Plan model with failed_task_name, failure_reason, failure_type on completion
   - Store first 500 chars of stderr as failure_reason
   - Set failure_type based on error patterns: "timeout", "validation", "dependency", "llm_error", "unknown"

### Phase 2: Frontend Error Display Enhancement

5. Add error types to `fastapi-client.ts`
   - Update MissingSectionResponse interface with error fields
   - Add FailureType enum matching backend categories
   - Update PlanResponse to include failed_task_name and failure_reason

6. Enhance ResumeDialog in `ResumeDialog.tsx`
   - Add error badge next to each missing item filename
   - Color-code by error_type: red (exception), yellow (timeout), orange (validation), gray (dependency)
   - Add expandable error details section with chevron icon
   - Display full error_message in collapsed accordion under each item
   - Show retry_count if &gt; 0 with "Attempted X times" badge
   - Add timestamp for failure in human-readable format
   - Group tasks by error_type first, then by stage

7. Add failure summary to RecoveryHeader in `RecoveryHeader.tsx`
   - When plan.status === "failed", show alert banner above status card
   - Display "Failed at Task: {failed_task_name}" with error icon
   - Show truncated failure_reason (first 200 chars) with "View Details" link
   - Link opens modal or scrolls to error in logs
   - Add "Jump to Errors" button that filters log panel
   - Color-code banner by failure_type

8. Enhance LiveStreamPanel error display in `LiveStreamPanel.tsx`
   - When stream.status === "failed", show expanded error section
   - Display full error message with monospace font
   - Add "Copy Error" button for easy sharing
   - Show error_type badge prominently
   - Display retry suggestion based on error_type

### Phase 3: Log Error Highlighting

9. Create log parser utility in `recovery/utils/logParser.ts`
   - Export parseLogForErrors(logText: string) function
   - Return array of {lineNumber, errorText, errorType} objects
   - Detect patterns: "ERROR", "FAILED", "Exception", "Traceback", "Task failed"
   - Classify error severity: critical (Exception), error (FAILED), warning (timeout)

10. Add error filtering to log display component (create or modify existing)
   - Add "Show Errors Only" toggle button above log panel
   - Add "Jump to Next Error" navigation buttons
   - Highlight error lines with red-100 background
   - Highlight warning lines with yellow-50 background
   - Add red left border stripe on error lines
   - Show error count summary: "3 errors, 2 warnings"

11. Implement log error navigation
   - Create scrollToError(errorIndex: number) function
   - Use refs to scroll to highlighted lines
   - Add keyboard shortcuts: 'n' for next error, 'p' for previous
   - Show current error position indicator: "Error 2 of 5"

### Phase 4: Integration and Polish

12. Wire error data flow in recovery page
   - Fetch enhanced fallback-report with error metadata
   - Pass error details to ResumeDialog component
   - Parse logs on component mount to identify error lines
   - Store error positions in state for navigation

13. Add error-aware suggestions
   - For llm_timeout errors, suggest increasing timeout or using faster model
   - For validation errors, show affected schema field
   - For dependency errors, list missing prerequisite tasks
   - Display suggestions in ResumeDialog under each error

14. Update error messaging for clarity
   - Replace generic "Missing from plan_content table" with specific reasons
   - Show "Task timed out after 180s" instead of "timeout"
   - Display "Schema validation failed: missing required field 'description'" for validation errors
   - Use friendly language: "This task couldn't complete because..." instead of raw exceptions

15. Add error filtering to resume flow
   - Pre-select only failed tasks (not skipped dependencies)
   - Add filter buttons: "All", "Errors Only", "Timeouts Only"
   - Show task count per filter category
   - Default to "Errors Only" selection

## Integration Points

- `fallback-report` endpoint provides error metadata to recovery page
- PipelineExecutionService captures and persists failure context during execution
- ResumeDialog consumes enhanced MissingSection data for error display
- RecoveryHeader reads Plan.failure_reason for summary banner
- Log parsing utilities shared across recovery components

## Validation

Implementation complete. User testing will validate:
- Error messages are actionable and clear
- Log error highlighting improves debugging workflow
- Resume dialog shows which tasks truly need attention
- Failure summary provides quick context without diving into logs
