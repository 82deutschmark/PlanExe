#!/usr/bin/env python3
"""
Script to add model_config = {'extra': 'allow'} to all Pydantic models 
used with structured LLM outputs to prevent validation errors.

Author: Cascade
Date: 2025-10-27
PURPOSE: Fix Pydantic validation errors across the entire codebase
SRP and DRY check: Pass - Script focuses on model configuration fixes
"""

import os
import re
import logging
from pathlib import Path
from typing import List, Set

logger = logging.getLogger(__name__)

# Files that contain Pydantic models used with structured LLM outputs
STRUCTURED_LLM_FILES = [
    "planexe/team/enrich_team_members_with_environment_info.py",
    "planexe/team/enrich_team_members_with_contract_type.py", 
    "planexe/team/enrich_team_members_with_background_story.py",
    "planexe/swot/swot_phase2_conduct_analysis.py",
    "planexe/questions_answers/questions_answers.py",
    "planexe/plan/create_wbs_level1.py",
    "planexe/plan/create_wbs_level2.py", 
    "planexe/plan/create_wbs_level3.py",
    "planexe/plan/data_collection.py",
    "planexe/plan/executive_summary.py",
    "planexe/plan/estimate_wbs_task_durations.py",
    "planexe/plan/identify_wbs_task_dependencies.py",
    "planexe/plan/project_plan.py",
    "planexe/plan/review_plan.py",
    "planexe/plan/related_resources.py",
    "planexe/plan/expert_cost.py",
    "planexe/pitch/create_pitch.py",
    "planexe/lever/select_scenario.py",
    "planexe/lever/identify_potential_levers.py",
    "planexe/lever/focus_on_vital_few_levers.py",
    "planexe/lever/enrich_potential_levers.py",
    "planexe/lever/deduplicate_levers.py",
    "planexe/lever/candidate_scenarios.py",
    "planexe/governance/governance_phase6_extra.py",
    "planexe/governance/governance_phase5_monitoring_progress.py",
    "planexe/governance/governance_phase4_decision_escalation_matrix.py",
    "planexe/governance/governance_phase3_impl_plan.py",
    "planexe/governance/governance_phase2_bodies.py",
    "planexe/governance/governance_phase1_audit.py",
    "planexe/expert/expert_finder.py",
    "planexe/expert/pre_project_assessment.py",
    "planexe/expert/expert_criticism.py",
    "planexe/document/identify_documents.py",
    "planexe/document/filter_documents_to_find.py",
    "planexe/document/filter_documents_to_create.py",
    "planexe/document/draft_document_to_find.py",
    "planexe/document/draft_document_to_create.py",
    "planexe/diagnostics/premise_attack.py",
    "planexe/diagnostics/redline_gate.py",
    "planexe/diagnostics/premortem.py",
    "planexe/diagnostics/experimental_premise_attack6.py",
    "planexe/diagnostics/experimental_premise_attack5.py",
    "planexe/diagnostics/experimental_premise_attack4.py",
    "planexe/diagnostics/experimental_premise_attack2.py",
    "planexe/diagnostics/experimental_premise_attack1.py",
    "planexe/assume/currency_strategy.py",
    "planexe/assume/distill_assumptions.py",
    "planexe/assume/identify_plan_type.py",
    "planexe/assume/identify_purpose.py",
    "planexe/assume/physical_locations.py",
    "planexe/assume/review_assumptions.py",
    "planexe/assume/identify_risks.py",
    "planexe/fiction/fiction_writer.py"
]

def add_model_config_to_file(file_path: str) -> bool:
    """Add model_config = {'extra': 'allow'} to Pydantic models in a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find all Pydantic BaseModel classes
        class_pattern = r'(class\s+(\w+)\s*\(.*BaseModel.*\):\s*.*?)(?=\n\nclass|\n\n[A-Z]|\Z)'
        
        def add_config_to_class(match):
            class_content = match.group(1)
            class_name = match.group(2)
            
            # Skip if already has model_config
            if 'model_config' in class_content:
                return class_content
            
            # Find the end of the class definition (before the next class or end)
            lines = class_content.split('\n')
            config_line = "    model_config = {'extra': 'allow'}"
            
            # Find the last Field definition or method to insert config before it
            insert_index = len(lines)
            for i, line in enumerate(lines):
                if line.strip().startswith('def ') or line.strip().startswith('@'):
                    insert_index = i
                    break
                elif line.strip() and not line.strip().startswith('#') and '=' not in line and not line.strip().endswith(':'):
                    # Likely the end of field definitions
                    insert_index = i + 1
                    break
            
            # Insert the model_config
            lines.insert(insert_index, config_line)
            return '\n'.join(lines)
        
        modified_content = re.sub(class_pattern, add_config_to_class, content, flags=re.DOTALL)
        
        if modified_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(modified_content)
            logger.info(f"Added model_config to classes in {file_path}")
            return True
        
        return False
        
    except Exception as e:
        logger.error(f"Error processing {file_path}: {e}")
        return False

def main():
    """Main function to fix all Pydantic models."""
    base_path = Path(__file__).parent
    fixed_files = []
    
    for relative_path in STRUCTURED_LLM_FILES:
        file_path = base_path / relative_path
        if file_path.exists():
            if add_model_config_to_file(str(file_path)):
                fixed_files.append(relative_path)
        else:
            logger.warning(f"File not found: {file_path}")
    
    print(f"Fixed {len(fixed_files)} files:")
    for file_path in fixed_files:
        print(f"  - {file_path}")

if __name__ == "__main__":
    main()
