"""
Unit tests for AdaptiveRefreshScaler.

Tests the adaptive polling interval scaling logic that reduces egress costs
by intelligently increasing sleep intervals when data becomes stale.
"""
import pytest
import time
from planexe.utils.adaptive_refresh_scaler import AdaptiveRefreshScaler, IntervalTier


class TestAdaptiveRefreshScaler:
    """Test suite for AdaptiveRefreshScaler"""

    def test_initial_interval(self):
        """Test that initial interval is 5 seconds (tier 0)"""
        scaler = AdaptiveRefreshScaler()
        # First call with no change should return 5s (tier 0)
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5, "Initial interval should be 5 seconds"

    def test_data_change_resets_to_tier_0(self):
        """Test that data changes reset scaler to fastest polling tier"""
        scaler = AdaptiveRefreshScaler()

        # Simulate 70 seconds of staleness (should be at tier 1)
        scaler.last_change_time = time.time() - 70

        # Should be at tier 1 (10s)
        interval = scaler.get_interval(data_changed=False)
        assert interval == 10, "After 70s staleness, should be at tier 1 (10s)"

        # Data changes - should reset to tier 0 (5s)
        interval = scaler.get_interval(data_changed=True)
        assert interval == 5, "Data change should reset to tier 0 (5s)"
        assert scaler.current_tier_index == 0, "Current tier should be 0 after reset"

    def test_progressive_scaling_tier_0(self):
        """Test tier 0: 0-60s staleness = 5s interval"""
        scaler = AdaptiveRefreshScaler()

        # Tier 0: 0-60s staleness = 5s interval
        scaler.last_change_time = time.time() - 30
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5, "Staleness 30s should be tier 0 (5s)"

        scaler.last_change_time = time.time() - 59
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5, "Staleness 59s should be tier 0 (5s)"

    def test_progressive_scaling_tier_1(self):
        """Test tier 1: 60-120s staleness = 10s interval"""
        scaler = AdaptiveRefreshScaler()

        # Tier 1: 60-120s staleness = 10s interval
        scaler.last_change_time = time.time() - 60
        interval = scaler.get_interval(data_changed=False)
        assert interval == 10, "Staleness 60s should be tier 1 (10s)"

        scaler.last_change_time = time.time() - 90
        interval = scaler.get_interval(data_changed=False)
        assert interval == 10, "Staleness 90s should be tier 1 (10s)"

        scaler.last_change_time = time.time() - 119
        interval = scaler.get_interval(data_changed=False)
        assert interval == 10, "Staleness 119s should be tier 1 (10s)"

    def test_progressive_scaling_tier_2(self):
        """Test tier 2: 120-180s staleness = 20s interval"""
        scaler = AdaptiveRefreshScaler()

        # Tier 2: 120-180s staleness = 20s interval
        scaler.last_change_time = time.time() - 120
        interval = scaler.get_interval(data_changed=False)
        assert interval == 20, "Staleness 120s should be tier 2 (20s)"

        scaler.last_change_time = time.time() - 150
        interval = scaler.get_interval(data_changed=False)
        assert interval == 20, "Staleness 150s should be tier 2 (20s)"

    def test_progressive_scaling_tier_3(self):
        """Test tier 3: 180-300s staleness = 30s interval"""
        scaler = AdaptiveRefreshScaler()

        # Tier 3: 180-300s staleness = 30s interval
        scaler.last_change_time = time.time() - 180
        interval = scaler.get_interval(data_changed=False)
        assert interval == 30, "Staleness 180s should be tier 3 (30s)"

        scaler.last_change_time = time.time() - 240
        interval = scaler.get_interval(data_changed=False)
        assert interval == 30, "Staleness 240s should be tier 3 (30s)"

    def test_progressive_scaling_tier_4(self):
        """Test tier 4: 300+ staleness = 60s interval (max)"""
        scaler = AdaptiveRefreshScaler()

        # Tier 4: 300+ staleness = 60s interval
        scaler.last_change_time = time.time() - 300
        interval = scaler.get_interval(data_changed=False)
        assert interval == 60, "Staleness 300s should be tier 4 (60s)"

        scaler.last_change_time = time.time() - 400
        interval = scaler.get_interval(data_changed=False)
        assert interval == 60, "Staleness 400s should be tier 4 (60s)"

        scaler.last_change_time = time.time() - 1000
        interval = scaler.get_interval(data_changed=False)
        assert interval == 60, "Staleness 1000s should be tier 4 (60s)"

    def test_custom_tiers(self):
        """Test that custom tiers work correctly"""
        custom_tiers = [
            IntervalTier(min_staleness_seconds=0, interval_seconds=2),
            IntervalTier(min_staleness_seconds=10, interval_seconds=5),
            IntervalTier(min_staleness_seconds=30, interval_seconds=15),
        ]
        scaler = AdaptiveRefreshScaler(tiers=custom_tiers)

        # Test tier 0 (0-10s)
        scaler.last_change_time = time.time() - 5
        interval = scaler.get_interval(data_changed=False)
        assert interval == 2, "Custom tier 0 should return 2s"

        # Test tier 1 (10-30s)
        scaler.last_change_time = time.time() - 15
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5, "Custom tier 1 should return 5s"

        # Test tier 2 (30+s)
        scaler.last_change_time = time.time() - 35
        interval = scaler.get_interval(data_changed=False)
        assert interval == 15, "Custom tier 2 should return 15s"

    def test_manual_reset(self):
        """Test that manual reset returns to tier 0"""
        scaler = AdaptiveRefreshScaler()

        # Advance to tier 3
        scaler.last_change_time = time.time() - 200

        # Should be at higher tier
        interval = scaler.get_interval(data_changed=False)
        assert interval == 30, "Should be at tier 3 (30s) before reset"
        assert scaler.current_tier_index == 3, "Should be at tier index 3"

        # Manual reset
        scaler.reset()
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5, "After manual reset, should return to tier 0 (5s)"
        assert scaler.current_tier_index == 0, "After manual reset, tier index should be 0"

    def test_get_staleness(self):
        """Test that staleness calculation is correct"""
        scaler = AdaptiveRefreshScaler()

        # Set last change to 100 seconds ago
        scaler.last_change_time = time.time() - 100

        staleness = scaler.get_staleness()
        # Allow for small timing variations (within 1 second)
        assert 99 <= staleness <= 101, f"Staleness should be ~100s, got {staleness}"

    def test_get_current_interval(self):
        """Test that get_current_interval returns current tier's interval"""
        scaler = AdaptiveRefreshScaler()

        # Start at tier 0
        assert scaler.get_current_interval() == 5, "Initial interval should be 5s"

        # Advance to tier 2
        scaler.last_change_time = time.time() - 150
        scaler.get_interval(data_changed=False)
        assert scaler.get_current_interval() == 20, "After advancing to tier 2, interval should be 20s"

    def test_tier_transitions_are_logged(self, caplog):
        """Test that tier transitions are logged when logging is enabled"""
        import logging
        caplog.set_level(logging.INFO)

        scaler = AdaptiveRefreshScaler(enable_logging=True)

        # Transition from tier 0 to tier 1
        scaler.last_change_time = time.time() - 70
        scaler.get_interval(data_changed=False)

        # Check that a log message was created
        assert "Tier transition" in caplog.text, "Tier transition should be logged"

    def test_data_change_at_start(self):
        """Test that signaling data_changed=True at start stays at tier 0"""
        scaler = AdaptiveRefreshScaler()

        # Signal change immediately
        interval = scaler.get_interval(data_changed=True)
        assert interval == 5, "Data change at start should return tier 0 (5s)"
        assert scaler.current_tier_index == 0, "Should remain at tier 0"

    def test_alternating_changes(self):
        """Test behavior with alternating changes and no changes"""
        scaler = AdaptiveRefreshScaler()

        # No change - should stay at tier 0
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5

        # Wait for tier advancement
        scaler.last_change_time = time.time() - 70

        # No change - should advance to tier 1
        interval = scaler.get_interval(data_changed=False)
        assert interval == 10

        # Change detected - reset to tier 0
        interval = scaler.get_interval(data_changed=True)
        assert interval == 5

        # No change again - back to tier 0
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5

    def test_tier_sorting(self):
        """Test that tiers are sorted by staleness even if provided out of order"""
        unsorted_tiers = [
            IntervalTier(min_staleness_seconds=30, interval_seconds=15),
            IntervalTier(min_staleness_seconds=0, interval_seconds=2),
            IntervalTier(min_staleness_seconds=10, interval_seconds=5),
        ]
        scaler = AdaptiveRefreshScaler(tiers=unsorted_tiers)

        # Verify tiers are sorted
        assert scaler.tiers[0].min_staleness_seconds == 0
        assert scaler.tiers[1].min_staleness_seconds == 10
        assert scaler.tiers[2].min_staleness_seconds == 30

        # Test that they work correctly after sorting
        scaler.last_change_time = time.time() - 5
        interval = scaler.get_interval(data_changed=False)
        assert interval == 2, "Should use tier 0 after sorting"

        scaler.last_change_time = time.time() - 15
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5, "Should use tier 1 after sorting"

    def test_boundary_conditions(self):
        """Test exact boundary conditions between tiers"""
        scaler = AdaptiveRefreshScaler()

        # Exactly at tier 1 boundary (60s)
        scaler.last_change_time = time.time() - 60.0
        interval = scaler.get_interval(data_changed=False)
        assert interval == 10, "At exactly 60s, should be tier 1 (10s)"

        # Just before tier 1 boundary (59.9s)
        scaler.last_change_time = time.time() - 59.9
        interval = scaler.get_interval(data_changed=False)
        assert interval == 5, "At 59.9s, should still be tier 0 (5s)"

        # Exactly at tier 2 boundary (120s)
        scaler.last_change_time = time.time() - 120.0
        interval = scaler.get_interval(data_changed=False)
        assert interval == 20, "At exactly 120s, should be tier 2 (20s)"

    def test_real_world_simulation(self):
        """
        Simulate a real-world scenario: long-running job with idle periods.

        Scenario:
        - Job starts, data changes frequently for first 30s
        - Goes idle for 3 minutes
        - Becomes active again for 10s
        - Goes idle for 5 minutes
        """
        scaler = AdaptiveRefreshScaler()

        # Phase 1: Active period (data changes)
        for _ in range(6):  # 6 iterations of 5s each = 30s
            interval = scaler.get_interval(data_changed=True)
            assert interval == 5, "During active period, should stay at 5s"

        # Phase 2: Idle for 3 minutes (180s)
        scaler.last_change_time = time.time() - 180
        interval = scaler.get_interval(data_changed=False)
        assert interval == 30, "After 3 min idle, should be at 30s interval"

        # Phase 3: Active again
        interval = scaler.get_interval(data_changed=True)
        assert interval == 5, "When active again, reset to 5s"

        # Phase 4: Idle for 5+ minutes (350s)
        scaler.last_change_time = time.time() - 350
        interval = scaler.get_interval(data_changed=False)
        assert interval == 60, "After 5+ min idle, should be at max 60s interval"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
