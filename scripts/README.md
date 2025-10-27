# Scripts Directory

This directory contains various utility scripts for development, testing, and maintenance of PlanExe.

## Directory Structure

### `testing/`
Test scripts for validating API endpoints, pipeline functionality, and integration testing.

**PowerShell Scripts (.ps1):**
- `check_*.ps1` - Various status and health check scripts
- `create_*.ps1` - Plan creation test scripts
- `test_*.ps1` - General testing utilities

**Python Scripts (.py):**
- `test_*.py` - Unit and integration test scripts
- `check_*.py` - Validation and verification scripts
- `manual_trigger.py` - Manual pipeline trigger for testing
- `trigger_yorkshire_plan.py` - Specific test case trigger

### `debug/`
Debugging utilities for troubleshooting issues.

- `debug_*.py` - Debug scripts for API, background tasks, etc.
- `inspect_bytes.py` - Byte inspection utilities
- `track_activity.jsonl` - Activity tracking logs

### `deployment/`
Scripts related to deployment and migration.

- `run_migration.py` - Database migration runner
- `railway-deploy.sh` - Railway deployment script

### `maintenance/`
Maintenance and cleanup utilities.

- `fix_*.py` - Various fix and repair scripts
- Data cleanup and repair utilities

## Usage

Most scripts are designed to be run from the project root directory. Ensure you have the proper environment configured before running:

```bash
# For Python scripts
python scripts/debug/debug_api_error.py

# For PowerShell scripts (Windows)
powershell -ExecutionPolicy Bypass -File scripts\testing\check_plan.ps1

# For shell scripts (Linux/macOS)
bash scripts/deployment/railway-deploy.sh
```

## Notes

- These scripts are development utilities and not part of the core application
- Some scripts may require specific environment variables or configurations
- Test scripts may create temporary data or plans in the `run/` directory
- Always review script contents before execution, especially debug and maintenance scripts
