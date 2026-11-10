# ADR 0004: User accounts with server-side cookie sessions

- Status: Accepted (approved by the project owner on 2026-11-10: email + password, cookie
  sessions, private projects, `argon2-cffi` and `react-router-dom`)
- Date: 2026-11-10

## Context

Until now anyone who could reach the API could list and read every uploaded project.
VIFE now needs sign-up, sign-in, sign-out, a profile page, password change and reset, and
account deletion. Uploaded projects must be private to the user who uploaded them.

## Decision

**Email + password accounts.** Passwords are hashed with **Argon2id** (`argon2-cffi`, the
library's default recommended parameters). Policy, enforced on the server and mirrored on the
client for instant feedback: 8–128 characters, not only letters or only digits, not equal to
the email. Emails are trimmed and lower-cased.

**Opaque server-side sessions in an httpOnly cookie**, instead of JWTs:
- `vife_session` = 32 random bytes (`secrets.token_urlsafe`). The `user_sessions` table stores
  only its SHA-256, so a database leak can't be used to sign in.
- Cookie flags: `HttpOnly` (unreadable by JavaScript, so XSS can't steal it), `SameSite=Lax`
  (not sent on cross-site POST/DELETE, which is our CSRF defence), `Secure` whenever
  `APP_ENV` is not `development`, `Path=/`, 14-day lifetime (`SESSION_DAYS`).
- Logout deletes the session row, so a copied cookie stops working immediately. Changing the
  password ends every other session; resetting it ends all sessions.

**Password reset** uses single-use tokens (`password_reset_tokens`, hashed like sessions) that
expire after 30 minutes (`PASSWORD_RESET_MINUTES`). Requesting a new link invalidates older
ones. `/auth/forgot-password` returns the same response whether or not the email exists, and
login returns the same error for an unknown email and a wrong password (with a dummy Argon2
check, so the timing is similar too).

**Email delivery**: only `EMAIL_BACKEND=console` exists for now. It logs the reset link to the
API console. A real provider (SMTP or a hosted service) needs separate approval.

**Privacy**: `projects.owner_id` references `users.id` (`ON DELETE CASCADE`). Every project
and summary endpoint requires a session and returns **404** (not 403) for another user's
project, so project ids can't be probed. Projects uploaded before this change have no owner
and are visible to no one.

**Frontend**: `react-router-dom` provides real URLs (`/`, `/login`, `/register`,
`/forgot-password`, `/reset-password`, `/app`, `/account`), redirects back to the requested
page after sign-in (same-site paths only, to prevent open redirects), and a 404 page.

## Consequences

- Sessions can be revoked, but every authenticated request reads one row. That's fine at
  this scale.
- The Vite proxy keeps the frontend and API on one origin, so no CORS or cross-site cookies
  are needed. A split-domain deployment would need CORS with credentials and a CSRF token.
- Not done yet: rate limiting or lockout for login and reset attempts, email verification,
  changing the email address, and OAuth (GitHub sign-in fits the later GitHub-repo feature).
