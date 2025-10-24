"""Service for managing response ID storage and retrieval."""

from typing import Optional

from planexe_api.database import DatabaseService


class ResponseIDStore:
    """Database-backed storage for tracking latest response ID per conversation."""

    def __init__(self, db_service: DatabaseService) -> None:
        self._db_service = db_service

    async def store_response_id(self, conversation_id: str, response_id: str) -> None:
        """Store the latest response ID for a conversation in database."""
        # Response IDs are already stored in llm_interactions table metadata
        # This method exists for API compatibility but doesn't need separate storage
        pass

    async def get_response_id(self, conversation_id: str) -> Optional[str]:
        """Retrieve the latest response ID for a conversation from database."""
        try:
            # Query the most recent completed interaction for this conversation
            interactions = self._db_service.get_plan_interactions(conversation_id)
            if not interactions:
                return None

            # Find the most recent completed interaction with a response_id
            for interaction in sorted(interactions, key=lambda x: x.created_at, reverse=True):
                if (interaction.status == "completed" and
                    interaction.response_metadata and
                    interaction.response_metadata.get("response_id")):
                    return interaction.response_metadata["response_id"]

            return None
        except Exception as e:
            print(f"Warning: Failed to retrieve response_id for conversation {conversation_id}: {e}")
            return None

    async def clear_response_id(self, conversation_id: str) -> None:
        """Response IDs are stored in database and don't need explicit clearing."""
        pass
