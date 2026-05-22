"""Task API routes implemented with FastAPI."""

from __future__ import annotations

import json
from typing import Dict, Optional, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse

from . import tasks_router
from ..dependencies import api_response, get_request_user_id, get_services
from ..schemas import CreateBatchTaskRequest, CreateTaskRequest, TaskUpdateRequest
from core.ctf_kernel import WorkflowResult
from core.models import RuntimeConfig, TaskStatus
from services.tasks.manager import UploadedTaskFile


async def _get_request_payload(request: Request) -> dict:
    """Read task payloads from JSON or multipart form data.

    Args:
        request: Current FastAPI request containing JSON or multipart data.

    Returns:
        A dictionary payload parsed from the request.

    Raises:
        ValueError: If a multipart `payload` field is not valid JSON.
    """
    # Prefer native JSON bodies when the content type is JSON.
    content_type = request.headers.get('content-type', '')
    if 'application/json' in content_type:
        return await request.json()

    # Parse multipart form payloads from a JSON string field.
    form = await request.form()
    raw_payload = str(form.get('payload', '')).strip()
    if not raw_payload:
        return {}
    try:
        return json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        raise ValueError(f'请求载荷不是合法 JSON: {exc}') from exc


async def _extract_uploaded_files(request: Request) -> Dict[str, UploadedTaskFile]:
    """Extract uploaded task files from multipart form data.

    Args:
        request: Current FastAPI request containing multipart uploads.

    Returns:
        Uploaded files keyed by frontend client id.
    """
    # Ignore upload extraction for non-multipart requests.
    content_type = request.headers.get('content-type', '')
    if 'multipart/form-data' not in content_type:
        return {}

    # Read each UploadFile entry and store bytes by field name.
    uploads: Dict[str, UploadedTaskFile] = {}
    form = await request.form()
    for client_id, storage in form.multi_items():
        if not hasattr(storage, 'filename') or not hasattr(storage, 'read'):
            continue
        normalized_client_id = str(client_id).strip()
        if not normalized_client_id:
            continue
        content = await storage.read()
        uploads[normalized_client_id] = UploadedTaskFile(
            client_id=normalized_client_id,
            name=storage.filename or normalized_client_id,
            size=len(content),
            content=content,
        )
    return uploads


async def _extract_new_input(request: Request) -> str:
    """Extract optional new input for continue or retry operations.

    Args:
        request: Current FastAPI request containing optional JSON/form data.

    Returns:
        Trimmed new input text or an empty string.
    """
    # Treat empty request bodies as no additional input.
    if not await request.body():
        return ''
    try:
        payload = await _get_request_payload(request)
    except ValueError:
        return ''
    return str(payload.get('newInput', '')).strip()


def _require_llm_config(request: Request, user_id: str) -> Tuple[Optional[JSONResponse], Optional[RuntimeConfig]]:
    """Validate that an effective LLM API key is available.

    Args:
        request: Current FastAPI request used to access services.
        user_id: Authenticated user whose config should be checked.

    Returns:
        A tuple of `(error_response, config)`, where one value is `None`.
    """
    # Load effective config and return a route-ready error when no key exists.
    services = get_services(request)
    config = services.config_handler.get_effective_config(user_id)
    if config.api_key.strip():
        return None, config
    return (
        api_response(
            False,
            code='missing_user_api_config',
            message='当前用户未配置 API，且服务器兜底 API 不可用',
            data={'hint': '请先在设置中保存用户 API，或启用服务器兜底 API。'},
            status_code=400,
        ),
        None,
    )


def _build_workflow_error_response_from_result(result: WorkflowResult) -> JSONResponse:
    """Convert workflow service result objects into API responses.

    Args:
        result: A workflow result produced by the orchestration service.

    Returns:
        A normalized API error response that preserves the machine-readable code.
    """
    code = getattr(result, 'code', '') or 'workflow_error'
    message = getattr(result, 'message', '') or '任务执行失败'
    details = getattr(result, 'details', None)
    if code == 'task_not_found':
        return api_response(False, code=code, message=message, data=details, status_code=404)
    return api_response(False, code=code, message=message, data=details, status_code=400)


@tasks_router.get('/tasks')
def get_tasks(request: Request) -> JSONResponse:
    """Return all persisted tasks for the current user.

    Args:
        request: Current FastAPI request used for auth and services.

    Returns:
        A normalized API response containing serialized task records.
    """
    # Query task records in the authenticated user's scope.
    services = get_services(request)
    user_id = get_request_user_id(request)
    tasks = services.task_manager.get_all_tasks(user_id=user_id)
    return api_response(True, data=[task.to_dict() for task in tasks])


@tasks_router.post('/tasks')
async def create_task(request: Request) -> JSONResponse:
    """Create and persist a new CTF task.

    Args:
        request: Current FastAPI request containing JSON or multipart task data.

    Returns:
        A normalized API response containing the created task or an error.
    """
    # Parse payload, uploaded files, and normalized task config.
    try:
        payload = await _get_request_payload(request)
        upload_index = await _extract_uploaded_files(request)
        create_request = CreateTaskRequest.from_payload(payload)
        uploaded_files = create_request.resolve_uploaded_files(upload_index)
    except ValueError as exc:
        return api_response(False, message=f'任务参数无效: {exc}', status_code=400)

    # Validate the minimum task data before service creation.
    if not create_request.name.strip():
        return api_response(False, message='任务名称不能为空', status_code=400)
    try:
        config = create_request.to_config()
    except (KeyError, ValueError) as exc:
        return api_response(False, message=f'任务参数无效: {exc}', status_code=400)

    # Create the task and attach uploaded files transactionally.
    services = get_services(request)
    user_id = get_request_user_id(request)
    result = services.task_manager.create_task(config, user_id=user_id)
    if result.success and result.task is not None:
        try:
            task = result.task
            if uploaded_files:
                task = services.task_manager.attach_uploaded_files(task.id, uploaded_files) or task
            return api_response(True, data=task.to_dict())
        except Exception as exc:
            services.task_manager.delete_task(result.task.id)
            return api_response(False, message=f'文件复制失败: {exc}', status_code=500)
    return api_response(False, message=result.error_message, status_code=500)


@tasks_router.post('/tasks/batch')
async def create_tasks_batch(request: Request) -> JSONResponse:
    """Create and persist multiple CTF tasks.

    Args:
        request: Current FastAPI request containing JSON or multipart batch data.

    Returns:
        A normalized API response containing created tasks and per-item errors.
    """
    # Parse batch payload and uploads before iterating over task entries.
    try:
        payload = await _get_request_payload(request)
        upload_index = await _extract_uploaded_files(request)
        batch_request = CreateBatchTaskRequest.from_payload(payload)
    except ValueError as exc:
        return api_response(False, message=f'批量任务参数无效: {exc}', status_code=400)
    if not batch_request.tasks:
        return api_response(False, message='批量任务不能为空', status_code=400)

    # Initialize result accumulators for partial success reporting.
    services = get_services(request)
    user_id = get_request_user_id(request)
    created_tasks = []
    errors = []

    # Create each task independently so one failure does not block the rest.
    for index, item in enumerate(batch_request.tasks, start=1):
        if not item.name.strip():
            errors.append({'index': index, 'name': item.name, 'message': '任务名称不能为空'})
            continue
        try:
            config = item.to_config()
            uploaded_files = item.resolve_uploaded_files(upload_index)
        except (KeyError, ValueError) as exc:
            errors.append({'index': index, 'name': item.name, 'message': f'任务参数无效: {exc}'})
            continue

        # Attach files after task creation and roll back only the failed item.
        result = services.task_manager.create_task(config, user_id=user_id)
        if result.success and result.task is not None:
            try:
                task = result.task
                if uploaded_files:
                    task = services.task_manager.attach_uploaded_files(task.id, uploaded_files) or task
                created_tasks.append(task.to_dict())
            except Exception as exc:
                services.task_manager.delete_task(result.task.id)
                errors.append({'index': index, 'name': item.name, 'message': f'文件复制失败: {exc}'})
        else:
            errors.append({'index': index, 'name': item.name, 'message': result.error_message or '创建失败'})

    # Return either a full failure or a partial-success payload.
    if not created_tasks:
        return api_response(False, message='批量创建失败', data={'tasks': [], 'errors': errors}, status_code=400)
    message = (
        f'批量创建完成，成功 {len(created_tasks)} 个'
        if not errors
        else f'批量创建部分成功，成功 {len(created_tasks)} 个，失败 {len(errors)} 个'
    )
    return api_response(not errors, message=message, data={'tasks': created_tasks, 'errors': errors})


@tasks_router.post('/tasks/{task_id}/start')
async def start_task(request: Request, task_id: str) -> JSONResponse:
    """Start background analysis for a persisted task.

    Args:
        request: Current FastAPI request containing optional new input.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response containing the updated task or error details.
    """
    # Validate auth, config, and task existence before starting workflow.
    services = get_services(request)
    user_id = get_request_user_id(request)
    missing_config_response, runtime_config = _require_llm_config(request, user_id)
    if missing_config_response is not None:
        return missing_config_response
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        return api_response(False, message='任务未找到', status_code=404)

    # Store optional new input and prepare runtime config for execution.
    new_input = await _extract_new_input(request)
    if new_input:
        services.task_manager.save_pending_new_input(task_id, new_input)
    if runtime_config is not None:
        services.task_manager.prepare_runtime_config(task_id, runtime_config)

    # Start workflow execution and return the latest task snapshot.
    result = services.workflow.start_ctf_analysis(task_id)
    if not result.success:
        return _build_workflow_error_response_from_result(result)
    task = services.task_manager.get_task(task_id)
    return api_response(True, code=result.code or 'task_started', data=task.to_dict() if task else None, message=result.message)


@tasks_router.post('/tasks/{task_id}/continue')
async def continue_task(request: Request, task_id: str) -> JSONResponse:
    """Continue a task from saved context.

    Args:
        request: Current FastAPI request containing optional new input.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response containing the updated task or error details.
    """
    # Validate auth, config, and task existence before continuing workflow.
    services = get_services(request)
    user_id = get_request_user_id(request)
    missing_config_response, runtime_config = _require_llm_config(request, user_id)
    if missing_config_response is not None:
        return missing_config_response
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        return api_response(False, message='任务未找到', status_code=404)

    # Store optional new input and prepare runtime config for continuation.
    new_input = await _extract_new_input(request)
    if new_input:
        services.task_manager.save_pending_new_input(task_id, new_input)
    if runtime_config is not None:
        services.task_manager.prepare_runtime_config(task_id, runtime_config)

    # Continue workflow execution and return the latest task snapshot.
    result = services.workflow.continue_ctf_analysis(task_id)
    if not result.success:
        return _build_workflow_error_response_from_result(result)
    task = services.task_manager.get_task(task_id)
    return api_response(True, code=result.code or 'task_continued', data=task.to_dict() if task else None, message=result.message)


@tasks_router.post('/tasks/{task_id}/retry')
async def retry_task(request: Request, task_id: str) -> JSONResponse:
    """Clear context and rerun a task from the beginning.

    Args:
        request: Current FastAPI request containing optional new input.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response containing the updated task or error details.
    """
    # Validate auth, config, and task existence before retrying workflow.
    services = get_services(request)
    user_id = get_request_user_id(request)
    missing_config_response, runtime_config = _require_llm_config(request, user_id)
    if missing_config_response is not None:
        return missing_config_response
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        return api_response(False, message='任务未找到', status_code=404)

    # Store optional new input and prepare runtime config for retry execution.
    new_input = await _extract_new_input(request)
    if new_input:
        services.task_manager.save_pending_new_input(task_id, new_input)
    if runtime_config is not None:
        services.task_manager.prepare_runtime_config(task_id, runtime_config)

    # Retry workflow execution and return the latest task snapshot.
    result = services.workflow.retry_ctf_analysis(task_id)
    if not result.success:
        return _build_workflow_error_response_from_result(result)
    task = services.task_manager.get_task(task_id)
    return api_response(True, code=result.code or 'task_restarted', data=task.to_dict() if task else None, message=result.message)


@tasks_router.post('/tasks/{task_id}/new-input')
async def save_task_new_input(request: Request, task_id: str) -> JSONResponse:
    """Save additional input for a later continue or retry action.

    Args:
        request: Current FastAPI request containing `newInput`.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response containing the updated task.
    """
    # Confirm task ownership before accepting new input.
    services = get_services(request)
    user_id = get_request_user_id(request)
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        return api_response(False, message='任务未找到', status_code=404)

    # Parse and persist the new input text.
    try:
        payload = await _get_request_payload(request)
    except ValueError as exc:
        return api_response(False, message=f'新输入参数无效: {exc}', status_code=400)
    new_input = str(payload.get('newInput', '')).strip()
    updated_task = services.task_manager.save_pending_new_input(task_id, new_input)
    return api_response(True, data=updated_task.to_dict() if updated_task else None)


@tasks_router.post('/tasks/{task_id}/stop')
def stop_task(request: Request, task_id: str) -> JSONResponse:
    """Request cancellation for a running task.

    Args:
        request: Current FastAPI request used for auth and services.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response containing the updated task.
    """
    # Confirm task ownership before sending a workflow stop request.
    services = get_services(request)
    user_id = get_request_user_id(request)
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        return api_response(False, message='任务未找到', status_code=404)

    # Stop the workflow and return the refreshed task state.
    result = services.workflow.stop_task(task_id)
    if not result.success:
        return _build_workflow_error_response_from_result(result)
    task = services.task_manager.get_task(task_id)
    return api_response(True, code=result.code or 'task_stopped', data=task.to_dict() if task else None, message=result.message)


@tasks_router.post('/tasks/{task_id}/delete')
def delete_task(request: Request, task_id: str) -> JSONResponse:
    """Delete a task by identifier.

    Args:
        request: Current FastAPI request used for auth and services.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response indicating whether deletion succeeded.
    """
    # Verify the task belongs to the user before deletion and stop it first if it is still running.
    services = get_services(request)
    user_id = get_request_user_id(request)
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is not None and task.status == TaskStatus.RUNNING:
        services.workflow.stop_task(task_id)
    success = services.task_manager.delete_task(task_id, user_id=user_id) if task else False
    if success:
        return api_response(True, code='task_deleted', message='任务已删除')
    return api_response(False, code='task_not_found', message='任务未找到', status_code=404)


@tasks_router.get('/tasks/{task_id}/logs')
def get_task_logs(request: Request, task_id: str) -> JSONResponse:
    """Return log lines for a task.

    Args:
        request: Current FastAPI request used for auth and services.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response containing task logs.
    """
    # Fetch the scoped task and expose its stored log list.
    services = get_services(request)
    user_id = get_request_user_id(request)
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        return api_response(False, message='任务未找到', status_code=404)
    return api_response(True, data=task.logs)


@tasks_router.put('/tasks/{task_id}')
async def update_task(request: Request, task_id: str) -> JSONResponse:
    """Update editable task configuration fields.

    Args:
        request: Current FastAPI request containing update data.
        task_id: Task identifier from the path.

    Returns:
        A normalized API response containing the updated task.
    """
    # Verify task ownership and reject edits while the task is running.
    services = get_services(request)
    user_id = get_request_user_id(request)
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        return api_response(False, message='任务未找到', status_code=404)
    if task.status == TaskStatus.RUNNING:
        return api_response(False, message='任务运行中，不能编辑', status_code=400)

    # Parse the update payload and normalize optional fields.
    try:
        payload = await _get_request_payload(request)
        update_request = TaskUpdateRequest.from_payload(payload)
    except ValueError as exc:
        return api_response(False, message=f'请求参数无效: {exc}', status_code=400)

    # Send normalized optional fields to the task manager.
    learning_limits = update_request.learning_limits
    updated_task = services.task_manager.update_task_config(
        task_id=task_id,
        name=update_request.name,
        target=update_request.target,
        system_prompt=update_request.system_prompt,
        skills=update_request.skills,
        selected_mcp=update_request.selected_mcp,
        workflow_kind=update_request.workflow_kind,
        task_mode=update_request.task_mode,
        execution_mode=update_request.execution_mode,
        learning_mode=update_request.learning_mode,
        learning_search_rounds=learning_limits['search_rounds'] if learning_limits is not None else None,
        learning_results_per_query=learning_limits['results_per_query'] if learning_limits is not None else None,
        learning_max_sources=learning_limits['max_sources'] if learning_limits is not None else None,
        learning_max_chars_per_source=learning_limits['max_chars_per_source'] if learning_limits is not None else None,
        learning_focus_keywords=update_request.learning_focus_keywords,
        learning_exclude_keywords=update_request.learning_exclude_keywords,
        user_id=user_id,
    )
    if updated_task is None:
        return api_response(False, message='任务更新失败', status_code=500)
    return api_response(True, data=updated_task.to_dict())
