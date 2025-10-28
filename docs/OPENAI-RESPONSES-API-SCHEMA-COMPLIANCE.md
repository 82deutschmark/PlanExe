# OpenAI Responses API Schema Compliance Guide

## Problem Summary

The OpenAI Responses API now requires `additionalProperties: false` to be explicitly set in JSON schemas for structured outputs. Pydantic models that use `extra='allow'` or have no `model_config` will fail with HTTP 400 errors:

```
Error code: 400 - {'error': {'message': "Invalid schema for response_format 'ModelName': In context=(...), 'additionalProperties' is required to be supplied and to be false.", 'type': 'invalid_request_error', 'param': 'text.format.schema', 'code': 'invalid_json_schema'}}
```

## Root Cause

Pydantic v2 models used with `llm.as_structured_llm(ModelClass)` generate JSON schemas that don't explicitly set `additionalProperties: false`. The OpenAI Responses API now enforces this requirement strictly.

## Solution Pattern

Replace `model_config = {'extra': 'allow'}` with:

```python
from pydantic import BaseModel, Field, ConfigDict

class ModelName(BaseModel):
    field1: str = Field(description="...")
    # ... other fields
    
    model_config = ConfigDict(
        extra='forbid', 
        json_schema_extra={"additionalProperties": False}
    )
```

## Files That Need Fixing

### Critical Pipeline Files ( Luigi Tasks)

These files contain Pydantic models used with `as_structured_llm()` in the main Luigi pipeline. They WILL fail if not fixed:

#### Already Fixed (DO NOT modify again):
- ✅ `planexe/assume/identify_plan_type.py` - DocumentDetails (PlanTypeTask)
- ✅ `planexe/lever/identify_potential_levers.py` - Lever, DocumentDetails (PotentialLeversTask)  
- ✅ `planexe/lever/deduplicate_levers.py` - LeverDecision, DeduplicationAnalysis (DeduplicateLeversTask)
- ✅ `planexe/lever/select_scenario.py` - All models (SelectScenarioTask)
- ✅ `planexe/diagnostics/premise_attack.py` - DocumentDetails (PremiseAttackTask)

#### Still Need Fixing (HIGH PRIORITY):
1. `planexe/lever/focus_on_vital_few_levers.py`
   - Models: EnrichedLever, LeverAssessment, VitalLeversAssessmentResult
   - Used by: FocusOnVitalFewLeversTask

2. `planexe/lever/enrich_potential_levers.py`
   - Models: InputLever, LeverCharacterization, BatchCharacterizationResult, CharacterizedLever
   - Used by: EnrichLeversTask

3. `planexe/lever/candidate_scenarios.py`
   - Models: VitalLever, LeverSetting, Scenario, ScenarioAnalysisResult
   - Used by: CandidateScenariosTask

#### Medium Priority (Later Pipeline Stages):
4. `planexe/assume/make_assumptions.py`
   - Models: QuestionAssumptionItem, ExpertDetails
   - Used by: MakeAssumptionsTask

5. `planexe/assume/review_assumptions.py`
   - Models: ReviewItem, DocumentDetails
   - Used by: ReviewAssumptionsTask

6. `planexe/assume/distill_assumptions.py`
   - Models: AssumptionDetails
   - Used by: DistillAssumptionsTask

7. `planexe/assume/identify_risks.py`
   - Models: RiskItem, DocumentDetails
   - Used by: IdentifyRisksTask

8. `planexe/assume/physical_locations.py`
   - Models: PhysicalLocationItem, DocumentDetails
   - Used by: PhysicalLocationsTask

9. `planexe/assume/currency_strategy.py`
   - Models: CurrencyItem, DocumentDetails
   - Used by: CurrencyStrategyTask

10. `planexe/assume/identify_purpose.py`
    - Models: PlanPurposeInfo
    - Used by: IdentifyPurposeTask

#### WBS/Planning Tasks:
11. `planexe/plan/create_wbs_level1.py`
    - Models: WBSLevel1
    - Used by: CreateWBSLevel1Task

12. `planexe/plan/create_wbs_level2.py`
    - Models: SubtaskDetails, MajorPhaseDetails, WorkBreakdownStructure
    - Used by: CreateWBSLevel2Task

13. `planexe/plan/create_wbs_level3.py`
    - Models: WBSSubtask, WBSTaskDetails
    - Used by: CreateWBSLevel3Task

14. `planexe/plan/estimate_wbs_task_durations.py`
    - Models: TaskTimeEstimateDetail, TimeEstimates
    - Used by: EstimateWBSTaskDurationsTask

15. `planexe/plan/identify_wbs_task_dependencies.py`
    - Models: TaskDependencyDetail, DependencyMapping
    - Used by: IdentifyWBSTaskDependenciesTask

16. `planexe/plan/expert_cost.py`
    - Models: CostComponent, CostEstimateItem, ExpertCostEstimationResponse
    - Used by: ExpertCostTask

#### Lower Priority (Final Stages):
17. `planexe/plan/data_collection.py`
    - Models: AssumptionItem, PlannedDataCollectionItem, DocumentDetails
    - Used by: DataCollectionTask

18. `planexe/plan/related_resources.py`
    - Models: SuggestionItem, DocumentDetails
    - Used by: RelatedResourcesTask

19. `planexe/plan/executive_summary.py`
    - Models: DocumentDetails
    - Used by: ExecutiveSummaryTask

20. `planexe/plan/review_plan.py`
    - Models: DocumentDetails
    - Used by: ReviewPlanTask

21. `planexe/plan/project_plan.py`
    - Models: SMARTCriteria, RiskAssessmentAndMitigationStrategies, StakeholderAnalysis, RegulatoryAndComplianceRequirements, GoalDefinition
    - Used by: ProjectPlanTask

22. `planexe/pitch/create_pitch.py`
    - Models: ProjectPitch
    - Used by: CreatePitchTask

### Governance, Team, Document, Expert Modules

These are lower priority as they run later in the pipeline or are optional:

#### Governance:
- `planexe/governance/governance_phase1_audit.py` - DocumentDetails
- `planexe/governance/governance_phase2_bodies.py` - InternalGovernanceBody, DocumentDetails
- `planexe/governance/governance_phase3_impl_plan.py` - ImplementationStep, DocumentDetails
- `planexe/governance/governance_phase4_decision_escalation_matrix.py` - DecisionEscalationItem, DocumentDetails
- `planexe/governance/governance_phase5_monitoring_progress.py` - MonitoringProgress, DocumentDetails
- `planexe/governance/governance_phase6_extra.py` - DocumentDetails

#### Team:
- `planexe/team/find_team_members.py` - TeamMember, DocumentDetails
- `planexe/team/enrich_team_members_with_environment_info.py` - TeamMember, DocumentDetails
- `planexe/team/enrich_team_members_with_contract_type.py` - TeamMember, DocumentDetails
- `planexe/team/enrich_team_members_with_background_story.py` - TeamMember, TeamDetails
- `planexe/team/review_team.py` - ReviewItem, DocumentDetails

#### Document:
- `planexe/document/identify_documents.py` - CreateDocumentItem, FindDocumentItem, DocumentDetails, etc.
- `planexe/document/filter_documents_to_find.py` - DocumentItem, DocumentImpactAssessmentResult
- `planexe/document/filter_documents_to_create.py` - DocumentItem, DocumentImpactAssessmentResult
- `planexe/document/draft_document_to_find.py` - DocumentItem
- `planexe/document/draft_document_to_create.py` - DocumentItem

#### Expert:
- `planexe/expert/expert_finder.py` - Expert, ExpertDetails
- `planexe/expert/expert_criticism.py` - NegativeFeedbackItem, ExpertConsultation
- `planexe/expert/pre_project_assessment.py` - FeedbackItem, Expert, ExpertDetails

#### Other:
- `planexe/swot/swot_phase2_conduct_analysis.py` - SWOTAnalysis
- `planexe/questions_answers/questions_answers.py` - QuestionAnswerPair, DocumentDetails
- `planexe/fiction/fiction_writer.py` - BookDraft
- `planexe/diagnostics/premortem.py` - AssumptionItem, FailureModeItem, PremortemAnalysis
- `planexe/diagnostics/redline_gate.py` - Decision

## Files That DO NOT Need Fixing

### Test/Proof of Concept Files
These files are not part of the main pipeline and can be ignored:
- All files in `planexe/proof_of_concepts/`
- All files in `planexe/llm_util/tests/`
- `planexe/llm_util/track_activity.py`
- `planexe/llm_util/intercept_last_response.py`

### Files Without Structured LLM Usage
Files that don't use `as_structured_llm()` don't need fixing:
- `planexe/llm_util/schema_registry.py` (utility only)
- `planexe/llm_util/simple_openai_llm.py` (implements the method, doesn't use it)
- `planexe/intake/enriched_plan_intake.py` (not used with structured LLM)
- `planexe/lever/scenarios_markdown.py` (markdown generation, not structured LLM)
- `planexe/lever/strategic_decisions_markdown.py` (markdown generation, not structured LLM)

## Implementation Strategy

### Step 1: Fix High Priority Files
Start with the lever tasks since they're likely to hit next in the pipeline:
1. `focus_on_vital_few_levers.py`
2. `enrich_potential_levers.py` 
3. `candidate_scenarios.py`

### Step 2: Test Pipeline Progression
Run a plan after each fix to ensure the pipeline progresses further before hitting the next schema error.

### Step 3: Fix Remaining Files Methodically
Work through the remaining files in pipeline order, not all at once.

## Automated Detection Script

To identify which models need fixing, use this pattern:

```bash
# Find all files with as_structured_llm usage
grep -r "as_structured_llm" planexe/ --include="*.py" | grep -v proof_of_concepts | grep -v tests

# For each file found, check for model_config = {'extra': 'allow'}
grep -n "model_config.*extra.*allow" <filename>
```

## Verification

After fixing a file:
1. Check the model generates the correct schema:
```python
from your_module import YourModel
import json
schema = YourModel.model_json_schema()
print(json.dumps(schema, indent=2))
# Should show: "additionalProperties": false
```

2. Run a pipeline test to ensure the task progresses past the LLM call

## Important Notes

- **NEVER** use a blanket find/replace approach - some models legitimately need `extra='allow'`
- **ONLY** fix models that are actually used with `as_structured_llm()`
- **PRESERVE** all existing field descriptions and validation rules
- **TEST** after each fix to avoid breaking the pipeline
- **SKIP** proof-of-concept and test files - they're not part of the production pipeline

## Future Prevention

When creating new Pydantic models for structured LLM outputs:
1. Always use `ConfigDict(extra='forbid', json_schema_extra={"additionalProperties": False})`
2. Test the schema generation before committing
3. Include this requirement in code review guidelines
