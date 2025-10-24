#!/usr/bin/env python3
"""Test script to verify circular import is resolved."""

import sys
import os

# Add the project root to Python path
sys.path.insert(0, 'd:/GitHub/PlanExe')

try:
    from planexe_api.services.conversation_service import ConversationService
    print("✓ Successfully imported ConversationService")
except ImportError as e:
    print(f"✗ Failed to import ConversationService: {e}")
    sys.exit(1)

try:
    from planexe_api.streaming.analysis_stream_service import AnalysisStreamService
    print("✓ Successfully imported AnalysisStreamService")
except ImportError as e:
    print(f"✗ Failed to import AnalysisStreamService: {e}")
    sys.exit(1)

try:
    from planexe_api.services.response_id_service import ResponseIDStore
    print("✓ Successfully imported ResponseIDStore")
except ImportError as e:
    print(f"✗ Failed to import ResponseIDStore: {e}")
    sys.exit(1)

print("\n🎉 All imports successful! Circular import has been resolved.")
print("The FastAPI application should now start without the ImportError.")
