// Mirrors backend app/security/auth.py password_problem() so users see problems before submitting.
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Password must be at most ${MAX_PASSWORD} characters.`;
  if (/^\p{L}+$/u.test(password) || /^\d+$/.test(password)) return "Use a mix of letters and numbers or symbols.";
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "Password must not be your email address.";
  return null;
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

/** A rough 0-4 strength hint for the meter. The server policy above is what's enforced. */
export function passwordStrength(password: string): Strength {
  if (password.length < MIN_PASSWORD) return { score: 0, label: LABELS[0] };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = classes >= 3 ? 2 : 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16 && classes >= 3) score += 1;
  const clamped = Math.min(score, 4) as Strength["score"];
  return { score: clamped, label: LABELS[clamped] };
}

export function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}
