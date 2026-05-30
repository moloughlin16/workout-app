"use client";

// ============================================================
// SCHEDULE SECTION
// Embedded view of the Elevate MMA weekly class schedule, with planning
// and "I went" actions. Originally lived at /schedule as its own page;
// now embedded inside the Martial Arts page under a sub-tab.
// ============================================================

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
import IntensityPicker, {
  intensityCardClass,
  type Intensity,
} from "@/components/IntensityPicker";

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
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

type PlannedRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  class_name: string;
  discipline: string;
  intensity: Intensity | null;
};

/** Normalize "HH:MM" to "HH:MM:00" so Postgres time matching is consistent. */
function toPgTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

type Props = {
  /** Called whenever the user logs attendance, so the parent can refresh its session list. */
  onAttendanceLogged?: () => void;
};

export default function ScheduleSection({ onAttendanceLogged }: Props) {
  const [weekStart, setWeekStart] = useState<string>(startOfWeekLocal());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  async function loadPlanned() {
    setLoading(true);
    const endExclusive = addDays(weekStart, 7);
    const { data, error } = await supabase
      .from("planned_sessions")
      .select(
        "id, date, start_time, end_time, class_name, discipline, intensity"
      )
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
      setPlanned((prev) => [...prev, data as PlannedRow]);
    }
  }

  async function setPlannedIntensity(id: string, intensity: Intensity | null) {
    const previous = planned;
    setPlanned((prev) =>
      prev.map((p) => (p.id === id ? { ...p, intensity } : p))
    );
    const { error } = await supabase
      .from("planned_sessions")
      .update({ intensity })
      .eq("id", id);
    if (error) {
      console.error("Set intensity failed:", error.message);
      setErrorMsg("Couldn't update intensity.");
      setPlanned(previous);
    }
  }

  async function unplan(id: string) {
    setBusyKey(id);
    setErrorMsg(null);
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

  async function logAttendance(cls: GymClass, date: string) {
    const key = `log-${date}-${cls.start}-${cls.name}`;
    setBusyKey(key);
    setErrorMsg(null);
    setSuccessMsg(null);

    const existing = findPlanned(cls, date);

    const { error: insertErr } = await supabase
      .from("martial_arts_sessions")
      .insert({
        date,
        discipline: cls.discipline,
        duration_min: classDurationMin(cls),
        class_name: cls.name,
        start_time: toPgTime(cls.start),
        intensity: existing?.intensity ?? null,
      });

    if (insertErr) {
      console.error("Log attendance failed:", insertErr.message);
      setErrorMsg("Couldn't log that class.");
      setBusyKey(null);
      return;
    }

    if (existing) {
      await supabase.from("planned_sessions").delete().eq("id", existing.id);
      setPlanned((prev) => prev.filter((p) => p.id !== existing.id));
    }

    setSuccessMsg(`Logged: ${cls.name}`);
    setBusyKey(null);
    setTimeout(() => setSuccessMsg(null), 3000);
    onAttendanceLogged?.();
  }

  const plannedThisDay = useMemo(
    () => planned.filter((p) => p.date === selectedDate),
    [planned, selectedDate]
  );

  const plannedCountByDayIdx = useMemo(() => {
    const counts = new Array(7).fill(0);
    for (const p of planned) {
      const dayDiff = Math.round(
        (new Date(p.date).getTime() - new Date(weekStart).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (dayDiff >= 0 && dayDiff < 7) counts[dayDiff]++;
    }
    return counts;
  }, [planned, weekStart]);

  return (
    <div>
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
          className="w-full mb-3 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
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
                  ? "bg-indigo-600 text-white font-semibold"
                  : isTodayDay
                    ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 font-semibold"
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
                    isSelected ? "bg-white" : "bg-indigo-500"
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
        <div className="mb-3 p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 text-sm text-center">
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

      {loading && <p className="text-xs text-zinc-500 mb-2">Loading…</p>}

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

            const intensityTint = isPlanned
              ? intensityCardClass(isPlanned.intensity)
              : "";
            const cardClass = isPlanned
              ? intensityTint ||
                "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800";
            return (
              <li
                key={keyBase}
                className={`p-3 rounded-xl border ${cardClass}`}
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
                  {(isToday || isPast) && canLog && (
                    <button
                      onClick={() => logAttendance(cls, selectedDate)}
                      disabled={busyKey === logKey}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700"
                    >
                      {busyKey === logKey ? "…" : "✓ I went"}
                    </button>
                  )}

                  {isPlanned ? (
                    <button
                      onClick={() => unplan(isPlanned.id)}
                      disabled={busyKey === isPlanned.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50"
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

                {isPlanned && (
                  <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
                    <IntensityPicker
                      value={isPlanned.intensity}
                      onChange={(v) => setPlannedIntensity(isPlanned.id, v)}
                      label="Planned intensity"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
