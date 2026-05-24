"""Helpers for authenticating against GZCTF and auto-submitting flags."""

from __future__ import annotations

import base64
import os
import re
import time
from http.cookiejar import MozillaCookieJar
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple
from urllib.parse import urlparse

import requests

from core.models import RuntimeConfig

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import x25519
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:  # pragma: no cover - exercised only in minimal environments
    hashes = serialization = x25519 = AESGCM = None


class GZCTFService:
    """Login, persist cookies, and submit flags through the GZCTF HTTP API."""

    def __init__(self, data_dir: Path | str) -> None:
        self._root = Path(data_dir).expanduser().resolve() / 'gzctf'
        self._root.mkdir(parents=True, exist_ok=True)

    def is_configured(self, config: RuntimeConfig) -> bool:
        """Return whether all fields required for auto-submit are present."""
        return all((
            str(config.gzctf_username).strip(),
            str(config.gzctf_password),
            str(config.gzctf_game_url).strip(),
        ))

    def has_partial_config(self, config: RuntimeConfig) -> bool:
        """Return whether the config contains some but not all GZCTF fields."""
        values = [
            str(config.gzctf_username).strip(),
            str(config.gzctf_password),
            str(config.gzctf_game_url).strip(),
        ]
        return any(values) and not all(values)

    def validate_config(self, config: RuntimeConfig) -> None:
        """Ensure the config is either empty or fully specified."""
        if self.has_partial_config(config):
            raise ValueError('GZCTF 配置需要同时填写账号、密码和比赛链接，或全部留空')
        if self.is_configured(config):
            self.parse_game_url(config.gzctf_game_url)

    def get_status(self, user_id: str, config: RuntimeConfig) -> Dict[str, Any]:
        """Return non-secret GZCTF status fields for the settings UI."""
        cookie_path = self.get_cookie_path()
        configured = self.is_configured(config)
        return {
            'gzctf_enabled': configured,
            'gzctf_cookie_file': str(cookie_path),
            'gzctf_has_cookie': cookie_path.is_file(),
            'gzctf_game_url': str(config.gzctf_game_url or '').strip(),
        }

    def clear_cookie(self, user_id: str) -> None:
        """Remove a persisted cookie jar for a user when the config is cleared."""
        cookie_path = self.get_cookie_path()
        if cookie_path.is_file():
            cookie_path.unlink()

    def get_cookie_path(self) -> Path:
        """Return the shared persisted cookie-jar location for the instance."""
        cookie_dir = self._root / 'shared'
        cookie_dir.mkdir(parents=True, exist_ok=True)
        return cookie_dir / 'cookies.txt'

    def refresh_login(self, user_id: str, config: RuntimeConfig) -> Dict[str, Any]:
        """Log in and persist a fresh cookie jar for later submissions."""
        self.validate_config(config)
        if not self.is_configured(config):
            self.clear_cookie(user_id)
            return {
                **self.get_status(user_id, config),
                'gzctf_login_ok': False,
                'gzctf_status_message': '未配置 GZCTF 自动提交通道',
            }

        base_url, game_id = self.parse_game_url(config.gzctf_game_url)
        session = requests.Session()
        session.headers.update({
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'ElfCTF/0.1.0',
        })
        public_key = self.fetch_public_key(session, base_url)
        payload = {
            'userName': config.gzctf_username,
            'password': self.encrypt_api_data(config.gzctf_password, public_key),
        }
        response = session.post(
            f'{base_url}/api/account/login',
            json=payload,
            timeout=20,
        )
        self._raise_for_status(response, 'GZCTF 登录失败')
        self.verify_profile(session, base_url)
        game_details = self.fetch_game_details(session, base_url, game_id)
        self.save_cookies(session.cookies)
        team_info = self.extract_team_info(game_details)
        return {
            **self.get_status(user_id, config),
            'gzctf_login_ok': True,
            'gzctf_status_message': f'已登录并保存 Cookie（gameId={game_id}）',
            'gzctf_team': team_info,
        }

    def submit_flag_for_task(
        self,
        *,
        user_id: str,
        config: RuntimeConfig,
        task_name: str,
        task_target: str,
        gzctf_challenge_id: str,
        flag: str,
    ) -> Dict[str, Any]:
        """Submit one solved flag for the current task and poll the verdict."""
        self.validate_config(config)
        if not self.is_configured(config):
            return {'attempted': False, 'reason': 'gzctf_not_configured'}

        base_url, game_id = self.parse_game_url(config.gzctf_game_url)
        session = self.ensure_authenticated_session(user_id, config)
        game_details = self.fetch_game_details(session, base_url, game_id)
        challenge = self.resolve_challenge(
            game_details,
            task_name=task_name,
            task_target=task_target,
            gzctf_challenge_id=gzctf_challenge_id,
        )
        if challenge is None:
            return {
                'attempted': False,
                'reason': 'challenge_not_found',
                'game_id': game_id,
                'task_name': task_name,
                'requested_challenge_id': str(gzctf_challenge_id or '').strip(),
            }

        challenge_id = int(challenge['id'])
        challenge_name = str(challenge.get('title') or challenge.get('name') or task_name).strip()
        public_key = self.fetch_public_key(session, base_url)
        payload = {'flag': self.encrypt_api_data(flag, public_key)}
        response = self.submit_flag(session, base_url, game_id, challenge_id, payload)
        submit_id = self.parse_submit_id(response)
        verdict = self.poll_submission_status(session, base_url, game_id, challenge_id, submit_id) if submit_id is not None else None

        return {
            'attempted': True,
            'accepted': verdict == 'accepted' if verdict is not None else None,
            'verdict': verdict or 'unknown',
            'game_id': game_id,
            'challenge_id': challenge_id,
            'challenge_name': challenge_name,
            'submit_id': submit_id,
        }

    def ensure_authenticated_session(self, user_id: str, config: RuntimeConfig) -> requests.Session:
        """Load a valid cookie jar or fall back to a fresh login."""
        session = requests.Session()
        session.headers.update({
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'ElfCTF/0.1.0',
        })
        cookie_path = self.get_cookie_path()
        if cookie_path.is_file():
            jar = MozillaCookieJar(str(cookie_path))
            jar.load(ignore_discard=True, ignore_expires=True)
            session.cookies.update(jar)
            base_url, _ = self.parse_game_url(config.gzctf_game_url)
            try:
                self.verify_profile(session, base_url)
                return session
            except requests.RequestException:
                pass
        self.refresh_login(user_id, config)
        jar = MozillaCookieJar(str(cookie_path))
        jar.load(ignore_discard=True, ignore_expires=True)
        session.cookies.update(jar)
        return session

    def parse_game_url(self, game_url: str) -> Tuple[str, int]:
        """Infer the deployment base URL and game id from a game/challenge URL."""
        parsed = urlparse(str(game_url).strip())
        if not parsed.scheme or not parsed.netloc:
            raise ValueError('GZCTF 比赛链接无效')
        match = re.search(r'/games/(\d+)', parsed.path)
        if not match:
            raise ValueError('GZCTF 比赛链接中缺少 gameId')
        base_url = f'{parsed.scheme}://{parsed.netloc}'
        return base_url.rstrip('/'), int(match.group(1))

    def fetch_public_key(self, session: requests.Session, base_url: str) -> Optional[str]:
        """Read `/api/config` and extract an optional API encryption public key."""
        response = session.get(f'{base_url}/api/config', timeout=20)
        self._raise_for_status(response, '读取 GZCTF 配置失败')
        return self.find_public_key(response.json())

    def verify_profile(self, session: requests.Session, base_url: str) -> Dict[str, Any]:
        """Confirm the current cookie jar belongs to a logged-in user."""
        response = session.get(f'{base_url}/api/account/profile', timeout=20)
        self._raise_for_status(response, 'GZCTF 账号校验失败')
        return response.json() if response.content else {}

    def fetch_game_details(self, session: requests.Session, base_url: str, game_id: int) -> Dict[str, Any]:
        """Fetch active game participation details, including challenge metadata."""
        response = session.get(f'{base_url}/api/game/{game_id}/details', timeout=20)
        self._raise_for_status(response, '读取 GZCTF 比赛详情失败')
        return response.json()

    def resolve_challenge(
        self,
        game_details: Dict[str, Any],
        *,
        task_name: str,
        task_target: str,
        gzctf_challenge_id: str = '',
    ) -> Optional[Dict[str, Any]]:
        """Infer the target challenge from an explicit id, target URL, or challenge title."""
        explicit_challenge_id = self._parse_int(gzctf_challenge_id)
        target_match = re.search(r'/challenges/(\d+)', str(task_target or ''))
        challenge_list = self.list_challenge_candidates(game_details)
        if explicit_challenge_id is not None:
            for item in challenge_list:
                if self._match_challenge_id(item, explicit_challenge_id):
                    return item
        if target_match:
            challenge_id = int(target_match.group(1))
            for item in challenge_list:
                if self._match_challenge_id(item, challenge_id):
                    return item

        candidate_labels = {
            self._normalize_label(task_name),
            self._normalize_label(self._extract_fragment_label(task_target)),
        }
        candidate_labels = {label for label in candidate_labels if label}
        if not candidate_labels:
            return None

        exact_match = None
        fuzzy_match = None
        for item in challenge_list:
            if not isinstance(item, dict):
                continue
            for candidate_name in self._challenge_labels(item):
                normalized_candidate = self._normalize_label(candidate_name)
                if not normalized_candidate:
                    continue
                if normalized_candidate in candidate_labels:
                    exact_match = item
                    break
                if any(
                    label in normalized_candidate or normalized_candidate in label
                    for label in candidate_labels
                ):
                    fuzzy_match = fuzzy_match or item
            if exact_match is not None:
                break
        return exact_match or fuzzy_match

    def list_challenge_candidates(self, game_details: Dict[str, Any]) -> list[Dict[str, Any]]:
        """Flatten possible challenge collections from game details into dict items."""
        challenge_list: list[Dict[str, Any]] = []
        self._collect_challenge_candidates(game_details.get('challenges'), challenge_list)
        return challenge_list

    def submit_flag(
        self,
        session: requests.Session,
        base_url: str,
        game_id: int,
        challenge_id: int,
        payload: Dict[str, str],
    ) -> requests.Response:
        """Submit one candidate flag, with a compatibility fallback for `/submit`."""
        primary = f'{base_url}/api/game/{game_id}/challenges/{challenge_id}'
        response = session.post(primary, json=payload, timeout=20)
        if response.status_code in {404, 405}:
            fallback = f'{primary}/submit'
            response = session.post(fallback, json=payload, timeout=20)
        self._raise_for_status(response, 'GZCTF Flag 提交失败')
        return response

    def parse_submit_id(self, response: requests.Response) -> Optional[int]:
        """Extract the submission id from a successful submit response body."""
        text = response.text.strip()
        if not text:
            return None
        if text.isdigit():
            return int(text)
        try:
            payload = response.json()
        except ValueError:
            return None
        if isinstance(payload, int):
            return payload
        if isinstance(payload, dict):
            for key in ('id', 'submitId', 'submissionId'):
                value = payload.get(key)
                if isinstance(value, int):
                    return value
                if isinstance(value, str) and value.isdigit():
                    return int(value)
        return None

    def poll_submission_status(
        self,
        session: requests.Session,
        base_url: str,
        game_id: int,
        challenge_id: int,
        submit_id: int,
        *,
        max_polls: int = 8,
        delay_seconds: float = 1.0,
    ) -> Optional[str]:
        """Poll the verdict endpoint until the submission is accepted/rejected."""
        verdict = None
        for _ in range(max_polls):
            response = session.get(
                f'{base_url}/api/game/{game_id}/challenges/{challenge_id}/status/{submit_id}',
                timeout=20,
            )
            self._raise_for_status(response, '读取 GZCTF 判题状态失败')
            payload = response.json() if response.content else {}
            verdict = self.classify_verdict(payload)
            if verdict in {'accepted', 'rejected'}:
                return verdict
            time.sleep(delay_seconds)
        return verdict

    def save_cookies(self, cookies: Iterable[Any]) -> Path:
        """Persist a `requests` cookie jar to a Mozilla cookie file."""
        cookie_path = self.get_cookie_path()
        jar = MozillaCookieJar(str(cookie_path))
        for cookie in cookies:
            jar.set_cookie(cookie)
        jar.save(ignore_discard=True, ignore_expires=True)
        return cookie_path

    def fetch_team_info(self, user_id: str, config: RuntimeConfig) -> Dict[str, Any]:
        """Ensure login and return the current team's participation snapshot."""
        self.validate_config(config)
        if not self.is_configured(config):
            return {
                **self.get_status(user_id, config),
                'gzctf_login_ok': False,
                'gzctf_status_message': '未配置 GZCTF 自动提交通道',
                'gzctf_team': None,
            }

        base_url, game_id = self.parse_game_url(config.gzctf_game_url)
        session = self.ensure_authenticated_session(user_id, config)
        details = self.fetch_game_details(session, base_url, game_id)
        team_info = self.extract_team_info(details)
        status_message = '已获取当前队伍信息' if team_info else '当前账号未获取到队伍信息'
        return {
            **self.get_status(user_id, config),
            'gzctf_login_ok': True,
            'gzctf_status_message': f'{status_message}（gameId={game_id}）',
            'gzctf_team': team_info,
        }

    def extract_team_info(self, game_details: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract a frontend-safe current team summary from game details."""
        rank = game_details.get('rank')
        if not isinstance(rank, dict):
            return None
        team_id = self._parse_int(rank.get('id'))
        return {
            'id': team_id,
            'name': str(rank.get('name') or '').strip(),
            'score': rank.get('score'),
            'rank': rank.get('rank'),
            'solvedCount': rank.get('solvedCount'),
        }

    def find_public_key(self, obj: Any) -> Optional[str]:
        """Find a likely API encryption public key inside `/api/config` JSON."""
        if isinstance(obj, dict):
            for key in ('publicKey', 'apiPublicKey', 'apiEncryptionPublicKey'):
                value = obj.get(key)
                if isinstance(value, str) and value:
                    return value
            for key, value in obj.items():
                if isinstance(key, str) and 'public' in key.lower() and 'key' in key.lower():
                    if isinstance(value, str) and value:
                        return value
                found = self.find_public_key(value)
                if found:
                    return found
        elif isinstance(obj, list):
            for item in obj:
                found = self.find_public_key(item)
                if found:
                    return found
        return None

    def encrypt_api_data(self, plain_text: str, public_key_b64: Optional[str]) -> str:
        """Encrypt one API field using the frontend-compatible GZCTF scheme."""
        if not public_key_b64:
            return plain_text
        if not plain_text:
            raise ValueError('Refusing to encrypt empty API data')
        if not all((hashes, serialization, x25519, AESGCM)):
            raise RuntimeError('当前环境缺少 cryptography，无法处理启用了 API 加密的 GZCTF 实例')

        server_public_bytes = base64.b64decode(public_key_b64)
        if len(server_public_bytes) != 32:
            raise ValueError('Invalid X25519 public key length')
        server_public_key = x25519.X25519PublicKey.from_public_bytes(server_public_bytes)

        ephemeral_private_key = x25519.X25519PrivateKey.generate()
        ephemeral_public_key = ephemeral_private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        shared_secret = ephemeral_private_key.exchange(server_public_key)

        digest = hashes.Hash(hashes.SHA256())
        digest.update(shared_secret)
        aes_key = digest.finalize()

        nonce = os.urandom(12)
        ciphertext = AESGCM(aes_key).encrypt(nonce, plain_text.encode('utf-8'), None)
        packed = ephemeral_public_key + nonce + ciphertext
        return base64.b64encode(packed).decode('ascii')

    def classify_verdict(self, payload: Any) -> Optional[str]:
        """Normalize diverse verdict payloads into accepted/rejected/pending buckets."""
        flattened = ' '.join(part.lower() for part in self._walk_strings(payload))
        if any(token in flattened for token in ('accepted', 'correct', 'success', 'passed', '通过', '正确')):
            return 'accepted'
        if any(token in flattened for token in ('wrong', 'rejected', 'incorrect', 'denied', '失败', '错误', '不正确')):
            return 'rejected'
        if any(token in flattened for token in ('pending', 'checking', 'queued', 'processing', '判题', '等待')):
            return 'pending'
        return None

    def _raise_for_status(self, response: requests.Response, prefix: str) -> None:
        """Raise a readable exception that preserves server-side error context."""
        if response.ok:
            return
        detail = response.text.strip()
        if detail:
            try:
                parsed = response.json()
                if isinstance(parsed, dict):
                    detail = str(parsed.get('title') or parsed.get('message') or parsed)
            except ValueError:
                pass
        raise requests.HTTPError(f'{prefix}: HTTP {response.status_code} {detail}'.strip(), response=response)

    def _normalize_label(self, value: str) -> str:
        """Normalize challenge labels for loose matching."""
        return re.sub(r'[\W_]+', '', str(value or '').strip().lower())

    def _parse_int(self, value: Any) -> Optional[int]:
        """Convert a loose id-like value into an integer when possible."""
        text = str(value or '').strip()
        if not text or not text.isdigit():
            return None
        return int(text)

    def _match_challenge_id(self, item: Dict[str, Any], expected_id: int) -> bool:
        """Return whether a challenge-like object exposes the expected id under known keys."""
        for key in ('id', 'gameChallengeId', 'challengeId'):
            value = self._parse_int(item.get(key))
            if value == expected_id:
                return True
        return False

    def _challenge_labels(self, item: Dict[str, Any]) -> list[str]:
        """Collect human-facing labels from a challenge-like object."""
        labels: list[str] = []
        for key in ('title', 'name', 'slug', 'tag'):
            value = str(item.get(key) or '').strip()
            if value and value not in labels:
                labels.append(value)
        return labels

    def _extract_fragment_label(self, task_target: str) -> str:
        """Extract a readable label from a `#123-name` style challenge fragment."""
        fragment = urlparse(str(task_target or '')).fragment
        if not fragment:
            return ''
        if '-' in fragment:
            return fragment.split('-', 1)[1]
        return fragment

    def _collect_challenge_candidates(self, value: Any, dest: list[Dict[str, Any]]) -> None:
        """Recursively flatten nested challenge payloads into challenge-like dicts."""
        if isinstance(value, list):
            for item in value:
                self._collect_challenge_candidates(item, dest)
            return
        if not isinstance(value, dict):
            return

        if any(key in value for key in ('id', 'gameChallengeId', 'challengeId')) and any(
            key in value for key in ('title', 'name', 'slug', 'tag')
        ):
            dest.append(value)
            return

        for item in value.values():
            self._collect_challenge_candidates(item, dest)

    def _safe_segment(self, value: str) -> str:
        """Normalize one filesystem path segment."""
        normalized = re.sub(r'[^a-zA-Z0-9._-]+', '_', str(value or '').strip())
        return normalized.strip('._-') or 'anonymous'

    def _walk_strings(self, value: Any) -> Iterable[str]:
        """Yield every nested string-like value from a JSON payload."""
        if isinstance(value, dict):
            for key, item in value.items():
                yield str(key)
                yield from self._walk_strings(item)
        elif isinstance(value, list):
            for item in value:
                yield from self._walk_strings(item)
        elif value is not None:
            yield str(value)
