"""Unit tests for immutable task context mode persistence."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.models import CTFTaskConfig, TaskType
from services.tasks.manager import TaskManager


class TaskContextModeTest(unittest.TestCase):
    def test_context_mode_is_persisted_and_not_editable_after_creation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TaskManager(Path(tmpdir))
            result = manager.create_task(
                CTFTaskConfig(
                    name='ctx mode task',
                    task_type=TaskType.RE,
                    context_mode='graph',
                    external_tool_names=['upx_section_fixer', 'vmpunpacker'],
                ),
                user_id='user-a',
            )
            self.assertTrue(result.success)
            self.assertIsNotNone(result.task)
            assert result.task is not None

            task_id = result.task.id
            persisted = TaskManager(Path(tmpdir)).get_task(task_id, user_id='user-a')
            self.assertIsNotNone(persisted)
            assert persisted is not None
            self.assertEqual(persisted.config.context_mode, 'graph')
            self.assertEqual(persisted.to_dict()['contextMode'], 'graph')
            self.assertEqual(persisted.config.external_tool_names, ['upx_section_fixer', 'vmpunpacker'])
            self.assertEqual(
                persisted.to_dict()['externalToolNames'],
                ['upx_section_fixer', 'vmpunpacker'],
            )

            manager.update_task_config(task_id, user_id='user-a', context_mode='linear')
            updated = manager.get_task(task_id, user_id='user-a')
            self.assertIsNotNone(updated)
            assert updated is not None
            self.assertEqual(updated.config.context_mode, 'graph')
            self.assertEqual(updated.config.external_tool_names, ['upx_section_fixer', 'vmpunpacker'])


if __name__ == '__main__':
    unittest.main()
