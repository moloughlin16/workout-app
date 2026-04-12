"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { startOfWeekLocal, relativeLabel } from "@/lib/date";
import { extractTags } from "@/lib/tags";
import WeeklyMartialArtsChart from "@/components/WeeklyMartialArtsChart";
import NoteText from "@/components/NoteText";

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
  // All tags that appear in any note, counted across all time. Drives the
  // Tags section; each tag links to /notes?tag=xxx for browsing.
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // AI weekly summary state
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    // Run all fetches in parallel — they're independent, so waiting
    // for one before starting the next would be pointlessly slow.
    Promise.all([
      loadWeekSessions(),
      loadWeekLifts(),
      loadRecentNotes(),
      loadTagCounts(),
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

  // Fetch the `notes` column from every session that has one and count
  // how often each tag appears. We fetch just the notes column (tiny
  // payload) and do the tag extraction client-side.
  async function loadTagCounts() {
    const { data, error } = await supabase
      .from("martial_arts_sessions")
      .select("notes")
      .not("notes", "is", null);

    if (error) {
      console.error("Failed to load tag counts:", error.message);
      return;
    }
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { notes: string | null }[]) {
      for (const tag of extractTags(row.notes)) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    setTagCounts(counts);
  }

  // Calls our server-side API route to generate a weekly summary via Gemini.
  // The API key never leaves the server — the browser just gets the summary text back.
  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/summary", { method: "POST" });
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

  // Top tags sorted by frequency desc, then alphabetically as a tiebreaker.
  // Limit to the top 12 so the pill cloud stays readable on mobile.
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12);

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

      {/* Weekly martial arts bar chart — 8-week training history */}
      <WeeklyMartialArtsChart />

      {/* AI Weekly Summary — calls Gemini via our server-side API route.
          Only shown after the user taps the button (not auto-generated)
          so we don't burn API calls on every page load. */}
      <section className="mt-4">
        {!summary && !summaryLoading && (
          <button
            onClick={generateSummary}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-purple-600 text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
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
              onClick={generateSummary}
              className="ml-2 underline font-medium"
            >
              Retry
            </button>
          </div>
        )}
        {summary && (
          <div className="p-5 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                ✨ AI Weekly Summary
              </h3>
              <button
                onClick={() => {
                  setSummary(null);
                  setSummaryError(null);
                }}
                className="text-xs text-purple-500 hover:text-purple-700 dark:hover:text-purple-300"
              >
                Dismiss
              </button>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {summary}
            </p>
            <button
              onClick={generateSummary}
              className="mt-3 text-xs text-purple-600 dark:text-purple-400 font-medium hover:underline"
            >
              Regenerate
            </button>
          </div>
        )}
      </section>

      {/* Recent notes — last few training notes as quote cards.
          Surfaces your past learnings so you see them before your next class. */}
      {recentNotes.length > 0 && (
        <section className="mt-4">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-medium text-zinc-500">Recent notes</h3>
            <Link
              href="/notes"
              className="text-xs text-green-600 dark:text-green-400 font-medium"
            >
              View all
            </Link>
          </div>
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
                  <NoteText text={s.notes ?? ""} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tags cloud — top recurring topics from your notes. Tap to filter. */}
      {sortedTags.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-medium text-zinc-500 mb-2">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {sortedTags.map(([tag, count]) => (
              <Link
                key={tag}
                href={`/notes?tag=${encodeURIComponent(tag)}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50"
              >
                <span>#{tag}</span>
                <span className="text-green-600 dark:text-green-500">
                  {count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <p className="mt-6 text-center text-xs text-zinc-500">Loading…</p>
      )}
    </main>
  );
}
