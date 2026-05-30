"use client";

// ============================================================
// PLANNER PAGE
// Unified weekly view of all training activity, bucketed into
// Morning / Afternoon / Evening per day. Pulls from:
//   - martial_arts_sessions (logged) — bucketed by start_time
//   - planned_sessions (Elevate planned) — bucketed by start_time
//   - lift_sessions (logged) — default to Morning per user preference
//   - cardio_sessions (logged Zone 2) — bucketed by start_time
//   - weekly_plans (custom planned activities) — uses explicit day_part
//
// The user can add cardio sessions and custom planned activities directly
// from any day-part slot. Existing entries can be deleted from here too
// (with confirm), but edits flow back to the originating page.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  addDays,
  formatClockTime,
  startOfWeekLocal,
  todayLocal,
  weekRangeLabel,
} from "@/lib/date";
import IntensityPicker, {
  IntensityBadge,
  intensityCardClass,
  type Intensity,
} from "@/components/IntensityPicker";

type DayPart = "morning" | "afternoon" | "evening";

// Unified shape for everything that shows up in the planner. The
// `source` discriminates the underlying table — used for routing
// delete operations and for visual differentiation (planned MA classes
// get a "Planned" dashed border, etc).
type Entry = {
  id: string;
  source: "ma" | "ma_planned" | "lift" | "cardio" | "custom";
  date: string;
  day_part: DayPart;
  title: string;
  subtitle?: string;
  emoji: string;
  intensity: Intensity | null;
};

const DAYS_LABEL: { short: string; full: string }[] = [
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
  { short: "Sun", full: "Sunday" },
];

const DAY_PARTS: { id: DayPart; label: string; emoji: string }[] = [
  { id: "morning", label: "Morning", emoji: "🌅" },
  { id: "afternoon", label: "Afternoon", emoji: "🌤️" },
  { id: "evening", label: "Evening", emoji: "🌙" },
];

/** Bucket a clock time string into a day-part. Defaults to fallback when null. */
function bucketByTime(
  time: string | null | undefined,
  fallback: DayPart = "morning"
): DayPart {
  if (!time) return fallback;
  const hour = parseInt(time.split(":")[0], 10);
  if (!Number.isFinite(hour)) return fallback;
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Sensible default start_time when adding cardio from a slot. */
function defaultStartTimeForSlot(slot: DayPart): string {
  if (slot === "morning") return "09:00";
  if (slot === "afternoon") return "14:00";
  return "18:00";
}

/** Common Zone 2 cardio activities — used as quick-pick buttons. */
const CARDIO_PRESETS = ["Walking", "Jogging", "Biking"];

type AddTarget = { date: string; dayPart: DayPart };

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState<string>(startOfWeekLocal());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add-entry form state — null when no form is open.
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  // Four supported entry types. Each routes to a different table on save.
  const [addType, setAddType] = useState<"ma" | "lift" | "cardio" | "custom">(
    "ma"
  );

  // MA form fields
  const [maDiscipline, setMaDiscipline] = useState<string>("MMA");
  const [maClassName, setMaClassName] = useState<string>("");
  const [maDuration, setMaDuration] = useState<string>("60");
  const [maIntensity, setMaIntensity] = useState<Intensity | null>(null);
  const [maNotes, setMaNotes] = useState<string>("");

  // Lift form fields
  const [liftTemplate, setLiftTemplate] = useState<string>("Full Body 1");
  const [liftIntensity, setLiftIntensity] = useState<Intensity | null>(null);
  const [liftNotes, setLiftNotes] = useState<string>("");

  // Cardio form fields
  const [cardioActivity, setCardioActivity] = useState<string>("Walking");
  const [cardioDuration, setCardioDuration] = useState<string>("30");
  const [cardioIntensity, setCardioIntensity] = useState<Intensity | null>("low");
  const [cardioNotes, setCardioNotes] = useState<string>("");

  // Custom-plan form fields
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customIntensity, setCustomIntensity] = useState<Intensity | null>(null);
  const [customNotes, setCustomNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  async function loadAll() {
    setLoading(true);
    setErrorMsg(null);

    const weekEnd = addDays(weekStart, 7);

    // Fetch all 5 sources in parallel. Cardio + weekly_plans may not exist
    // yet if migrations haven't run; we tolerate errors gracefully.
    const [maRes, plannedRes, liftRes, cardioRes, plansRes] = await Promise.all([
      supabase
        .from("martial_arts_sessions")
        .select("id, date, discipline, duration_min, class_name, start_time, intensity")
        .gte("date", weekStart)
        .lt("date", weekEnd),
      supabase
        .from("planned_sessions")
        .select("id, date, start_time, class_name, discipline, intensity")
        .gte("date", weekStart)
        .lt("date", weekEnd),
      supabase
        .from("lift_sessions")
        .select("id, date, template_name, intensity")
        .gte("date", weekStart)
        .lt("date", weekEnd),
      supabase
        .from("cardio_sessions")
        .select("id, date, activity, duration_min, start_time, intensity")
        .gte("date", weekStart)
        .lt("date", weekEnd),
      supabase
        .from("weekly_plans")
        .select("id, date, day_part, title, intensity, notes")
        .gte("date", weekStart)
        .lt("date", weekEnd),
    ]);

    const out: Entry[] = [];

    // Martial arts logged
    for (const r of (maRes.data ?? []) as Array<{
      id: string;
      date: string;
      discipline: string;
      duration_min: number;
      class_name: string | null;
      start_time: string | null;
      intensity: Intensity | null;
    }>) {
      out.push({
        id: `ma-${r.id}`,
        source: "ma",
        date: r.date,
        day_part: bucketByTime(r.start_time, "evening"),
        title: r.class_name ?? r.discipline,
        subtitle: `${r.duration_min}m${r.start_time ? ` · ${formatClockTime(r.start_time)}` : ""}`,
        emoji: "🥋",
        intensity: r.intensity,
      });
    }

    // Martial arts planned
    for (const r of (plannedRes.data ?? []) as Array<{
      id: string;
      date: string;
      start_time: string;
      class_name: string;
      intensity: Intensity | null;
    }>) {
      out.push({
        id: `mp-${r.id}`,
        source: "ma_planned",
        date: r.date,
        day_part: bucketByTime(r.start_time),
        title: r.class_name,
        subtitle: `Planned · ${formatClockTime(r.start_time)}`,
        emoji: "📅",
        intensity: r.intensity,
      });
    }

    // Lifts — default to morning per user preference
    for (const r of (liftRes.data ?? []) as Array<{
      id: string;
      date: string;
      template_name: string;
      intensity: Intensity | null;
    }>) {
      out.push({
        id: `lift-${r.id}`,
        source: "lift",
        date: r.date,
        day_part: "morning",
        title: r.template_name,
        subtitle: "Lift session",
        emoji: "🏋️",
        intensity: r.intensity,
      });
    }

    // Cardio
    if (!cardioRes.error) {
      for (const r of (cardioRes.data ?? []) as Array<{
        id: string;
        date: string;
        activity: string;
        duration_min: number;
        start_time: string | null;
        intensity: Intensity | null;
      }>) {
        out.push({
          id: `cardio-${r.id}`,
          source: "cardio",
          date: r.date,
          day_part: bucketByTime(r.start_time, "morning"),
          title: r.activity,
          subtitle: `${r.duration_min}m${r.start_time ? ` · ${formatClockTime(r.start_time)}` : ""}`,
          emoji: "🚶",
          intensity: r.intensity,
        });
      }
    }

    // Custom plans
    if (!plansRes.error) {
      for (const r of (plansRes.data ?? []) as Array<{
        id: string;
        date: string;
        day_part: DayPart;
        title: string;
        intensity: Intensity | null;
      }>) {
        out.push({
          id: `plan-${r.id}`,
          source: "custom",
          date: r.date,
          day_part: r.day_part,
          title: r.title,
          subtitle: "Custom",
          emoji: "📝",
          intensity: r.intensity,
        });
      }
    }

    setEntries(out);
    setLoading(false);
  }

  function openAddForm(target: AddTarget) {
    setAddTarget(target);
    setAddType("ma");
    // MA defaults
    setMaDiscipline("MMA");
    setMaClassName("");
    setMaDuration("60");
    setMaIntensity(null);
    setMaNotes("");
    // Lift defaults
    setLiftTemplate("Full Body 1");
    setLiftIntensity(null);
    setLiftNotes("");
    // Cardio defaults
    setCardioActivity("Walking");
    setCardioDuration("30");
    setCardioIntensity("low");
    setCardioNotes("");
    // Custom defaults
    setCustomTitle("");
    setCustomIntensity(null);
    setCustomNotes("");
  }

  function closeAddForm() {
    setAddTarget(null);
  }

  async function handleAddSubmit() {
    if (!addTarget) return;
    setSubmitting(true);
    setErrorMsg(null);

    if (addType === "ma") {
      // MA form. Routes to planned_sessions for future dates, or directly
      // to martial_arts_sessions for today/past — matches the Schedule
      // tab's "Plan vs I went" semantics. Discipline is required; the
      // class_name field is optional and falls back to the discipline.
      const dur = parseInt(maDuration, 10);
      if (!Number.isFinite(dur) || dur <= 0) {
        setErrorMsg("Duration must be a positive number.");
        setSubmitting(false);
        return;
      }
      const startTime = defaultStartTimeForSlot(addTarget.dayPart);
      const className = maClassName.trim() || maDiscipline;
      const isFuture = addTarget.date > todayLocal();
      if (isFuture) {
        // Compute end_time = start_time + dur minutes for planned_sessions.
        // Hours/minutes math is small enough to inline.
        const [sh, sm] = startTime.split(":").map(Number);
        const totalMin = sh * 60 + sm + dur;
        const eh = Math.floor(totalMin / 60) % 24;
        const em = totalMin % 60;
        const endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`;
        const { error } = await supabase.from("planned_sessions").insert({
          date: addTarget.date,
          start_time: startTime,
          end_time: endTime,
          class_name: className,
          discipline: maDiscipline,
          intensity: maIntensity,
        });
        if (error) {
          console.error("Add planned MA failed:", error.message);
          setErrorMsg(`Couldn't save plan: ${error.message}`);
          setSubmitting(false);
          return;
        }
      } else {
        const { error } = await supabase.from("martial_arts_sessions").insert({
          date: addTarget.date,
          discipline: maDiscipline,
          duration_min: dur,
          class_name: className,
          start_time: startTime,
          intensity: maIntensity,
          notes: maNotes.trim() || null,
        });
        if (error) {
          console.error("Add MA log failed:", error.message);
          setErrorMsg(`Couldn't save MA session: ${error.message}`);
          setSubmitting(false);
          return;
        }
      }
    } else if (addType === "lift") {
      // Lift form. Inserts a lift_sessions row with no sets — the user
      // opens /lift and edits when they actually train. Works for past
      // (you can backfill) and future (placeholder) dates alike.
      const { error } = await supabase.from("lift_sessions").insert({
        date: addTarget.date,
        template_name: liftTemplate,
        intensity: liftIntensity,
        notes: liftNotes.trim() || null,
      });
      if (error) {
        console.error("Add lift failed:", error.message);
        setErrorMsg(`Couldn't save lift: ${error.message}`);
        setSubmitting(false);
        return;
      }
    } else if (addType === "cardio") {
      const dur = parseInt(cardioDuration, 10);
      if (!Number.isFinite(dur) || dur <= 0) {
        setErrorMsg("Duration must be a positive number.");
        setSubmitting(false);
        return;
      }
      const activityValue = cardioActivity.trim() || "Cardio";
      const { error } = await supabase.from("cardio_sessions").insert({
        date: addTarget.date,
        activity: activityValue,
        duration_min: dur,
        // Pre-fill start_time based on the slot the user tapped, so the
        // entry buckets back into the right place on refresh.
        start_time: defaultStartTimeForSlot(addTarget.dayPart),
        intensity: cardioIntensity,
        notes: cardioNotes.trim() || null,
      });
      if (error) {
        console.error("Add cardio failed:", error.message);
        setErrorMsg(`Couldn't save cardio: ${error.message}`);
        setSubmitting(false);
        return;
      }
    } else {
      // Custom
      const title = customTitle.trim();
      if (!title) {
        setErrorMsg("Give the entry a title.");
        setSubmitting(false);
        return;
      }
      const { error } = await supabase.from("weekly_plans").insert({
        date: addTarget.date,
        day_part: addTarget.dayPart,
        title,
        intensity: customIntensity,
        notes: customNotes.trim() || null,
      });
      if (error) {
        console.error("Add custom plan failed:", error.message);
        setErrorMsg(`Couldn't save plan: ${error.message}`);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    closeAddForm();
    loadAll();
  }

  /**
   * Delete an entry. Routes to the right table based on its source.
   * MA / lift entries open a confirm and only delete if confirmed — those
   * are real training records and accidental deletion would be costly.
   */
  async function handleDelete(entry: Entry) {
    const okPrompt = `Delete "${entry.title}"?`;
    if (!confirm(okPrompt)) return;

    // Strip the source prefix off the ID.
    const realId = entry.id.split("-").slice(1).join("-");

    let table = "";
    if (entry.source === "cardio") table = "cardio_sessions";
    else if (entry.source === "custom") table = "weekly_plans";
    else if (entry.source === "ma") table = "martial_arts_sessions";
    else if (entry.source === "ma_planned") table = "planned_sessions";
    else if (entry.source === "lift") table = "lift_sessions";
    if (!table) return;

    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));

    const { error } = await supabase.from(table).delete().eq("id", realId);
    if (error) {
      console.error("Delete failed:", error.message);
      setErrorMsg(`Couldn't delete: ${error.message}`);
      setEntries(previous);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto pb-24">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Planner</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Your full week — training, cardio, plans.
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
          className="w-full mb-3 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
        >
          Back to this week
        </button>
      )}

      {errorMsg && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {errorMsg}
        </div>
      )}

      {loading && <p className="text-xs text-zinc-500 mb-3">Loading…</p>}

      {/* Day cards — one per day of the week */}
      <div className="space-y-3">
        {DAYS_LABEL.map((d, idx) => {
          const date = addDays(weekStart, idx);
          const isToday = date === todayLocal();
          const dayEntries = entries.filter((e) => e.date === date);
          return (
            <section
              key={date}
              className={`rounded-2xl border ${
                isToday
                  ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-800"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <header className="px-4 pt-3 pb-2 flex items-baseline justify-between">
                <h2 className="font-bold">
                  {d.short}
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {date.split("-")[2]}
                  </span>
                </h2>
                {dayEntries.length > 0 && (
                  <span className="text-xs text-zinc-500">
                    {dayEntries.length} {dayEntries.length === 1 ? "entry" : "entries"}
                  </span>
                )}
              </header>

              {DAY_PARTS.map((part) => {
                const slotEntries = dayEntries.filter(
                  (e) => e.day_part === part.id
                );
                return (
                  <div
                    key={part.id}
                    className="px-4 py-2 border-t border-black/5 dark:border-white/5"
                  >
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-xs font-medium text-zinc-500">
                        {part.emoji} {part.label}
                      </span>
                      <button
                        onClick={() =>
                          openAddForm({ date, dayPart: part.id })
                        }
                        className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                      >
                        + Add
                      </button>
                    </div>
                    {slotEntries.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic py-1">—</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {slotEntries.map((e) => {
                          const tint = intensityCardClass(e.intensity);
                          const cardClass = tint
                            ? tint
                            : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800";
                          const isPlanned = e.source === "ma_planned";
                          return (
                            <li
                              key={e.id}
                              className={`flex items-start gap-2 p-2 rounded-lg border ${cardClass} ${isPlanned ? "border-dashed" : ""}`}
                            >
                              <span className="text-base flex-shrink-0">
                                {e.emoji}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold truncate">
                                  {e.title}
                                </div>
                                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 flex-wrap">
                                  {e.subtitle && <span>{e.subtitle}</span>}
                                  <IntensityBadge value={e.intensity} />
                                </div>
                              </div>
                              <button
                                onClick={() => handleDelete(e)}
                                className="text-zinc-400 hover:text-red-500 text-base flex-shrink-0"
                                aria-label="Delete entry"
                              >
                                ×
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {/* Add-entry sheet (overlay) */}
      {addTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={closeAddForm}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">
                Add to{" "}
                {DAY_PARTS.find((p) => p.id === addTarget.dayPart)?.label}
              </h3>
              <button
                onClick={closeAddForm}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xl px-1"
              >
                ✕
              </button>
            </div>

            {/* Type toggle — 4 options. Compact pill row. */}
            <div className="grid grid-cols-4 gap-1 mb-4 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
              {(
                [
                  { id: "ma", label: "🥋 MA" },
                  { id: "lift", label: "🏋️ Lift" },
                  { id: "cardio", label: "🚶 Cardio" },
                  { id: "custom", label: "📝 Custom" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAddType(opt.id)}
                  className={`py-2 rounded-md text-[11px] font-semibold ${
                    addType === opt.id
                      ? "bg-white dark:bg-zinc-900 shadow"
                      : "text-zinc-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {addType === "ma" && (
              <div className="space-y-3">
                {/* Discipline pills */}
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                    Discipline
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { key: "MMA", label: "🥋 MMA" },
                        { key: "Kickboxing", label: "🥊 Kickboxing" },
                        { key: "Grappling", label: "🤼 Grappling" },
                        { key: "Sparring", label: "⚡ Sparring" },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.key}
                        onClick={() => setMaDiscipline(d.key)}
                        className={`py-2 rounded-lg text-xs font-semibold border-2 ${
                          maDiscipline === d.key
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={maClassName}
                  onChange={(e) => setMaClassName(e.target.value)}
                  placeholder="Class name (optional, e.g. NoGi BJJ)"
                  className="w-full text-sm px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-zinc-500">
                    Duration
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={maDuration}
                    onChange={(e) => setMaDuration(e.target.value)}
                    className="w-16 text-sm px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                  />
                  <span className="text-xs text-zinc-500">min</span>
                  {addTarget && addTarget.date > todayLocal() && (
                    <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Will save as planned
                    </span>
                  )}
                </div>
                <IntensityPicker value={maIntensity} onChange={setMaIntensity} />
                <textarea
                  value={maNotes}
                  onChange={(e) => setMaNotes(e.target.value)}
                  placeholder="Notes (optional). Use #tags to group topics."
                  rows={2}
                  className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                />
              </div>
            )}

            {addType === "lift" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                    Template
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {["Full Body 1", "Full Body 2", "Custom"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setLiftTemplate(t)}
                        className={`py-2 rounded-lg text-xs font-semibold border-2 ${
                          liftTemplate === t
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <IntensityPicker
                  value={liftIntensity}
                  onChange={setLiftIntensity}
                />
                <textarea
                  value={liftNotes}
                  onChange={(e) => setLiftNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                />
                <p className="text-[10px] text-zinc-500">
                  Creates an empty session. Tap it in the planner or visit Lift
                  to enter sets when you train.
                </p>
              </div>
            )}

            {addType === "cardio" && (
              <div className="space-y-3">
                {/* Activity quick-picks + custom input */}
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                    Activity
                  </label>
                  <div className="flex gap-1 flex-wrap mb-2">
                    {CARDIO_PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setCardioActivity(p)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          cardioActivity === p
                            ? "bg-indigo-600 text-white"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={cardioActivity}
                    onChange={(e) => setCardioActivity(e.target.value)}
                    placeholder="or type your own…"
                    className="w-full text-sm px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-zinc-500">
                    Duration
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={cardioDuration}
                    onChange={(e) => setCardioDuration(e.target.value)}
                    className="w-16 text-sm px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                  />
                  <span className="text-xs text-zinc-500">min</span>
                </div>
                <IntensityPicker
                  value={cardioIntensity}
                  onChange={setCardioIntensity}
                />
                <textarea
                  value={cardioNotes}
                  onChange={(e) => setCardioNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                />
              </div>
            )}

            {addType === "custom" && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Rest day, Stretching, Yoga…"
                  className="w-full text-sm px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                />
                <IntensityPicker
                  value={customIntensity}
                  onChange={setCustomIntensity}
                />
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                />
              </div>
            )}

            <button
              onClick={handleAddSubmit}
              disabled={submitting}
              className="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
