import pytest

from app.security.redaction import redact


@pytest.mark.parametrize(
    ("text", "secret"),
    [
        ('const JWT_SECRET = "abc123supersecret";', "abc123supersecret"),
        ("password: 'hunter2hunter2'", "hunter2hunter2"),
        ("API_KEY=9f8e7d6c5b4a", "9f8e7d6c5b4a"),
        ('{"apiKey": "live-key-value-1"}', "live-key-value-1"),
        ("mongodb+srv://admin:p4ssw0rd@cluster0.mongodb.net/db", "admin:p4ssw0rd"),
        ("aws = AKIAABCDEFGHIJKLMNOP", "AKIAABCDEFGHIJKLMNOP"),
        ("token ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"),
        ("key sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"),
        ("stripe sk_live_abcdefghijklmnop", "sk_live_abcdefghijklmnop"),
        ("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
         "eyJhbGciOiJIUzI1NiJ9"),
        ("-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----", "MIIEow"),
    ],
)
def test_secrets_are_redacted(text: str, secret: str) -> None:
    result = redact(text)
    assert secret not in result.text
    assert "[REDACTED:" in result.text
    assert result.redacted


@pytest.mark.parametrize(
    "text",
    [
        "const secret = process.env.JWT_SECRET;",
        "jwt.sign(payload, config.jwtSecret)",
        "router.post('/login', verifyToken, handler)",
        "const token = req.headers.authorization;",
        "function getToken() { return 1 }",
    ],
)
def test_code_references_are_not_redacted(text: str) -> None:
    result = redact(text)
    assert result.text == text
    assert not result.redacted


def test_url_redaction_keeps_host() -> None:
    result = redact("MONGO=mongodb://user:pw123@localhost:27017/app")
    assert "localhost:27017/app" in result.text
    assert "pw123" not in result.text
