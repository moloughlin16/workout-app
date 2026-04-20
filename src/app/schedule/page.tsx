"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  addDays,
  formatClockTime,
  relativeLabel,
  startOfWeekLocal,
  todayLocal,
  weekRangeLabel,
} from "@/lib/date";
import {
  GYM_SCHEDULE,
  type DayOfWeek,
  type GymClass,
  TRACKABLE_DISCIPLINES,
  DISCIPLINE_COLOR,
  classDurationMin,
} from "@/lib/gym-schedule";

// Day order used for the tab row and the array-index math below.
// Monday is index 0 because we treat Monday as start-of-week everywhere.
const DAYS: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DAY_SHORT: Record<DayOfWeek, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

/** Returns index 0–6 (Mon=0 ... Sun=6) for today. */
function todayDayIndex(): number {
  const d = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return d === 0 ? 6 : d - 1;
}

// Row shape returned from Supabase for `planned_sessions`.
type PlannedRow = {
  id: string;
  date: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  class_name: string;
  discipline: string;
};

/** Normalize a "HH:MM" string to "HH:MM:00" to match Postgres's time format. */
function toPgTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

export default function SchedulePage() {
  // Monday of the week we're viewing. `addDays(weekStart, 7)` jumps to next week.
  const [weekStart, setWeekStart] = useState<string>(startOfWeekLocal());

  // Default-select today when we're on the current week; otherwise Monday.
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() =>
    todayDayIndex()
  );

  const [planned, setPlanned] = useState<PlannedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedDay = DAYS[selectedDayIdx];
  const selectedDate = addDays(weekStart, selectedDayIdx);
  const classes = GYM_SCHEDULE[selectedDay];
  const today = todayLocal();

  useEffect(() => {
    loadPlanned();
  }, [weekStart]);

  async function loadPlanned() {
    setLoading(true);
    const endExclusive = addDays(weekStart, 7);
    const { data, error } = await supabase
      .from("planned_sessions")
      .select("id, date, start_time, end_time, class_name, discipline")
      .gte("date", weekStart)
      .lt("date", endExclusive)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) {
      console.error("Failed to load planned sessions:", error.message);
      setErrorMsg("Couldn't load planned sessions.");
      setLoading(false);
      return;
    }
    setPlanned((data ?? []) as PlannedRow[]);
    setLoading(false);
  }

  /** Returns the planned_sessions row matching this class on this date, if any. */
  function findPlanned(cls: GymClass, date: string): PlannedRow | null {
    const wanted = toPgTime(cls.start);
    return (
      planned.find(
        (p) =>
          p.date === date &&
          p.start_time === wanted &&
          p.class_name === cls.name
      ) ?? null
    );
  }

  async function plan(cls: GymClass, date: string) {
    const key = `${date}-${cls.start}-${cls.name}`;
    setBusyKey(key);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("planned_sessions")
      .insert({
        date,
        start_time: toPgTime(cls.start),
        end_time: toPgTime(cls.end),
        class_name: cls.name,
        discipline: cls.discipline,
      })
      .select()
      .single();
    setBusyKey(null);
    if (error) {
      console.error("Plan failed:", error.message);
      setErrorMsg("Couldn't plan that class.");
      return;
    }
    if (data) {
      // Prepend to local state so the UI updates without another round trip.
      setPlanned((prev) => [...prev, data as PlannedRow]);
    }
  }

  async function unplan(id: string) {
    setBusyKey(id);
    setErrorMsg(null);
    // Optimistic update: drop the row from UI immediately, roll back on error.
    const previous = planned;
    setPlanned((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase
      .from("planned_sessions")
      .delete()
      .eq("id", id);
    setBusyKey(null);
    if (error) {
      console.error("Unplan failed:", error.message);
      setErrorMsg("Couldn't remove that plan.");
      setPlanned(previous);
    }
  }

  /**
   * "I went" — insert a martial_arts_sessions row for this class, and if the
   * class was planned, delete the planned_sessions row (so it doesn't double
   * up). Only available for trackable disciplines; the UI hides the button
   * for yoga/open mat.
   */
  async function logAttendance(cls: GymClass, date: string) {
    const key = `log-${date}-${cls.start}-${cls.name}`;
    setBusyKey(key);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { error: insertErr } = await supabase
      .from("martial_arts_sessions")
      .insert({
        date,
        discipline: cls.discipline,
        duration_min: classDurationMin(cls),
        class_name: cls.name,
        start_time: toPgTime(cls.start),
      });

    if (insertErr) {
      console.error("Log attendance failed:", insertErr.message);
      setErrorMsg("Couldn't log that class.");
      setBusyKey(null);
      return;
    }

    // If the class was planned, clear the plan so the coach message and
    // "This week's plan" strip reflect reality.
    const existing = findPlanned(cls, date);
    if (existing) {
      await supabase.from("planned_sessions").delete().eq("id", existing.id);
      setPlanned((prev) => prev.filter((p) => p.id !== existing.id));
    }

    setSuccessMsg(`Logged: ${cls.name}`);
    setBusyKey(null);
    // Clear the success message after a few seconds.
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  // Totals shown in the day header: "3 planned, 1 attended"
  const plannedThisDay = useMemo(
    () => planned.filter((p) => p.date === selectedDate),
    [planned, selectedDate]
  );

  const plannedCountByDayIdx = useMemo(() => {
    const counts = new Array(7).fill(0);
    for (const p of planned) {
      // Count dates relative to weekStart
      const dayDiff = Math.round(
        (new Date(p.date).getTime() - new Date(weekStart).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (dayDiff >= 0 && dayDiff < 7) counts[dayDiff]++;
    }
    return counts;
  }, [planned, weekStart]);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto pb-24">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Schedule</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Elevate MMA — plan your classes.
        </p>
      </header>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3 p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Previous week"
        >
          ←
        </button>
        <div className="text-sm font-semibold">{weekRangeLabel(weekStart)}</div>
        <button
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="px-3 py-1.5 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Next week"
        >
          →
        </button>
      </div>

      {weekStart !== startOfWeekLocal() && (
        <button
          onClick={() => setWeekStart(startOfWeekLocal())}
          className="w-full mb-3 text-xs text-green-600 dark:text-green-400 font-medium"
        >
          Back to this week
        </button>
      )}

      {/* Day tabs */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {DAYS.map((day, idx) => {
          const date = addDays(weekStart, idx);
          const isSelected = idx === selectedDayIdx;
          const isTodayDay = date === today;
          const count = plannedCountByDayIdx[idx];
          return (
            <button
              key={day}
              onClick={() => setSelectedDayIdx(idx)}
              className={`flex flex-col items-center py-2 rounded-lg text-xs transition-colors ${
                isSelected
                  ? "bg-green-600 text-white font-semibold"
                  : isTodayDay
                    ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 font-semibold"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span>{DAY_SHORT[day]}</span>
              <span
                className={`text-sm font-bold mt-0.5 ${
                  isSelected ? "text-white" : ""
                }`}
              >
                {date.split("-")[2]}
              </span>
              {count > 0 && (
                <span
                  className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${
                    isSelected ? "bg-white" : "bg-green-500"
                  }`}
                  aria-label={`${count} planned`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Feedback banners */}
      {successMsg && (
        <div className="mb-3 p-3 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200 text-sm text-center">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Day header */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{relativeLabel(selectedDate)}</h2>
        <span className="text-xs text-zinc-500">
          {plannedThisDay.length > 0
            ? `${plannedThisDay.length} planned`
            : classes.length === 0
              ? "No classes"
              : `${classes.length} classes`}
        </span>
      </div>

      {loading && (
        <p className="text-xs text-zinc-500 mb-2">Loading…</p>
      )}

      {/* Class list for the selected day */}
      {classes.length === 0 ? (
        <p className="text-sm text-zinc-500 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          No classes scheduled on {DAY_SHORT[selectedDay]}.
        </p>
      ) : (
        <ul className="space-y-2">
          {classes.map((cls) => {
            const isPlanned = findPlanned(cls, selectedDate);
            const isPast = selectedDate < today;
            const isToday = selectedDate === today;
            const canLog = TRACKABLE_DISCIPLINES.has(cls.discipline);
            const keyBase = `${selectedDate}-${cls.start}-${cls.name}`;
            const planKey = keyBase;
            const logKey = `log-${keyBase}`;
            const duration = classDurationMin(cls);
            const durationLabel =
              duration < 60
                ? `${duration}m`
                : duration % 60 === 0
                  ? `${duration / 60}h`
                  : `${Math.floor(duration / 60)}h ${duration % 60}m`;

            return (
              <li
                key={keyBase}
                className={`p-3 rounded-xl border ${
                  isPlanned
                    ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${DISCIPLINE_COLOR[cls.discipline]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-tight truncate">
                      {cls.name}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {formatClockTime(cls.start)} · {durationLabel}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 justify-end">
                  {/* "I went" button — only for today/past and trackable disciplines. */}
                  {(isToday || isPast) && canLog && (
                    <button
                      onClick={() => logAttendance(cls, selectedDate)}
                      disabled={busyKey === logKey}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
                    >
                      {busyKey === logKey ? "…" : "✓ I went"}
                    </button>
                  )}

                  {/* Plan / Unplan */}
                  {isPlanned ? (
                    <button
                      onClick={() => unplan(isPlanned.id)}
                      disabled={busyKey === isPlanned.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-green-700 dark:text-green-300 border border-green-300 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 disabled:opacity-50"
                    >
                      ✓ Planned · Remove
                    </button>
                  ) : !isPast ? (
                    <button
                      onClick={() => plan(cls, selectedDate)}
                      disabled={busyKey === planKey}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {busyKey === planKey ? "…" : "+ Plan"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-xs text-zinc-400">
        Tap a class to plan it, or tap &quot;I went&quot; after attending.
      </p>
    </main>
  );
}
