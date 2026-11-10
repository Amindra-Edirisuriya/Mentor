import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  return (last ? first.charAt(0) + last.charAt(0) : first.slice(0, 2)).toUpperCase();
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  async function signOut() {
    setOpen(false);
    await logout();
    navigate("/login", { replace: true, state: { notice: "You've been signed out." } });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm text-slate-200 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-violet to-brand-cyan text-xs font-bold text-white">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:block">{user.name}</span>
        <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link role="menuitem" to="/app" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-slate-50">
            Projects
          </Link>
          <Link role="menuitem" to="/account" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-slate-50">
            Account settings
          </Link>
          <button role="menuitem" onClick={signOut} className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? "bg-white/10 text-white" : "text-slate-300 hover:text-white"}`;

export function AppHeader() {
  return (
    <header className="relative bg-brand-night text-white">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.45),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(34,211,238,0.25),transparent_50%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <Link to="/app" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="VIFE logo" className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-brand-violet/30 ring-1 ring-white/10" />
          <span className="hidden min-w-0 sm:block">
            <span className="block bg-gradient-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-xl font-extrabold leading-tight tracking-tight text-transparent">
              VIFE
            </span>
            <span className="block text-xs font-medium text-cyan-200/90">Vibe Intelligence for Engineering</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/app" className={navClass}>
            Projects
          </NavLink>
          <NavLink to="/account" className={navClass}>
            Account
          </NavLink>
        </nav>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-center text-xs text-slate-400 sm:px-6">
      VIFE · Vibe Intelligence for Engineering
    </footer>
  );
}
