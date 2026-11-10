import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { changePassword, deleteAccount, updateProfile } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AppFooter, AppHeader, initials } from "../components/AppHeader";
import { Notice, PasswordField, TextField } from "../components/forms";
import { Spinner } from "../components/ui";
import { friendlyError } from "../lib/errors";
import { MIN_PASSWORD, passwordProblem } from "../lib/password";

type Status = { tone: "error" | "success"; text: string } | null;

function Panel({ title, description, children, danger = false }: { title: string; description: string; children: ReactNode; danger?: boolean }) {
  return (
    <section className={`card grid gap-6 p-5 sm:p-6 md:grid-cols-3 ${danger ? "border-rose-200" : ""}`}>
      <div>
        <h2 className={`text-base font-semibold ${danger ? "text-rose-700" : "text-slate-900"}`}>{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="md:col-span-2">{children}</div>
    </section>
  );
}

function SaveButton({ busy, children, danger = false }: { busy: boolean; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={
        danger
          ? "inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:opacity-50"
          : "btn-primary"
      }
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setStatus({ tone: "error", text: "Enter your name." });
    setBusy(true);
    setStatus(null);
    try {
      setUser(await updateProfile(name.trim()));
      setStatus({ tone: "success", text: "Profile saved." });
    } catch (err) {
      setStatus({ tone: "error", text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <form onSubmit={submit} className="space-y-4">
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-violet to-brand-cyan text-lg font-bold text-white">
          {initials(user.name)}
        </span>
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium text-slate-900">{user.email}</p>
          <p className="text-slate-500">Member since {new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: "long" })}</p>
        </div>
      </div>
      <TextField label="Full name" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Email" value={user.email} disabled hint="Email changes aren't supported yet." />
      <SaveButton busy={busy}>Save profile</SaveButton>
    </form>
  );
}

function PasswordForm() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(next, user?.email) ?? (confirm !== next ? "New passwords don't match." : null);
    if (problem) return setStatus({ tone: "error", text: problem });
    setBusy(true);
    setStatus(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus({ tone: "success", text: "Password changed. You've been signed out on your other devices." });
    } catch (err) {
      setStatus({ tone: "error", text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        showStrength
        hint={`At least ${MIN_PASSWORD} characters, mixing letters with numbers or symbols.`}
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <SaveButton busy={busy}>Change password</SaveButton>
    </form>
  );
}

function DeleteForm() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = confirmText === "DELETE" && password.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!armed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      setUser(null);
      navigate("/", { replace: true });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Notice tone="error">
        This permanently deletes your account, every project you uploaded and all their reports. It can't be undone.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <TextField
        label='Type "DELETE" to confirm'
        autoComplete="off"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
      />
      <PasswordField label="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className={armed ? "" : "pointer-events-none opacity-50"} aria-disabled={!armed}>
        <SaveButton busy={busy} danger>
          Delete my account
        </SaveButton>
      </div>
    </form>
  );
}

export function AccountPage() {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your profile, password and account.</p>
        </div>
        <Panel title="Profile" description="How you appear in VIFE.">
          <ProfileForm />
        </Panel>
        <Panel title="Password" description="Changing it signs you out everywhere else.">
          <PasswordForm />
        </Panel>
        <Panel title="Delete account" description="Remove your account and all your data." danger>
          <DeleteForm />
        </Panel>
      </main>
      <AppFooter />
    </div>
  );
}
