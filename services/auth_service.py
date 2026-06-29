"""SQLite-backed authentication service for local ElfCTF users."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional


class AuthError(ValueError):
    """Raised when registration or login cannot be completed."""


@dataclass
class AuthUser:
    """Authenticated user record."""

    id: str
    username: str
    created_at: float


@dataclass
class AuthSession:
    """Session token and attached user metadata."""

    token: str
    user: AuthUser
    expires_at: float
    created_at: float
    token_type: str = 'session'
    scopes: tuple[str, ...] = ()
    label: str = ''


@dataclass
class AuthTokenRecord:
    """Resolved bearer token metadata used by platform clients.

    Attributes:
        token: The opaque bearer token string stored in SQLite.
        user: Authenticated user bound to the token.
        expires_at: Unix timestamp at which the token becomes invalid.
        created_at: Unix timestamp describing when the token was issued.
        token_type: Stable token family name such as `session` or `plugin`.
        scopes: Platform scopes attached to the token.
        label: Optional human-readable label shown to plugin users.
    """

    token: str
    user: AuthUser
    expires_at: float
    created_at: float
    token_type: str = 'session'
    scopes: tuple[str, ...] = ()
    label: str = ''


class AuthService:
    """Manage local users and bearer sessions in SQLite."""

    DEFAULT_PLUGIN_SCOPES: tuple[str, ...] = (
        'profile:read',
        'config:read',
        'config:write',
        'codegen:use',
    )

    def __init__(self, database_path: Path | str, *, session_ttl_seconds: int = 86400 * 14) -> None:
        """Initialize the authentication database.

        Args:
            database_path: SQLite file path.
            session_ttl_seconds: Lifetime for newly issued session tokens.
        """
        self.database_path = str(database_path)
        self.session_ttl_seconds = session_ttl_seconds
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        """Open a SQLite connection with row dictionaries enabled."""
        conn = sqlite3.connect(self.database_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        """Create required auth tables if they do not exist."""
        with self._connect() as conn:
            conn.execute(
                'CREATE TABLE IF NOT EXISTS users ('
                'id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, '
                'password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at REAL NOT NULL)'
            )
            conn.execute(
                'CREATE TABLE IF NOT EXISTS sessions ('
                'token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at REAL NOT NULL, '
                'created_at REAL NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))'
            )
            columns = {row['name'] for row in conn.execute('PRAGMA table_info(sessions)').fetchall()}
            if 'token_type' not in columns:
                conn.execute("ALTER TABLE sessions ADD COLUMN token_type TEXT NOT NULL DEFAULT 'session'")
            if 'scopes' not in columns:
                conn.execute("ALTER TABLE sessions ADD COLUMN scopes TEXT NOT NULL DEFAULT ''")
            if 'label' not in columns:
                conn.execute("ALTER TABLE sessions ADD COLUMN label TEXT NOT NULL DEFAULT ''")

    def _hash_password(self, password: str, salt: str) -> str:
        """Hash a password using PBKDF2-HMAC-SHA256."""
        digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 120000)
        return digest.hex()

    def has_users(self) -> bool:
        """Return whether at least one user exists."""
        with self._connect() as conn:
            row = conn.execute('SELECT COUNT(*) AS count FROM users').fetchone()
        return bool(row and row['count'])

    def register(self, username: str, password: str) -> AuthUser:
        """Create a new local user.

        Args:
            username: Requested username.
            password: Plaintext password to hash.

        Returns:
            The created user.

        Raises:
            AuthError: If validation fails or username already exists.
        """
        username = username.strip()
        if not username:
            raise AuthError('用户名不能为空')
        if not password:
            raise AuthError('密码不能为空')
        user_id = secrets.token_hex(12)
        salt = secrets.token_hex(16)
        created_at = time.time()
        password_hash = self._hash_password(password, salt)
        try:
            with self._connect() as conn:
                conn.execute(
                    'INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)',
                    (user_id, username, password_hash, salt, created_at),
                )
        except sqlite3.IntegrityError as exc:
            raise AuthError('用户名已存在') from exc
        return AuthUser(id=user_id, username=username, created_at=created_at)

    def _row_to_user(self, row: sqlite3.Row) -> AuthUser:
        """Convert a SQLite row into an auth user."""
        return AuthUser(id=row['id'], username=row['username'], created_at=row['created_at'])

    def _normalize_scopes(self, scopes: Optional[Iterable[str]]) -> tuple[str, ...]:
        """Normalize scope values into a deduplicated stable tuple.

        Args:
            scopes: Raw scope sequence supplied by an API caller.

        Returns:
            A deduplicated ordered tuple of non-empty scope identifiers.
        """
        normalized: list[str] = []
        for raw_scope in scopes or ():
            scope = str(raw_scope).strip()
            if scope and scope not in normalized:
                normalized.append(scope)
        return tuple(normalized)

    def _row_to_token_record(self, row: sqlite3.Row) -> AuthTokenRecord:
        """Convert a joined session row into a resolved token record.

        Args:
            row: Joined `sessions`/`users` row containing both token and user fields.

        Returns:
            Structured token metadata for auth and plugin inspection flows.
        """
        scopes = self._normalize_scopes(str(row['scopes'] or '').split())
        user = AuthUser(
            id=row['user_id'],
            username=row['username'],
            created_at=float(row['user_created_at']),
        )
        return AuthTokenRecord(
            token=row['token'],
            user=user,
            expires_at=float(row['expires_at']),
            created_at=float(row['session_created_at']),
            token_type=str(row['token_type'] or 'session'),
            scopes=scopes,
            label=str(row['label'] or ''),
        )

    def login(self, username: str, password: str) -> AuthSession:
        """Validate credentials and create a session token.

        Args:
            username: Username to authenticate.
            password: Plaintext password.

        Returns:
            Newly issued auth session.

        Raises:
            AuthError: If credentials are invalid.
        """
        created_at = time.time()
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM users WHERE username = ?', (username.strip(),)).fetchone()
            if row is None:
                raise AuthError('用户名或密码错误')
            expected = self._hash_password(password, row['salt'])
            if not secrets.compare_digest(expected, row['password_hash']):
                raise AuthError('用户名或密码错误')
            token_record = self._create_token_record(
                conn,
                self._row_to_user(row),
                token_type='session',
                scopes=(),
                label='',
                created_at=created_at,
            )
        return AuthSession(
            token=token_record.token,
            user=token_record.user,
            expires_at=token_record.expires_at,
            created_at=token_record.created_at,
            token_type=token_record.token_type,
            scopes=token_record.scopes,
            label=token_record.label,
        )

    def _create_token_record(
        self,
        conn: sqlite3.Connection,
        user: AuthUser,
        *,
        token_type: str,
        scopes: Iterable[str],
        label: str,
        created_at: Optional[float] = None,
    ) -> AuthTokenRecord:
        """Insert one bearer token row and return the normalized record.

        Args:
            conn: Open SQLite connection used for the token insert.
            user: Authenticated user owning the token.
            token_type: Stable token family name.
            scopes: Scope values stored alongside the token.
            label: Optional user-facing token label.
            created_at: Optional issuance timestamp override.

        Returns:
            Structured token metadata describing the inserted token.
        """
        issued_at = float(created_at or time.time())
        normalized_scopes = self._normalize_scopes(scopes)
        token = secrets.token_urlsafe(32)
        expires_at = issued_at + self.session_ttl_seconds
        conn.execute(
            'INSERT INTO sessions (token, user_id, expires_at, created_at, token_type, scopes, label) '
            'VALUES (?, ?, ?, ?, ?, ?, ?)',
            (token, user.id, expires_at, issued_at, token_type, ' '.join(normalized_scopes), label.strip()),
        )
        return AuthTokenRecord(
            token=token,
            user=user,
            expires_at=expires_at,
            created_at=issued_at,
            token_type=token_type,
            scopes=normalized_scopes,
            label=label.strip(),
        )

    def issue_plugin_token(self, username: str, password: str, *, label: str = '', scopes: Optional[Iterable[str]] = None) -> AuthTokenRecord:
        """Validate credentials and issue a platform token intended for plugins.

        Args:
            username: Username to authenticate.
            password: Plaintext password.
            label: Optional label shown to users managing issued tokens.
            scopes: Optional requested scopes; defaults to the plugin scope set.

        Returns:
            Issued token metadata including user identity and expiry.

        Raises:
            AuthError: If credentials are invalid.
        """
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM users WHERE username = ?', (username.strip(),)).fetchone()
            if row is None:
                raise AuthError('用户名或密码错误')
            expected = self._hash_password(password, row['salt'])
            if not secrets.compare_digest(expected, row['password_hash']):
                raise AuthError('用户名或密码错误')
            return self._create_token_record(
                conn,
                self._row_to_user(row),
                token_type='plugin',
                scopes=scopes or self.DEFAULT_PLUGIN_SCOPES,
                label=label or 'VS Code codetalk',
            )

    def logout(self, token: str) -> None:
        """Invalidate a session token if it exists."""
        if not token:
            return
        with self._connect() as conn:
            conn.execute('DELETE FROM sessions WHERE token = ?', (token,))

    def get_user_by_token(self, token: str) -> Optional[AuthUser]:
        """Resolve a valid session token to a user.

        Args:
            token: Bearer or X-Auth-Token value.

        Returns:
            The authenticated user, or `None` when absent or expired.
        """
        if not token:
            return None
        now = time.time()
        record = self.get_token_record(token)
        return record.user if record else None

    def get_token_record(self, token: str) -> Optional[AuthTokenRecord]:
        """Resolve a valid bearer token to full token metadata.

        Args:
            token: Bearer or `X-Auth-Token` value supplied by a client.

        Returns:
            Token metadata when the token exists and has not expired, else `None`.
        """
        if not token:
            return None
        now = time.time()
        with self._connect() as conn:
            row = conn.execute(
                'SELECT s.token, s.expires_at, s.created_at AS session_created_at, '
                's.token_type, s.scopes, s.label, '
                'u.id AS user_id, u.username, u.created_at AS user_created_at '
                'FROM sessions s JOIN users u ON u.id = s.user_id '
                'WHERE s.token = ? AND s.expires_at > ?',
                (token, now),
            ).fetchone()
            conn.execute('DELETE FROM sessions WHERE expires_at <= ?', (now,))
        if row is None:
            return None
        return self._row_to_token_record(row)

    def revoke_token(self, token: str) -> bool:
        """Revoke one bearer token by value.

        Args:
            token: Bearer token string to invalidate.

        Returns:
            `True` when a token row was removed, otherwise `False`.
        """
        if not token:
            return False
        with self._connect() as conn:
            cursor = conn.execute('DELETE FROM sessions WHERE token = ?', (token,))
        return cursor.rowcount > 0
