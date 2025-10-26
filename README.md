# PlanExe

PlanExe turns a short planning prompt into a full execution plan by coordinating 61 Luigi tasks behind a FastAPI API and a Next.js frontend. Every task writes its results to the database before touching the filesystem, so plans can be monitored, resumed, and downloaded even when run directories disappear.

## Why teams use PlanExe
- **Database-first pipeline** – content is persisted in `plan_content`, enabling resumable executions and API-first artefact delivery.
- **Structured LLM orchestration** – the `SimpleOpenAILLM` adapter standardises calls to OpenAI's Responses API with schema-aware retries and telemetry.
- **Real-time visibility** – WebSockets stream logs, structured reasoning, and progress percentages so operators can see exactly what Luigi is doing.

## Architecture at a glance
| Layer | Location | Notes |
| --- | --- | --- |
| Frontend | `planexe-frontend/` | Next.js 15 + shadcn/ui. Talks directly to FastAPI (`src/lib/api/fastapi-client.ts`). |
| API | `planexe_api/` | FastAPI + SQLAlchemy. Manages WebSockets, Luigi subprocesses, and persistence. |
| Pipeline | `planexe/plan/` | Luigi DAG of 61 tasks. Each task writes to DB and filesystem. |
| Shared services | `planexe/llm_util/`, `planexe_api/services/` | LLM adapters, schema registry, conversation helpers. |
| Data | `planexe_api/database.py` | PostgreSQL (recommended) or SQLite (local). Tables: plans, plan_content, plan_files, llm_interactions, plan_metrics. |

Key principles:
1. **Database-first** – never rely on filesystem-only artefacts.
2. **Thread-safe orchestration** – WebSocket manager and ProcessRegistry use locks to avoid race conditions.
3. **Deterministic response chaining** – response IDs from the Responses API are stored and reused to maintain context.

## Quick links
- [API reference (`/docs`)](README_API.md)
- [`docs/run_plan_pipeline_documentation.md`](docs/run_plan_pipeline_documentation.md) – Luigi task breakdown
- [`AGENTS.md`](AGENTS.md) – development rules and architecture guide
- [`docs/pipeline_handoff_notes.md`](docs/pipeline_handoff_notes.md) – current migration work items

## Getting started
### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 12+ (or SQLite for local testing)
- OpenAI API key with Responses API access (environment variable `OPENAI_API_KEY`)

### Clone and install
```powershell
# Clone the repository
git clone https://github.com/neoneye/PlanExe.git
cd PlanExe

# Create a virtual environment
python -m venv .venv
.venv\Scripts\Activate  # PowerShell; use `source .venv/bin/activate` on macOS/Linux

# Install Python dependencies (dev extras recommended)
pip install -e ".[dev]"

# Install frontend dependencies
cd planexe-frontend
npm install
cd ..

# Copy environment template and add secrets
Copy-Item .env.example .env
# set OPENAI_API_KEY, OPENROUTER_API_KEY (optional), DATABASE_URL, PLANEXE_RUN_DIR, etc.
```

## Running the stack locally
1. **Start the FastAPI backend**
   ```powershell
   python -m planexe_api.api  # serves on http://localhost:8080
   ```
2. **Start the Next.js frontend**
   ```powershell
   cd planexe-frontend
   npm run dev  # serves on http://localhost:3000
   ```
3. **Trigger a plan** via the UI or curl:
   ```bash
   curl -X POST http://localhost:8080/api/plans \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "Create a market entry plan for a solar installer",
       "speed_vs_detail": "balanced_speed_and_detail",
       "llm_model": "gpt-5-mini-2025-08-07"
     }'
   ```
   The backend spawns `python -m planexe.plan.run_plan_pipeline` as a subprocess.

### Observability & operations
- **Live progress** – the WebSocket endpoint `/ws/plans/{plan_id}/progress` streams:
  - log lines from Luigi stdout/stderr,
  - LLM reasoning/output deltas, and
  - periodic percentage updates derived from completed `plan_content` entries.
- **Artefacts** – download from `/api/plans/{id}/files` or `/api/plans/{id}/report`; each entry comes from the database.
- **Fallback report** – if the HTML report task fails, use `/api/plans/{id}/fallback-report` to rebuild it from stored content.

### Pipeline tips
- `FAST_BUT_SKIP_DETAILS=1` speeds up test runs (fewer prompts, shorter outputs).
- Structured tasks rely on the schema registry in `planexe/llm_util/schema_registry.py`; register new Pydantic models there.
- All new Python files must include the header template specified in `AGENTS.md`.

## Testing
```powershell
# Python tests
pytest

# Frontend typecheck & lint (from planexe-frontend)
npx tsc --noEmit
npm run lint
```
Tests should use data created by real plan runs; mocking is discouraged per project guidelines.

## Deployment (Railway reference)
1. Build using `docker/Dockerfile.railway.api`; it bundles the static Next.js export under `/app/ui_static`.
2. Provide environment variables from `railway-env-template.txt` (database URL, API keys, `PLANEXE_RUN_DIR=/tmp/planexe_runs`).
3. Run database migrations with `python -m planexe_api.run_migration` (or `alembic upgrade head`).
4. Expose port `8080`; the FastAPI app serves both API and static UI.

## Directory map
```text
PlanExe/
├── planexe/                # Luigi tasks, LLM adapters, utilities
├── planexe_api/            # FastAPI app, services, migrations
├── planexe-frontend/       # Next.js frontend
├── docs/                   # Design notes, runbooks, ADRs
├── extra/                  # Provider-specific setup guides
├── run/                    # Local plan artefacts (transient)
├── README_API.md           # Detailed API reference
└── CHANGELOG.md            # High-level technical change log
```

## Contributing guidelines
- Follow `AGENTS.md` for architecture rules, environment expectations, and required Python headers.
- Keep pipeline tasks database-first and avoid altering Luigi dependencies without a full impact review.
- Prefer incremental fixes; add tests where practical, using real plan data.
- Capture meaningful documentation updates under `docs/`.

## Troubleshooting
| Symptom | Check |
| --- | --- |
| WebSocket connection fails | Backend running on port 8080? Verify `/ws/plans/{id}/progress` reachable. |
| Plan stuck with no progress | Inspect `plan_content` entries for the plan ID; the highest task name hints at the failure point. |
| Structured task errors | Confirm schema registered in `planexe/llm_util/schema_registry.py` and that the OpenAI model supports Responses API strict mode. |
| No artefacts returned | Ensure database credentials are correct and `planexe_api/database.py` migrations ran. |

## Further reading
- `docs/pipeline_handoff_notes.md` – remaining migration tasks for the SimpleOpenAILLM refactor
- `docs/INTAKE_SCHEMA.md` – structured intake flow design
- `docs/Cascading-Failure-Analysis-2025-10-22.md` – validation hardening rationale

PlanExe is actively evolving; check the changelog for recent backend and pipeline improvements.
