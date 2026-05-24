---
name: gzctf-game-flow
description: Use when interacting with a GZCTF instance via API: registering accounts, logging in, handling API encryption, joining games, fetching challenges, submitting flags, and polling submission results.
metadata:
  short-description: Operate GZCTF games through API
---

# GZCTF Game Flow

Use this skill when working with a GZCTF instance through HTTP APIs.

Typical tasks:
- Register a user
- Log in
- Handle API-encrypted request fields
- Join a game with a team
- Fetch game/challenge data
- Submit a flag
- Poll submission status

This skill assumes the target is a legitimate CTF platform interaction. Do not leak, print, persist, or summarize real passwords, encrypted passwords, session cookies, `GZCTF_Token` values, or team tokens.

## Core Rules

1. Use JSON request bodies.
2. Use `userName`, not `username`.
3. Preserve session state with a cookie jar, usually `cookies.txt`.
4. Treat plaintext passwords, encrypted passwords, flags, encrypted flags, cookies, and team tokens as sensitive data.
5. `GZCTF_Token` is normally stored as an HTTP-only cookie. Send it by using the cookie jar, not by manually copying it into prompts or logs.
6. Do not add extra JSON fields unless the API schema explicitly allows them.
7. If a browser URL looks like `/games/33/challenges`, infer `gameId = 33`.
8. If an endpoint returns `404` or `405`, verify the exact deployed API path through browser DevTools -> Network. GZCTF deployments and generated OpenAPI files may differ.

## Initialize

This skill should activate when the user has or provides:
- A username and password
- A URL for the target GZCTF game

From the game URL, infer `BASE` and `GAME_ID` whenever possible.

Examples:
- `https://gz.imxbt.cn/games/33/challenges#`
  - `BASE=https://gz.imxbt.cn`
  - `GAME_ID=33`

After initialization:
1. Check `/api/config` for API encryption.
2. Log in with encrypted credentials if required.
3. Save the session cookie with a cookie jar.
4. Verify login with `/api/account/profile`.
5. Fetch game participation data with `/api/game/{GAME_ID}/details`.


## API Encryption

Some GZCTF deployments enable API encryption. When enabled, API-data fields such as `password` and `flag` may need to be encrypted client-side before sending.

Before registration, login, or flag submission:

1. Request:

   ```http
   GET /api/config
   ```

2. Look for a public key field. Known or likely names include:

   ```text
   publicKey
   apiPublicKey
   apiEncryptionPublicKey
   ```

   If needed, also search shallow or nested JSON keys containing both `public` and `key`.

3. If a public key exists, encrypt fields that the frontend encrypts before sending.
4. If no public key exists, send the original field value.
5. If a non-empty field is sent and the server replies with a message like:

   ```json
   {"title":"密码是必需的","status":400}
   ```

   or:

   ```json
   {"title":"flag 是必需的","status":400}
   ```

   treat this as a likely API-encryption failure or malformed encrypted field, not as proof that the original variable was empty.

### Encryption Algorithm

The frontend-style GZCTF API encryption is:

```text
X25519 ECDH
shared_secret = ephemeral_private_key.exchange(server_public_key)
aes_key = SHA256(shared_secret)
nonce = 12 random bytes
ciphertext = AES-GCM(aes_key, nonce).encrypt(plaintext)
output = base64(ephemeral_public_key_raw_32_bytes || nonce_12_bytes || ciphertext_with_gcm_tag)
```

The encrypted output string replaces the original JSON field value.

### Python Encryption Helper

Use this helper to produce encrypted API field values:

```python
import base64
import os
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def gzctf_find_public_key(obj: Any) -> str | None:
    """Find a GZCTF API public key in /api/config-like JSON."""
    if isinstance(obj, dict):
        for key in ("publicKey", "apiPublicKey", "apiEncryptionPublicKey"):
            value = obj.get(key)
            if isinstance(value, str) and value:
                return value

        for key, value in obj.items():
            if isinstance(key, str) and "public" in key.lower() and "key" in key.lower():
                if isinstance(value, str) and value:
                    return value

            found = gzctf_find_public_key(value)
            if found:
                return found

    elif isinstance(obj, list):
        for item in obj:
            found = gzctf_find_public_key(item)
            if found:
                return found

    return None


def gzctf_encrypt_api_data(plain_text: str, public_key_b64: str | None) -> str:
    """
    Encrypt a GZCTF API field.

    If public_key_b64 is missing, return plaintext.
    If public_key_b64 exists, output:
        base64(ephemeral_public_key || nonce || ciphertext_with_gcm_tag)
    """
    if not public_key_b64:
        return plain_text

    if not plain_text:
        raise ValueError("Refusing to encrypt empty API data")

    server_public_bytes = base64.b64decode(public_key_b64)
    if len(server_public_bytes) != 32:
        raise ValueError("Invalid X25519 public key length")

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
    ciphertext = AESGCM(aes_key).encrypt(nonce, plain_text.encode("utf-8"), None)

    packed = ephemeral_public_key + nonce + ciphertext
    return base64.b64encode(packed).decode("ascii")
```

## Register

Endpoint:

```http
POST /api/account/register
```

Request body before API encryption:

```json
{"userName":"...","password":"...","email":"..."}
```

Rules:
- Required fields: `userName`, `password`, `email`.
- `challenge` may be required when captcha is enabled.
- If API encryption is enabled, encrypt `password` before sending.
- Save cookies if the registration flow logs the user in immediately.

Example after preparing the final password value:

```bash
curl -i -c cookies.txt \
  --json '{"userName":"USER","password":"FINAL_PASSWORD_VALUE","email":"USER@example.com"}' \
  "$BASE/api/account/register"
```

## Login

Endpoint:

```http
POST /api/account/login
```

Request body before API encryption:

```json
{"userName":"...","password":"..."}
```

Rules:
- Required fields: `userName`, `password`.
- If API encryption is enabled, send the encrypted password.
- Use `-c cookies.txt` to save `GZCTF_Token`.
- A successful login may return `200` with an empty body. This is valid if `Set-Cookie: GZCTF_Token=...` is present.

Example after preparing the final password value:

```bash
curl -i -c cookies.txt \
  --json '{"userName":"USER","password":"FINAL_PASSWORD_VALUE"}' \
  "$BASE/api/account/login"
```

Verify login:

```bash
curl -b cookies.txt "$BASE/api/account/profile"
```

## Get current team in a game

Endpoint:

`GET /api/game/{id}/details`

Requires:
- authenticated user cookie
- active team participation in this game
- cookie (obtain this in login progress)

The current team information is in the `rank` field:

```json
{
  "rank": {
    "id": 3768,
    "name": "lunamoon",
    "score": 0,
    "rank": 600,
    "solvedChallenges": [],
    "solvedCount": 0
  }
}
```

Example:

```bash
curl -sS -b cookies.txt "$BASE/api/game/$GAME_ID/details" | jq '.rank'
```

## Join a Game

Endpoint:

```http
POST /api/game/{id}
```

Request body:

```json
{"teamId":123,"divisionId":1,"inviteCode":"optional"}
```

Rules:
- `teamId` is required and should be a number.
- `divisionId` is optional unless the game requires division selection.
- `inviteCode` is optional unless the game requires an invitation code.
- Use the saved cookie jar with `-b cookies.txt`.

Example:

```bash
curl -i -b cookies.txt \
  --json '{"teamId":123,"divisionId":1,"inviteCode":"optional"}' \
  "$BASE/api/game/$GAME_ID"
```

If no `divisionId` or `inviteCode` is needed:

```bash
curl -i -b cookies.txt \
  --json '{"teamId":123}' \
  "$BASE/api/game/$GAME_ID"
```

If the server replies:

```json
{"title":"您已经在其他队伍报名参赛","status":400}
```

then the login cookie is valid and the user is already registered for this game with another team or participation record. Do not keep retrying join. Fetch game details instead.

## Fetch Current Team/Game Participation

Use this endpoint after login and joining:

```http
GET /api/game/{id}/details
```

Example:

```bash
curl -sS -b cookies.txt "$BASE/api/game/$GAME_ID/details" | jq
```

This is the safest way to enumerate challenges and discover current team participation.

Useful fields may include:
- `challenges`
- `rank.id`
- `rank.name`
- `rank.score`
- `rank.rank`
- `rank.solvedChallenges`
- `teamToken`
- `writeupRequired`
- `writeupDeadline`

Treat `teamToken` as sensitive.

To inspect team-related fields:

```bash
curl -sS -b cookies.txt "$BASE/api/game/$GAME_ID/details" > game_details.json

jq '.. | objects | select(
  has("team") or
  has("teamId") or
  has("teamName") or
  has("teamToken") or
  has("rank")
)' game_details.json
```

## Fetch Game and Challenge Data

Game overview:

```http
GET /api/game/{id}
```

Full game details for an active participating team:

```http
GET /api/game/{id}/details
```

Single challenge detail:

```http
GET /api/game/{id}/challenges/{challengeId}
```

Recommended challenge enumeration flow after login and joining:

```bash
curl -b cookies.txt "$BASE/api/game/$GAME_ID/details" | jq '.challenges'
```

For a URL like:

```text
https://gz.imxbt.cn/games/33/challenges#
```

set:

```bash
GAME_ID=33
```

## Submit Flag

Observed/current route:

```http
POST /api/game/{id}/challenges/{challengeId}
```

Request body before API encryption:

```json
{"flag":"flag{...}"}
```

Rules:
- Requires authenticated user.
- Requires active team participation.
- The body accepts only one field: `flag`.
- Do not include challenge name, team ID, user ID, or extra metadata.
- If API encryption is enabled, encrypt the `flag` value before sending:

  ```json
  {"flag":"ENCRYPTED_FLAG_VALUE"}
  ```

- Treat the `200` response body as the integer submission ID.

Compatibility note:

Some generated or local OpenAPI references may list:

```http
POST /api/game/{id}/challenges/{challengeId}/submit
```

However, on observed deployments, `/submit` may return `405 Method Not Allowed`. If `/submit` returns `405`, use the endpoint without `/submit`:

```http
POST /api/game/{id}/challenges/{challengeId}
```

If both endpoints fail, inspect browser DevTools -> Network while submitting a flag manually.

### Correct curl Shape

Plain structure:

```bash
curl -i -b cookies.txt \
  --json '{"flag":"FINAL_FLAG_VALUE"}' \
  "$BASE/api/game/$GAME_ID/challenges/$CHALLENGE_ID"
```

If API encryption is enabled, `FINAL_FLAG_VALUE` must be the encrypted flag, not the plaintext flag.

Do not escape braces in the flag. Use:

```json
{"flag":"flag{example}"}
```

not:

```json
{"flag":"flag\{example\}"}
```

### One-shot Encrypted Flag Submitter

This creates the encrypted request body and submits it.

```bash
BASE="https://gz.imxbt.cn"
GAME_ID=33
CHALLENGE_ID=1245
FLAG='flag{CHANGE_ME}'

python3 - "$BASE" "$FLAG" <<'PY' > submit-body.json
import base64
import json
import os
import sys
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

base = sys.argv[1].rstrip("/")
flag = sys.argv[2]

def find_public_key(obj):
    if isinstance(obj, dict):
        for k in ("publicKey", "apiPublicKey", "apiEncryptionPublicKey"):
            v = obj.get(k)
            if isinstance(v, str) and v:
                return v
        for k, v in obj.items():
            if isinstance(k, str) and "public" in k.lower() and "key" in k.lower():
                if isinstance(v, str) and v:
                    return v
            found = find_public_key(v)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = find_public_key(item)
            if found:
                return found
    return None

def encrypt_api_data(plain, public_key_b64):
    if not public_key_b64:
        return plain

    server_pub = base64.b64decode(public_key_b64)
    if len(server_pub) != 32:
        raise RuntimeError("invalid X25519 public key length")

    server_key = x25519.X25519PublicKey.from_public_bytes(server_pub)

    eph_priv = x25519.X25519PrivateKey.generate()
    eph_pub = eph_priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    shared = eph_priv.exchange(server_key)

    digest = hashes.Hash(hashes.SHA256())
    digest.update(shared)
    aes_key = digest.finalize()

    nonce = os.urandom(12)
    cipher = AESGCM(aes_key).encrypt(nonce, plain.encode(), None)

    return base64.b64encode(eph_pub + nonce + cipher).decode()

with urllib.request.urlopen(base + "/api/config") as r:
    config = json.loads(r.read().decode())

public_key = find_public_key(config)
encrypted_flag = encrypt_api_data(flag, public_key)

print(json.dumps({"flag": encrypted_flag}, ensure_ascii=False))
PY

curl -i -b ./cookies.txt \
  -H 'Content-Type: application/json' \
  --data @submit-body.json \
  "$BASE/api/game/$GAME_ID/challenges/$CHALLENGE_ID"
```

## Poll Submission Status

Endpoint:

```http
GET /api/game/{id}/challenges/{challengeId}/status/{submitId}
```

Example:

```bash
curl -b cookies.txt \
  "$BASE/api/game/$GAME_ID/challenges/$CHALLENGE_ID/status/$SUBMIT_ID"
```

Rules:
- If the result is accepted, stop.
- If the result is rejected, revise the candidate flag and resubmit.
- If the result is pending or checking, poll with a short delay.
- Do not hammer the endpoint.

## Minimal End-to-End Pattern

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="https://gz.imxbt.cn"
# change game id if needed
GAME_ID=33
CHALLENGE_ID="CHANGE_ME"
COOKIE_FILE="./cookies.txt"

# Login should already have been performed.
# If API encryption is enabled, the password must have been encrypted before login.

curl -fsS -b "$COOKIE_FILE" "$BASE/api/account/profile" >/dev/null

curl -fsS -b "$COOKIE_FILE" "$BASE/api/game/$GAME_ID/details" | jq

# For encrypted deployments, do not submit plaintext flags.
# Generate an encrypted {"flag":"..."} body first, then submit it.

curl -i -b "$COOKIE_FILE" \
  -H 'Content-Type: application/json' \
  --data @submit-body.json \
  "$BASE/api/game/$GAME_ID/challenges/$CHALLENGE_ID"
```

## Common HTTP Results

- `200`: success.
- `400`: malformed body, missing field, captcha requirement, invalid encrypted field, duplicate registration, or validation failure.
- `401`: not authenticated; login failed or cookie jar was not sent.
- `403`: authenticated but unauthorized; not joined, not approved, wrong team state, or insufficient role.
- `404`: wrong game/challenge ID, hidden resource, or endpoint mismatch.
- `405`: route exists but method is wrong; for flag submit, try the endpoint without `/submit`.
- `415`: missing or wrong `Content-Type`; use `--json` or `-H 'Content-Type: application/json'`.
- `429`: rate limited; slow down.

## Diagnostics

When login fails:

1. Confirm `Content-Type: application/json`.
2. Confirm body uses `userName` and `password`.
3. Confirm password is non-empty before encryption.
4. Request `/api/config`.
5. If a public key exists, encrypt password.
6. If response is `{"title":"密码是必需的","status":400}` after sending a non-empty password, assume encryption failed.
7. Compare with browser DevTools:
   - Open browser.
   - Log in normally.
   - DevTools -> Network.
   - Locate `/api/account/login`.
   - Compare payload shape, cookies, and endpoint.

When join fails:

1. Confirm login with `/api/account/profile`.
2. Confirm `-b cookies.txt` is present.
3. Confirm `teamId` is numeric.
4. If already registered in another team, fetch `/api/game/{id}/details`.

When flag submission fails:

1. Confirm current login with `/api/account/profile`.
2. Confirm game ID.
3. Confirm active participation with `/api/game/{id}/details`.
4. Confirm challenge ID exists in the details response.
5. Use the observed submit endpoint:
   `/api/game/{id}/challenges/{challengeId}`
6. If plaintext flag returns `{"title":"flag 是必需的","status":400}`, encrypt the `flag` value and resubmit.
7. If `/submit` returns `405`, do not use `/submit`.
8. Do not guess many endpoints aggressively against a live platform; verify through docs or browser Network capture.

## Reference

See `references/api-1.md` for endpoint notes and observed deployment differences.
