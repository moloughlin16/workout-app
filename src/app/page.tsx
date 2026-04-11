"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { todayLocal, startOfWeekLocal, relativeLabel } from "@/lib/date";

// The four martial arts disciplines we want to track.
// `key` is what we store in the database; `label` is what we show on the button.
// Must match the `check` constraint in the martial_arts_sessions table.
const DISCIPLINES = [
  { key: "MMA", label: "MMA", emoji: "🥋" },
  { key: "Kickboxing", label: "Kickboxing", emoji: "🥊" },
  { key: "Grappling", label: "Grappling", emoji: "🤼" },
  { key: "Sparring", label: "Sparring", emoji: "⚡" },
] as const;

// Goal: 10 hours per week of martial arts.
const WEEKLY_HOURS_GOAL = 10;

// Shape of one row in the martial_arts_sessions table.
// This is a TypeScript "type" — a compile-time description of what the data looks like.
type Session = {
  id: string;
  date: string;
  discipline: string;
  duration_min: number;
  notes: string | null;
  created_at: string;
};

export default function Home() {
  // State variables.
  const [lastLogged, setLastLogged] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [weekSessions, setWeekSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // The date we're logging FOR. Defaults to today.
  // Changing this lets the user log a class they missed logging earlier.
  const [logDate, setLogDate] = useState<string>(todayLocal());

  // Fetch this week's sessions when the page first loads.
  useEffect(() => {
    loadWeekSessions();
  }, []);

  async function loadWeekSessions() {
    setLoadingSessions(true);
    const { data, error } = await supabase
      .from("martial_arts_sessions")
      .select("*")
      .gte("date", startOfWeekLocal())
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(`Failed to load sessions: ${error.message}`);
    } else {
      setWeekSessions(data ?? []);
    }
    setLoadingSessions(false);
  }

  async function handleLog(discipline: string) {
    setSaving(true);
    setErrorMsg(null);

    // Explicitly send the logDate so we can log for a past day.
    // If logDate === today, this is the same as omitting it (the
    // DB default is current_date) — but being explicit is clearer.
    const { error } = await supabase
      .from("martial_arts_sessions")
      .insert({ discipline, date: logDate });

    if (error) {
      setErrorMsg(`Failed to save: ${error.message}`);
    } else {
      setLastLogged(discipline);
      // Refresh the week total so the counter updates immediately.
      await loadWeekSessions();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this class?")) return;

    // Optimistic update: remove from UI immediately for snappy feel.
    const previous = weekSessions;
    setWeekSessions((curr) => curr.filter((s) => s.id !== id));

    const { error } = await supabase
      .from("martial_arts_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      // Roll back on failure.
      setWeekSessions(previous);
      setErrorMsg(`Failed to delete: ${error.message}`);
    }
  }

  // Lookup: emoji by discipline name, for the list.
  const emojiByDiscipline: Record<string, string> = Object.fromEntries(
    DISCIPLINES.map((d) => [d.key, d.emoji])
  );

  // True when user is logging for a day other than today.
  const isBackdating = logDate !== todayLocal();

  // Derived values — computed from state, not stored separately.
  const weekMinutes = weekSessions.reduce((sum, s) => sum + s.duration_min, 0);
  const weekHours = weekMinutes / 60;
  const goalPercent = Math.min(100, (weekHours / WEEKLY_HOURS_GOAL) * 100);

  // Count sessions per discipline for the breakdown.
  const countsByDiscipline: Record<string, number> = {};
  for (const s of weekSessions) {
    countsByDiscipline[s.discipline] =
      (countsByDiscipline[s.discipline] ?? 0) + 1;
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Workout Tracker</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Tap a discipline to log a class.
        </p>
      </header>

      {/* Date selector row — default "Today", but can be changed to backdate. */}
      <div
        className={`mb-4 flex items-center justify-between p-3 rounded-xl border ${
          isBackdating
            ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Logging for:</span>
          <span className="text-sm font-semibold">
            {relativeLabel(logDate)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={logDate}
            max={todayLocal()}
            onChange={(e) => setLogDate(e.target.value)}
            className="text-xs bg-transparent border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1"
          />
          {isBackdating && (
            <button
              onClick={() => setLogDate(todayLocal())}
              className="text-xs text-green-600 dark:text-green-400 font-medium"
              aria-label="Reset to today"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Weekly progress panel */}
      <section className="mb-6 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">This week</h2>
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
        {/* Progress bar */}
        <div className="mt-3 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${goalPercent}%` }}
          />
        </div>
        {/* Per-discipline breakdown */}
        {weekSessions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {DISCIPLINES.map((d) => (
              <span key={d.key}>
                {d.emoji} {d.label}: {countsByDiscipline[d.key] ?? 0}
              </span>
            ))}
          </div>
        )}
        {loadingSessions && (
          <p className="mt-2 text-xs text-zinc-500">Loading…</p>
        )}
      </section>

      {/* Quick-log buttons */}
      <section className="grid grid-cols-2 gap-4">
        {DISCIPLINES.map((d) => (
          <button
            key={d.key}
            onClick={() => handleLog(d.key)}
            disabled={saving}
            className="aspect-square rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            <span className="text-4xl">{d.emoji}</span>
            <span className="text-lg font-semibold">{d.label}</span>
          </button>
        ))}
      </section>

      {/* Feedback banners */}
      {saving && (
        <div className="mt-6 p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center text-sm">
          Saving…
        </div>
      )}
      {lastLogged && !saving && !errorMsg && (
        <div className="mt-6 p-4 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200 text-center">
          Logged {lastLogged} ✓
        </div>
      )}
      {errorMsg && (
        <div className="mt-6 p-4 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-200 text-center text-sm">
          {errorMsg}
        </div>
      )}

      {/* This week's classes — for quick recovery from misclicks */}
      {weekSessions.length > 0 && (
        <section className="mt-8">
          <h3 className="text-sm font-medium text-zinc-500 mb-2">
            This week&apos;s classes
          </h3>
          <ul className="space-y-2">
            {weekSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              >
                <span className="text-2xl">
                  {emojiByDiscipline[s.discipline] ?? "•"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {s.discipline}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {relativeLabel(s.date)} · {s.duration_min} min
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-zinc-400 hover:text-red-500 text-xl px-2"
                  aria-label="Delete class"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
