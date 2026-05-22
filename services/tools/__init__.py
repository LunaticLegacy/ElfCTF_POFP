"""Tool catalog helpers used by API routes."""

CATEGORY_LABELS = {
    'utility': '通用',
    'crypto': '密码',
    'reverse': '逆向',
    'pwn': 'Pwn',
    'web': 'Web',
    'forensics': '取证',
}


def get_tool_categories() -> list[str]:
    """Return supported tool category keys."""
    return list(CATEGORY_LABELS.keys())
