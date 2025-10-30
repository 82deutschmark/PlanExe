# 30 Oct 2025 – OpenAI Images Failure Analysis and Fix Plan

## Summary
- **Problem**: `/api/images/generate` and `/api/images/edit` return OpenAI errors while Responses API calls succeed.
- **Root Cause**: `ImageGenerationService` bypasses the official OpenAI SDK and posts raw HTTP requests via `httpx`, so required platform headers (e.g., `OpenAI-Project`) never reach the Images API.
- **Fix Overview**: Reuse the shared `OpenAI` client (already instantiated in `SimpleOpenAILLM`) and call `client.images.generate/edit`, ensuring headers, retries, and auth are handled by the SDK.

## Evidence
1. `ImageGenerationService._generate_with_images_api` constructs custom headers with only `Authorization` (@planexe_api/services/image_generation_service.py#87-94).
2. Current OpenAI SDK automatically adds `OpenAI-Project` when configured, which is missing in raw requests.
3. Other services use `SimpleOpenAILLM` (which wraps the SDK) and work correctly, confirming the API key and project configuration are valid.

## Plan
1. **Service Refactor**
   - Inject/reuse the existing `OpenAI` client (or construct a shared singleton) in `ImageGenerationService`.
   - Replace manual `httpx` calls with `client.images.generate` / `client.images.edit`.
   - Preserve retry/backoff logic around the SDK calls for consistency.
   - Normalize responses to keep the current return shape.

2. **Config Alignment**
   - Ensure `PlanExeLLMConfig` continues to supply defaults (`model`, `size`, etc.).
   - Confirm `OPENAI_API_KEY`/`OPENAI_PROJECT` remain sourced from `.env`.

3. **Testing & Verification**
   - Manually trigger image generation to verify a successful response.
   - Confirm structured errors still propagate when API rejects the request.

4. **Documentation & Change Log**
   - Update this doc (done) and record the fix in `CHANGELOG.md` with semantic versioning.
