import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthLayout } from "../auth/AuthLayout";
import { useAuth } from "../auth/AuthContext";
import { Notice, PasswordField, SubmitButton, TextField } from "../components/forms";
import { friendlyError } from "../lib/errors";
import { isEmail } from "../lib/password";
import { safeRedirect } from "../lib/redirect";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; notice?: string } | null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isEmail(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(safeRedirect(state?.from), { replace: true });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see your projects and reports."
      footer={
        <>
          New to VIFE?{" "}
          <Link to="/register" className="font-semibold text-brand-indigo hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {state?.notice && !error && <Notice tone="success">{state.notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          error={emailError}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
          placeholder="you@university.edu"
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          labelAside={
            <Link to="/forgot-password" className="text-xs font-medium text-brand-indigo hover:underline">
              Forgot password?
            </Link>
          }
        />
        <SubmitButton busy={busy}>{busy ? "Signing in…" : "Sign in"}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
