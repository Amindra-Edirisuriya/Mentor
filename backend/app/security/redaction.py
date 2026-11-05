"""Detect and redact secrets in text before it can reach an LLM (CLAUDE.md rule 6).

Deliberately aggressive: a false positive only hides a few characters from the model, a false
negative leaks a credential. Redacted values are replaced by ``[REDACTED:<kind>]``.
"""

import re
from dataclasses import dataclass, field

_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("slack-token", re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b")),
    ("stripe-key", re.compile(r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("llm-api-key", re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
    # scheme://user:password@host  -> keep scheme and host, hide credentials
    ("url-credentials", re.compile(r"(?<=://)[^/\s:@'\"]+:[^@\s'\"]+(?=@)")),
)

# key = "value" / key: 'value' / KEY=value where the key name suggests a secret.
_ASSIGNMENT = re.compile(
    r"""(?ix)
    (?P<key>[\w.-]*(?:secret|passw(?:or)?d|pwd|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|
        client[_-]?secret|auth|credential|session[_-]?key|signing[_-]?key)[\w.-]*)
    (?P<sep>\s*["']?\s*[:=]\s*)
    (?P<quote>["'`]?)
    (?P<value>[^\s"'`,;)}]{4,})
    (?P=quote)
    """
)
# Values that are clearly code, not literals (env lookups, identifiers, calls).
_NOT_A_LITERAL = re.compile(r"^(?:process\.env|os\.environ|os\.getenv|env\(|config\.|settings\.|req\.|[A-Za-z_]\w*\()")


@dataclass
class RedactionResult:
    text: str
    kinds: list[str] = field(default_factory=list)

    @property
    def redacted(self) -> bool:
        return bool(self.kinds)


def redact(text: str) -> RedactionResult:
    kinds: list[str] = []

    for kind, pattern in _PATTERNS:
        text, count = pattern.subn(f"[REDACTED:{kind}]", text)
        kinds.extend([kind] * count)

    def replace_assignment(match: re.Match[str]) -> str:
        value = match.group("value")
        if value.startswith("[REDACTED:") or _NOT_A_LITERAL.match(value):
            return match.group(0)
        kinds.append("secret-assignment")
        quote = match.group("quote")
        return f"{match.group('key')}{match.group('sep')}{quote}[REDACTED:secret]{quote}"

    text = _ASSIGNMENT.sub(replace_assignment, text)
    return RedactionResult(text=text, kinds=kinds)
