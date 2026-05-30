"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { addDays, startOfWeekLocal, relativeLabel } from "@/lib/date";

// Weekly goals (used for the progress bars on the scorecards).
const WEEKLY_HOURS_GOAL = 10;
const WEEKLY_LIFTS_GOAL = 2;
const WEEKLY_CARDIO_GOAL_MIN = 150; // ~2.5h Zone 2 / week is a reasonable starting baseline.

type Session = {
  id: string;
  date: string;
  discipline: string;
  duration_min: number;
  notes: string | null;
  created_at: string;
};

type LiftSession = {
  id: string;
  date: string;
  template_name: string;
  created_at: string;
};

type CardioSession = {
  id: string;
  date: string;
  activity: string;
  duration_min: number;
};

export default function HomePage() {
  const [weekSessions, setWeekSessions] = useState<Session[]>([]);
  const [weekLifts, setWeekLifts] = useState<LiftSession[]>([]);
  const [weekCardio, setWeekCardio] = useState<CardioSession[]>([]);
  const [loading, setLoading] = useState(true);

  // AI weekly summary state.
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      loadWeekSessions(),
      loadWeekLifts(),
      loadWeekCardio(),
      loadCachedSummary(),
    ]).then(() => setLoading(false));
  }, []);

  async function loadWeekSessions() {
    const { data, error } = await supabase
      .from("martial_arts_sessions")
      .select("*")
      .gte("date", startOfWeekLocal())
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load martial arts sessions:", error.message);
      return;
    }
    setWeekSessions(data ?? []);
  }

  async function loadWeekLifts() {
    const { data, error } = await supabase
      .from("lift_sessions")
      .select("id, date, template_name, created_at")
      .gte("date", startOfWeekLocal())
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load lift sessions:", error.message);
      return;
    }
    setWeekLifts(data ?? []);
  }

  async function loadWeekCardio() {
    const weekStart = startOfWeekLocal();
    const weekEnd = addDays(weekStart, 7);
    const { data, error } = await supabase
      .from("cardio_sessions")
      .select("id, date, activity, duration_min")
      .gte("date", weekStart)
      .lt("date", weekEnd);
    if (error) {
      // Table might not exist yet (migration not run). Treat as empty.
      console.warn("Cardio load skipped:", error.message);
      setWeekCardio([]);
      return;
    }
    setWeekCardio(data ?? []);
  }

  // Cached AI summary for this week, loaded silently on mount.
  async function loadCachedSummary() {
    const { data } = await supabase
      .from("weekly_summaries")
      .select("summary")
      .eq("week_start", startOfWeekLocal())
      .single();
    if (data) setSummary(data.summary);
  }

  async function generateSummary(force = false) {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const url = force ? "/api/summary?force=true" : "/api/summary";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSummaryError(data.error || "Something went wrong");
      } else {
        setSummary(data.summary);
      }
    } catch {
      setSummaryError("Network error — are you online?");
    } finally {
      setSummaryLoading(false);
    }
  }

  // ── Derived stats ───────────────────────────────────────────────
  const weekMinutes = weekSessions.reduce((sum, s) => sum + s.duration_min, 0);
  const weekHours = weekMinutes / 60;
  const maGoalPercent = Math.min(100, (weekHours / WEEKLY_HOURS_GOAL) * 100);

  const liftGoalPercent = Math.min(
    100,
    (weekLifts.length / WEEKLY_LIFTS_GOAL) * 100
  );

  const weekCardioMin = weekCardio.reduce((sum, c) => sum + c.duration_min, 0);
  const cardioGoalPercent = Math.min(
    100,
    (weekCardioMin / WEEKLY_CARDIO_GOAL_MIN) * 100
  );

  const lastLift = weekLifts[0] ?? null;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Home</h1>
        <p className="text-sm text-zinc-500 mt-1">Your week at a glance.</p>
      </header>

      {/* Martial arts weekly card */}
      <Link
        href="/martial-arts"
        className="block mb-3 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">
            Martial arts this week
          </h2>
          <span className="text-xs text-zinc-500">
            Goal: {WEEKLY_HOURS_GOAL}h
          </span>
        </div>
        <div className="mt-1 text-3xl font-bold">
          {weekHours.toFixed(1)}h{" "}
          <span className="text-base font-normal text-zinc-500">
            ({weekSessions.length} {weekSessions.length === 1 ? "class" : "classes"})
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-cyan-500 transition-all duration-500"
            style={{ width: `${maGoalPercent}%` }}
          />
        </div>
        {weekSessions.length === 0 && !loading && (
          <p className="mt-3 text-xs text-zinc-400">
            No classes yet this week — tap to log one
          </p>
        )}
      </Link>

      {/* Lift weekly card */}
      <Link
        href="/lift"
        className="block mb-3 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">Lifts this week</h2>
          <span className="text-xs text-zinc-500">
            Goal: {WEEKLY_LIFTS_GOAL}
          </span>
        </div>
        <div className="mt-1 text-3xl font-bold">
          {weekLifts.length}
          <span className="text-base font-normal text-zinc-500">
            {" "}
            / {WEEKLY_LIFTS_GOAL} sessions
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${liftGoalPercent}%` }}
          />
        </div>
        {lastLift ? (
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            Last: 🏋️ {lastLift.template_name} · {relativeLabel(lastLift.date)}
          </p>
        ) : (
          <p className="mt-3 text-xs text-zinc-400">
            No lifts yet this week — tap to start one
          </p>
        )}
      </Link>

      {/* Cardio weekly card */}
      <Link
        href="/planner"
        className="block mb-5 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">Cardio this week</h2>
          <span className="text-xs text-zinc-500">
            Goal: {WEEKLY_CARDIO_GOAL_MIN}m
          </span>
        </div>
        <div className="mt-1 text-3xl font-bold">
          {weekCardioMin}
          <span className="text-base font-normal text-zinc-500"> min</span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${cardioGoalPercent}%` }}
          />
        </div>
        {weekCardio.length === 0 && !loading && (
          <p className="mt-3 text-xs text-zinc-400">
            No cardio yet — tap to add to your planner
          </p>
        )}
      </Link>

      {/* AI Weekly Summary */}
      <section className="mt-3">
        {!summary && !summaryLoading && (
          <button
            onClick={() => generateSummary()}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-violet-600 text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            ✨ Summarize my week
          </button>
        )}
        {summaryLoading && (
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="inline-block animate-spin mr-2">✨</div>
            <span className="text-sm text-zinc-500">Generating your summary…</span>
          </div>
        )}
        {summaryError && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {summaryError}
            <button
              onClick={() => generateSummary()}
              className="ml-2 underline font-medium"
            >
              Retry
            </button>
          </div>
        )}
        {summary && (
          <div className="p-5 rounded-2xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                ✨ AI Weekly Summary
              </h3>
              <button
                onClick={() => {
                  setSummary(null);
                  setSummaryError(null);
                }}
                className="text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300"
              >
                Dismiss
              </button>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {summary}
            </p>
            <button
              onClick={() => generateSummary(true)}
              className="mt-3 text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline"
            >
              Regenerate
            </button>
          </div>
        )}
      </section>

      {loading && (
        <p className="mt-6 text-center text-xs text-zinc-500">Loading…</p>
      )}
    </main>
  );
}
