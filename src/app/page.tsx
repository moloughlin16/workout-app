"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { startOfWeekLocal, relativeLabel } from "@/lib/date";

// Kept in sync with martial arts page. If you add a discipline, update both.
const DISCIPLINES = [
  { key: "MMA", label: "MMA", emoji: "🥋" },
  { key: "Kickboxing", label: "Kickboxing", emoji: "🥊" },
  { key: "Grappling", label: "Grappling", emoji: "🤼" },
  { key: "Sparring", label: "Sparring", emoji: "⚡" },
] as const;

const WEEKLY_HOURS_GOAL = 10;
const WEEKLY_LIFTS_GOAL = 2;
const RECENT_NOTES_LIMIT = 3;

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

export default function HomePage() {
  const [weekSessions, setWeekSessions] = useState<Session[]>([]);
  const [weekLifts, setWeekLifts] = useState<LiftSession[]>([]);
  // Recent martial arts notes (across all time, not just this week) — the
  // "what have you been working on" feed. Surfaces your past learnings so
  // you're reminded of them before your next class.
  const [recentNotes, setRecentNotes] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Run all three fetches in parallel — they're independent, so waiting
    // for one before starting the next would be pointlessly slow.
    Promise.all([loadWeekSessions(), loadWeekLifts(), loadRecentNotes()]).then(
      () => setLoading(false)
    );
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

  async function loadRecentNotes() {
    const { data, error } = await supabase
      .from("martial_arts_sessions")
      .select("*")
      .not("notes", "is", null)
      .order("created_at", { ascending: false })
      .limit(RECENT_NOTES_LIMIT * 2);
    if (error) {
      console.error("Failed to load recent notes:", error.message);
      return;
    }
    const filtered = (data ?? [])
      .filter((s) => (s.notes ?? "").trim().length > 0)
      .slice(0, RECENT_NOTES_LIMIT);
    setRecentNotes(filtered);
  }

  // Lookup: emoji by discipline name, for the recent-notes section.
  const emojiByDiscipline: Record<string, string> = Object.fromEntries(
    DISCIPLINES.map((d) => [d.key, d.emoji])
  );

  // Derived values.
  const weekMinutes = weekSessions.reduce((sum, s) => sum + s.duration_min, 0);
  const weekHours = weekMinutes / 60;
  const maGoalPercent = Math.min(100, (weekHours / WEEKLY_HOURS_GOAL) * 100);

  const countsByDiscipline: Record<string, number> = {};
  for (const s of weekSessions) {
    countsByDiscipline[s.discipline] =
      (countsByDiscipline[s.discipline] ?? 0) + 1;
  }

  const lastLift = weekLifts[0] ?? null;
  const liftGoalPercent = Math.min(
    100,
    (weekLifts.length / WEEKLY_LIFTS_GOAL) * 100
  );

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Home</h1>
        <p className="text-sm text-zinc-500 mt-1">Your week at a glance.</p>
      </header>

      {/* Martial arts weekly card — tappable, links to /martial-arts */}
      <Link
        href="/martial-arts"
        className="block mb-4 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">
            Martial arts this week
          </h2>
          <span className="text-sm text-zinc-500">
            Goal: {WEEKLY_HOURS_GOAL}h
          </span>
        </div>
        <div className="mt-2 text-3xl font-bold">
          {weekHours.toFixed(1)}h{" "}
          <span className="text-base font-normal text-zinc-500">
            ({weekSessions.length} classes)
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${maGoalPercent}%` }}
          />
        </div>
        {weekSessions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {DISCIPLINES.map((d) => (
              <span key={d.key}>
                {d.emoji} {d.label}: {countsByDiscipline[d.key] ?? 0}
              </span>
            ))}
          </div>
        )}
        {weekSessions.length === 0 && !loading && (
          <p className="mt-3 text-xs text-zinc-400">
            No classes yet this week — tap to log one
          </p>
        )}
      </Link>

      {/* Lift summary card — tappable, links to /lift */}
      <Link
        href="/lift"
        className="block mb-6 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">Lifts this week</h2>
          <span className="text-sm text-zinc-500">
            Goal: {WEEKLY_LIFTS_GOAL}
          </span>
        </div>
        <div className="mt-2 text-3xl font-bold">
          {weekLifts.length}
          <span className="text-base font-normal text-zinc-500">
            {" "}
            / {WEEKLY_LIFTS_GOAL} sessions
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
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

      {/* Recent notes — last few training notes as quote cards.
          Surfaces your past learnings so you see them before your next class. */}
      {recentNotes.length > 0 && (
        <section className="mt-4">
          <h3 className="text-sm font-medium text-zinc-500 mb-2">
            Recent notes
          </h3>
          <ul className="space-y-2">
            {recentNotes.map((s) => (
              <li
                key={s.id}
                className="p-4 rounded-xl bg-white dark:bg-zinc-900 border-l-4 border-l-green-500 border-y border-r border-zinc-200 dark:border-zinc-800"
              >
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                  <span>{emojiByDiscipline[s.discipline] ?? "•"}</span>
                  <span className="font-semibold">{s.discipline}</span>
                  <span>·</span>
                  <span>{relativeLabel(s.date)}</span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap line-clamp-4">
                  {s.notes}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading && (
        <p className="mt-6 text-center text-xs text-zinc-500">Loading…</p>
      )}
    </main>
  );
}
