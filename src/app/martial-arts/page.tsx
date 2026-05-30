"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  addDays,
  relativeLabel,
  startOfWeekLocal,
  todayLocal,
  weekRangeLabel,
  weekStartFor,
} from "@/lib/date";
import { extractTags } from "@/lib/tags";
import { buildCoachMessage } from "@/lib/coach-message";
import NoteText from "@/components/NoteText";
import IntensityPicker, {
  IntensityBadge,
  intensityCardClass,
  type Intensity,
} from "@/components/IntensityPicker";
import ScheduleSection from "@/components/ScheduleSection";
import DisciplinePieChart from "@/components/DisciplinePieChart";
import WeeklyMartialArtsChart from "@/components/WeeklyMartialArtsChart";

// The four martial arts disciplines we track.
// Must match the `check` constraint on martial_arts_sessions.discipline.
const DISCIPLINES = [
  { key: "MMA", label: "MMA", emoji: "🥋" },
  { key: "Kickboxing", label: "Kickboxing", emoji: "🥊" },
  { key: "Grappling", label: "Grappling", emoji: "🤼" },
  { key: "Sparring", label: "Sparring", emoji: "⚡" },
] as const;

const WEEKLY_HOURS_GOAL = 10;
const RECENT_NOTES_LIMIT = 5;

type Session = {
  id: string;
  date: string;
  discipline: string;
  duration_min: number;
  notes: string | null;
  intensity: Intensity | null;
  created_at: string;
};

// Sub-tabs within the Martial Arts page. Sessions is the default view
// (log + view this week's classes). Schedule embeds the Elevate gym
// schedule. Stats shows charts. Notes shows recent notes + coach msg.
type Tab = "sessions" | "schedule" | "stats" | "notes";

const TABS: { id: Tab; label: string }[] = [
  { id: "sessions", label: "Sessions" },
  { id: "schedule", label: "Schedule" },
  { id: "stats", label: "Stats" },
  { id: "notes", label: "Notes" },
];

export default function MartialArtsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("sessions");

  // ── Sessions tab state ──────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [weekSessions, setWeekSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Week being viewed in the Sessions list. Prev/next arrows scroll
  // through history; "Back to this week" jumps home.
  const [viewedWeekStart, setViewedWeekStart] = useState<string>(
    startOfWeekLocal()
  );

  // Custom-log form state. The big quick-log buttons were removed
  // (rarely used in practice — most logging happens via "I went" on
  // the Schedule tab). This form is the fallback for non-Elevate training.
  const [showCustomLog, setShowCustomLog] = useState(false);
  const [logDate, setLogDate] = useState<string>(todayLocal());
  const [logDiscipline, setLogDiscipline] = useState<string>("MMA");
  const [logDuration, setLogDuration] = useState<string>("60");
  const [logIntensity, setLogIntensity] = useState<Intensity | null>(null);
  const [logNotes, setLogNotes] = useState<string>("");

  // Editor state — same shape as before.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>(
    {}
  );
  const [intensityDrafts, setIntensityDrafts] = useState<
    Record<string, Intensity | null>
  >({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // ── Notes tab state ─────────────────────────────────────────────
  const [recentNotes, setRecentNotes] = useState<Session[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachCopied, setCoachCopied] = useState(false);

  // ── Lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    loadWeekSessions();
    loadRecentNotes();
    loadTagCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedWeekStart]);

  async function loadWeekSessions() {
    setLoadingSessions(true);
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

  // ── Custom log ──────────────────────────────────────────────────
  async function handleCustomLog() {
    setSaving(true);
    setErrorMsg(null);
    const dur = parseInt(logDuration, 10);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 600) {
      setErrorMsg("Duration must be between 1 and 600 minutes.");
      setSaving(false);
      return;
    }
    const trimmedNotes = logNotes.trim();
    const { error } = await supabase.from("martial_arts_sessions").insert({
      discipline: logDiscipline,
      date: logDate,
      duration_min: dur,
      intensity: logIntensity,
      notes: trimmedNotes.length > 0 ? trimmedNotes : null,
    });

    if (error) {
      setErrorMsg(`Failed to save: ${error.message}`);
      setSaving(false);
      return;
    }

    // Reset the form and collapse it.
    setLogNotes("");
    setLogIntensity(null);
    setShowCustomLog(false);
    setSaving(false);

    // Jump to the week containing logDate so the user sees the new entry.
    const targetWeek = weekStartFor(logDate);
    if (targetWeek === viewedWeekStart) {
      await loadWeekSessions();
    } else {
      setViewedWeekStart(targetWeek);
    }
    loadRecentNotes();
    loadTagCounts();
  }

  // ── Session row editor ──────────────────────────────────────────
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
    setIntensityDrafts((curr) => ({
      ...curr,
      [session.id]:
        curr[session.id] !== undefined ? curr[session.id] : session.intensity,
    }));
  }

  async function handleSaveSession(id: string) {
    const draft = noteDrafts[id] ?? "";
    const notesValue = draft.trim().length === 0 ? null : draft.trim();

    const durationDraft = durationDrafts[id] ?? "";
    const parsed = parseInt(durationDraft, 10);
    const currentRow = weekSessions.find((s) => s.id === id);
    const previousDuration = currentRow?.duration_min ?? 60;
    const durationValue =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 600
        ? parsed
        : previousDuration;

    const intensityValue: Intensity | null =
      id in intensityDrafts
        ? intensityDrafts[id]
        : (currentRow?.intensity ?? null);

    setSavingNoteId(id);
    setErrorMsg(null);

    const previous = weekSessions;
    setWeekSessions((curr) =>
      curr.map((s) =>
        s.id === id
          ? {
              ...s,
              notes: notesValue,
              duration_min: durationValue,
              intensity: intensityValue,
            }
          : s
      )
    );

    const { error } = await supabase
      .from("martial_arts_sessions")
      .update({
        notes: notesValue,
        duration_min: durationValue,
        intensity: intensityValue,
      })
      .eq("id", id);

    if (error) {
      setWeekSessions(previous);
      setErrorMsg(`Failed to save: ${error.message}`);
    } else {
      setExpandedId(null);
      loadRecentNotes();
      loadTagCounts();
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
    } else {
      loadRecentNotes();
      loadTagCounts();
    }
  }

  // ── Coach message ───────────────────────────────────────────────
  async function generateCoachMessage() {
    setCoachLoading(true);
    setCoachCopied(false);
    try {
      const text = await buildCoachMessage();
      setCoachMessage(text);
      try {
        await navigator.clipboard.writeText(text);
        setCoachCopied(true);
      } catch {
        /* user can select + copy manually */
      }
    } finally {
      setCoachLoading(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────
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

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 16);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Martial Arts</h1>
      </header>

      {/* Sub-tabs row. Pill-style, horizontally scrollable on tight screens. */}
      <div className="flex gap-1 mb-5 overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => {
          const selected = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                selected
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─────────────────── SESSIONS TAB ─────────────────── */}
      {activeTab === "sessions" && (
        <>
          {/* Week navigation */}
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
              className="w-full mb-3 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
            >
              Back to this week
            </button>
          )}

          {/* Weekly progress card */}
          <section className="mb-5 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
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
                className="h-full bg-cyan-500 transition-all duration-500"
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

          {/* Custom log — collapsed by default. Most logging happens via the
              Schedule tab's "I went" button, but this stays around for
              training that didn't come from an Elevate class. */}
          {!showCustomLog ? (
            <button
              onClick={() => setShowCustomLog(true)}
              className="w-full mb-4 py-2.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              + Log a custom class
            </button>
          ) : (
            <section className="mb-4 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Log a custom class</h3>
                <button
                  onClick={() => setShowCustomLog(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
              {/* Discipline */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {DISCIPLINES.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setLogDiscipline(d.key)}
                    className={`py-2 rounded-lg text-sm font-semibold border-2 ${
                      logDiscipline === d.key
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {d.emoji} {d.label}
                  </button>
                ))}
              </div>
              {/* Date + Duration */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="date"
                  value={logDate}
                  max={todayLocal()}
                  onChange={(e) => setLogDate(e.target.value)}
                  className={`text-xs bg-transparent border rounded px-2 py-1.5 ${
                    isBackdating
                      ? "border-amber-400"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={600}
                  value={logDuration}
                  onChange={(e) => setLogDuration(e.target.value)}
                  className="w-16 text-sm px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs text-zinc-500">min</span>
              </div>
              {/* Intensity */}
              <div className="mb-3">
                <IntensityPicker
                  value={logIntensity}
                  onChange={setLogIntensity}
                />
              </div>
              {/* Notes */}
              <textarea
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="Notes (optional). Use #tags to group topics."
                rows={2}
                className="w-full mb-3 text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleCustomLog}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
              >
                {saving ? "Saving…" : "Log class"}
              </button>
            </section>
          )}

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Empty state for past weeks with no logs */}
          {weekSessions.length === 0 &&
            viewedWeekStart !== startOfWeekLocal() &&
            !loadingSessions && (
              <p className="mt-2 text-sm text-zinc-500 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
                No classes logged in {weekRangeLabel(viewedWeekStart)}.
              </p>
            )}

          {/* Classes list */}
          {weekSessions.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-zinc-500 mb-2">
                {viewedWeekStart === startOfWeekLocal()
                  ? "This week's classes"
                  : `Classes for ${weekRangeLabel(viewedWeekStart)}`}
              </h3>
              <ul className="space-y-2">
                {weekSessions.map((s) => {
                  const isExpanded = expandedId === s.id;
                  const hasNote = (s.notes ?? "").trim().length > 0;
                  const tint = intensityCardClass(s.intensity);
                  const cardClass = tint
                    ? tint
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800";
                  return (
                    <li
                      key={s.id}
                      className={`rounded-xl border overflow-hidden ${cardClass}`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <button
                          onClick={() => toggleExpand(s)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          aria-expanded={isExpanded}
                        >
                          <span className="text-2xl">
                            {emojiByDiscipline[s.discipline] ?? "•"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">
                              {s.discipline}
                            </div>
                            <div className="text-xs text-zinc-500 flex items-center gap-1.5 flex-wrap">
                              <span>
                                {relativeLabel(s.date)} · {s.duration_min} min
                                {hasNote && " · 📝"}
                              </span>
                              <IntensityBadge value={s.intensity} />
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
                        <div className="px-3 pb-3 border-t border-black/10 dark:border-white/10 pt-3">
                          <div className="flex items-center gap-2 mb-3">
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
                              className="w-16 text-sm px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-zinc-500">min</span>
                          </div>
                          <div className="mb-3">
                            <IntensityPicker
                              value={
                                (intensityDrafts[s.id] !== undefined
                                  ? intensityDrafts[s.id]
                                  : s.intensity) ?? null
                              }
                              onChange={(v) =>
                                setIntensityDrafts((curr) => ({
                                  ...curr,
                                  [s.id]: v,
                                }))
                              }
                            />
                          </div>
                          <textarea
                            value={noteDrafts[s.id] ?? ""}
                            onChange={(e) =>
                              setNoteDrafts((curr) => ({
                                ...curr,
                                [s.id]: e.target.value,
                              }))
                            }
                            placeholder="What did you learn? What did you struggle with? Use #tags to group topics."
                            rows={4}
                            className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50"
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
        </>
      )}

      {/* ─────────────────── SCHEDULE TAB ─────────────────── */}
      {activeTab === "schedule" && (
        <ScheduleSection onAttendanceLogged={loadWeekSessions} />
      )}

      {/* ─────────────────── STATS TAB ─────────────────── */}
      {activeTab === "stats" && (
        <>
          <WeeklyMartialArtsChart />
          <DisciplinePieChart />
        </>
      )}

      {/* ─────────────────── NOTES TAB ─────────────────── */}
      {activeTab === "notes" && (
        <>
          {/* Coach message generator */}
          <section className="mb-4">
            {!coachMessage ? (
              <button
                onClick={generateCoachMessage}
                disabled={coachLoading}
                className="w-full py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-semibold disabled:opacity-50"
              >
                {coachLoading ? "Preparing…" : "📋 Copy message for coach"}
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">
                    📋 Message for coach
                  </h3>
                  <button
                    onClick={() => {
                      setCoachMessage(null);
                      setCoachCopied(false);
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    Dismiss
                  </button>
                </div>
                {coachCopied && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2">
                    ✓ Copied to clipboard — paste into Instagram.
                  </p>
                )}
                <textarea
                  readOnly
                  value={coachMessage}
                  rows={Math.min(12, coachMessage.split("\n").length + 1)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full text-xs font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 resize-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(coachMessage);
                        setCoachCopied(true);
                      } catch {
                        /* user can select + copy manually */
                      }
                    }}
                    className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                  >
                    {coachCopied ? "✓ Copied" : "Copy again"}
                  </button>
                  <button
                    onClick={generateCoachMessage}
                    disabled={coachLoading}
                    className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-medium"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Tags cloud */}
          {sortedTags.length > 0 && (
            <section className="mb-5">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-medium text-zinc-500">Tags</h3>
                <Link
                  href="/notes"
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                >
                  Browse all notes
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {sortedTags.map(([tag, count]) => (
                  <Link
                    key={tag}
                    href={`/notes?tag=${encodeURIComponent(tag)}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
                  >
                    <span>#{tag}</span>
                    <span className="text-indigo-600 dark:text-indigo-500">
                      {count}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recent notes */}
          <section>
            <h3 className="text-sm font-medium text-zinc-500 mb-2">
              Recent notes
            </h3>
            {recentNotes.length === 0 ? (
              <p className="text-xs text-zinc-500">No notes yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentNotes.map((s) => (
                  <li
                    key={s.id}
                    className="p-4 rounded-xl bg-white dark:bg-zinc-900 border-l-4 border-l-indigo-500 border-y border-r border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                      <span>{emojiByDiscipline[s.discipline] ?? "•"}</span>
                      <span className="font-semibold">{s.discipline}</span>
                      <span>·</span>
                      <span>{relativeLabel(s.date)}</span>
                      <IntensityBadge value={s.intensity} className="ml-auto" />
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap line-clamp-4">
                      <NoteText text={s.notes ?? ""} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
