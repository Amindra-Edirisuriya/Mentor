import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthLayout } from "../auth/AuthLayout";
import { useAuth } from "../auth/AuthContext";
import { Notice, PasswordField, SubmitButton, TextField } from "../components/forms";
import { friendlyError } from "../lib/errors";
import { MIN_PASSWORD, isEmail, passwordProblem } from "../lib/password";

type Errors = Partial<Record<"name" | "email" | "password" | "confirm", string>>;

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  function validate(): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter your name.";
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    const problem = passwordProblem(password, email);
    if (problem) next.password = problem;
    if (confirm !== password) next.confirm = "Passwords don't match.";
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  const clear = (key: keyof Errors) => setErrors((e) => ({ ...e, [key]: undefined }));

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free for students and independent developers."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-indigo hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <TextField
          label="Full name"
          autoComplete="name"
          autoFocus
          maxLength={100}
          value={name}
          error={errors.name}
          onChange={(e) => {
            setName(e.target.value);
            clear("name");
          }}
          placeholder="Ada Lovelace"
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clear("email");
          }}
          placeholder="you@university.edu"
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          showStrength
          value={password}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD} characters, mixing letters with numbers or symbols.`}
          onChange={(e) => {
            setPassword(e.target.value);
            clear("password");
          }}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            clear("confirm");
          }}
        />
        <SubmitButton busy={busy}>{busy ? "Creating account…" : "Create account"}</SubmitButton>
        <p className="text-center text-xs text-slate-500">
          Your uploaded projects stay private to your account and are never executed.
        </p>
      </form>
    </AuthLayout>
  );
}
