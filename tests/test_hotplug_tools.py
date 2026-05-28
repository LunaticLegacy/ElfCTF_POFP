from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from services.tools.hotplug import HotplugToolManager


class HotplugToolManagerTests(unittest.IsolatedAsyncioTestCase):
    def test_builtin_hotplug_manifests_load_into_runtime_tools(self) -> None:
        manager = HotplugToolManager(Path('.elfctf/hotplug-tools'))
        runtime_tools = manager.build_runtime_tools(default_cwd=Path.cwd())
        tool_names = {tool.name for tool in runtime_tools}

        self.assertTrue(
            {
                'ctf_toolkit_file',
                'ctf_toolkit_stego',
                'upx_section_fixer',
                'vmpunpacker',
            }.issubset(tool_names),
            msg=f'missing runtime tools: {tool_names}',
        )

    def test_runtime_tools_can_be_whitelisted_per_agent(self) -> None:
        manager = HotplugToolManager(Path('.elfctf/hotplug-tools'))
        runtime_tools = manager.build_runtime_tools(
            default_cwd=Path.cwd(),
            tool_names=['upx_section_fixer', 'vmpunpacker'],
        )
        tool_names = {tool.name for tool in runtime_tools}

        self.assertEqual(tool_names, {'upx_section_fixer', 'vmpunpacker'})

    def test_empty_whitelist_disables_external_tools(self) -> None:
        manager = HotplugToolManager(Path('.elfctf/hotplug-tools'))
        runtime_tools = manager.build_runtime_tools(default_cwd=Path.cwd(), tool_names=[])

        self.assertEqual(runtime_tools, [])

    async def test_python_module_hotplug_tool_executes_with_tool_schema_arguments(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            module_path = root / 'echo_tool.py'
            module_path.write_text(
                '\n'.join(
                    [
                        'def handler(**kwargs):',
                        '    return {"success": True, "echo": kwargs["message"]}',
                    ]
                ),
                encoding='utf-8',
            )
            manifest_path = root / 'echo_tool.json'
            manifest_path.write_text(
                json.dumps(
                    {
                        'name': 'echo_tool',
                        'description': 'Echo a message back to the caller.',
                        'category': 'utility',
                        'dangerous': False,
                        'source': 'upload',
                        'code_path': str(module_path),
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'message': {
                                    'type': 'string',
                                    'description': 'Message to echo.',
                                }
                            },
                            'required': ['message'],
                            'additionalProperties': False,
                        },
                        'runtime': {
                            'kind': 'python_module',
                            'entrypoint': 'handler',
                        },
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding='utf-8',
            )

            manager = HotplugToolManager(root)
            runtime_tools = manager.build_runtime_tools(default_cwd=root)
            echo_tool = next(tool for tool in runtime_tools if tool.name == 'echo_tool')

            result = await echo_tool.execute(message='hello world')

            self.assertEqual(result, {'success': True, 'echo': 'hello world'})

    async def test_script_hotplug_tool_executes_through_cli_adapter(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            script_path = root / 'toolkit_stub.py'
            script_path.write_text(
                '\n'.join(
                    [
                        'import sys',
                        'print("argv=" + " ".join(sys.argv[1:]))',
                    ]
                ),
                encoding='utf-8',
            )
            (root / 'toolkit_stub.json').write_text(
                json.dumps(
                    {
                        'name': 'toolkit_stub',
                        'description': 'Stub CLI runtime tool.',
                        'category': 'utility',
                        'dangerous': False,
                        'source': 'builtin',
                        'code_path': str(script_path),
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'file': {'type': 'string', 'description': 'Target file.'},
                                'output': {'type': 'string', 'description': 'Output directory.'},
                                'type': {'type': 'boolean', 'description': 'Run type detection.'},
                            },
                            'required': ['file'],
                            'additionalProperties': False,
                        },
                        'runtime': {
                            'kind': 'ctf_toolkit_file',
                            'entrypoint': 'ctf_toolkit_file',
                            'script': str(script_path),
                        },
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding='utf-8',
            )

            manager = HotplugToolManager(root)
            runtime_tools = manager.build_runtime_tools(default_cwd=root)
            cli_tool = next(tool for tool in runtime_tools if tool.name == 'toolkit_stub')

            result = await cli_tool.execute(file='input.bin', output='out', type=True)

            self.assertIn('argv=file -f input.bin -o out --type', result)
