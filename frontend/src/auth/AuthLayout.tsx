import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const POINTS = [
  ["Evidence, not guesses", "Every finding links to the exact file and line it came from."],
  ["Know what you built", "See the frameworks, routes and data models your project really uses."],
  ["Private by default", "Your uploads are visible only to you and are never executed."],
] as const;

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5" aria-label="VIFE home">
      <img src="/logo.png" alt="" className="h-9 w-9 rounded-xl object-cover shadow-glow ring-1 ring-brand-violet/10" />
      <span className={`text-xl font-black tracking-[-0.04em] ${dark ? "text-brand-ink" : "text-white"}`}>VIFE</span>
    </Link>
  );
}

/** Split-screen layout for sign-in, sign-up and password pages. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[44%] max-w-xl overflow-hidden m-3 rounded-[1.75rem] bg-brand-night p-10 text-white shadow-soft lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(116,75,239,0.55),transparent_55%),radial-gradient(circle_at_90%_100%,rgba(169,150,255,0.3),transparent_50%)]"
          aria-hidden
        />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative my-auto">
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.05em]">
            Understand the code
            <br />
            <span className="bg-gradient-to-r from-brand-light via-[#8064f4] to-[#c2b6ff] bg-clip-text text-transparent">you actually ship.</span>
          </h2>
          <ul className="mt-8 space-y-5">
            {POINTS.map(([head, text]) => (
              <li key={head} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                  <svg className="h-3.5 w-3.5 text-brand-light" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">{head}</p>
                  <p className="text-sm text-[#8d95aa]">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-[#8d95aa]">VIFE · Vibe Intelligence for Engineering</p>
      </aside>

      <main className="flex flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="lg:hidden">
          <Logo dark />
        </div>
        <div className="card mx-auto my-auto w-full max-w-md p-8 sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-brand-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-brand-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
