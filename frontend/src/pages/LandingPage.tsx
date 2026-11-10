import { Link } from "react-router-dom";

import { Logo } from "../auth/AuthLayout";
import { useAuth } from "../auth/AuthContext";

const AVAILABLE = [
  {
    title: "Project analysis",
    text: "Upload a ZIP and see the languages, frameworks and structure your project really uses.",
    icon: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  },
  {
    title: "Routes & data models",
    text: "Express routes and Mongoose models mapped to the exact file and line that defines them.",
    icon: "m8 9-3 3 3 3m8-6 3 3-3 3m-5 3 2-12",
  },
  {
    title: "Evidence-grounded summary",
    text: "Every claim cites its evidence and is labelled verified, inferred or unknown.",
    icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
] as const;

const MORE = [
  ["Logic walkthroughs", "Step-by-step explanations of how each concept works in your own files, with citations."],
  ["Learning pathway & gaps", "Concepts ordered from fundamentals to advanced, with your weakest ones up next."],
  ["Free learning resources", "Hand-picked official docs and guides (MDN, React, Express, OWASP…) for every concept."],
  ["Practice & viva mode", "Questions about your code, graded with feedback. Viva mode adds a timer and voice answers."],
  ["Progress tracking", "Mastery per concept and your daily scores, so you can see yourself improving."],
  ["Presentation builder", "An evidence-backed slide deck with speaker notes, a rehearsal timer and PDF export."],
] as const;

const COMING = ["Import from a GitHub repository", "Password-reset emails (currently shown in the server console)"];

function Icon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden bg-brand-night text-white">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.5),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(34,211,238,0.3),transparent_50%)]"
          aria-hidden
        />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/app" className="btn-primary">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary">
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-14 text-center sm:px-6 sm:pt-20">
          <p className="mx-auto inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-cyan-200 ring-1 ring-white/15">
            For CS & engineering students and independent developers
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Understand the project{" "}
            <span className="bg-gradient-to-r from-violet-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">you built.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
            VIFE analyses your code, maps every concept it uses to real source locations, and shows you what's actually there —
            with evidence for every finding.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to={user ? "/app" : "/register"} className="btn-primary px-6 py-3 text-base">
              {user ? "Go to your projects" : "Create a free account"}
            </Link>
            {!user && (
              <Link to="/login" className="rounded-lg px-6 py-3 text-base font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/10">
                I already have an account
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">What VIFE does today</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {AVAILABLE.map((f) => (
            <div key={f.title} className="card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet/10 to-brand-cyan/10 text-brand-indigo">
                <Icon d={f.icon} />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-20 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Then learn from it</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MORE.map(([head, text]) => (
            <div key={head} className="rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900">{head}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">On the roadmap</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Coming soon</span>
          </div>
          <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
            {COMING.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-violet" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-3">
          {[
            ["Never executed", "Uploaded code is only read — never run, installed or built."],
            ["Secrets redacted", "Keys and tokens are stripped before anything reaches an AI model."],
            ["Private to you", "Your projects are visible only to your account."],
          ].map(([head, text]) => (
            <div key={head}>
              <h3 className="font-semibold text-slate-900">{head}</h3>
              <p className="mt-1 text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-slate-400">VIFE · Vibe Intelligence for Engineering</footer>
    </div>
  );
}
