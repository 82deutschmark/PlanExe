# Luigi Pipeline Dependency Chain

## Legend:
- 🔴 **Sequential Bottleneck**: Major concurrency opportunity identified
- 🟡 **Medium Opportunity**: Some concurrency possible  
- ✅ **Already Optimal**: Current structure is efficient

1. StartTimeTask
   └── 2. SetupTask
       ├── 3. RedlineGateTask
       │   └── 4. PremiseAttackTask
       │       └── 5. IdentifyPurposeTask
       │           ├── 6. MakeAssumptionsTask
       │           │   └── 7. DistillAssumptionsTask
       │           │       └── 8. ReviewAssumptionsTask
       │           │           └── 9. IdentifyRisksTask
       │           │               ├── 57. RiskMatrixTask
       │           │               │   └── 58. RiskMitigationPlanTask
       │           │               └── (feeds into Governance & Report later)
       │           ├── 10. CurrencyStrategyTask
       │           └── 11. PhysicalLocationsTask
       │
       ├── 12. StrategicDecisionsMarkdownTask
       │   └── 13. ScenariosMarkdownTask
       │       └── 14. ExpertFinder 🔴
       │           └── 15. ExpertCriticism 🔴
       │               └── 16. ExpertOrchestrator 🔴
       │
       ├── 17. CreateWBSLevel1
       │   └── 18. CreateWBSLevel2
       │       └── 19. CreateWBSLevel3 🔴
       │           ├── 20. IdentifyWBSTaskDependencies
       │           ├── 21. EstimateWBSTaskDurations 🔴
       │           ├── 22. WBSPopulate
       │           ├── 23. WBSTaskTooltip
       │           └── (→ feeds into 24. WBSTask & 25. WBSProject)
       │               └── 26. ProjectSchedulePopulator
       │                   └── 27. ProjectSchedule
       │                       ├── 28. ExportGanttDHTMLX
       │                       ├── 29. ExportGanttCSV
       │                       └── 30. ExportGanttMermaid
       │
       ├── 31. FindTeamMembers
       │   ├── 32. EnrichTeamMembersWithContractType
       │   ├── 33. EnrichTeamMembersWithBackgroundStory
       │   ├── 34. EnrichTeamMembersWithEnvironmentInfo
       │   └── 35. TeamMarkdownDocumentBuilder
       │       └── 36. ReviewTeam
       │
       ├── 37. CreatePitch
       │   └── 38. ConvertPitchToMarkdown
       │
       ├── 39. ExecutiveSummary
       ├── 40. ReviewPlan
       ├── 41. ReportGenerator
       │
       ├── 42. GovernancePhase1AuditTask
       │   └── 43. GovernancePhase2InternalBodiesTask
       │       ├── 44. GovernancePhase3ImplementationPlanTask
       │       └── 45. GovernancePhase4DecisionMatrixTask 🟡
       │       └── 46. GovernancePhase5MonitoringTask 🟡
       │       └── 47. GovernancePhase6ExtraTask 🟡
       │           └── 48. ConsolidateGovernanceTask
       │
       ├── 49. DataCollection
       ├── 50. ObtainOutputFiles
       ├── 51. PipelineEnvironment
       ├── 52. LLMExecutor
       │
       ├── 53. WBSJSONExporter
       ├── 54. WBSDotExporter
       ├── 55. WBSPNGExporter
       ├── 56. WBSPDFExporter
       │
       ├── 59. BudgetEstimationTask
       │   └── 60. CashflowProjectionTask
       │
       └── 61. FinalReportAssembler
           ├── merges Governance outputs
           ├── merges Risk outputs
           ├── merges WBS & Schedule exports
           ├── merges Team documents
           ├── merges Pitch & Executive Summary
           └── produces **Final Report**

## Missing Task Groups (Added for Complete Picture):

### Document Processing Pipeline 🔴 **MAJOR BOTTLENECK**
├── 62. IdentifyDocumentsTask
│   ├── 63. FilterDocumentsToFindTask
│   │   └── 64. DraftDocumentsToFindTask 🔴 **Sequential Processing**
│   └── 65. FilterDocumentsToCreateTask
│       └── 66. DraftDocumentsToCreateTask 🔴 **Sequential Processing**

### Questions & Answers Generation 🟡
├── 67. QuestionsAnswersTask
│   └── Sequential Q&A pair generation (5 pairs per call)

### Pre-Project Assessment ✅
├── 68. PreProjectAssessmentTask
│   └── Feeds into multiple downstream tasks

## Concurrency Opportunities Summary:

### 🔴 **High Impact (Sequential Bottlenecks):**
1. **ExpertCriticism**: Processes 2-3 experts sequentially → Can run concurrently
2. **DraftDocumentsToFind**: Processes 5-10 documents sequentially → Can run concurrently  
3. **DraftDocumentsToCreate**: Processes 5-10 documents sequentially → Can run concurrently
4. **CreateWBSLevel3**: Decomposes tasks sequentially → Can run concurrently
5. **EstimateWBSTaskDurations**: Processes task chunks sequentially → Can run concurrently

### 🟡 **Medium Impact:**
1. **Governance Phases 4-6**: Could run concurrently after phases 2-3 complete
2. **QuestionsAnswers**: Sequential Q&A generation could be batched

### ✅ **Already Optimal:**
1. **Team Enrichment**: Sequential chain required for progressive enrichment
2. **WBS Levels 1-2**: Hierarchical dependency requires sequence
3. **Main Pipeline Flow**: Core dependencies are appropriately structured

## Implementation Notes:
- Tasks marked 🔴 represent the **highest priority optimization targets**
- Governance phases 4-6 (🟡) have identical dependencies and can run in parallel
- Document processing tasks are the **biggest opportunity** with 75% potential time reduction
- Expert processing tasks offer **50% potential time reduction** with minimal complexity

See `docs/pipeline-concurrency-optimization.md` for detailed implementation strategy and performance estimates.