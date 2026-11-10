import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Logo } from "../auth/AuthLayout";

const FEATURES = [
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
  {
    title: "Concept mind map",
    text: "See how the concepts in your project connect, from fundamentals out to the advanced parts.",
    icon: "M7.5 7.5h.008v.008H7.5V7.5Zm9 0h.008v.008H16.5V7.5Zm-4.5 9h.008v.008H12v-.008ZM7.5 7.5 12 16.5m4.5-9L12 16.5M7.5 7.5h9",
  },
  {
    title: "Learning pathway & gaps",
    text: "Walkthroughs of each concept in your own files, ordered so your weakest ones come next.",
    icon: "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342",
  },
  {
    title: "Practice & viva mode",
    text: "Questions about your code, graded with feedback. Viva mode adds a timer and voice answers.",
    icon: "M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z",
  },
  {
    title: "Progress tracking",
    text: "Mastery per concept and your daily scores, so you can see yourself improving.",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  },
  {
    title: "Presentation builder",
    text: "An evidence-backed slide deck with speaker notes, a rehearsal timer and PDF export.",
    icon: "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5",
  },
  {
    title: "Free learning resources",
    text: "Hand-picked official docs and guides (MDN, React, Express, OWASP…) for every concept.",
    icon: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  },
] as const;

const STEPS = [
  ["Upload", "Drop in a ZIP of your project. It's checked for unsafe archives and never executed."],
  ["Analyse", "Deterministic detectors scan files, manifests, routes and models, and record evidence for each finding."],
  ["Understand", "Read a cited summary, explore the mind map, then practise until the concepts stick."],
] as const;

const SAFETY = [
  ["Never executed", "Uploaded code is only read: never run, installed or built."],
  ["Secrets redacted", "Keys and tokens are stripped before anything reaches an AI model."],
  ["Private to you", "Your projects are visible only to your account."],
] as const;

const COMING = ["Import from a GitHub repository", "Password-reset emails (currently shown in the server console)"];

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/** Fades its children up the first time they scroll into view. */
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`min-w-0 transition duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-brand-ink sm:text-5xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-brand-muted sm:text-lg">{children}</p>}
    </Reveal>
  );
}

function WindowDots() {
  return (
    <span className="flex gap-1.5" aria-hidden>
      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </span>
  );
}

const pill = (tone: "verified" | "inferred" | "unknown") =>
  ({
    verified: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    inferred: "bg-amber-50 text-amber-700 ring-amber-600/20",
    unknown: "bg-slate-100 text-slate-600 ring-slate-500/20",
  })[tone];

/** Illustrative preview of a report. Clearly labelled as an example, not real output. */
function ReportPreview() {
  const rows = [
    { claim: "Uses Express for the HTTP API", where: "server/app.js:4-12", tone: "verified" as const },
    { claim: "JWT-based authentication middleware", where: "server/middleware/auth.js:8-31", tone: "verified" as const },
    { claim: "Role checks for artists and listeners", where: "server/routes/tracks.js:22", tone: "inferred" as const },
    { claim: "Rate limiting on login", where: "no evidence found", tone: "unknown" as const },
  ];
  return (
    <div className="card overflow-hidden text-left shadow-soft">
      <div className="flex items-center gap-3 border-b border-brand-line/70 bg-white/70 px-4 py-3">
        <WindowDots />
        <span className="font-mono text-xs text-brand-muted">vife · example report</span>
        <span className="ml-auto rounded-full bg-brand-mist px-2 py-0.5 text-[11px] font-medium text-brand-violet">Illustrative</span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[180px_1fr] sm:p-6">
        <div className="space-y-3">
          {[
            ["Files scanned", "142"],
            ["Frameworks", "React · Express"],
            ["Evidence items", "87"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-brand-bg/80 p-3 ring-1 ring-inset ring-brand-line/60">
              <p className="text-[11px] uppercase tracking-wider text-brand-muted">{k}</p>
              <p className="mt-0.5 font-semibold text-brand-ink">{v}</p>
            </div>
          ))}
        </div>
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.claim} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-inset ring-brand-line/60">
              <span className="flex-1 text-sm font-medium text-brand-ink">{r.claim}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${pill(r.tone)}`}>{r.tone}</span>
              <code className="w-full truncate font-mono text-xs text-brand-violet">{r.where}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function NavBar() {
  const { user } = useAuth();
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-30 px-4 transition-all duration-500 ${compact ? "pt-2" : "pt-4"}`}>
      <nav
        className={`mx-auto flex items-center gap-3 rounded-2xl bg-white/90 py-1.5 pl-4 pr-1.5 shadow-card ring-1 ring-brand-line/60 backdrop-blur-xl transition-all duration-500 ${compact ? "max-w-4xl" : "max-w-6xl"}`}
      >
        <Logo dark />
        <div className="mx-auto hidden items-center gap-1 md:flex">
          {[
            ["#how", "How it works"],
            ["#features", "Features"],
            ["#safety", "Safety"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-brand-muted transition hover:bg-brand-mist hover:text-brand-violet">
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {user ? (
            <Link to="/app" className="btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden rounded-full px-3 py-2 text-sm font-semibold sm:inline-flex text-brand-ink transition hover:text-brand-violet">
                Sign in
              </Link>
              <Link to="/register" className="btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavBar />

      {/* Hero */}
      <section className="relative flex min-h-[100svh] items-center justify-center px-4 pb-16 pt-32 text-center sm:px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.6)_30%,transparent_65%)]"
          aria-hidden
        />
        <div className="relative w-full min-w-0 max-w-5xl">
          <p className="glass-pill max-w-full animate-rise text-left">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-violet" aria-hidden />
            For CS & engineering students and independent developers
          </p>
          <h1 className="mt-7 animate-rise text-[clamp(2.75rem,7.5vw,6rem)] font-black leading-[0.95] tracking-[-0.06em] text-brand-ink [animation-delay:100ms]">
            Understand
            <br />
            <span className="text-gradient">what you built.</span>
          </h1>
          <p className="mx-auto mt-6 flex animate-rise flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xl font-bold tracking-tight text-brand-ink [animation-delay:200ms] sm:text-2xl">
            <span>Analyse</span>
            <span className="text-brand-light">→</span>
            <span className="text-brand-violet">Explain</span>
            <span className="text-brand-light">→</span>
            <span>Practise</span>
          </p>
          <p className="mx-auto mt-5 max-w-2xl animate-rise text-base leading-relaxed text-brand-muted [animation-delay:300ms] sm:text-lg">
            You shipped it, but <em className="text-[#8b5cf6]">do you really know how it works?</em> VIFE maps every concept in your
            project to real source lines and{" "}
            <span className="font-semibold text-brand-violet">backs every finding with evidence.</span>
          </p>
          <div className="mt-6 flex animate-rise flex-wrap items-center justify-center gap-2 [animation-delay:400ms]">
            {["File-and-line evidence", "No code executed", "Secrets redacted"].map((p) => (
              <span key={p} className="glass-pill">
                <svg className="h-3.5 w-3.5 text-brand-violet" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                </svg>
                {p}
              </span>
            ))}
          </div>
          <div className="mt-10 flex animate-rise flex-col items-center justify-center gap-3 [animation-delay:500ms] sm:flex-row sm:gap-4">
            <Link to={user ? "/app" : "/register"} className="btn-primary px-9 py-3.5 text-base">
              {user ? "Go to your projects" : "Get started free"}
            </Link>
            <a href="#how" className="btn-secondary px-9 py-3.5 text-base">
              See how it works →
            </a>
          </div>
          <div className="mx-auto mt-16 max-w-4xl animate-rise [animation-delay:650ms]">
            <div className="animate-float">
              <ReportPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Problem vs solution */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="The problem" title={<>A file tree tells you <span className="text-gradient">where.</span><br className="hidden sm:block" /> VIFE tells you <span className="text-gradient">why.</span></>}>
          Generated or copied code works until someone asks you to explain it. VIFE turns your repository into something you can
          actually reason about.
        </SectionHeading>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Reveal>
            <div className="card h-full p-6">
              <p className="text-sm font-semibold text-brand-muted">What you usually see</p>
              <pre className="mt-4 max-w-full overflow-x-auto rounded-xl bg-brand-bg p-4 font-mono text-xs leading-6 text-brand-muted ring-1 ring-inset ring-brand-line/60">
{`client/
  src/App.jsx
  src/pages/Upload.jsx
server/
  app.js
  routes/tracks.js
  middleware/auth.js
  models/User.js`}
              </pre>
              <p className="mt-4 text-sm text-brand-muted">Folders and file names. No idea which concepts they use or how they connect.</p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="card relative h-full overflow-hidden p-6 ring-1 ring-brand-violet/20">
              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand-violet/15 blur-3xl" aria-hidden />
              <p className="text-sm font-semibold text-brand-violet">What VIFE shows you</p>
              <ul className="relative mt-4 space-y-2.5 text-sm">
                {[
                  ["Authentication", "JWT issued at login, verified in middleware", "auth.js:8"],
                  ["Data model", "User schema with a role field", "User.js:5"],
                  ["API route", "POST /tracks, protected by auth", "tracks.js:22"],
                  ["Frontend", "React upload form posting to the API", "Upload.jsx:41"],
                ].map(([k, v, loc]) => (
                  <li key={k} className="flex items-start gap-3 rounded-xl bg-white/90 p-3 ring-1 ring-inset ring-brand-line/60">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-brand-deep to-brand-bright" aria-hidden />
                    <span className="flex-1">
                      <span className="font-semibold text-brand-ink">{k}</span>
                      <span className="text-brand-muted"> · {v}</span>
                    </span>
                    <code className="font-mono text-xs text-brand-violet">{loc}</code>
                  </li>
                ))}
              </ul>
              <p className="relative mt-4 text-sm text-brand-muted">Concepts, connections and the exact line that proves each one.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="How it works" title={<>From ZIP to understanding<br className="hidden sm:block" /> in <span className="text-gradient">three steps.</span></>} />
        <div className="mx-auto mt-14 grid max-w-6xl gap-6 md:grid-cols-3">
          {STEPS.map(([head, text], i) => (
            <Reveal key={head} delay={i * 120}>
              <div className="card group h-full p-7 transition duration-300 hover:-translate-y-1 hover:shadow-soft">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-deep via-brand-violet to-brand-bright font-mono text-sm font-semibold text-white shadow-glow">
                  0{i + 1}
                </span>
                <h3 className="mt-5 text-xl font-bold tracking-tight text-brand-ink">{head}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-muted">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Features" title={<>Everything you need to <span className="text-gradient">own your code.</span></>}>
          Analysis first, then learning built on top of it, all grounded in your project's real source.
        </SectionHeading>
        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 100}>
              <div className="card group h-full p-6 transition duration-300 hover:-translate-y-1 hover:shadow-soft">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-mist text-brand-violet ring-1 ring-inset ring-brand-violet/15 transition group-hover:bg-brand-violet group-hover:text-white">
                  <Icon d={f.icon} />
                </span>
                <h3 className="mt-5 font-bold tracking-tight text-brand-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-brand-muted">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mx-auto mt-10 max-w-6xl">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-dashed border-brand-violet/25 bg-white/50 px-6 py-4">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Coming soon</span>
            {COMING.map((item) => (
              <span key={item} className="flex items-center gap-2 text-sm text-brand-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-violet" aria-hidden />
                {item}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Safety */}
      <section id="safety" className="scroll-mt-24 px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Safety" title={<>Your code is <span className="text-gradient">untrusted by design.</span></>} />
        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
          {SAFETY.map(([head, text], i) => (
            <Reveal key={head} delay={i * 120}>
              <div className="h-full text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-card ring-1 ring-brand-line">
                  <svg className="h-5 w-5 text-brand-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                </span>
                <h3 className="mt-4 font-bold text-brand-ink">{head}</h3>
                <p className="mt-1.5 text-sm text-brand-muted">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Get started */}
      <section className="px-4 py-24 sm:px-6">
        <Reveal className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-[2rem] bg-brand-night px-6 py-14 text-center text-white shadow-soft sm:px-12">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(116,75,239,0.45),transparent_50%),radial-gradient(circle_at_90%_100%,rgba(169,150,255,0.25),transparent_45%)]"
              aria-hidden
            />
            <div className="relative">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-light">Get started</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">
                Your first report in{" "}
                <span className="bg-gradient-to-r from-brand-light via-[#8064f4] to-[#c2b6ff] bg-clip-text text-transparent">under a minute.</span>
              </h2>
              <div className="mx-auto mt-10 max-w-xl overflow-hidden rounded-2xl bg-white/5 text-left ring-1 ring-white/10">
                <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                  <WindowDots />
                  <span className="font-mono text-xs text-[#8d95aa]">getting-started</span>
                </div>
                <ol className="space-y-2 p-5 font-mono text-sm">
                  {["Create a free account", "Upload your project as a .zip", "Read your evidence-backed report"].map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="text-brand-light">{i + 1}.</span>
                      <span className="text-[#eef0fb]">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <Link to={user ? "/app" : "/register"} className="btn-primary mt-10 px-9 py-3.5 text-base">
                {user ? "Go to your projects" : "Create a free account"}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-brand-line/70 px-4 py-10 text-sm text-brand-muted sm:flex-row sm:px-6">
        <Logo dark />
        <p>VIFE · Vibe Intelligence for Engineering</p>
        <p>© {new Date().getFullYear()} VIFE</p>
      </footer>
    </div>
  );
}
