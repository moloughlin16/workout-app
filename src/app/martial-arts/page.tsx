"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  addDays,
  relativeLabel,
  startOfWeekLocal,
  todayLocal,
  weekRangeLabel,
  weekStartFor,
} from "@/lib/date";
import NoteText from "@/components/NoteText";

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
type Session = {
  id: string;
  date: string;
  discipline: string;
  duration_min: number;
  notes: string | null;
  created_at: string;
};

export default function MartialArtsPage() {
  const [lastLogged, setLastLogged] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [weekSessions, setWeekSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Monday of the week we're CURRENTLY VIEWING on the page. Navigate with
  // the prev/next arrows to browse and delete past sessions. Independent
  // of `logDate` — you can view last week while still logging for today.
  const [viewedWeekStart, setViewedWeekStart] = useState<string>(
    startOfWeekLocal()
  );

  // The date we're logging FOR. Defaults to today.
  // Changing this lets the user log a class they missed logging earlier.
  const [logDate, setLogDate] = useState<string>(todayLocal());

  // Notes + duration editing state.
  // `expandedId` is the id of the session whose editor is currently open
  // (or null if none). Only one open at a time keeps the UI tidy.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // `noteDrafts` holds in-progress text for each session id. We keep drafts
  // separate from the saved `weekSessions` so typing doesn't mutate the
  // "source of truth" until you hit Save.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  // `durationDrafts` is the parallel draft for the duration input. Stored
  // as a string because form inputs are strings; parsed to int at save.
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>(
    {}
  );
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // Reload the session list whenever the user navigates to a different week.
  useEffect(() => {
    loadWeekSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedWeekStart]);

  async function loadWeekSessions() {
    setLoadingSessions(true);
    // Fetch only the week currently being viewed: [weekStart, weekStart + 7).
    const endExclusive = addDays(viewedWeekStart, 7);
    const { data, error } = await supabase
      .from("martial_arts_sessions")
      .select("*")
      .gte("date", viewedWeekStart)
      .lt("date", endExclusive)
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

    const { error } = await supabase
      .from("martial_arts_sessions")
      .insert({ discipline, date: logDate });

    if (error) {
      setErrorMsg(`Failed to save: ${error.message}`);
    } else {
      setLastLogged(discipline);
      // Jump to the week containing the date we just logged for, so the
      // user always sees the class they just added. If they're already on
      // that week, nothing changes (and we still refresh via useEffect).
      const targetWeek = weekStartFor(logDate);
      if (targetWeek === viewedWeekStart) {
        await loadWeekSessions(); // Same week — manual refresh.
      } else {
        setViewedWeekStart(targetWeek); // Different week — useEffect reloads.
      }
    }
    setSaving(false);
  }

  function toggleExpand(session: Session) {
    if (expandedId === session.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(session.id);
    setNoteDrafts((curr) => ({
      ...curr,
      [session.id]: curr[session.id] ?? session.notes ?? "",
    }));
    setDurationDrafts((curr) => ({
      ...curr,
      [session.id]: curr[session.id] ?? String(session.duration_min),
    }));
  }

  // Save the editor state: both the note text and the session duration.
  // Duration is clamped to [1, 600] min; invalid input falls back to
  // whatever was previously saved on the row.
  async function handleSaveSession(id: string) {
    const draft = noteDrafts[id] ?? "";
    const notesValue = draft.trim().length === 0 ? null : draft.trim();

    // Parse duration. If the user typed nonsense or cleared the field,
    // keep the previous value instead of writing NaN/null to the DB.
    const durationDraft = durationDrafts[id] ?? "";
    const parsed = parseInt(durationDraft, 10);
    const currentRow = weekSessions.find((s) => s.id === id);
    const previousDuration = currentRow?.duration_min ?? 60;
    const durationValue =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 600
        ? parsed
        : previousDuration;

    setSavingNoteId(id);
    setErrorMsg(null);

    // Optimistic update for BOTH fields.
    const previous = weekSessions;
    setWeekSessions((curr) =>
      curr.map((s) =>
        s.id === id
          ? { ...s, notes: notesValue, duration_min: durationValue }
          : s
      )
    );

    const { error } = await supabase
      .from("martial_arts_sessions")
      .update({ notes: notesValue, duration_min: durationValue })
      .eq("id", id);

    if (error) {
      setWeekSessions(previous);
      setErrorMsg(`Failed to save: ${error.message}`);
    } else {
      setExpandedId(null);
    }
    setSavingNoteId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this class?")) return;

    const previous = weekSessions;
    setWeekSessions((curr) => curr.filter((s) => s.id !== id));

    const { error } = await supabase
      .from("martial_arts_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      setWeekSessions(previous);
      setErrorMsg(`Failed to delete: ${error.message}`);
    }
  }

  const emojiByDiscipline: Record<string, string> = Object.fromEntries(
    DISCIPLINES.map((d) => [d.key, d.emoji])
  );

  const isBackdating = logDate !== todayLocal();

  const weekMinutes = weekSessions.reduce((sum, s) => sum + s.duration_min, 0);
  const weekHours = weekMinutes / 60;
  const goalPercent = Math.min(100, (weekHours / WEEKLY_HOURS_GOAL) * 100);

  const countsByDiscipline: Record<string, number> = {};
  for (const s of weekSessions) {
    countsByDiscipline[s.discipline] =
      (countsByDiscipline[s.discipline] ?? 0) + 1;
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Martial Arts</h1>
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

      {/* Week navigation — lets the user browse past weeks to view/delete
          old sessions. The weekly progress panel + classes list both follow. */}
      <div className="mb-3 flex items-center justify-between p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setViewedWeekStart((w) => addDays(w, -7))}
          className="px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Previous week"
        >
          ←
        </button>
        <div className="text-sm font-semibold">
          {viewedWeekStart === startOfWeekLocal()
            ? "This week"
            : weekRangeLabel(viewedWeekStart)}
        </div>
        <button
          onClick={() => setViewedWeekStart((w) => addDays(w, 7))}
          disabled={viewedWeekStart >= startOfWeekLocal()}
          className="px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next week"
        >
          →
        </button>
      </div>

      {viewedWeekStart !== startOfWeekLocal() && (
        <button
          onClick={() => setViewedWeekStart(startOfWeekLocal())}
          className="w-full mb-3 text-xs text-green-600 dark:text-green-400 font-medium"
        >
          Back to this week
        </button>
      )}

      {/* Weekly progress panel — shows whatever week is being viewed. */}
      <section className="mb-6 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500">
            {viewedWeekStart === startOfWeekLocal()
              ? "This week"
              : weekRangeLabel(viewedWeekStart)}
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
            style={{ width: `${goalPercent}%` }}
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

      {/* Classes for the viewed week — delete buttons double as a way to
          clean up backfilled/old entries. An explicit empty-state message
          appears when you've navigated to a past week with nothing logged. */}
      {weekSessions.length === 0 && viewedWeekStart !== startOfWeekLocal() && !loadingSessions && (
        <p className="mt-8 text-sm text-zinc-500 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
          No classes logged in {weekRangeLabel(viewedWeekStart)}.
        </p>
      )}

      {weekSessions.length > 0 && (
        <section className="mt-8">
          <h3 className="text-sm font-medium text-zinc-500 mb-2">
            {viewedWeekStart === startOfWeekLocal()
              ? "This week's classes"
              : `Classes for ${weekRangeLabel(viewedWeekStart)}`}
          </h3>
          <ul className="space-y-2">
            {weekSessions.map((s) => {
              const isExpanded = expandedId === s.id;
              const hasNote = (s.notes ?? "").trim().length > 0;
              return (
                <li
                  key={s.id}
                  className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                >
                  <div className="flex items-center gap-3 p-3">
                    <button
                      onClick={() => toggleExpand(s)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      aria-expanded={isExpanded}
                      aria-label={
                        hasNote ? "Edit class notes" : "Add class notes"
                      }
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
                          {hasNote && " · 📝"}
                        </div>
                        {hasNote && !isExpanded && (
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2 whitespace-pre-wrap">
                            <NoteText text={s.notes ?? ""} />
                          </div>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-zinc-400 hover:text-red-500 text-xl px-2"
                      aria-label="Delete class"
                    >
                      ×
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                      {/* Duration input row */}
                      <div className="flex items-center gap-2 mb-2">
                        <label
                          htmlFor={`duration-${s.id}`}
                          className="text-xs text-zinc-500"
                        >
                          Duration
                        </label>
                        <input
                          id={`duration-${s.id}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={600}
                          value={durationDrafts[s.id] ?? ""}
                          onChange={(e) =>
                            setDurationDrafts((curr) => ({
                              ...curr,
                              [s.id]: e.target.value,
                            }))
                          }
                          className="w-16 text-sm px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <span className="text-xs text-zinc-500">min</span>
                      </div>
                      <textarea
                        value={noteDrafts[s.id] ?? ""}
                        onChange={(e) =>
                          setNoteDrafts((curr) => ({
                            ...curr,
                            [s.id]: e.target.value,
                          }))
                        }
                        placeholder="What did you learn? What did you struggle with? Use #tags to group topics (e.g. #guard-retention)."
                        rows={4}
                        className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => setExpandedId(null)}
                          className="text-xs px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveSession(s.id)}
                          disabled={savingNoteId === s.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-medium disabled:opacity-50"
                        >
                          {savingNoteId === s.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
