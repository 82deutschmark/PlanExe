# Author: gpt-5-codex
# Date: 2025-10-21T22:27:00Z
# PURPOSE: Provide a Luigi target that treats persisted plan_content rows as the authoritative artefact store.
# SRP and DRY check: Pass - Encapsulates database-backed target logic without duplicating pipeline task behavior.
"""Database-backed Luigi targets for PlanExe pipeline outputs."""

import logging
from typing import Optional

import luigi

from planexe_api.database import get_database_service, DatabaseService


logger = logging.getLogger(__name__)


class PlanContentTarget(luigi.Target):
    """Luigi target that reports completion when plan content exists in the database."""

    def __init__(self, plan_id: str, filename: str):
        self.plan_id = plan_id
        self.filename = filename

    def _get_record(self, db_service: DatabaseService):
        return db_service.get_plan_content_by_filename(self.plan_id, self.filename)

    def exists(self) -> bool:
        db_service: Optional[DatabaseService] = None
        try:
            db_service = get_database_service()
            record = self._get_record(db_service)
            return record is not None and bool(record.content)
        except Exception as exc:  # pragma: no cover - defensive guardrail
            logger.error(
                "Failed to verify plan content target existence for plan_id=%s filename=%s: %s",
                self.plan_id,
                self.filename,
                exc,
            )
            return False
        finally:
            if db_service:
                db_service.close()

