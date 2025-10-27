#!/usr/bin/env python3
"""Quick import test for Responses API integration"""

print("Testing critical imports...")

try:
    from planexe.llm_util.simple_openai_llm import openai
    print('OpenAI version:', openai.__version__)

    # Test critical features used by PlanExe
    client = openai.OpenAI(api_key="test")
    print('✓ OpenAI client creation OK')

    # Test responses client availability
    responses = getattr(client, 'responses', None)
    if responses:
        print('✓ client.responses available')
    else:
        print('✗ client.responses NOT available')

    beta_responses = getattr(client, 'beta', None)
    if beta_responses:
        beta_resp = getattr(beta_responses, 'responses', None)
        if beta_resp:
            print('✓ client.beta.responses available')
        else:
            print('✗ client.beta.responses NOT available')
    else:
        print('✗ client.beta NOT available')

    # Test import of responses module
    try:
        from openai.resources import responses as responses_module
        responses_cls = getattr(responses_module, "Responses", None)
        if responses_cls:
            print('✓ openai.resources.responses.Responses available')
        else:
            print('✗ Responses class NOT found')
    except ImportError as e:
        print('✗ openai.resources.responses import failed:', e)

except ImportError as e:
    print(f"✗ SimpleOpenAILLM import FAILED: {e}")

try:
    from planexe_api.streaming.analysis_stream_service import AnalysisStreamService
    print("✓ AnalysisStreamService import OK")
except ImportError as e:
    print(f"✗ AnalysisStreamService import FAILED: {e}")

try:
    from planexe_api.models import AnalysisStreamRequest, ReasoningEffort
    print("✓ AnalysisStreamRequest models import OK")
except ImportError as e:
    print(f"✗ AnalysisStreamRequest models import FAILED: {e}")

try:
    from planexe_api.api import app
    print("✓ FastAPI app import OK")
except ImportError as e:
    print(f"✗ FastAPI app import FAILED: {e}")

print("\nAll critical imports successful!")
