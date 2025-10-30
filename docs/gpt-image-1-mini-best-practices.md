# gpt-image-1-mini integration best practices (October 2025)

The OpenAI Cookbook's [*Generate Images with GPT Image*](https://github.com/openai/openai-cookbook/blob/main/examples/Generate_Images_With_GPT_Image.ipynb) notebook highlights the key tunable parameters for the current Images API models, including `quality`, `size`, `output_format`, and `output_compression` values for the `gpt-image-1` family.【F:docs/gpt-image-1-mini-best-practices.md†L1-L4】 Building on those guidelines, PlanExe now applies the following conventions when talking to `gpt-image-1-mini`:

- **Expose the model's full quality matrix** – allow users to request `low`, `medium`, `high`, or the API-managed `auto` quality tier, defaulting to `auto` unless callers override it.【F:docs/gpt-image-1-mini-best-practices.md†L6-L8】  
- **Support OpenAI's size presets** – the Images API accepts `1024x1024`, `1024x1536`, `1536x1024`, and the adaptive `auto` option; all four are now configurable defaults in `llm_config.json` so requests pass validation.【F:docs/gpt-image-1-mini-best-practices.md†L9-L11】  
- **Surface output format and compression controls** – PlanExe forwards optional `output_format` (`png`, `jpeg`, or `webp`) and `output_compression` (0–100) values, matching the cookbook's recommendations for balancing transparency, fidelity, and filesize.【F:docs/gpt-image-1-mini-best-practices.md†L12-L14】  
- **Guard transparent backgrounds** – transparency only applies to PNG or WEBP; the service drops a `transparent` background request if the caller also selects JPEG so we never send unsupported combinations.【F:docs/gpt-image-1-mini-best-practices.md†L15-L16】  
- **Echo actual render metadata** – responses now report the resolved format and compression level so downstream consumers (UI, storage policies) can persist assets correctly.【F:docs/gpt-image-1-mini-best-practices.md†L17-L18】

These adjustments keep the PlanExe image toolchain aligned with the October 2025 OpenAI guidance without forcing downstream systems to hard-code magic values.
