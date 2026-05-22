"""Background job cockpit API routes implemented with FastAPI."""

from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse

from . import background_router
from ..dependencies import api_response, get_request_user_id, get_services
from ..schemas import BackgroundJobCreateRequest, BackgroundJobInputRequest, BackgroundJobStopRequest


def _resolve_task_workspace(request: Request, task_id: str, user_id: str) -> Path:
    """Resolve a task workspace for background job execution.

    Args:
        request: Current FastAPI request used to access services.
        task_id: Task identifier whose workspace should be used.
        user_id: Authenticated user used to scope task lookup.

    Returns:
        The filesystem path for the task workspace.

    Raises:
        ValueError: If the task does not exist for the user.
    """
    # Look up the task in the current user's scope and derive its workspace.
    services = get_services(request)
    task = services.task_manager.get_task(task_id, user_id=user_id)
    if task is None:
        raise ValueError('任务未找到')
    return services.task_manager.get_task_workspace(task)


@background_router.get('/background-jobs')
def list_background_jobs(
    request: Request,
    task_id: str = '',
    status: str = '',
) -> JSONResponse:
    """List background jobs for the authenticated user.

    Args:
        request: Current FastAPI request used for auth and services.
        task_id: Optional task filter from query parameters.
        status: Optional status filter from query parameters.

    Returns:
        A normalized API response containing serialized job records.
    """
    # Normalize filters and query the background job manager.
    services = get_services(request)
    user_id = get_request_user_id(request)
    jobs = services.background_jobs.list_jobs(
        user_id=user_id,
        task_id=str(task_id).strip(),
        status=str(status).strip(),
    )
    return api_response(True, data=[job.to_dict() for job in jobs])


@background_router.post('/background-jobs')
def start_background_job(request: Request, payload: BackgroundJobCreateRequest) -> JSONResponse:
    """Start a new background command.

    Args:
        request: Current FastAPI request used for auth and services.
        payload: Command, task scope, stdin, and interactivity settings.

    Returns:
        A normalized API response containing the created job record.
    """
    # Validate and normalize the requested command.
    job_request = BackgroundJobCreateRequest.from_payload(payload.__dict__)
    if not job_request.command:
        return api_response(False, message='command 不能为空', status_code=400)

    # Resolve the working directory and start the process through the service.
    services = get_services(request)
    user_id = get_request_user_id(request)
    try:
        cwd = (
            _resolve_task_workspace(request, job_request.task_id, user_id)
            if job_request.task_id
            else services.storage.get_data_dir()
        )
        record = services.background_jobs.start_job(
            command=job_request.command,
            cwd=cwd,
            user_id=user_id,
            task_id=job_request.task_id,
            name=job_request.name,
            stdin_text=job_request.stdin_text,
            interactive=job_request.interactive,
        )
    except ValueError as exc:
        return api_response(False, message=str(exc), status_code=404)
    except Exception as exc:
        return api_response(False, message=str(exc), status_code=400)
    return api_response(True, data=record.to_dict())


@background_router.get('/background-jobs/{job_id}')
def get_background_job(
    request: Request,
    job_id: str,
    task_id: str = '',
    tail_lines: int = 80,
) -> JSONResponse:
    """Return background job detail and output tail.

    Args:
        request: Current FastAPI request used for auth and services.
        job_id: Background job identifier from the path.
        task_id: Optional task scope from query parameters.
        tail_lines: Number of log lines to include from the tail.

    Returns:
        A normalized API response containing job output data.
    """
    # Read scoped job output and convert missing records to 404 responses.
    services = get_services(request)
    user_id = get_request_user_id(request)
    result = services.background_jobs.read_job_output(
        job_id,
        user_id=user_id,
        task_id=str(task_id).strip(),
        tail_lines=tail_lines,
    )
    if result is None:
        return api_response(False, message='后台任务未找到', status_code=404)
    return api_response(True, data=result)


@background_router.post('/background-jobs/{job_id}/input')
def send_background_job_input(request: Request, job_id: str, payload: BackgroundJobInputRequest) -> JSONResponse:
    """Send stdin text to an interactive background job.

    Args:
        request: Current FastAPI request used for auth and services.
        job_id: Background job identifier from the path.
        payload: Text and newline settings for process stdin.

    Returns:
        A normalized API response containing the updated job record.
    """
    # Normalize input payload and forward it to the background job manager.
    services = get_services(request)
    user_id = get_request_user_id(request)
    input_request = BackgroundJobInputRequest.from_payload(payload.__dict__)
    try:
        record = services.background_jobs.send_input(
            job_id,
            input_request.input_text,
            user_id=user_id,
            task_id=input_request.task_id,
            append_newline=input_request.append_newline,
        )
    except ValueError as exc:
        status_code = 400 if '不可交互' in str(exc) else 404
        return api_response(False, message=str(exc), status_code=status_code)
    return api_response(True, data=record.to_dict())


@background_router.post('/background-jobs/{job_id}/stop')
def stop_background_job(request: Request, job_id: str, payload: BackgroundJobStopRequest) -> JSONResponse:
    """Stop a background job.

    Args:
        request: Current FastAPI request used for auth and services.
        job_id: Background job identifier from the path.
        payload: Optional task scope and force flag.

    Returns:
        A normalized API response containing the stopped job record.
    """
    # Normalize stop options and request process termination.
    services = get_services(request)
    user_id = get_request_user_id(request)
    stop_request = BackgroundJobStopRequest.from_payload(payload.__dict__)
    try:
        record = services.background_jobs.stop_job(
            job_id,
            user_id=user_id,
            task_id=stop_request.task_id,
            force=stop_request.force,
        )
    except ValueError as exc:
        return api_response(False, message=str(exc), status_code=404)
    return api_response(True, data=record.to_dict())
