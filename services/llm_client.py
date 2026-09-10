"""Small helper for model-listing requests."""

from __future__ import annotations

import urllib.error
import urllib.request
import json
from urllib.parse import urlparse
from typing import Any, Dict


class LLMClient:
    """Fetch model metadata from OpenAI-compatible endpoints."""

    def fetch_models(self, api_key: str, api_base: str, connector_type: str = 'litellm') -> Dict[str, Any]:
        """Fetch available model names from an LLM provider.

        Args:
            api_key: API key used for authorization.
            api_base: Provider base URL.
            connector_type: Connector family selected by the user.

        Returns:
            A status dictionary consumed by the model route. The returned
            model entries include `id`, `name`, `display_name`, and `object`
            so the frontend can render a label even when the provider omits one.
        """
        # Some providers expose models under `/models`, others under `/v1/models`.
        # Try the provider-specific order first so OpenAI-compatible and DeepSeek-style bases both work.
        model_urls = self._iter_model_list_urls(api_base, connector_type)
        last_error = '未能读取模型列表'
        for index, url in enumerate(model_urls):
            request = urllib.request.Request(
                url,
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Accept': 'application/json',
                    'User-Agent': 'ElfCTF/0.1.0',
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    payload = json.loads(response.read().decode('utf-8'))
                    break
            except urllib.error.HTTPError as exc:
                error_body = ''
                try:
                    error_body = exc.read().decode('utf-8', errors='ignore').strip()
                except Exception:
                    error_body = ''
                detail = f'{exc.code} {exc.reason}'
                if error_body:
                    detail = f'{detail}: {error_body[:500]}'
                last_error = detail
                if exc.code not in (403, 404, 405) or index == len(model_urls) - 1:
                    return {'success': False, 'message': f'获取模型列表失败: {detail}'}
            except urllib.error.URLError as exc:
                return {'success': False, 'message': f'获取模型列表失败: {exc}'}
            except Exception as exc:
                return {'success': False, 'message': f'获取模型列表失败: {exc}'}
        else:
            return {'success': False, 'message': f'获取模型列表失败: {last_error}'}

        # Normalize common provider response shapes into a compact list.
        models = payload.get('data', payload if isinstance(payload, list) else [])
        data = [
            {
                'id': str(item.get('id', item.get('name', item.get('display_name', str(item))))).strip(),
                'name': str(item.get('name', item.get('display_name', item.get('id', str(item))))).strip(),
                'display_name': str(item.get('display_name', item.get('name', item.get('id', str(item))))).strip(),
                'object': str(item.get('object', 'model')).strip(),
            }
            if isinstance(item, dict)
            else {'id': str(item), 'name': str(item), 'display_name': str(item), 'object': 'model'}
            for item in models
        ]
        return {'success': True, 'data': data, 'message': f'已加载 {len(data)} 个模型'}

    def _iter_model_list_urls(self, api_base: str, connector_type: str) -> list[str]:
        """Yield provider-specific model-list URLs in preferred order.

        Args:
            api_base: Provider base URL supplied by the caller or stored config.
            connector_type: Connector family selected by the UI.

        Returns:
            Candidate URLs for the provider's model-list endpoint.
        """
        # Preserve explicit paths from the caller, then try the provider-native and OpenAI-style routes.
        base = api_base.rstrip('/')
        parsed = urlparse(base)
        host = parsed.netloc.lower()
        path = parsed.path.rstrip('/')
        if path.endswith('/v1'):
            base = base[:-3].rstrip('/')
        if 'deepseek' in host or connector_type == 'anthropic':
            return [f'{base}/models', f'{base}/v1/models']
        return [f'{base}/v1/models', f'{base}/models']
