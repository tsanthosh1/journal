import Link from "next/link";
import { FinanceTopBar } from "@/components/FinanceTopBar";

const links = [
  {
    href: "/subscriptions",
    title: "Subscriptions & Bills",
    badge: "Deterministic Sync",
    description:
      "Audit recurring commitments, credit card statements, and partial payments with deterministic Gmail regex matching.",
  },
  {
    href: "/import",
    title: "Import Statements",
    badge: "Statement Parser",
    description: "Upload bank text statements, preview parsed transactions, and save to Firestore.",
  },
  {
    href: "/statements",
    title: "View Statements",
    badge: "Transactions",
    description: "Pick an account, filter transaction history, and categorize spending.",
  },
  {
    href: "/categories",
    title: "Update Categories",
    badge: "Rules Engine",
    description: "Manage category rules and reprocess transactions with automated rule matching.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <FinanceTopBar />

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 xl:px-10 space-y-6 sm:space-y-8">
        {/* Hero Section */}
        <header className="relative overflow-hidden rounded-3xl md:rounded-4xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-cyan-950/30 p-6 sm:p-8 lg:p-12 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />

          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em] text-cyan-300">
            Track Everything AI
          </p>
          <h1 className="mt-3 sm:mt-4 max-w-4xl text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Personal Finance & Subscription Hub
          </h1>
          <p className="mt-3 sm:mt-5 max-w-2xl text-sm sm:text-base leading-relaxed text-slate-300">
            Unified control over fixed commitments, automated Gmail statement sync, partial payments, and category rules.
          </p>
        </header>

        {/* Highlight Feature Card */}
        <Link
          href="/subscriptions"
          className="group relative block overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-indigo-950/40 p-6 sm:p-8 lg:p-10 shadow-2xl transition-all duration-300 hover:border-cyan-400 hover:shadow-cyan-500/10 hover:-translate-y-0.5"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 px-3 py-1 text-xs font-bold text-cyan-300">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Featured Outflow Tracker
              </span>
              <h2 className="mt-3 text-xl sm:text-2xl lg:text-3xl font-extrabold text-white group-hover:text-cyan-200 transition">
                Subscriptions & Bill Outflow Engine
              </h2>
              <p className="mt-2 max-w-2xl text-xs sm:text-sm text-slate-300 leading-relaxed">
                Deterministic regex parsers for HDFC, ICICI, SBI, Axis, and utilities. Reconciles partial vs full payments from your Gmail alerts with zero LLM hallucinations.
              </p>
            </div>
            <div className="shrink-0 self-start md:self-center">
              <span className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-400/20 group-hover:bg-cyan-300 transition">
                Open Outflow Tracker →
              </span>
            </div>
          </div>
        </Link>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {links.slice(1).map((link) => (
            <Link
              className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 p-6 sm:p-7 transition-all duration-300 hover:border-cyan-300/50 hover:bg-cyan-300/5 hover:-translate-y-0.5 shadow-xl backdrop-blur-md"
              href={link.href}
              key={link.href}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-cyan-200 transition">
                    {link.title}
                  </h2>
                  <span className="rounded-md bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] text-slate-400 font-medium">
                    {link.badge}
                  </span>
                </div>
                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-400">
                  {link.description}
                </p>
              </div>
              <div className="mt-6 flex items-center text-xs font-semibold text-cyan-400 group-hover:translate-x-1 transition">
                Explore →
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
