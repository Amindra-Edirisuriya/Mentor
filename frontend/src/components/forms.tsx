import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

import { passwordStrength } from "../lib/password";
import { Spinner } from "./ui";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  labelAside?: ReactNode;
};

const INPUT =
  "block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-indigo focus:ring-4 focus:ring-brand-indigo/10 disabled:bg-slate-50";

export function TextField({ label, error, hint, labelAside, className = "", ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {labelAside}
      </div>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${INPUT} ${error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10" : "border-slate-300"}`}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {open ? (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5c4.64 0 8.57 3 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.49 16.64 19.5 12 19.5c-4.64 0-8.57-3-9.96-7.18Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </>
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.22A10.48 10.48 0 0 0 2.04 12c1.29 4.34 5.31 7.5 10.07 7.5 1.99 0 3.86-.55 5.44-1.5M6.23 6.23A10.45 10.45 0 0 1 12 4.5c4.76 0 8.77 3.16 10.07 7.5a10.52 10.52 0 0 1-4.29 5.77M6.23 6.23 3 3m3.23 3.23 3.65 3.65m7.89 7.89L21 21m-3.23-3.23-3.65-3.65m0 0a3 3 0 1 0-4.24-4.24m4.24 4.24L9.88 9.88" />
      )}
    </svg>
  );
}

const METER_COLORS = ["bg-slate-200", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? METER_COLORS[score] : "bg-slate-200"}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Strength: <span className="font-medium text-slate-700">{label}</span>
      </p>
    </div>
  );
}

export function PasswordField({
  showStrength = false,
  ...props
}: Omit<FieldProps, "type"> & { showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const { label, error, hint, labelAside, className = "", ...input } = props;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`${INPUT} pr-10 ${error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10" : "border-slate-300"}`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:text-brand-indigo"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          <EyeIcon open={!visible} />
        </button>
      </div>
      {showStrength && typeof input.value === "string" && <StrengthMeter password={input.value} />}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SubmitButton({ busy, children, className = "" }: { busy: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="submit" disabled={busy} className={`btn-primary w-full py-2.5 ${className}`}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3.5 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
