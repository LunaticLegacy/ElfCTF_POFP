"""GZCTF automation API routes."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

from . import gzctf_router
from ..dependencies import api_response, get_request_user_id, get_services
from core.models import RuntimeConfig


def _build_runtime_config_from_saved_and_payload(request: Request, payload: dict, user_id: str) -> RuntimeConfig:
    """Merge saved runtime config with optional campaign overrides."""
    services = get_services(request)
    saved = services.config_handler.get_effective_config(user_id)
    merged = RuntimeConfig(**saved.to_dict())
    provided_values = []
    overrides = {
        "gzctf_username": str(payload.get("gzctf_username", payload.get("username", ""))).strip(),
        "gzctf_password": str(payload.get("gzctf_password", payload.get("password", ""))),
        "gzctf_game_url": str(payload.get("gzctf_game_url", payload.get("game_url", ""))).strip(),
    }
    for key, value in overrides.items():
        if value:
            setattr(merged, key, value)
            provided_values.append(value)
    merged.gzctf_enabled = bool(merged.gzctf_enabled or provided_values)
    return merged


@gzctf_router.get("/gzctf/automation/runs")
def list_gzctf_automation_runs(request: Request) -> JSONResponse:
    """Return all GZCTF automation runs for the authenticated user."""
    services = get_services(request)
    user_id = get_request_user_id(request)
    return api_response(True, data=services.gzctf_automation.list_runs(user_id=user_id))


@gzctf_router.get("/gzctf/automation/runs/{run_id}")
def get_gzctf_automation_run(request: Request, run_id: str) -> JSONResponse:
    """Return one GZCTF automation run."""
    services = get_services(request)
    user_id = get_request_user_id(request)
    data = services.gzctf_automation.get_run(run_id, user_id=user_id)
    if data is None:
        return api_response(False, message="自动化运行不存在", status_code=404)
    return api_response(True, data=data)


@gzctf_router.post("/gzctf/automation/runs/{run_id}/cancel")
def cancel_gzctf_automation_run(request: Request, run_id: str) -> JSONResponse:
    """Request cancellation for one automation run."""
    services = get_services(request)
    user_id = get_request_user_id(request)
    data = services.gzctf_automation.cancel_run(run_id, user_id=user_id)
    if data is None:
        return api_response(False, message="自动化运行不存在", status_code=404)
    return api_response(True, data=data, message="已请求取消 GZCTF 自动化")


@gzctf_router.post("/gzctf/automation/start")
async def start_gzctf_automation(request: Request) -> JSONResponse:
    """Create a new GZCTF automation run and start batch task fan-out."""
    services = get_services(request)
    user_id = get_request_user_id(request)
    payload = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    runtime_config = _build_runtime_config_from_saved_and_payload(request, payload or {}, user_id)
    if not runtime_config.api_key.strip():
        return api_response(False, message="当前用户没有可用的 LLM API 配置", status_code=400)
    try:
        challenge_limit = int(payload.get("challenge_limit", payload.get("challengeLimit", 0)) or 0)
    except (TypeError, ValueError):
        challenge_limit = 0
    try:
        max_concurrent_tasks = int(payload.get("max_concurrent_tasks", payload.get("maxConcurrentTasks", 3)) or 3)
    except (TypeError, ValueError):
        max_concurrent_tasks = 3
    try:
        data = services.gzctf_automation.start_run(
            user_id=user_id,
            runtime_config=runtime_config,
            challenge_limit=challenge_limit,
            max_concurrent_tasks=max_concurrent_tasks,
        )
    except ValueError as exc:
        return api_response(False, message=f"GZCTF 自动化启动失败: {exc}", status_code=400)
    except RuntimeError as exc:
        return api_response(False, message=f"GZCTF 自动化启动失败: {exc}", status_code=500)
    return api_response(True, data=data, message="GZCTF 自动化已启动")
