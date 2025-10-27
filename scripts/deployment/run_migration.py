import os
import sys

try:
    from planexe.utils.planexe_dotenv import PlanExeDotEnv
except ImportError as exc:
    sys.stderr.write(f"Failed to import PlanExeDotEnv: {exc}\n")
    sys.exit(1)

# Load environment variables (uses .env if present)
PlanExeDotEnv.load().update_os_environ()

os.chdir(os.path.join(os.path.dirname(__file__), "planexe_api"))
exit_code = os.system("alembic upgrade head")

if exit_code != 0:
    sys.exit(os.WEXITSTATUS(exit_code))
