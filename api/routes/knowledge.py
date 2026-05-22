"""Knowledge evolution and review API routes implemented with FastAPI."""

from fastapi import Request
from fastapi.responses import JSONResponse

from . import knowledge_router
from ..dependencies import api_response, get_request_user_id, get_services
from ..schemas import (
    DynamicKnowledgeFetchRequest,
    DynamicKnowledgeIngestRequest,
    KnowledgeEvolveRequest,
    ReviewDecisionRequest,
)


@knowledge_router.get('/knowledge/search')
def search_knowledge(request: Request, query: str = '', limit: int = 5) -> JSONResponse:
    """Search the existing knowledge base.

    Args:
        request: Current FastAPI request used to access services.
        query: Search query text from query parameters.
        limit: Maximum number of results to return.

    Returns:
        A normalized API response containing search results.
    """
    # Validate query input before calling the knowledge search service.
    normalized_query = str(query).strip()
    if not normalized_query:
        return api_response(False, message='query 不能为空', status_code=400)

    # Run the search with the caller-provided result limit.
    services = get_services(request)
    return api_response(True, data=services.knowledge_service.search(normalized_query, limit=limit))


@knowledge_router.get('/knowledge/vector/status')
def knowledge_vector_status(request: Request) -> JSONResponse:
    """Return vector index status for the knowledge base.

    Args:
        request: Current FastAPI request used to access services.

    Returns:
        A normalized API response containing vector index status data.
    """
    # Delegate status collection to the knowledge service.
    services = get_services(request)
    return api_response(True, data=services.knowledge_service.vector_status())


@knowledge_router.post('/knowledge/vector/rebuild')
def rebuild_knowledge_vector_index(request: Request) -> JSONResponse:
    """Rebuild the knowledge base vector index.

    Args:
        request: Current FastAPI request used to access services.

    Returns:
        A normalized API response containing rebuild status data.
    """
    # Trigger a full vector index rebuild through the service layer.
    services = get_services(request)
    return api_response(True, data=services.knowledge_service.rebuild_vector_index())


@knowledge_router.get('/knowledge/sources/status')
def dynamic_knowledge_source_status(request: Request) -> JSONResponse:
    """Return dynamic knowledge source status for the current user.

    Args:
        request: Current FastAPI request used for auth and services.

    Returns:
        A normalized API response containing dynamic source status.
    """
    # Resolve user scope and ask the dynamic knowledge manager for status.
    services = get_services(request)
    user_id = get_request_user_id(request)
    return api_response(True, data=services.dynamic_knowledge.status(user_id))


@knowledge_router.get('/knowledge/sources')
def list_dynamic_knowledge_sources(request: Request, status: str = '') -> JSONResponse:
    """List dynamic knowledge sources for the current user.

    Args:
        request: Current FastAPI request used for auth and services.
        status: Optional source status filter.

    Returns:
        A normalized API response containing source records.
    """
    # Normalize the optional status filter and list scoped sources.
    services = get_services(request)
    user_id = get_request_user_id(request)
    normalized_status = str(status).strip().lower()
    return api_response(True, data=services.dynamic_knowledge.list_sources(user_id, status=normalized_status))


@knowledge_router.post('/knowledge/sources/ingest')
def ingest_dynamic_knowledge_text(request: Request, payload: DynamicKnowledgeIngestRequest) -> JSONResponse:
    """Ingest manual or external text into dynamic knowledge.

    Args:
        request: Current FastAPI request used for auth and services.
        payload: Title, content, source metadata, and tags.

    Returns:
        A normalized API response containing ingestion result data.
    """
    # Normalize and validate the ingestion payload.
    ingest_request = DynamicKnowledgeIngestRequest.from_payload(payload.__dict__)
    if not ingest_request.title and not ingest_request.url:
        return api_response(False, message='title 或 url 至少提供一个', status_code=400)
    if not ingest_request.content.strip():
        return api_response(False, message='content 不能为空', status_code=400)

    # Persist the content into the current user's dynamic knowledge store.
    services = get_services(request)
    user_id = get_request_user_id(request)
    try:
        data = services.dynamic_knowledge.ingest_text(
            user_id,
            title=ingest_request.title or ingest_request.url,
            content=ingest_request.content,
            source_type=ingest_request.source_type,
            url=ingest_request.url,
            category=ingest_request.category,
            tags=ingest_request.tags or [],
            notes=ingest_request.notes,
        )
    except ValueError as exc:
        return api_response(False, message=str(exc), status_code=400)
    return api_response(True, data=data)


@knowledge_router.post('/knowledge/sources/fetch')
def fetch_dynamic_knowledge_url(request: Request, payload: DynamicKnowledgeFetchRequest) -> JSONResponse:
    """Fetch a remote URL and ingest it into dynamic knowledge.

    Args:
        request: Current FastAPI request used for auth and services.
        payload: URL metadata, tags, and fetch character budget.

    Returns:
        A normalized API response containing fetch and ingestion result data.
    """
    # Normalize and validate URL fetch input.
    fetch_request = DynamicKnowledgeFetchRequest.from_payload(payload.__dict__)
    if not fetch_request.url:
        return api_response(False, message='url 不能为空', status_code=400)

    # Fetch and ingest the URL under the current user's knowledge scope.
    services = get_services(request)
    user_id = get_request_user_id(request)
    try:
        data = services.dynamic_knowledge.fetch_and_ingest_url(
            user_id,
            url=fetch_request.url,
            title=fetch_request.title,
            category=fetch_request.category,
            tags=fetch_request.tags or [],
            notes=fetch_request.notes,
            max_chars=fetch_request.max_chars,
        )
    except ValueError as exc:
        return api_response(False, message=str(exc), status_code=400)
    return api_response(True, data=data)


@knowledge_router.post('/knowledge/evolve')
def evolve_knowledge_from_task(request: Request, payload: KnowledgeEvolveRequest) -> JSONResponse:
    """Extract knowledge from a task workspace.

    Args:
        request: Current FastAPI request used for auth and services.
        payload: Task identifier, evolution mode, source mode, and notes.

    Returns:
        A normalized API response containing created review or knowledge data.
    """
    # Normalize and validate task evolution mode.
    evolve_request = KnowledgeEvolveRequest.from_payload(payload.__dict__)
    if not evolve_request.task_id:
        return api_response(False, message='taskId 不能为空', status_code=400)
    if evolve_request.mode not in {'review', 'direct'}:
        return api_response(False, message='mode 仅支持 review 或 direct', status_code=400)

    # Ask the knowledge service to evolve task artifacts into reusable knowledge.
    services = get_services(request)
    user_id = get_request_user_id(request)
    try:
        item = services.knowledge_service.evolve_from_task(
            evolve_request.task_id,
            user_id,
            mode=evolve_request.mode,
            source_mode=evolve_request.source_mode,
            review_notes=evolve_request.review_notes,
        )
    except ValueError as exc:
        return api_response(False, message=str(exc), status_code=400)
    return api_response(True, data=item)


@knowledge_router.get('/knowledge/reviews')
def list_knowledge_reviews(request: Request, status: str = '') -> JSONResponse:
    """List the current user's knowledge review queue.

    Args:
        request: Current FastAPI request used for auth and services.
        status: Optional review status filter.

    Returns:
        A normalized API response containing review records.
    """
    # Normalize status and query the scoped review queue.
    services = get_services(request)
    user_id = get_request_user_id(request)
    normalized_status = str(status).strip().lower()
    data = services.knowledge_service.list_reviews(user_id, status=normalized_status)
    return api_response(True, data=data)


@knowledge_router.get('/knowledge/reviews/{review_id}')
def get_knowledge_review(request: Request, review_id: str) -> JSONResponse:
    """Return detail for one knowledge review record.

    Args:
        request: Current FastAPI request used for auth and services.
        review_id: Review identifier from the path.

    Returns:
        A normalized API response containing review detail or a not-found error.
    """
    # Fetch the requested review in the authenticated user's scope.
    services = get_services(request)
    user_id = get_request_user_id(request)
    data = services.knowledge_service.get_review(review_id, user_id)
    if data is None:
        return api_response(False, message='审核记录未找到', status_code=404)
    return api_response(True, data=data)


@knowledge_router.post('/knowledge/reviews/{review_id}/approve')
def approve_knowledge_review(request: Request, review_id: str, payload: ReviewDecisionRequest) -> JSONResponse:
    """Approve a knowledge review draft and publish it.

    Args:
        request: Current FastAPI request used for auth and services.
        review_id: Review identifier from the path.
        payload: Optional reviewer notes.

    Returns:
        A normalized API response containing the approval result.
    """
    # Normalize notes and approve the requested review.
    services = get_services(request)
    user_id = get_request_user_id(request)
    decision = ReviewDecisionRequest.from_payload(payload.__dict__)
    try:
        data = services.knowledge_service.approve_review(review_id, user_id, review_notes=decision.review_notes)
    except ValueError as exc:
        return api_response(False, message=str(exc), status_code=404)
    return api_response(True, data=data)


@knowledge_router.post('/knowledge/reviews/{review_id}/reject')
def reject_knowledge_review(request: Request, review_id: str, payload: ReviewDecisionRequest) -> JSONResponse:
    """Reject a knowledge review draft.

    Args:
        request: Current FastAPI request used for auth and services.
        review_id: Review identifier from the path.
        payload: Optional reviewer notes.

    Returns:
        A normalized API response containing the rejection result.
    """
    # Normalize notes and reject the requested review.
    services = get_services(request)
    user_id = get_request_user_id(request)
    decision = ReviewDecisionRequest.from_payload(payload.__dict__)
    try:
        data = services.knowledge_service.reject_review(review_id, user_id, review_notes=decision.review_notes)
    except ValueError as exc:
        return api_response(False, message=str(exc), status_code=404)
    return api_response(True, data=data)
