/**
 * Author: Cascade
 * Date: 2025-10-28
 * PURPOSE: Complete Luigi pipeline task metadata for visualization
 * Extracted from docs/LUIGI.md
 */

export interface PipelineTask {
  id: number;
  stage: string;
  name: string;
  description: string;
  stageGroup: string;
  dependencies: number[];
  color: string;
}

export const PIPELINE_TASKS: PipelineTask[] = [
  // Setup Stage
  { id: 1, stage: 'start_time', name: 'Start Time', description: 'Initialize pipeline execution', stageGroup: 'Setup', dependencies: [], color: 'bg-slate-100' },
  { id: 2, stage: 'setup', name: 'Setup', description: 'Configure pipeline environment', stageGroup: 'Setup', dependencies: [1], color: 'bg-slate-100' },
  
  // Analysis Stage
  { id: 3, stage: 'redline_gate', name: 'Redline Gate', description: 'Check for sensitive content', stageGroup: 'Analysis', dependencies: [2], color: 'bg-blue-100' },
  { id: 4, stage: 'premise_attack', name: 'Premise Attack', description: 'Validate plan assumptions', stageGroup: 'Analysis', dependencies: [3], color: 'bg-blue-100' },
  { id: 5, stage: 'identify_purpose', name: 'Purpose Analysis', description: 'Determine project type (business/personal/creative)', stageGroup: 'Analysis', dependencies: [4], color: 'bg-blue-100' },
  { id: 6, stage: 'make_assumptions', name: 'Make Assumptions', description: 'Generate initial plan assumptions', stageGroup: 'Analysis', dependencies: [5], color: 'bg-blue-100' },
  { id: 7, stage: 'distill_assumptions', name: 'Distill Assumptions', description: 'Refine and consolidate assumptions', stageGroup: 'Analysis', dependencies: [6], color: 'bg-blue-100' },
  { id: 8, stage: 'review_assumptions', name: 'Review Assumptions', description: 'Validate assumption quality', stageGroup: 'Analysis', dependencies: [7], color: 'bg-blue-100' },
  { id: 9, stage: 'identify_risks', name: 'Identify Risks', description: 'Assess potential risks and challenges', stageGroup: 'Analysis', dependencies: [8], color: 'bg-blue-100' },
  { id: 10, stage: 'currency_strategy', name: 'Currency Strategy', description: 'Determine financial currency approach', stageGroup: 'Analysis', dependencies: [5], color: 'bg-blue-100' },
  { id: 11, stage: 'physical_locations', name: 'Physical Locations', description: 'Identify required physical locations', stageGroup: 'Analysis', dependencies: [5], color: 'bg-blue-100' },
  
  // Strategic Stage
  { id: 12, stage: 'strategic_decisions', name: 'Strategic Decisions', description: 'Document strategic levers and decisions', stageGroup: 'Strategic', dependencies: [2], color: 'bg-purple-100' },
  { id: 13, stage: 'scenarios_markdown', name: 'Scenarios', description: 'Generate and document planning scenarios', stageGroup: 'Strategic', dependencies: [12], color: 'bg-purple-100' },
  { id: 14, stage: 'expert_finder', name: 'Expert Finder', description: 'Identify relevant domain experts', stageGroup: 'Strategic', dependencies: [13], color: 'bg-purple-100' },
  { id: 15, stage: 'expert_criticism', name: 'Expert Criticism', description: 'Gather expert feedback on plan', stageGroup: 'Strategic', dependencies: [14], color: 'bg-purple-100' },
  { id: 16, stage: 'expert_orchestrator', name: 'Expert Orchestrator', description: 'Synthesize expert feedback', stageGroup: 'Strategic', dependencies: [15], color: 'bg-purple-100' },
  
  // WBS Stage
  { id: 17, stage: 'create_wbs_level1', name: 'WBS Level 1', description: 'Create top-level work breakdown', stageGroup: 'WBS', dependencies: [2], color: 'bg-green-100' },
  { id: 18, stage: 'create_wbs_level2', name: 'WBS Level 2', description: 'Detailed second-level breakdown', stageGroup: 'WBS', dependencies: [17], color: 'bg-green-100' },
  { id: 19, stage: 'create_wbs_level3', name: 'WBS Level 3', description: 'Granular third-level tasks', stageGroup: 'WBS', dependencies: [18], color: 'bg-green-100' },
  { id: 20, stage: 'identify_wbs_task_dependencies', name: 'Task Dependencies', description: 'Map task relationships', stageGroup: 'WBS', dependencies: [19], color: 'bg-green-100' },
  { id: 21, stage: 'estimate_wbs_task_durations', name: 'Task Durations', description: 'Estimate time for each task', stageGroup: 'WBS', dependencies: [19], color: 'bg-green-100' },
  { id: 22, stage: 'wbs_populate', name: 'WBS Populate', description: 'Populate WBS with details', stageGroup: 'WBS', dependencies: [19], color: 'bg-green-100' },
  { id: 23, stage: 'wbs_task_tooltip', name: 'WBS Tooltips', description: 'Add task descriptions', stageGroup: 'WBS', dependencies: [19], color: 'bg-green-100' },
  { id: 24, stage: 'wbs_task', name: 'WBS Task', description: 'Finalize WBS tasks', stageGroup: 'WBS', dependencies: [22, 23], color: 'bg-green-100' },
  { id: 25, stage: 'wbs_project', name: 'WBS Project', description: 'Consolidate WBS project', stageGroup: 'WBS', dependencies: [24], color: 'bg-green-100' },
  
  // Scheduling Stage
  { id: 26, stage: 'project_schedule_populator', name: 'Schedule Populator', description: 'Generate project schedule', stageGroup: 'Scheduling', dependencies: [25], color: 'bg-amber-100' },
  { id: 27, stage: 'project_schedule', name: 'Project Schedule', description: 'Finalize timeline', stageGroup: 'Scheduling', dependencies: [26], color: 'bg-amber-100' },
  { id: 28, stage: 'export_gantt_dhtmlx', name: 'Gantt DHTMLX', description: 'Export interactive Gantt chart', stageGroup: 'Scheduling', dependencies: [27], color: 'bg-amber-100' },
  { id: 29, stage: 'export_gantt_csv', name: 'Gantt CSV', description: 'Export CSV format', stageGroup: 'Scheduling', dependencies: [27], color: 'bg-amber-100' },
  { id: 30, stage: 'export_gantt_mermaid', name: 'Gantt Mermaid', description: 'Export Mermaid diagram', stageGroup: 'Scheduling', dependencies: [27], color: 'bg-amber-100' },
  
  // Team Stage
  { id: 31, stage: 'find_team_members', name: 'Find Team', description: 'Identify required team members', stageGroup: 'Team', dependencies: [2], color: 'bg-pink-100' },
  { id: 32, stage: 'enrich_team_contract_type', name: 'Contract Types', description: 'Define employment types', stageGroup: 'Team', dependencies: [31], color: 'bg-pink-100' },
  { id: 33, stage: 'enrich_team_background', name: 'Team Backgrounds', description: 'Add member backgrounds', stageGroup: 'Team', dependencies: [31], color: 'bg-pink-100' },
  { id: 34, stage: 'enrich_team_environment', name: 'Team Environment', description: 'Define work environment', stageGroup: 'Team', dependencies: [31], color: 'bg-pink-100' },
  { id: 35, stage: 'team_markdown_document', name: 'Team Document', description: 'Generate team documentation', stageGroup: 'Team', dependencies: [32, 33, 34], color: 'bg-pink-100' },
  { id: 36, stage: 'review_team', name: 'Review Team', description: 'Validate team structure', stageGroup: 'Team', dependencies: [35], color: 'bg-pink-100' },
  
  // Pitch Stage
  { id: 37, stage: 'create_pitch', name: 'Create Pitch', description: 'Generate project pitch', stageGroup: 'Pitch', dependencies: [2], color: 'bg-orange-100' },
  { id: 38, stage: 'convert_pitch_to_markdown', name: 'Pitch Markdown', description: 'Format pitch document', stageGroup: 'Pitch', dependencies: [37], color: 'bg-orange-100' },
  
  // Reports Stage
  { id: 39, stage: 'executive_summary', name: 'Executive Summary', description: 'High-level overview', stageGroup: 'Reports', dependencies: [2], color: 'bg-indigo-100' },
  { id: 40, stage: 'review_plan', name: 'Review Plan', description: 'Final plan review', stageGroup: 'Reports', dependencies: [2], color: 'bg-indigo-100' },
  { id: 41, stage: 'report_generator', name: 'Report Generator', description: 'Generate reports', stageGroup: 'Reports', dependencies: [2], color: 'bg-indigo-100' },
  
  // Governance Stage
  { id: 42, stage: 'governance_phase1_audit', name: 'Governance Audit', description: 'Phase 1: Governance audit', stageGroup: 'Governance', dependencies: [2], color: 'bg-cyan-100' },
  { id: 43, stage: 'governance_phase2_bodies', name: 'Governance Bodies', description: 'Phase 2: Internal governance', stageGroup: 'Governance', dependencies: [42], color: 'bg-cyan-100' },
  { id: 44, stage: 'governance_phase3_impl_plan', name: 'Implementation Plan', description: 'Phase 3: Governance implementation', stageGroup: 'Governance', dependencies: [43], color: 'bg-cyan-100' },
  { id: 45, stage: 'governance_phase4_decision_matrix', name: 'Decision Matrix', description: 'Phase 4: Decision escalation', stageGroup: 'Governance', dependencies: [43], color: 'bg-cyan-100' },
  { id: 46, stage: 'governance_phase5_monitoring', name: 'Monitoring', description: 'Phase 5: Progress monitoring', stageGroup: 'Governance', dependencies: [43], color: 'bg-cyan-100' },
  { id: 47, stage: 'governance_phase6_extra', name: 'Governance Extra', description: 'Phase 6: Additional governance', stageGroup: 'Governance', dependencies: [43], color: 'bg-cyan-100' },
  { id: 48, stage: 'consolidate_governance', name: 'Consolidate Governance', description: 'Merge all governance phases', stageGroup: 'Governance', dependencies: [44, 45, 46, 47], color: 'bg-cyan-100' },
  
  // Documents Stage
  { id: 49, stage: 'data_collection', name: 'Data Collection', description: 'Identify required data', stageGroup: 'Documents', dependencies: [2], color: 'bg-yellow-100' },
  { id: 50, stage: 'obtain_output_files', name: 'Output Files', description: 'Gather output files', stageGroup: 'Documents', dependencies: [2], color: 'bg-yellow-100' },
  { id: 51, stage: 'pipeline_environment', name: 'Pipeline Environment', description: 'Setup environment', stageGroup: 'Documents', dependencies: [2], color: 'bg-yellow-100' },
  { id: 52, stage: 'llm_executor', name: 'LLM Executor', description: 'Execute LLM calls', stageGroup: 'Documents', dependencies: [2], color: 'bg-yellow-100' },
  
  // Risk Stage
  { id: 57, stage: 'risk_matrix', name: 'Risk Matrix', description: 'Create risk matrix', stageGroup: 'Risk', dependencies: [9], color: 'bg-red-100' },
  { id: 58, stage: 'risk_mitigation_plan', name: 'Risk Mitigation', description: 'Plan risk mitigation', stageGroup: 'Risk', dependencies: [57], color: 'bg-red-100' },
  
  // Budget Stage
  { id: 59, stage: 'budget_estimation', name: 'Budget Estimation', description: 'Estimate project budget', stageGroup: 'Budget', dependencies: [2], color: 'bg-emerald-100' },
  { id: 60, stage: 'cashflow_projection', name: 'Cashflow Projection', description: 'Project cash flow', stageGroup: 'Budget', dependencies: [59], color: 'bg-emerald-100' },
  
  // Final Stage
  { id: 61, stage: 'final_report_assembler', name: 'Final Report', description: 'Assemble complete report', stageGroup: 'Final', dependencies: [48, 58, 30, 36, 38, 39], color: 'bg-violet-100' },
];

export const STAGE_GROUPS = [
  { name: 'Setup', color: 'border-slate-300 bg-slate-50' },
  { name: 'Analysis', color: 'border-blue-300 bg-blue-50' },
  { name: 'Strategic', color: 'border-purple-300 bg-purple-50' },
  { name: 'WBS', color: 'border-green-300 bg-green-50' },
  { name: 'Scheduling', color: 'border-amber-300 bg-amber-50' },
  { name: 'Team', color: 'border-pink-300 bg-pink-50' },
  { name: 'Pitch', color: 'border-orange-300 bg-orange-50' },
  { name: 'Reports', color: 'border-indigo-300 bg-indigo-50' },
  { name: 'Governance', color: 'border-cyan-300 bg-cyan-50' },
  { name: 'Documents', color: 'border-yellow-300 bg-yellow-50' },
  { name: 'Risk', color: 'border-red-300 bg-red-50' },
  { name: 'Budget', color: 'border-emerald-300 bg-emerald-50' },
  { name: 'Final', color: 'border-violet-300 bg-violet-50' },
];

// Map stream stage names to task IDs
export function getTaskByStage(stage: string): PipelineTask | undefined {
  return PIPELINE_TASKS.find(t => t.stage === stage);
}

export function getTaskProgress(completedStreams: { stage: string; status: string }[]): {
  completed: number[];
  failed: number[];
  total: number;
} {
  const completed = new Set<number>();
  const failed = new Set<number>();
  
  completedStreams.forEach(stream => {
    const task = getTaskByStage(stream.stage);
    if (task) {
      if (stream.status === 'completed') {
        completed.add(task.id);
      } else if (stream.status === 'failed') {
        failed.add(task.id);
      }
    }
  });
  
  return {
    completed: Array.from(completed),
    failed: Array.from(failed),
    total: PIPELINE_TASKS.length,
  };
}
