"""SQLite-backed authentication service for local ElfCTF users."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


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


class AuthService:
    """Manage local users and bearer sessions in SQLite."""

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
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM users WHERE username = ?', (username.strip(),)).fetchone()
            if row is None:
                raise AuthError('用户名或密码错误')
            expected = self._hash_password(password, row['salt'])
            if not secrets.compare_digest(expected, row['password_hash']):
                raise AuthError('用户名或密码错误')
            token = secrets.token_urlsafe(32)
            expires_at = time.time() + self.session_ttl_seconds
            conn.execute(
                'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
                (token, row['id'], expires_at, time.time()),
            )
        return AuthSession(token=token, user=self._row_to_user(row), expires_at=expires_at)

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
        with self._connect() as conn:
            row = conn.execute(
                'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id '
                'WHERE s.token = ? AND s.expires_at > ?',
                (token, now),
            ).fetchone()
            conn.execute('DELETE FROM sessions WHERE expires_at <= ?', (now,))
        return self._row_to_user(row) if row else None
