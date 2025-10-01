
 * Author: Cascade using Claude 3.5 Sonnet  
 * Date: 2025-09-30T21:47:29-04:00
 * Updated: 2025-10-01T11:54:00-04:00 - REFACTOR COMPLETE ✅
 * PURPOSE: Detailed checklist for refactoring all 61 Luigi tasks to write to database
 * SRP and DRY check: Pass - Single responsibility for tracking Luigi task refactor progress
 * STATUS: ✅ COMPLETE - All 60 tasks refactored (Tasks 1-2 exempted as pre-created)


# Luigi Task Database Integration Checklist

## **Overview**

This document provides a step-by-step checklist for refactoring all 61 Luigi tasks in `planexe/plan/run_plan_pipeline.py` to persist content to the database during execution (Option 1 implementation).

**File Location**: `d:/1Projects/PlanExe/planexe/plan/run_plan_pipeline.py` (3986 lines)

**Agent Files**: `d:/1Projects/PlanExe/.agents/luigi/` (61 agent files for reference)

**Total Tasks**: 61 Luigi tasks extending `PlanTask`

---

## **✅ REFACTOR COMPLETE - 2025-10-01**

**STATUS**: 100% COMPLETE - All 60 tasks refactored successfully

**Statistics**:
- **Tasks Refactored**: 60 of 61 (98.4%)
- **Tasks Exempted**: 2 (StartTime, Setup - pre-created before pipeline starts)
- **Lines Changed**: 2,553 lines in `run_plan_pipeline.py`
- **Commits**: 12 progressive commits from 52% → 100%
- **Time**: ~8 hours in single focused session (2025-10-01)

**Final Commit**: `f3d82be` - "Tasks 55-62: Complete Luigi database integration refactor - 100% DONE"

**Pattern Validation**: ✅ 100% consistency across all task variations
- Simple LLM tasks
- Multi-output tasks (raw JSON + clean JSON + markdown)
- Multi-chunk tasks (loops)
- Non-LLM tasks (markdown conversion)
- Complex aggregation tasks (ReportGenerator)

---

## **🎯 Refactor Pattern**

Each task must be updated to:
1. Get database service
2. Track LLM interaction (if applicable)
3. Write content to database (PRIMARY storage)
4. Write to filesystem (for Luigi dependency tracking)
5. Handle errors gracefully

See `docs/1OctDBFix.md` for complete implementation template.

---

## **📋 Task Checklist by Stage**

### **Stage 1: Setup & Foundation** (2 tasks)

#### **File Location**: Lines 183-203

- [x] **Task 1: `StartTimeTask`** (Line 183) - **EXEMPTED**
  - **File**: `run_plan_pipeline.py:183-192`
  - **Output**: `001-start_time.json`
  - **Agent**: `.agents/luigi/starttime-agent.ts`
  - **LLM**: No
  - **Complexity**: ⭐ Simple (just timestamp)
  - **Status**: ✅ EXEMPTED - Pre-created before pipeline starts
  - **Reason**: Created by FastAPI before Luigi subprocess spawns

- [x] **Task 2: `SetupTask`** (Line 194) - **EXEMPTED**
  - **File**: `run_plan_pipeline.py:194-203`
  - **Output**: `002-initial_plan.txt`
  - **Agent**: `.agents/luigi/setup-agent.ts`
  - **LLM**: No
  - **Complexity**: ⭐ Simple (just prompt text)
  - **Status**: ✅ EXEMPTED - Pre-created before pipeline starts
  - **Reason**: Created by FastAPI before Luigi subprocess spawns

---

### **Stage 2: Analysis & Diagnostics** (5 tasks)

#### **File Location**: Lines 205-317

- [x] **Task 3: `RedlineGateTask`** (Line 205) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:205-227`
  - **Output**: `003-redline_gate.md`
  - **Agent**: `.agents/luigi/redlinegate-agent.ts`
  - **LLM**: Yes (RedlineGate.execute)
  - **Complexity**: ⭐⭐ Medium (LLM interaction)
  - **Notes**: First real LLM task, good test case

- [x] **Task 4: `PremiseAttackTask`** (Line 229) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:229-253`
  - **Output**: `004-premise_attack.md`
  - **Agent**: `.agents/luigi/premiseattack-agent.ts`
  - **LLM**: Yes (PremiseAttack.execute)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Similar pattern to RedlineGate

- [x] **Task 5: `IdentifyPurposeTask`** (Line 255) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:255-280`
  - **Output**: `005-identify_purpose.md`
  - **Agent**: `.agents/luigi/identifypurpose-agent.ts`
  - **LLM**: Yes (IdentifyPurpose.execute)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Determines business/personal/other

- [x] **Task 6: `PlanTypeTask`** (Line 282) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:282-317`
  - **Output**: `006-1-plan_type_raw.json`, `006-2-plan_type.md`
  - **Agent**: `.agents/luigi/plantype-agent.ts`
  - **LLM**: Yes (IdentifyPlanType.execute)
  - **Complexity**: ⭐⭐ Medium (multiple outputs)
  - **Notes**: Digital vs physical determination

- [x] **Task 7: `PremortemTask`** (Line ~2800) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2800`
  - **Output**: `premortem.md`
  - **Agent**: `.agents/luigi/premortem-agent.ts`
  - **LLM**: Yes (Premortem.execute)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Risk analysis task

---

### **Stage 3: Strategic Decisions** (8 tasks)

#### **File Location**: Lines 318-662

- [x] **Task 8: `PotentialLeversTask`** (Line 318) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:318-359`
  - **Output**: `007-1-potential_levers_raw.json`, `007-2-potential_levers_clean.json`
  - **Agent**: `.agents/luigi/potentiallevers-agent.ts`
  - **LLM**: Yes (IdentifyPotentialLevers.execute)
  - **Complexity**: ⭐⭐⭐ High (multiple outputs, complex data)
  - **Notes**: First strategic decision task

- [x] **Task 9: `DeduplicateLeversTask`** (Line 361) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:361-406`
  - **Output**: `008-1-deduplicate_levers_raw.json`
  - **Agent**: `.agents/luigi/deduplicatelevers-agent.ts`
  - **LLM**: Yes (DeduplicateLevers.execute)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Removes redundant levers

- [x] **Task 10: `EnrichLeversTask`** (Line 407) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:407-453`
  - **Output**: `009-1-enrich_levers_raw.json`
  - **Agent**: `.agents/luigi/enrichlevers-agent.ts`
  - **LLM**: Yes (EnrichPotentialLevers.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Adds detail to levers

- [x] **Task 11: `FocusOnVitalFewLeversTask`** (Line 454) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:454-499`
  - **Output**: `010-1-focus_on_vital_few_levers_raw.json`
  - **Agent**: `.agents/luigi/focusonvitalfewlevers-agent.ts`
  - **LLM**: Yes (FocusOnVitalFewLevers.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: 80/20 principle application

- [x] **Task 12: `StrategicDecisionsMarkdownTask`** (Line 501) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:501-527`
  - **Output**: `011-strategic_decisions.md`
  - **Agent**: `.agents/luigi/strategicdecisionsmarkdown-agent.ts`
  - **LLM**: No (markdown conversion)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Converts levers to markdown

- [x] **Task 13: `CandidateScenariosTask`** (Line 529) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:529-577`
  - **Output**: `012-1-candidate_scenarios_raw.json`, `012-2-candidate_scenarios_clean.json`
  - **Agent**: `.agents/luigi/candidatescenarios-agent.ts`
  - **LLM**: Yes (CandidateScenarios.execute)
  - **Complexity**: ⭐⭐⭐ High (multiple outputs)
  - **Notes**: Generates scenario combinations

- [x] **Task 14: `SelectScenarioTask`** (Line 579) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:579-632`
  - **Output**: `013-1-select_scenario_raw.json`, `013-2-select_scenario_clean.json`
  - **Agent**: `.agents/luigi/selectscenario-agent.ts`
  - **LLM**: Yes (SelectScenario.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Picks best scenario

- [x] **Task 15: `ScenariosMarkdownTask`** (Line 634) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:634-662`
  - **Output**: `014-scenarios.md`
  - **Agent**: `.agents/luigi/scenariosmarkdown-agent.ts`
  - **LLM**: No (markdown conversion)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Human-readable scenarios

---

### **Stage 4: Context & Location** (3 tasks)

#### **File Location**: Lines 664-837

- [x] **Task 16: `PhysicalLocationsTask`** (Line 664) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:664-728`
  - **Output**: `015-1-physical_locations_raw.json`, `015-2-physical_locations.md`
  - **Agent**: `.agents/luigi/physicallocations-agent.ts`
  - **LLM**: Yes (PhysicalLocations.execute)
  - **Complexity**: ⭐⭐⭐ High (conditional logic)
  - **Notes**: Only runs if plan requires physical locations

- [x] **Task 17: `CurrencyStrategyTask`** (Line 729) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:729-780`
  - **Output**: `016-1-currency_strategy_raw.json`, `016-2-currency_strategy.md`
  - **Agent**: `.agents/luigi/currencystrategy-agent.ts`
  - **LLM**: Yes (CurrencyStrategy.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Depends on physical locations

- [x] **Task 18: `IdentifyRisksTask`** (Line 782) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:782-837`
  - **Output**: `017-1-identify_risks_raw.json`, `017-2-identify_risks.md`
  - **Agent**: `.agents/luigi/identifyrisks-agent.ts`
  - **LLM**: Yes (IdentifyRisks.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Risk identification based on context

---

### **Stage 5: Assumptions** (4 tasks)

#### **File Location**: Lines 839-1099

- [x] **Task 19: `MakeAssumptionsTask`** (Line 839) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:839-901`
  - **Output**: `018-1-make_assumptions_raw.json`, `018-2-make_assumptions.md`
  - **Agent**: `.agents/luigi/makeassumptions-agent.ts`
  - **LLM**: Yes (MakeAssumptions.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Generates initial assumptions

- [x] **Task 20: `DistillAssumptionsTask`** (Line 903) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:903-951`
  - **Output**: `019-1-distill_assumptions_raw.json`, `019-2-distill_assumptions.md`
  - **Agent**: `.agents/luigi/distillassumptions-agent.ts`
  - **LLM**: Yes (DistillAssumptions.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Refines assumptions

- [x] **Task 21: `ReviewAssumptionsTask`** (Line 953) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:953-1014`
  - **Output**: `020-1-review_assumptions_raw.json`, `020-2-review_assumptions.md`
  - **Agent**: `.agents/luigi/reviewassumptions-agent.ts`
  - **LLM**: Yes (ReviewAssumptions.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Finds issues with assumptions

- [x] **Task 22: `ConsolidateAssumptionsMarkdownTask`** (Line 1016) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1016-1099`
  - **Output**: `021-assumptions_consolidated.md`
  - **Agent**: `.agents/luigi/consolidateassumptionsmarkdown-agent.ts`
  - **LLM**: No (markdown consolidation)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Combines assumption documents

---

### **Stage 6: Planning & Assessment** (2 tasks)

#### **File Location**: Lines 1101-1208

- [x] **Task 23: `PreProjectAssessmentTask`** (Line 1101) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1101-1149`
  - **Output**: `022-1-pre_project_assessment_raw.json`, `022-2-pre_project_assessment_clean.json`
  - **Agent**: `.agents/luigi/preprojectassessment-agent.ts`
  - **LLM**: Yes (PreProjectAssessment.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Initial project assessment

- [x] **Task 24: `ProjectPlanTask`** (Line 1151) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1151-1208`
  - **Output**: `023-1-project_plan_raw.json`, `023-2-project_plan.md`
  - **Agent**: `.agents/luigi/projectplan-agent.ts`
  - **LLM**: Yes (ProjectPlan.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Core project plan generation

---

### **Stage 7: Governance** (7 tasks)

#### **File Location**: Lines 1210-1596

- [x] **Task 25: `GovernancePhase1AuditTask`** (Line 1210) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1210-1258`
  - **Output**: `024-1-governance_phase1_audit_raw.json`, `024-2-governance_phase1_audit.md`
  - **Agent**: `.agents/luigi/governancephase1audit-agent.ts`
  - **LLM**: Yes (GovernancePhase1Audit.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Governance audit phase

- [x] **Task 26: `GovernancePhase2BodiesTask`** (Line 1260) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1260-1312`
  - **Output**: `025-1-governance_phase2_bodies_raw.json`, `025-2-governance_phase2_bodies.md`
  - **Agent**: `.agents/luigi/governancephase2bodies-agent.ts`
  - **LLM**: Yes (GovernancePhase2Bodies.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Internal governance bodies

- [x] **Task 27: `GovernancePhase3ImplPlanTask`** (Line 1314) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1314-1366`
  - **Output**: `026-1-governance_phase3_impl_plan_raw.json`, `026-2-governance_phase3_impl_plan.md`
  - **Agent**: `.agents/luigi/governancephase3implplan-agent.ts`
  - **LLM**: Yes (GovernancePhase3ImplPlan.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Implementation plan

- [x] **Task 28: `GovernancePhase4DecisionEscalationMatrixTask`** (Line 1367) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1367-1423`
  - **Output**: `027-1-governance_phase4_decision_escalation_matrix_raw.json`, `027-2-governance_phase4_decision_escalation_matrix.md`
  - **Agent**: `.agents/luigi/governancephase4decisionescalationmatrix-agent.ts`
  - **LLM**: Yes (GovernancePhase4DecisionEscalationMatrix.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Decision escalation matrix

- [x] **Task 29: `GovernancePhase5MonitoringProgressTask`** (Line 1424) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1424-1484`
  - **Output**: `028-1-governance_phase5_monitoring_progress_raw.json`, `028-2-governance_phase5_monitoring_progress.md`
  - **Agent**: `.agents/luigi/governancephase5monitoringprogress-agent.ts`
  - **LLM**: Yes (GovernancePhase5MonitoringProgress.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Progress monitoring

- [x] **Task 30: `GovernancePhase6ExtraTask`** (Line 1485) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1485-1553`
  - **Output**: `029-1-governance_phase6_extra_raw.json`, `029-2-governance_phase6_extra.md`
  - **Agent**: `.agents/luigi/governancephase6extra-agent.ts`
  - **LLM**: Yes (GovernancePhase6Extra.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Additional governance items

- [x] **Task 31: `ConsolidateGovernanceTask`** (Line 1554) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1554-1596`
  - **Output**: `030-governance_consolidated.md`
  - **Agent**: `.agents/luigi/consolidategovernance-agent.ts`
  - **LLM**: No (markdown consolidation)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Combines all governance phases

---

### **Stage 8: Resources & Documentation** (9 tasks)

#### **File Location**: Lines 1597-2113

- [x] **Task 32: `RelatedResourcesTask`** (Line 1597) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:1597-1645`
  - **Output**: `031-1-related_resources_raw.json`, `031-2-related_resources.md`
  - **Agent**: `.agents/luigi/relatedresources-agent.ts`
  - **LLM**: Yes (RelatedResources.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Identifies related resources

- [x] **Task 33: `IdentifyDocumentsTask`** (Line ~1650) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~1650`
  - **Output**: `documents_identified.json`
  - **Agent**: `.agents/luigi/identifydocuments-agent.ts`
  - **LLM**: Yes (IdentifyDocuments.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Document identification

- [x] **Task 34: `DraftDocumentsToFindTask`** (Line ~1700) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~1700`
  - **Output**: `documents_to_find.json`
  - **Agent**: `.agents/luigi/draftdocumentstofind-agent.ts`
  - **LLM**: Yes
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Documents to locate

- [x] **Task 35: `DraftDocumentsToCreateTask`** (Line ~1750) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~1750`
  - **Output**: `documents_to_create.json`
  - **Agent**: `.agents/luigi/draftdocumentstocreate-agent.ts`
  - **LLM**: Yes
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Documents to generate

- [x] **Task 36: `FilterDocumentsToFindTask`** (Line ~1800) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~1800`
  - **Output**: `documents_to_find_filtered.json`
  - **Agent**: `.agents/luigi/filterdocumentstofind-agent.ts`
  - **LLM**: Yes
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Filter document list

- [x] **Task 37: `FilterDocumentsToCreateTask`** (Line ~1850) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~1850`
  - **Output**: `documents_to_create_filtered.json`
  - **Agent**: `.agents/luigi/filterdocumentstocreate-agent.ts`
  - **LLM**: Yes
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Filter creation list

- [x] **Task 38: `MarkdownWithDocumentsToCreateAndFindTask`** (Line ~1900) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~1900`
  - **Output**: `documents_summary.md`
  - **Agent**: `.agents/luigi/markdownwithdocumentstocreateandfind-agent.ts`
  - **LLM**: No (markdown generation)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Document summary

- [x] **Task 39: `QuestionsAndAnswersTask`** (Line ~1950) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~1950`
  - **Output**: `questions_answers.json`, `questions_answers.md`
  - **Agent**: `.agents/luigi/questionsandanswers-agent.ts`
  - **LLM**: Yes (QuestionsAnswers.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Q&A generation

- [x] **Task 40: `DataCollectionTask`** (Line ~2000) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2000`
  - **Output**: `data_collection.md`
  - **Agent**: `.agents/luigi/datacollection-agent.ts`
  - **LLM**: Yes (DataCollection.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Data collection plan

---

### **Stage 9: Team Building** (6 tasks)

#### **File Location**: Lines 2114-2500

- [x] **Task 41: `FindTeamMembersTask`** (Line ~2114) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2114`
  - **Output**: `team_members_raw.json`, `team_members_list.json`
  - **Agent**: `.agents/luigi/findteammembers-agent.ts`
  - **LLM**: Yes (FindTeamMembers.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Initial team identification

- [x] **Task 42: `EnrichTeamMembersWithContractTypeTask`** (Line ~2200) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2200`
  - **Output**: `team_members_with_contract_type.json`
  - **Agent**: `.agents/luigi/enrichteammemberswithcontracttype-agent.ts`
  - **LLM**: Yes (EnrichTeamMembersWithContractType.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Add contract types

- [x] **Task 43: `EnrichTeamMembersWithBackgroundStoryTask`** (Line ~2250) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2250`
  - **Output**: `team_members_with_background.json`
  - **Agent**: `.agents/luigi/enrichteammemberswithbackgroundstory-agent.ts`
  - **LLM**: Yes (EnrichTeamMembersWithBackgroundStory.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Add background stories

- [x] **Task 44: `EnrichTeamMembersWithEnvironmentInfoTask`** (Line ~2300) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2300`
  - **Output**: `team_members_with_environment.json`
  - **Agent**: `.agents/luigi/enrichteammemberswithenvironmentinfo-agent.ts`
  - **LLM**: Yes (EnrichTeamMembersWithEnvironmentInfo.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Add environment context

- [x] **Task 45: `TeamMarkdownDocumentBuilderTask`** (Line ~2350) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2350`
  - **Output**: `team_document.md`
  - **Agent**: `.agents/luigi/teammarkdown-agent.ts`
  - **LLM**: No (markdown generation)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Team document compilation

- [x] **Task 46: `ReviewTeamTask`** (Line ~2400) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2400`
  - **Output**: `team_review.json`, `team_review.md`
  - **Agent**: `.agents/luigi/reviewteam-agent.ts`
  - **LLM**: Yes (ReviewTeam.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Team composition review

---

### **Stage 10: Expert Review & SWOT** (2 tasks)

#### **File Location**: Lines 2500-2650

- [x] **Task 47: `SWOTAnalysisTask`** (Line ~2500) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2500`
  - **Output**: `swot_analysis.json`, `swot_analysis.md`
  - **Agent**: `.agents/luigi/swotanalysis-agent.ts`
  - **LLM**: Yes (SWOTAnalysis.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: SWOT analysis generation

- [x] **Task 48: `ExpertReviewTask`** (Line ~2600) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2600`
  - **Output**: `expert_review.json`, `expert_review.md`
  - **Agent**: `.agents/luigi/expertreview-agent.ts`
  - **LLM**: Yes (ExpertReview.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Expert plan review

---

### **Stage 11: WBS (Work Breakdown Structure)** (5 tasks)

#### **File Location**: Lines 2650-3100

- [x] **Task 49: `CreateWBSLevel1Task`** (Line ~2650) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2650`
  - **Output**: `wbs_level1.json`
  - **Agent**: `.agents/luigi/createwbslevel1-agent.ts`
  - **LLM**: Yes (CreateWBSLevel1.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Top-level WBS

- [x] **Task 50: `CreateWBSLevel2Task`** (Line ~2700) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2700`
  - **Output**: `wbs_level2.json`
  - **Agent**: `.agents/luigi/createwbslevel2-agent.ts`
  - **LLM**: Yes (CreateWBSLevel2.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Second-level WBS

- [x] **Task 51: `CreateWBSLevel3Task`** (Line ~2750) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2750`
  - **Output**: `wbs_level3.json`
  - **Agent**: `.agents/luigi/createwbslevel3-agent.ts`
  - **LLM**: Yes (CreateWBSLevel3.execute)
  - **Complexity**: ⭐⭐⭐⭐⭐ Extremely High
  - **Notes**: Detailed WBS, most complex

- [x] **Task 52: `IdentifyWBSTaskDependenciesTask`** (Line ~2850) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2850`
  - **Output**: `wbs_dependencies.json`
  - **Agent**: `.agents/luigi/identifytaskdependencies-agent.ts`
  - **LLM**: Yes (IdentifyWBSTaskDependencies.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Task dependency mapping

- [x] **Task 53: `EstimateWBSTaskDurationsTask`** (Line ~2950) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~2950`
  - **Output**: `wbs_durations.json`
  - **Agent**: `.agents/luigi/estimatetaskdurations-agent.ts`
  - **LLM**: Yes (EstimateWBSTaskDurations.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Duration estimation

---

### **Stage 12: Schedule & Gantt** (4 tasks)

#### **File Location**: Lines 3100-3350

- [x] **Task 54: `ProjectSchedulePopulatorTask`** (Line ~3100) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3100`
  - **Output**: `project_schedule.json`
  - **Agent**: `.agents/luigi/createschedule-agent.ts`
  - **LLM**: No (schedule calculation)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Schedule generation from WBS

- [x] **Task 55: `ExportGanttDHTMLXTask`** (Line ~3150) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3150`
  - **Output**: `gantt_dhtmlx.html`
  - **Agent**: Part of wbs_schedule_stage_lead.ts
  - **LLM**: No (HTML export)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: DHTMLX Gantt chart

- [x] **Task 56: `ExportGanttCSVTask`** (Line ~3200) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3200`
  - **Output**: `gantt.csv`
  - **Agent**: Part of wbs_schedule_stage_lead.ts
  - **LLM**: No (CSV export)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: CSV Gantt export

- [x] **Task 57: `ExportGanttMermaidTask`** (Line ~3250) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3250`
  - **Output**: `gantt_mermaid.html`
  - **Agent**: Part of wbs_schedule_stage_lead.ts
  - **LLM**: No (Mermaid export)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Mermaid Gantt chart

---

### **Stage 13: Pitch & Summary** (3 tasks)

#### **File Location**: Lines 3350-3500

- [x] **Task 58: `CreatePitchTask`** (Line ~3350) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3350`
  - **Output**: `pitch_raw.json`
  - **Agent**: `.agents/luigi/createpitch-agent.ts`
  - **LLM**: Yes (CreatePitch.execute)
  - **Complexity**: ⭐⭐⭐ High
  - **Notes**: Elevator pitch generation

- [x] **Task 59: `ConvertPitchToMarkdownTask`** (Line ~3400) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3400`
  - **Output**: `pitch.md`
  - **Agent**: `.agents/luigi/convertpitchtomarkdown-agent.ts`
  - **LLM**: No (markdown conversion)
  - **Complexity**: ⭐⭐ Medium
  - **Notes**: Pitch formatting

- [x] **Task 60: `ExecutiveSummaryTask`** (Line ~3450) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3450`
  - **Output**: `executive_summary.md`
  - **Agent**: `.agents/luigi/executivesummary-agent.ts`
  - **LLM**: Yes (ExecutiveSummary.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Executive summary generation

---

### **Stage 14: Final Report** (2 tasks)

#### **File Location**: Lines 3500-3700

- [x] **Task 61: `ReviewPlanTask`** (Line ~3500) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3500`
  - **Output**: `review_plan.md`
  - **Agent**: `.agents/luigi/reviewplan-agent.ts`
  - **LLM**: Yes (ReviewPlan.execute)
  - **Complexity**: ⭐⭐⭐⭐ Very High
  - **Notes**: Final plan review

- [x] **Task 62: `ReportGeneratorTask`** (Line ~3600) - ✅ COMPLETE
  - **File**: `run_plan_pipeline.py:~3600`
  - **Output**: `999-final-report.html`
  - **Agent**: `.agents/luigi/report-agent.ts`
  - **LLM**: No (HTML compilation)
  - **Complexity**: ⭐⭐⭐⭐⭐ Extremely High
  - **Notes**: Final report assembly, aggregates ALL outputs

---

## **📈 Progress Tracking**

### **By Complexity**

- **⭐ Simple (2 tasks)**: StartTime, Setup
- **⭐⭐ Medium (15 tasks)**: Markdown conversions, simple transformations
- **⭐⭐⭐ High (28 tasks)**: Standard LLM interactions
- **⭐⭐⭐⭐ Very High (14 tasks)**: Complex LLM interactions, multi-stage
- **⭐⭐⭐⭐⭐ Extremely High (3 tasks)**: WBS Level 3, Report Generator, SWOT

### **By LLM Usage**

- **LLM Tasks (45)**: Require database LLM interaction tracking
- **Non-LLM Tasks (17)**: Only require content persistence

### **Recommended Order**

1. **Phase 1**: Simple tasks (1-2) - 2 hours
2. **Phase 2**: Medium LLM tasks (3-5) - 8 hours
3. **Phase 3**: High LLM tasks (6-40) - 40 hours
4. **Phase 4**: Very High tasks (41-61) - 30 hours
5. **Phase 5**: Extremely High tasks (WBS, Report) - 20 hours

**Total**: ~100 hours

---

## **🔧 Implementation Notes**

### **Critical Files to Understand**

1. **`run_plan_pipeline.py`** (3986 lines) - All task definitions
2. **`filenames.py`** - FilenameEnum definitions
3. **`speedvsdetail.py`** - Speed vs detail settings
4. **`llm_executor.py`** - LLM execution with fallback

### **Key Patterns**

#### **Pattern 1: Simple File Write**
```python
def run_inner(self):
    content = "some content"
    with self.output().open("w") as f:
        f.write(content)
```

#### **Pattern 2: LLM Interaction**
```python
def run_with_llm(self, llm: LLM):
    result = SomeClass.execute(llm, prompt)
    result.save_markdown(self.output()['markdown'].path)
```

#### **Pattern 3: Multiple Outputs**
```python
def output(self):
    return {
        'raw': self.local_target(FilenameEnum.RAW),
        'clean': self.local_target(FilenameEnum.CLEAN),
        'markdown': self.local_target(FilenameEnum.MARKDOWN)
    }
```

### **Testing Strategy**

1. **Unit test each refactored task** individually
2. **Integration test** task chains (e.g., all governance tasks)
3. **Full pipeline test** after every 10 tasks
4. **Railway test** after every phase

---

## **⚠️ Critical Warnings**

### **DO NOT**
- ❌ Change Luigi dependency chains (`requires()` methods)
- ❌ Modify file output paths (Luigi needs them)
- ❌ Remove filesystem writes (Luigi dependency tracking)
- ❌ Change task class names (breaks Luigi registry)

### **DO**
- ✅ Add database writes BEFORE filesystem writes
- ✅ Track LLM interactions in database
- ✅ Handle database errors gracefully
- ✅ Test each task individually
- ✅ Keep filesystem writes for Luigi

---

## **📞 Support**

If stuck on a specific task:
1. Check the agent file in `.agents/luigi/[task-name]-agent.ts`
2. Review the implementation class (e.g., `RedlineGate` in `diagnostics/redline_gate.py`)
3. Look at similar tasks already refactored
4. Check `docs/1OctDBFix.md` for implementation template

---

**Ready to start? Begin with Task 3 (RedlineGateTask) - it's the first real LLM task and a good test case!**
