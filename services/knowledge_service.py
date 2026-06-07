"""Knowledge search, ingestion, and review services."""

from __future__ import annotations

import time
import uuid
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.json_types import JsonObject
from modules.llmfetcher.rag_module.knowledge_base import KnowledgeBase


class KnowledgeService:
    """Provide search and lightweight review workflows over local knowledge."""

    def __init__(self, task_manager: Any, kb_root: Path | str = 'kb') -> None:
        """Initialize the knowledge service."""
        self.task_manager = task_manager
        self.kb_root = Path(kb_root)
        self.knowledge_base = KnowledgeBase(self.kb_root) if self.kb_root.exists() else None
        self._reviews: Dict[str, Dict[str, Any]] = {}

    def search(self, query: str, *, limit: int = 5) -> List[dict]:
        """Search local knowledge documents."""
        if self.knowledge_base is None:
            return []
        return [hit.__dict__ for hit in self.knowledge_base.search(query, limit=limit)]

    def vector_status(self) -> JsonObject:
        """Return vector index status for the current knowledge backend."""
        return {'available': bool(self.knowledge_base and self.knowledge_base.available())}

    def rebuild_vector_index(self) -> JsonObject:
        """Rebuild vector indexes when supported by the backend."""
        if self.knowledge_base and hasattr(self.knowledge_base, 'rebuild_vector_index'):
            entries = self.knowledge_base.rebuild_vector_index()
            return {path: entry.to_dict() for path, entry in entries.items()}
        return {'available': False, 'message': '当前知识库后端不支持重建向量索引'}

    def evolve_from_task(self, task_id: str, user_id: str, *, mode: str, source_mode: str, review_notes: str) -> dict:
        """Create a knowledge review item from a completed task."""
        task = self.task_manager.get_task(task_id, user_id=user_id)
        if task is None:
            raise ValueError('任务未找到')
        review_id = uuid.uuid4().hex
        item = {
            'id': review_id,
            'task_id': task_id,
            'user_id': user_id,
            'title': task.config.name,
            'content': task.result or '\n'.join(task.logs),
            'status': 'pending' if mode == 'review' else 'approved',
            'source_mode': source_mode,
            'review_notes': review_notes,
            'created_at': time.time(),
        }
        self._reviews[review_id] = item
        return item

    def list_reviews(self, user_id: str, *, status: str = '') -> dict:
        """List knowledge review records for a user."""
        reviews = [item for item in self._reviews.values() if item['user_id'] == user_id]
        if status:
            reviews = [item for item in reviews if item['status'] == status]
        return {'reviews': reviews, 'total': len(reviews)}

    def get_review(self, review_id: str, user_id: str) -> Optional[dict]:
        """Return one review if owned by the user."""
        item = self._reviews.get(review_id)
        return item if item and item['user_id'] == user_id else None

    def approve_review(self, review_id: str, user_id: str, *, review_notes: str = '') -> Optional[dict]:
        """Mark a review as approved."""
        item = self.get_review(review_id, user_id)
        if item:
            item['status'] = 'approved'
            item['review_notes'] = review_notes
        return item

    def reject_review(self, review_id: str, user_id: str, *, review_notes: str = '') -> Optional[dict]:
        """Mark a review as rejected."""
        item = self.get_review(review_id, user_id)
        if item:
            item['status'] = 'rejected'
            item['review_notes'] = review_notes
        return item


class DynamicKnowledgeService:
    """Store user-ingested knowledge snippets in memory for the running app."""

    def __init__(self) -> None:
        """Initialize an empty dynamic knowledge store."""
        self._sources: Dict[str, Dict[str, Any]] = {}

    def status(self, user_id: str) -> dict:
        """Return dynamic source counts for a user."""
        sources = [item for item in self._sources.values() if item['user_id'] == user_id]
        return {'total': len(sources), 'ready': len([item for item in sources if item['status'] == 'ready'])}

    def list_sources(self, user_id: str, *, status: str = '') -> dict:
        """List ingested sources for a user."""
        sources = [item for item in self._sources.values() if item['user_id'] == user_id]
        if status:
            sources = [item for item in sources if item['status'] == status]
        return {'sources': sources, 'total': len(sources)}

    def ingest_text(
        self,
        user_id: str,
        *,
        title: str,
        content: str,
        source_type: str,
        url: str = '',
        category: str = 'misc',
        notes: str = '',
        tags: Optional[List[Any]] = None,
    ) -> dict:
        """Ingest a text source into the dynamic store."""
        source_id = uuid.uuid4().hex
        item = {
            'id': source_id,
            'user_id': user_id,
            'title': title,
            'content': content,
            'source_type': source_type,
            'url': url,
            'category': category,
            'notes': notes,
            'tags': tags or [],
            'status': 'ready',
            'created_at': time.time(),
        }
        self._sources[source_id] = item
        return item

    def fetch_and_ingest_url(self, user_id: str, *, url: str, title: str, category: str, notes: str, tags: List[Any], max_chars: int) -> dict:
        """Fetch URL text and store it as a dynamic source."""
        with urllib.request.urlopen(url, timeout=20) as response:
            content = response.read(max_chars).decode('utf-8', errors='replace')
        return self.ingest_text(
            user_id=user_id,
            title=title or url,
            content=content,
            source_type='webpage',
            url=url,
            category=category,
            notes=notes,
            tags=tags,
        )
