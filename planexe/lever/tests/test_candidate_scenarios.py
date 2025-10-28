# Author: Cascade
# Date: 2025-10-28T15:30:00Z
# PURPOSE: Regression tests for candidate_scenarios to ensure VitalLever schema accepts enriched metadata from upstream tasks.
# SRP and DRY check: Pass. Focused unit test for VitalLever model, reuses existing implementation without duplication.

import unittest

from planexe.lever.candidate_scenarios import VitalLever


class TestVitalLeverModel(unittest.TestCase):
    def test_vital_lever_accepts_enriched_metadata(self):
        payload = {
            "lever_id": "lever-123",
            "name": "Sustainable Supply Chain",
            "options": ["Local suppliers", "Hybrid sourcing"],
            "review": "Critical procurement pathway decisions.",
            "consequences": "Immediate: Increased resilience; Long-term: higher costs.",
            "description": "Defines sourcing strategies balancing resilience and cost.",
            "synergy_text": "Aligns with eco-brand positioning initiatives.",
            "conflict_text": "Conflicts with cost-optimization mandate.",
            "deduplication_justification": "Unique focus on supply chain climate resilience.",
        }

        model = VitalLever(**payload)

        self.assertEqual(model.lever_id, payload["lever_id"])
        self.assertEqual(model.consequences, payload["consequences"])
        self.assertEqual(model.deduplication_justification, payload["deduplication_justification"])


if __name__ == "__main__":
    unittest.main()
