"""Tool API routes implemented with FastAPI."""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Dict, List

from fastapi import Request
from fastapi.responses import JSONResponse

from . import tools_router
from ..dependencies import api_response, get_request_user_id, get_services
from ..schemas import HotplugInstallPlanRequest
from services.tools import CATEGORY_LABELS, get_tool_categories
from services.tools.hotplug import hotplug_manager


@tools_router.get('/tools')
def list_tools(
    category: str = '',
    include_basic: str = None,
    include_builtin: str = 'true',
    include_hash: str = 'false',
) -> JSONResponse:
    """Return all available tools, optionally filtered by category.

    Args:
        category: Optional category filter.
        include_basic: Whether to include basic tools; overrides include_builtin.
        include_builtin: Legacy alias for include_basic.
        include_hash: Whether to include tool hash metadata.

    Returns:
        A normalized API response containing tool definitions.
    """
    # Normalize compatibility query flags and fetch tool definitions.
    include_basic_raw = include_basic if include_basic is not None else include_builtin
    include_builtin_flag = str(include_basic_raw).lower() == 'true'
    include_hash_flag = str(include_hash).lower() == 'true'
    tools = hotplug_manager.get_all_tools(include_builtin=include_builtin_flag)

    # Apply optional category filtering and decorate display labels.
    if category:
        tools = [tool for tool in tools if tool.get('category') == category]
    for tool in tools:
        tool['category_label'] = CATEGORY_LABELS.get(tool.get('category'), tool.get('category'))
        if not include_hash_flag:
            tool.pop('_hash', None)
    return api_response(success=True, data=tools)


@tools_router.get('/tools/bootstrap/status')
def tool_bootstrap_status(request: Request) -> JSONResponse:
    """Return recommended tool bootstrap status for the current environment.

    Args:
        request: Current FastAPI request used for auth and services.

    Returns:
        A normalized API response containing a bootstrap report.
    """
    # Build a user-scoped bootstrap report through the service layer.
    services = get_services(request)
    user_id = get_request_user_id(request)
    report = services.tool_bootstrap.build_report(user_id=user_id)
    return api_response(success=True, data=report.to_dict())


@tools_router.post('/tools/bootstrap/install-plan')
def write_tool_install_plan(request: Request, payload: HotplugInstallPlanRequest) -> JSONResponse:
    """Generate a recommended tool installation script.

    Args:
        request: Current FastAPI request used for auth and services.
        payload: Requested binary names.

    Returns:
        A normalized API response containing generated install plan data.
    """
    # Validate binary list shape before delegating script generation.
    plan_request = HotplugInstallPlanRequest.from_payload(payload.__dict__)
    if plan_request.binaries is not None and not isinstance(plan_request.binaries, list):
        return api_response(success=False, message='binaries 必须是数组', status_code=400)
    services = get_services(request)
    user_id = get_request_user_id(request)
    data = services.tool_bootstrap.write_install_plan(user_id, binaries=plan_request.binaries)
    return api_response(success=True, data=data)


@tools_router.get('/tools/categories')
def list_categories() -> JSONResponse:
    """Return all tool categories.

    Returns:
        A normalized API response containing category keys and labels.
    """
    # Convert category keys into frontend display records.
    categories = get_tool_categories()
    data = [{'key': cat, 'label': CATEGORY_LABELS.get(cat, cat)} for cat in categories]
    return api_response(success=True, data=data)


@tools_router.get('/tools/hotplug')
def hotplug_list() -> JSONResponse:
    """Return all externally managed hotplug tools.

    Returns:
        A normalized API response containing hotplug tool records.
    """
    # Load external tools and decorate category labels for display.
    tools = hotplug_manager.get_hotplug_tools()
    for tool in tools:
        tool['category_label'] = CATEGORY_LABELS.get(tool.get('category'), tool.get('category'))
    return api_response(success=True, data=tools)


@tools_router.get('/tools/{tool_name}')
def get_tool_detail(tool_name: str, include_hash: str = 'true') -> JSONResponse:
    """Return detail for one tool.

    Args:
        tool_name: Tool name from the path.
        include_hash: Whether to include hash metadata.

    Returns:
        A normalized API response containing tool detail or a not-found error.
    """
    # Fetch tool metadata and apply response decoration.
    include_hash_flag = str(include_hash).lower() == 'true'
    tool = hotplug_manager.get_tool(tool_name)
    if tool is None:
        return api_response(success=False, message=f'工具不存在: {tool_name}', status_code=404)
    tool['category_label'] = CATEGORY_LABELS.get(tool.get('category'), tool.get('category'))
    if not include_hash_flag:
        tool.pop('_hash', None)
    return api_response(success=True, data=tool)


@tools_router.post('/tools/hotplug')
async def hotplug_add(request: Request) -> JSONResponse:
    """Add or update an external hotplug tool.

    Args:
        request: Current FastAPI request containing the tool definition JSON.

    Returns:
        A normalized API response containing hash and action metadata.
    """
    # Parse the raw tool definition because schema is intentionally flexible.
    data = await request.json()
    if not data:
        return api_response(success=False, message='请求体不能为空', status_code=400)
    result = hotplug_manager.add_tool(data, source='api')

    # Return manager result with create/update/skip metadata.
    if result['success']:
        return api_response(
            success=True,
            data={'hash': result['hash'], 'action': result.get('action'), 'old_hash': result.get('old_hash')},
            message=result['message'],
        )
    return api_response(success=False, message=result['message'], status_code=400)


@tools_router.delete('/tools/hotplug/{tool_name}')
def hotplug_remove(tool_name: str) -> JSONResponse:
    """Remove an external hotplug tool.

    Args:
        tool_name: Tool name from the path.

    Returns:
        A normalized API response containing deletion metadata.
    """
    # Ask the hotplug manager to delete the named tool.
    result = hotplug_manager.remove_tool(tool_name)
    if result['success']:
        return api_response(success=True, message=result['message'], data={'hash': result['hash']})
    return api_response(success=False, message=result['message'], status_code=404)


@tools_router.put('/tools/hotplug/{tool_name}/code')
async def hotplug_update_code(request: Request, tool_name: str) -> JSONResponse:
    """Update dynamic code for an external tool.

    Args:
        request: Current FastAPI request containing a `code` field.
        tool_name: Tool name from the path.

    Returns:
        A normalized API response containing updated hash metadata.
    """
    # Validate that the update payload includes source code.
    data = await request.json()
    if not data or 'code' not in data:
        return api_response(success=False, message='缺少 code 字段', status_code=400)
    result = hotplug_manager.update_tool_code(tool_name, data['code'])

    # Convert manager status into an API response.
    if result['success']:
        return api_response(
            success=True,
            message=result['message'],
            data={'hash': result['hash'], 'old_hash': result.get('old_hash'), 'action': result.get('action')},
        )
    return api_response(success=False, message=result['message'], status_code=400)


@tools_router.post('/tools/hotplug/reload')
def hotplug_reload_all() -> JSONResponse:
    """Reload all external tool configuration files.

    Returns:
        A normalized API response containing reload statistics.
    """
    # Scan tool storage and refresh every external tool definition.
    result = hotplug_manager.reload_all()
    if result['success']:
        return api_response(success=True, message=result['message'], data=result['stats'])
    return api_response(success=False, message=result['message'], status_code=500)


@tools_router.post('/tools/hotplug/{tool_name}/reload')
def hotplug_reload_one(tool_name: str) -> JSONResponse:
    """Reload one external tool configuration file.

    Args:
        tool_name: Tool name from the path.

    Returns:
        A normalized API response containing reload metadata.
    """
    # Refresh the named tool definition from disk.
    result = hotplug_manager.reload_tool(tool_name)
    if result['success']:
        return api_response(success=True, message=result['message'], data={'hash': result.get('hash'), 'action': result.get('action')})
    return api_response(success=False, message=result['message'], status_code=400)


@tools_router.get('/tools/hotplug/status')
def hotplug_status() -> JSONResponse:
    """Return hotplug manager status.

    Returns:
        A normalized API response containing storage and count metadata.
    """
    # Delegate status collection to the hotplug manager.
    status = hotplug_manager.get_status()
    return api_response(success=True, data=status)


@tools_router.get('/tools/hotplug/{tool_name}/hash')
def hotplug_check_hash(tool_name: str, expected: str = '') -> JSONResponse:
    """Check whether a tool hash differs from the expected hash.

    Args:
        tool_name: Tool name from the path.
        expected: Expected hash value from query parameters.

    Returns:
        A normalized API response containing current and expected hash data.
    """
    # Compare the current manager hash against the caller's expected value.
    current = hotplug_manager.get_tool_hash(tool_name)
    if current is None:
        return api_response(
            success=True,
            data={'changed': True, 'current_hash': None, 'expected_hash': expected},
            message='工具不存在',
        )
    return api_response(success=True, data={'changed': current != expected, 'current_hash': current, 'expected_hash': expected})


@tools_router.post('/tools/hotplug/upload')
async def hotplug_upload_script(request: Request) -> JSONResponse:
    """Upload multiple files as an external tool.

    Args:
        request: Current FastAPI multipart request containing uploaded files.

    Returns:
        A normalized API response containing created tool metadata.
    """
    # Read multipart form data and collect uploaded files.
    form = await request.form()
    uploaded_files = [value for _, value in form.multi_items() if hasattr(value, 'filename') and value.filename]
    if not uploaded_files:
        return api_response(success=False, message='没有有效的上传文件', status_code=400)

    # Read file bytes and identify Python candidates.
    file_contents: Dict[str, bytes] = {}
    py_files: List[str] = []
    for uploaded_file in uploaded_files:
        content = await uploaded_file.read()
        file_contents[uploaded_file.filename] = content
        if uploaded_file.filename.endswith('.py'):
            py_files.append(uploaded_file.filename)
    if not py_files:
        return api_response(success=False, message='上传文件中必须包含至少一个 .py 文件', status_code=400)

    # Locate Python files that define the required callable entry point.
    handler_files = []
    for filename in py_files:
        try:
            text = file_contents[filename].decode('utf-8')
            if re.search(r'\bdef\s+handler\s*\(', text):
                handler_files.append(filename)
        except UnicodeDecodeError:
            continue
    if not handler_files:
        return api_response(success=False, message='Python 文件中必须定义可调用入口', status_code=400)

    # Determine the main handler file from form input or default to the first match.
    main_file = str(form.get('main_file', '')).strip()
    if main_file and main_file not in handler_files:
        return api_response(success=False, message=f'指定的主文件 "{main_file}" 不是有效的 handler 文件', status_code=400)
    if not main_file:
        main_file = handler_files[0]

    # Decode the main file so metadata can be extracted.
    try:
        main_content = file_contents[main_file].decode('utf-8')
    except UnicodeDecodeError:
        return api_response(success=False, message='主文件编码错误，请使用 UTF-8 编码', status_code=400)

    # Derive the tool name and short description from form fields or docstrings.
    default_name = main_file[:-3] if main_file.endswith('.py') else main_file
    tool_name = str(form.get('name', default_name)).strip() or default_name
    description = str(form.get('description', '')).strip()
    module_doc = ''
    if not description:
        module_doc = _extract_module_doc(main_content)
        description = module_doc.split('\n')[0] if module_doc else ''
    if not description:
        description = f'从 {main_file} 上传的工具'

    # Extract documentation and argument schema hints from docstrings.
    handler_doc = _extract_handler_doc(main_content)
    doc = module_doc or handler_doc
    arguments_schema = _extract_arguments_schema(doc or handler_doc)
    parameters = _build_parameters_schema(arguments_schema)

    # Persist uploaded files and optional markdown docs into hotplug storage.
    storage_dir = Path(hotplug_manager._storage_dir)
    tool_dir = storage_dir / 'scripts' / tool_name
    tool_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in file_contents.items():
        (tool_dir / filename).write_bytes(content)
    code_file_path = tool_dir / main_file

    # Save extracted docs separately when available.
    doc_path = None
    if doc:
        docs_dir = storage_dir / 'docs'
        docs_dir.mkdir(exist_ok=True)
        doc_file_path = docs_dir / f'{tool_name}.md'
        doc_file_path.write_text(doc, encoding='utf-8')
        doc_path = str(doc_file_path)

    # Build the hotplug tool definition and include optional upload metadata.
    attachments = [filename for filename in file_contents.keys() if filename != main_file]
    tool_def = {
        'name': tool_name,
        'description': description,
        'parameters': parameters,
        'arguments_schema': arguments_schema,
        'category': str(form.get('category', 'utility')),
        'dangerous': str(form.get('dangerous', 'false')).lower() == 'true',
        'code_path': str(code_file_path),
        'runtime': {
            'kind': 'python_module',
            'entrypoint': 'handler',
        },
    }
    if doc_path:
        tool_def['doc_path'] = doc_path
    if attachments:
        tool_def['attachments'] = attachments

    # Parse optional timeout and register the uploaded tool with the manager.
    timeout_str = str(form.get('timeout', '')).strip()
    if timeout_str:
        try:
            tool_def['timeout'] = int(timeout_str)
        except ValueError:
            pass
    result = hotplug_manager.add_tool(tool_def, source='upload')

    # Return upload metadata including doc preview and attachment names.
    if result['success']:
        return api_response(
            success=True,
            message=result['message'],
            data={
                'name': tool_name,
                'hash': result['hash'],
                'action': result.get('action'),
                'parameters': parameters,
                'arguments_schema': arguments_schema,
                'has_doc': bool(doc),
                'doc_preview': doc[:200] + '...' if doc and len(doc) > 200 else doc if doc else None,
                'attachments': attachments,
            },
        )
    return api_response(success=False, message=result['message'], status_code=400)


def _extract_module_doc(source: str) -> str:
    """Extract the module docstring from Python source.

    Args:
        source: Python source code to inspect.

    Returns:
        The module docstring, or an empty string if unavailable.
    """
    # Parse the file and return the first expression string as module docs.
    try:
        module = ast.parse(source)
        if module.body and isinstance(module.body[0], ast.Expr):
            first_expr = module.body[0].value
            if isinstance(first_expr, ast.Constant) and isinstance(first_expr.value, str):
                return first_expr.value.strip()
    except SyntaxError:
        return ''
    return ''


def _extract_handler_doc(source: str) -> str:
    """Extract the handler function docstring from Python source.

    Args:
        source: Python source code to inspect.

    Returns:
        The handler docstring, or an empty string if unavailable.
    """
    # Walk parsed functions until the handler definition is found.
    try:
        module = ast.parse(source)
    except SyntaxError:
        return ''
    for node in ast.walk(module):
        if isinstance(node, ast.FunctionDef) and node.name == 'handler':
            return ast.get_docstring(node) or ''
    return ''


def _extract_arguments_schema(doc: str) -> Dict[str, str]:
    """Extract simple `:param name:` entries from doc text.

    Args:
        doc: Docstring text to parse for parameter descriptions.

    Returns:
        A dictionary mapping argument names to descriptions.
    """
    # Parse multiline Sphinx-style parameter entries first.
    arguments_schema: Dict[str, str] = {}
    if not doc:
        return arguments_schema
    for match in re.finditer(r':param\s+(\w+):\s(.+?)(?=:\n|\n\n|:\w|$)', doc, re.DOTALL):
        arg_name = match.group(1)
        arg_desc = match.group(2).strip().replace('\n', ' ')
        arguments_schema[arg_name] = arg_desc

    # Fall back to simple one-line parameter entries.
    if not arguments_schema:
        for match in re.finditer(r':param\s+(\w+):\s*(.+)', doc):
            arg_name = match.group(1)
            arg_desc = match.group(2).strip()
            arguments_schema[arg_name] = arg_desc
    return arguments_schema


def _build_parameters_schema(arguments_schema: Dict[str, str]) -> Dict[str, object]:
    """Convert legacy argument hints into a JSON schema tool definition."""
    properties = {
        name: {
            'type': 'string',
            'description': description,
        }
        for name, description in arguments_schema.items()
    }
    required = list(arguments_schema.keys())
    return {
        'type': 'object',
        'properties': properties,
        'required': required,
        'additionalProperties': True,
    }
