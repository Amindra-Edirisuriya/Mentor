import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { forgotPassword, resetPassword } from "../api";
import { AuthLayout } from "../auth/AuthLayout";
import { Notice, PasswordField, SubmitButton, TextField } from "../components/forms";
import { friendlyError } from "../lib/errors";
import { MIN_PASSWORD, isEmail, passwordProblem } from "../lib/password";

const backToSignIn = (
  <Link to="/login" className="font-semibold text-brand-indigo hover:underline">
    ← Back to sign in
  </Link>
);

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setSent((await forgotPassword(email.trim())).detail);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to choose a new password."
      footer={backToSignIn}
    >
      {sent ? (
        <div className="space-y-4">
          <Notice tone="success">{sent}</Notice>
          <p className="text-sm text-slate-500">
            The link expires in 30 minutes. Didn't get it? Check your spam folder, or{" "}
            <button type="button" onClick={() => setSent(null)} className="font-medium text-brand-indigo hover:underline">
              try again
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
          />
          <SubmitButton busy={busy}>{busy ? "Sending…" : "Send reset link"}</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password) ?? (confirm !== password ? "Passwords don't match." : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true, state: { notice: "Your password was changed. Sign in with your new password." } });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Link not valid" footer={backToSignIn}>
        <Notice tone="error">
          This reset link is incomplete. <Link to="/forgot-password" className="font-semibold underline">Request a new one</Link>.
        </Notice>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be signed out on every device after changing it." footer={backToSignIn}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <PasswordField
          label="New password"
          autoComplete="new-password"
          autoFocus
          showStrength
          value={password}
          hint={`At least ${MIN_PASSWORD} characters, mixing letters with numbers or symbols.`}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <SubmitButton busy={busy}>{busy ? "Saving…" : "Set new password"}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
