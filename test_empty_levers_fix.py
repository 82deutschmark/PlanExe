#!/usr/bin/env python3
"""
Test script to verify empty lever handling fixes.
This script tests that the pipeline can handle empty lever lists gracefully
without crashing at any stage.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'planexe'))

from planexe.lever.focus_on_vital_few_levers import FocusOnVitalFewLevers
from planexe.lever.candidate_scenarios import CandidateScenarios
from planexe.lever.enrich_potential_levers import EnrichPotentialLevers
from planexe.lever.select_scenario import SelectScenario

def test_empty_focus_on_vital_few_levers():
    """Test that FocusOnVitalFewLevers handles empty input gracefully."""
    print("Testing FocusOnVitalFewLevers with empty input...")
    
    # Mock LLMExecutor for testing
    class MockLLMExecutor:
        def run(self, execute_function):
            # Should not be called for empty input
            pass
    
    result = FocusOnVitalFewLevers.execute(
        llm_executor=MockLLMExecutor(),
        project_context="Test project context",
        raw_levers_list=[],
        reasoning_effort="minimal"
    )
    
    assert result.vital_levers == []
    assert result.response.lever_assessments == []
    assert "No levers were identified" in result.response.summary
    print("✓ FocusOnVitalFewLevers handles empty input correctly")

def test_empty_candidate_scenarios():
    """Test that CandidateScenarios handles empty vital levers gracefully."""
    print("Testing CandidateScenarios with empty vital levers...")
    
    class MockLLMExecutor:
        def run(self, execute_function):
            # Should not be called for empty input
            pass
    
    result = CandidateScenarios.execute(
        llm_executor=MockLLMExecutor(),
        project_context="Test project context",
        raw_vital_levers=[],
        reasoning_effort="minimal"
    )
    
    assert len(result.response.scenarios) == 3
    assert result.response.scenarios[0].scenario_name == "Standard Implementation Approach"
    assert result.response.scenarios[1].scenario_name == "Conservative Risk-Managed Approach"
    assert result.response.scenarios[2].scenario_name == "Agile Innovation-First Approach"
    assert "No Vital Levers Identified" in result.response.analysis_title
    print("✓ CandidateScenarios handles empty vital levers correctly")

def test_empty_enrich_potential_levers():
    """Test that EnrichPotentialLevers handles empty input gracefully."""
    print("Testing EnrichPotentialLevers with empty input...")
    
    class MockLLMExecutor:
        def run(self, execute_function):
            # Should not be called for empty input
            pass
    
    result = EnrichPotentialLevers.execute(
        llm_executor=MockLLMExecutor(),
        project_context="Test project context",
        raw_levers_list=[],
        reasoning_effort="minimal"
    )
    
    assert result.characterized_levers == []
    assert len(result.metadata) == 1
    assert result.metadata[0]["llm_classname"] == "empty_input"
    print("✓ EnrichPotentialLevers handles empty input correctly")

def test_empty_select_scenario():
    """Test that SelectScenario handles empty scenarios gracefully."""
    print("Testing SelectScenario with empty scenarios...")
    
    class MockLLMExecutor:
        def run(self, execute_function):
            # Should not be called for empty input
            pass
    
    result = SelectScenario.execute(
        llm_executor=MockLLMExecutor(),
        project_context="Test project context",
        scenarios=[],
        reasoning_effort="minimal"
    )
    
    assert result.response.final_choice.chosen_scenario == "Standard Implementation Approach"
    assert "No scenarios were provided" in result.response.final_choice.rationale
    assert result.response.scenario_assessments == []
    print("✓ SelectScenario handles empty scenarios correctly")

def main():
    """Run all empty lever tests."""
    print("Running empty lever handling tests...\n")
    
    try:
        test_empty_focus_on_vital_few_levers()
        test_empty_candidate_scenarios()
        test_empty_enrich_potential_levers()
        test_empty_select_scenario()
        
        print("\n🎉 All tests passed! Empty lever handling is working correctly.")
        print("The pipeline should now be able to complete even when no levers are identified.")
        return 0
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
