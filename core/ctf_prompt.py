"""CTF-specific prompt helpers and context-compression profiles."""

from __future__ import annotations

from modules.llmfetcher.llm_context import ContextCompressionProfile
from modules.llmfetcher.prompt import CONTEXT_COMPACT_PROMPT_TEMPLATE

WEB_SCHEMA = """
For WEB tasks, state_updates should include:

{
  "base_url": string,
  "endpoints": [
    {
      "path": string,
      "method": string,
      "status": string,
      "purpose": string
    }
  ],
  "forms": [
    {
      "page": string,
      "action": string,
      "method": string,
      "inputs": [string],
      "notes": [string]
    }
  ],
  "parameters": [string],
  "cookies": [string],
  "headers": [string],
  "redirects": [string],
  "scripts": [string],
  "interesting_js": [string],
  "negative_findings": [string]
}

WEB-specific rules:
- Extract forms, input names, hidden fields, form action and method.
- Extract endpoints discovered from HTML, JavaScript, redirects, robots.txt, sitemap.xml, error pages, and HTTP headers.
- Extract cookies, Set-Cookie, Location, Authorization, CORS, Content-Type, and status codes.
- Extract JavaScript behavior relevant to auth, DOM form mutation, hidden parameters, network requests, crypto, encoding, storage, cookies, or redirects.
- Add do_not_repeat for duplicate GET requests unless refetching is needed for cookies, session state, cache validation, or time-varying behavior.
"""

RE_SCHEMA = """
For RE tasks, state_updates should include:

{
  "files": [
    {
      "path": string,
      "size": string,
      "sha256": string,
      "format": string,
      "purpose": string
    }
  ],
  "formats": [string],
  "entrypoints": [string],
  "functions": [string],
  "symbols": [string],
  "strings": [string],
  "constants": [string],
  "imports": [string],
  "algorithms": [string],
  "constraints": [string],
  "candidate_flags": [string],
  "negative_findings": [string]
}

RE-specific rules:
- Preserve file names, hashes, magic bytes, architecture, packer names, interpreter versions, offsets, addresses, function names, strings, constants, and decoded values.
- If a decompiler/disassembler/marshal/parser failed, record the exact command and error.
- Add do_not_repeat for failed tool paths, such as trying the same decompiler, same marshal offset, same unpacker, or same strings query.
- next_actions should be concrete, such as "run xdis on main.pyc", "inspect function check_flag", "extract constants from code object", "bruteforce 3-byte chunks against MD5 list".
"""

PWN_SCHEMA = """
For PWN tasks, state_updates should include:

{
  "binary_info": {
    "path": string,
    "arch": string,
    "bits": string,
    "endian": string,
    "libc": string
  },
  "protections": {
    "canary": string,
    "nx": string,
    "pie": string,
    "relro": string,
    "fortify": string
  },
  "io_protocol": [string],
  "vulnerabilities": [string],
  "offsets": [string],
  "symbols": [string],
  "gadgets": [string],
  "leaks": [string],
  "addresses": [string],
  "payloads_tested": [string],
  "crashes": [string],
  "negative_findings": [string]
}

PWN-specific rules:
- Preserve exact offsets, cyclic patterns, crash addresses, register values, gadget addresses, GOT/PLT symbols, libc leaks, base addresses, and payloads.
- Failed exploit attempts must be recorded with exact reason.
- Add do_not_repeat for payloads that already crashed in the same way.
- next_actions should be concrete, such as "find RIP offset with cyclic", "leak puts@got", "compute libc base", "build ROP chain with pop rdi; ret".
"""

CRYPTO_SCHEMA = """
For CRYPTO tasks, state_updates should include:

{
  "scheme": string,
  "parameters": {
    "n": string,
    "e": string,
    "c": string,
    "p": string,
    "q": string,
    "iv": string,
    "nonce": string,
    "modulus": string
  },
  "ciphertexts": [string],
  "known_plaintexts": [string],
  "oracles": [string],
  "equations": [string],
  "attacks_tested": [string],
  "candidate_attacks": [string],
  "partial_results": [string],
  "negative_findings": [string]
}

CRYPTO-specific rules:
- Preserve exact numeric parameters, encodings, ciphertexts, keys, nonces, IVs, moduli, exponents, equations, and error messages.
- Record failed attacks precisely: e.g. "small e attack failed because c >= n", "factorization timeout", "padding oracle not confirmed".
- next_actions should be concrete, such as "try Wiener's attack", "check common modulus", "factor n with yafu", "solve lattice with given equations".
"""

FORENSICS_SCHEMA = """
For FORENSICS tasks, state_updates should include:

{
  "files": [
    {
      "path": string,
      "size": string,
      "sha256": string,
      "format": string,
      "purpose": string
    }
  ],
  "metadata": [string],
  "embedded_files": [string],
  "extracted_artifacts": [string],
  "strings": [string],
  "timestamps": [string],
  "stego_findings": [string],
  "pcap_findings": [string],
  "disk_findings": [string],
  "negative_findings": [string]
}

FORENSICS-specific rules:
- Preserve exact filenames, hashes, magic bytes, metadata, timestamps, extracted paths, embedded file names, stream names, and passwords.
- Record failed extraction attempts and exact tool errors.
- Add do_not_repeat for tools that already found nothing, such as binwalk, foremost, zsteg, strings, exiftool, tshark filters.
- next_actions should be concrete, such as "run binwalk -e", "inspect PNG chunks", "extract HTTP objects from pcap", "try zsteg on image".
"""

MISC_SCHEMA = """
For MISC tasks, state_updates should include:

{
  "observations": [string],
  "rules": [string],
  "inputs_outputs": [
    {
      "input": string,
      "output": string,
      "meaning": string
    }
  ],
  "services": [string],
  "protocols": [string],
  "artifacts": [string],
  "hypotheses": [string],
  "negative_findings": [string]
}

MISC-specific rules:
- Preserve exact commands, inputs, outputs, encodings, protocols, prompts, constraints, and challenge-specific rules.
- Record failed attempts and avoid repeating the same interaction.
- next_actions should be concrete and testable.
"""

CTF_DOMAIN_SCHEMAS = {
    "web": WEB_SCHEMA,
    "re": RE_SCHEMA,
    "pwn": PWN_SCHEMA,
    "crypto": CRYPTO_SCHEMA,
    "forensics": FORENSICS_SCHEMA,
    "misc": MISC_SCHEMA,
}

def build_ctf_system_prompt(
    *,
    workspace: str,
    task_name: str,
    task_type: str,
    target: str,
    user_prompt_supplement: str,
    attached_files: str = '',
) -> str:
    """Build the base system prompt for the CTF task agent.

    The task description (attached files, target, supplement) lives here so
    the user message can be a simple start signal — the agent should not need
    to re-read the quest from user input.
    """
    files_section = f"Attached files:\n{attached_files}" if attached_files else ''
    return f"""You are ElfCTF's autonomous CTF solving agent.

Work only inside this task workspace: {workspace}

Solve the challenge by following observe -> hypothesize -> test -> verify -> report.
Prefer concrete tool evidence over guessing. Write helper scripts into the workspace when useful.
When you finished a step, DO NOT repeat the same step.

Script workflow (use this to avoid regenerating entire scripts every turn):
- First iteration: use `ctf_write_file` to save the full script, then `shell` to run it.
- Refinements: use `file_patch` to apply targeted edits (change one variable, fix one loop),
  then `shell` to run again. Only send the changed lines — the rest stays on disk.
  Include 1-2 lines of surrounding context in `old_string` for a unique match.
- Example: file_patch(path="solve.py", old_string="delta = 0x9e3779b9", new_string="delta = 0x88a3f735")

When you find a flag, save it to flag.txt, and then summarize how to proceed at solution.md. Then reply "Finish." without tool call to finish.
You can find some useful information in the archived context by fetching the original context by abstracts and tags.

Flag acceptance criteria:
- If a candidate flag is readable ASCII text, matches the flag format (e.g. ISCTF{{...}}, FLAG{{...}}, etc.),
  and was produced by a reasonable decryption or extraction routine, treat it as the real flag.
- Do NOT require round-trip re-encryption verification when the re-encryption is your own re-implementation
  — your re-implementation may have bugs while the decryption is still correct.
- Save the flag to flag.txt immediately when you have a valid-looking candidate. Do not run additional verification scripts after you already have the flag.

Task name: {task_name}
Task type: {task_type}
Target: {target or '(none)'}
{files_section}
User prompt supplement:
{user_prompt_supplement or '(none)'}
""".strip()


def build_ctf_user_prompt(
    *,
    mode: str,
    additional_input: str,
) -> str:
    """Build the user prompt sent to the agent for one workflow run.

    The task quest details are in the system prompt. This function only
    provides a start signal so the agent immediately begins working.
    """
    normalized_mode = "start" if mode == "retry" else mode
    extra = f"\nAdditional user input:\n{additional_input}" if additional_input else ""
    return f"""Mode: {normalized_mode}

Please solve the quest.
{extra}
""".strip()


def build_ctf_compression_profile(task_type: str) -> ContextCompressionProfile:
    """Build one CTF compression profile for the supplied task type.

    Args:
        task_type: Task category name such as `WEB`, `RE`, or `PWN`.

    Returns:
        A compression profile carrying the normalized task label and the
        matching domain-specific extraction schema.
    """

    # 先把任务类型归一化为内部使用的小写 key，避免上层传入枚举值、
    # 大写字符串或带空白的文本时破坏 profile 调度。
    normalized_task_type = str(task_type or "misc").strip().lower()
    schema_key = normalized_task_type if normalized_task_type in CTF_DOMAIN_SCHEMAS else "misc"

    # 再返回完整 profile，让 llm_context 只消费抽象配置，而不直接依赖
    # CTF 任务层的具体 schema 定义来源。
    return ContextCompressionProfile(
        task_type=schema_key,
        domain_schema=CTF_DOMAIN_SCHEMAS[schema_key],
        prompt_template=CONTEXT_COMPACT_PROMPT_TEMPLATE,
    )
