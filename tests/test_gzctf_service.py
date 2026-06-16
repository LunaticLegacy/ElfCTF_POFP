"""Unit tests for GZCTF helper behavior that does not require network access."""

from __future__ import annotations

import tempfile
import unittest

from core.models import RuntimeConfig
from services.gzctf_service import GZCTFService


class GZCTFServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.service = GZCTFService(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_parse_game_url_extracts_base_and_game_id(self) -> None:
        base, game_id = self.service.parse_game_url('https://gz.example.com/games/33/challenges#')
        self.assertEqual(base, 'https://gz.example.com')
        self.assertEqual(game_id, 33)

    def test_validate_config_rejects_partial_values_when_enabled(self) -> None:
        config = RuntimeConfig(
            gzctf_enabled=True,
            gzctf_username='user',
            gzctf_password='',
            gzctf_game_url='https://gz.example.com/games/1',
        )
        with self.assertRaises(ValueError):
            self.service.validate_config(config)

    def test_validate_config_ignores_partial_values_when_disabled(self) -> None:
        config = RuntimeConfig(
            gzctf_enabled=False,
            gzctf_username='user',
            gzctf_password='',
            gzctf_game_url='https://gz.example.com/games/1',
        )
        self.service.validate_config(config)
        self.assertFalse(self.service.is_configured(config))

    def test_resolve_challenge_prefers_target_challenge_id(self) -> None:
        details = {
            'challenges': [
                {'id': 12, 'title': 'warmup'},
                {'id': 24, 'title': 'crypto-1'},
            ]
        }
        challenge = self.service.resolve_challenge(
            details,
            task_name='something else',
            task_target='https://gz.example.com/games/33/challenges/24',
        )
        self.assertIsNotNone(challenge)
        self.assertEqual(challenge['id'], 24)

    def test_resolve_challenge_prefers_explicit_challenge_id(self) -> None:
        details = {
            'challenges': [
                {'id': 12, 'title': 'warmup'},
                {'id': 24, 'title': 'crypto-1'},
            ]
        }
        challenge = self.service.resolve_challenge(
            details,
            task_name='something else',
            task_target='',
            gzctf_challenge_id='12',
        )
        self.assertIsNotNone(challenge)
        self.assertEqual(challenge['id'], 12)

    def test_resolve_challenge_falls_back_to_name_match(self) -> None:
        details = {
            'challenges': [
                {'id': 12, 'title': 'Warm Up'},
                {'id': 24, 'title': 'crypto-1'},
            ]
        }
        challenge = self.service.resolve_challenge(
            details,
            task_name='warm_up',
            task_target='',
        )
        self.assertIsNotNone(challenge)
        self.assertEqual(challenge['id'], 12)

    def test_resolve_challenge_supports_nested_payload_and_alternate_id_key(self) -> None:
        details = {
            'challenges': {
                'reverse': [
                    {'gameChallengeId': 727, 'title': 'Ezre', 'tag': '727-Ezre'},
                ]
            }
        }
        challenge = self.service.resolve_challenge(
            details,
            task_name='other',
            task_target='https://gz.imxbt.cn/games/16/challenges#727-Ezre',
            gzctf_challenge_id='727',
        )
        self.assertIsNotNone(challenge)
        self.assertEqual(challenge['gameChallengeId'], 727)

    def test_extract_team_info_reads_rank_payload(self) -> None:
        team = self.service.extract_team_info({
            'rank': {
                'id': 3768,
                'name': 'lunamoon',
                'score': 0,
                'rank': 600,
                'solvedCount': 0,
            }
        })
        self.assertEqual(team, {
            'id': 3768,
            'name': 'lunamoon',
            'score': 0,
            'rank': 600,
            'solvedCount': 0,
        })


if __name__ == '__main__':
    unittest.main()
