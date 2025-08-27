# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PlanExe is an AI-powered project planning system that transforms simple ideas or prompts into comprehensive, detailed strategic and tactical plans. It generates multi-faceted plans with sections like assumptions, work breakdown structure (WBS), SWOT analysis, team composition, schedules, and governance frameworks.

## Commands

### Installation
```bash
git clone https://github.com/neoneye/PlanExe.git
cd PlanExe
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install '.[gradio-ui]'
```

### Running the Application
- **Gradio UI (primary interface)**: `python -m planexe.plan.app_text2plan` - launches at http://localhost:7860
- **Flask UI (alternative)**: `python -m planexe.ui_flask.app` - launches at http://localhost:5000
- **Run plan pipeline directly**: `python -m planexe.plan.run_plan_pipeline`

### Testing
- **Run all tests**: `python test.py`
- Individual test modules use standard unittest discovery pattern with `test_*.py` files

### Development Commands
- **Resume unfinished run**: `RUN_ID_DIR=/path/to/PlanExe_YYYYMMDD_HHMMSS python -m planexe.plan.run_plan_pipeline`

## Architecture Overview

### Core Components
- **LLM Factory** (`llm_factory.py`): Manages multiple LLM providers (OpenAI, Mistral, Ollama, LM Studio, OpenRouter, Together, Groq) with automatic fallback between models
- **Plan Pipeline** (`plan.run_plan_pipeline.py`): Luigi-based task orchestration system that processes plans through multiple phases
- **UI Layer**: Both Gradio (`plan.app_text2plan.py`) and Flask (`ui_flask.app.py`) interfaces available

### Planning Pipeline Phases
1. **Assumptions** (`assume/`): Identify purpose, plan type, locations, risks, currency strategy
2. **Expert Analysis** (`expert/`): Find relevant experts, conduct SWOT analysis, pre-project assessment
3. **Work Breakdown** (`plan/`, `wbs/`): Create hierarchical task structures (WBS levels 1-3)
4. **Team Planning** (`team/`): Identify roles, find team members, contract types
5. **Scheduling** (`schedule/`): Generate Gantt charts, estimate durations, dependencies
6. **Documentation** (`document/`): Identify and draft required documents
7. **Governance** (`governance/`): Create oversight structures and decision matrices
8. **Diagnostics** (`diagnostics/`): Premise attacks, premortem analysis, redline gates

### Key Modules
- **LLM Utilities** (`llm_util/`): Response handling, mock LLMs for testing, Ollama integration
- **Luigi Utilities** (`luigi_util/`): Task output file management
- **Markdown Utilities** (`markdown_util/`): Text formatting and processing
- **Scheduling** (`schedule/`): Multiple export formats (CSV, Mermaid, DHTMLX, Frappe)
- **Prompts** (`prompt/`): Centralized prompt management with JSONL data files

### Configuration
- **LLM Config**: `llm_config.json` - defines available LLM providers and priorities
- **Environment**: Uses python-dotenv for environment variables
- **Pipeline Config**: Configurable speed vs detail settings, pipeline environments

### Data Flow
1. User provides text prompt via UI
2. Plan pipeline processes through Luigi task graph
3. Each phase generates JSON/markdown outputs stored in timestamped run directories
4. Final reports generated in HTML format with embedded visualizations
5. Multiple export formats available (Gantt charts, WBS tables, team documents)

## Development Notes

- Uses Luigi for task orchestration and dependency management
- Supports multiple LLM providers with automatic fallback
- All pipeline outputs stored in timestamped directories for reproducibility
- Extensive test coverage with unittest framework
- Modular architecture allows for easy extension of planning phases
- Configuration-driven LLM selection with priority-based auto-selection