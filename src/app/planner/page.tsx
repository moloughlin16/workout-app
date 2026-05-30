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
import Link from "next/link";
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
import {
  GYM_SCHEDULE,
  classDurationMin,
  DISCIPLINE_COLOR,
  type DayOfWeek,
  type GymClass,
} from "@/lib/gym-schedule";

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
  // Raw fields carried through for in-planner editing (cardio + custom).
  notes?: string | null;
  startTime?: string | null;
  durationMin?: number;
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

// ── Time-of-day bucketing ───────────────────────────────────────────
// One rule, used for BOTH where an entry displays AND which classes a
// slot's picker offers — so anything you add to a slot stays in that slot.
// Boundaries match how the user mentally groups their training day:
//   morning   = before 11:00
//   afternoon = 11:00 up to (not incl.) 16:30
//   evening   = 16:30 onward
// (e.g. 10:30 Sat Kickboxing = morning, 11:00 Dutch KB = afternoon,
//  4:30pm NoGi = evening.)
const MORNING_END = "11:00"; // < this = morning
const EVENING_START = "16:30"; // >= this = evening; between the two = afternoon

/** Bucket a clock time string ("HH:MM" / "HH:MM:SS") into a day-part. */
function bucketByTime(
  time: string | null | undefined,
  fallback: DayPart = "morning"
): DayPart {
  if (!time) return fallback;
  // Compare as zero-padded "HH:MM" strings — lexicographic order matches
  // chronological order for fixed-width 24-hour times.
  const hhmm = time.slice(0, 5);
  if (!/^\d\d:\d\d$/.test(hhmm)) return fallback;
  if (hhmm < MORNING_END) return "morning";
  if (hhmm >= EVENING_START) return "evening";
  return "afternoon";
}

/** Sensible default start_time when adding from a slot (also used to pre-fill
 *  the editable time field). Each lands squarely inside its own bucket. */
function defaultStartTimeForSlot(slot: DayPart): string {
  if (slot === "morning") return "09:00";
  if (slot === "afternoon") return "13:00";
  return "18:00";
}

const DAY_NAMES: DayOfWeek[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Returns the gym-schedule DayOfWeek for a YYYY-MM-DD date string. */
function dayOfWeekFor(dateStr: string): DayOfWeek {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  return DAY_NAMES[new Date(yyyy, mm - 1, dd).getDay()];
}

/** Classes from the gym schedule that fall inside this slot — derived from
 *  the SAME bucketing rule used to display them, so a class picked from a
 *  slot always reappears in that slot, with no times falling through gaps. */
function classesForSlot(date: string, slot: DayPart): GymClass[] {
  const day = dayOfWeekFor(date);
  return GYM_SCHEDULE[day].filter((c) => bucketByTime(c.start) === slot);
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

  // MA form fields. Two modes:
  //   - Pick from this slot's Elevate classes (default; uses maSelectedClass)
  //   - Custom (free-form discipline + name + duration; via the toggle)
  const [maSelectedClass, setMaSelectedClass] = useState<GymClass | null>(
    null
  );
  const [maCustomMode, setMaCustomMode] = useState<boolean>(false);
  const [maDiscipline, setMaDiscipline] = useState<string>("MMA");
  const [maClassName, setMaClassName] = useState<string>("");
  const [maDuration, setMaDuration] = useState<string>("60");
  const [maIntensity, setMaIntensity] = useState<Intensity | null>(null);
  const [maNotes, setMaNotes] = useState<string>("");

  // Lift form fields
  const [liftTemplate, setLiftTemplate] = useState<string>("Day A");
  const [liftIntensity, setLiftIntensity] = useState<Intensity | null>(null);
  const [liftNotes, setLiftNotes] = useState<string>("");

  // Cardio form fields
  const [cardioActivity, setCardioActivity] = useState<string>("Walking");
  const [cardioDuration, setCardioDuration] = useState<string>("30");
  const [cardioTime, setCardioTime] = useState<string>("09:00");
  const [cardioIntensity, setCardioIntensity] = useState<Intensity | null>("low");
  const [cardioNotes, setCardioNotes] = useState<string>("");

  // Custom-plan form fields
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customIntensity, setCustomIntensity] = useState<Intensity | null>(null);
  const [customNotes, setCustomNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  // ── Edit-entry sheet state ──────────────────────────────────────────
  // Opened by tapping a cardio or custom card. Other sources route to their
  // own page instead (see card rendering below). Kept separate from the add
  // form so the two sheets can't clobber each other's fields.
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [eActivity, setEActivity] = useState<string>("");
  const [eDuration, setEDuration] = useState<string>("");
  const [eTime, setETime] = useState<string>("");
  const [eTitle, setETitle] = useState<string>("");
  const [eDayPart, setEDayPart] = useState<DayPart>("morning");
  const [eIntensity, setEIntensity] = useState<Intensity | null>(null);
  const [eNotes, setENotes] = useState<string>("");

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // Lock background body scroll while the add sheet is open so a finger
  // drag on the modal can't accidentally scroll the planner underneath.
  // Restoring on unmount handles the case where the user navigates away
  // mid-sheet (rare, but safer).
  useEffect(() => {
    if (!addTarget && !editEntry) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [addTarget, editEntry]);

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
        .select("id, date, template_name, start_time, intensity")
        .gte("date", weekStart)
        .lt("date", weekEnd),
      supabase
        .from("cardio_sessions")
        .select("id, date, activity, duration_min, start_time, intensity, notes")
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

    // Lifts — bucket by start_time if the planner set one; otherwise default
    // to morning (matches lifts logged from the Lift tab, which have no time).
    for (const r of (liftRes.data ?? []) as Array<{
      id: string;
      date: string;
      template_name: string;
      start_time: string | null;
      intensity: Intensity | null;
    }>) {
      out.push({
        id: `lift-${r.id}`,
        source: "lift",
        date: r.date,
        day_part: bucketByTime(r.start_time, "morning"),
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
        notes: string | null;
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
          notes: r.notes,
          startTime: r.start_time,
          durationMin: r.duration_min,
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
        notes: string | null;
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
          notes: r.notes,
        });
      }
    }

    setEntries(out);
    setLoading(false);
  }

  function openAddForm(target: AddTarget) {
    setAddTarget(target);
    setAddType("ma");
    // MA defaults — start in pick-from-list mode unless this slot has no
    // matching Elevate classes (then drop straight into custom mode).
    const available = classesForSlot(target.date, target.dayPart);
    setMaSelectedClass(null);
    setMaCustomMode(available.length === 0);
    setMaDiscipline("MMA");
    setMaClassName("");
    setMaDuration("60");
    setMaIntensity(null);
    setMaNotes("");
    // Lift defaults
    setLiftTemplate("Day A");
    setLiftIntensity(null);
    setLiftNotes("");
    // Cardio defaults
    setCardioActivity("Walking");
    setCardioDuration("30");
    setCardioTime(defaultStartTimeForSlot(target.dayPart));
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
      // MA form. Two source modes:
      //   - Pick from this slot's Elevate classes (uses the GymClass's
      //     own start/end/name/discipline; duration computed from class).
      //   - Custom (free-form discipline + duration; start_time defaults
      //     to a per-slot value).
      // Routes to planned_sessions when the date is in the future, or to
      // martial_arts_sessions for today/past (matches the Schedule tab's
      // Plan vs I-went semantics).
      let className: string;
      let discipline: string;
      let startTime: string;
      let dur: number;

      if (!maCustomMode && maSelectedClass) {
        className = maSelectedClass.name;
        discipline = maSelectedClass.discipline;
        startTime = `${maSelectedClass.start}:00`;
        dur = classDurationMin(maSelectedClass);
      } else if (maCustomMode) {
        dur = parseInt(maDuration, 10);
        if (!Number.isFinite(dur) || dur <= 0) {
          setErrorMsg("Duration must be a positive number.");
          setSubmitting(false);
          return;
        }
        className = maClassName.trim() || maDiscipline;
        discipline = maDiscipline;
        startTime = defaultStartTimeForSlot(addTarget.dayPart);
      } else {
        setErrorMsg("Pick a class or switch to Custom.");
        setSubmitting(false);
        return;
      }

      // Yoga / Open Mat use "Other" discipline — that's allowed in
      // planned_sessions but rejected by martial_arts_sessions's CHECK
      // constraint. Block logging "Other" disciplines today/past with a
      // clear error message instead of letting the DB reject it.
      const isFuture = addTarget.date > todayLocal();
      const isTrackable = ["MMA", "Kickboxing", "Grappling", "Sparring"].includes(
        discipline
      );
      if (!isFuture && !isTrackable) {
        setErrorMsg(
          `${className} isn't a trackable martial arts discipline. Plan it for a future date or add as Custom.`
        );
        setSubmitting(false);
        return;
      }

      if (isFuture) {
        // Compute end_time = start_time + dur minutes for planned_sessions.
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
          discipline,
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
          discipline,
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
        // Pre-fill start_time from the slot so the placeholder buckets back
        // into the slot the user added it to (morning/afternoon/evening).
        start_time: defaultStartTimeForSlot(addTarget.dayPart),
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
        // Editable time field, pre-filled from the tapped slot. Buckets the
        // entry back into the matching day-part on refresh.
        start_time: `${cardioTime}:00`,
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

  // ── Edit an existing cardio / custom entry ──────────────────────────
  // Tapping one of those cards opens this sheet pre-filled. (lift / MA cards
  // route to their own pages instead — see card rendering.)
  function openEditEntry(entry: Entry) {
    setEditEntry(entry);
    setEIntensity(entry.intensity);
    setENotes(entry.notes ?? "");
    if (entry.source === "cardio") {
      setEActivity(entry.title);
      setEDuration(String(entry.durationMin ?? ""));
      setETime((entry.startTime ?? "").slice(0, 5) || defaultStartTimeForSlot(entry.day_part));
    } else {
      setETitle(entry.title);
      setEDayPart(entry.day_part);
    }
  }

  function closeEditForm() {
    setEditEntry(null);
  }

  async function handleEditSubmit() {
    if (!editEntry) return;
    setSubmitting(true);
    setErrorMsg(null);
    const realId = editEntry.id.split("-").slice(1).join("-");

    if (editEntry.source === "cardio") {
      const dur = parseInt(eDuration, 10);
      if (!Number.isFinite(dur) || dur <= 0) {
        setErrorMsg("Duration must be a positive number.");
        setSubmitting(false);
        return;
      }
      const { error } = await supabase
        .from("cardio_sessions")
        .update({
          activity: eActivity.trim() || "Cardio",
          duration_min: dur,
          start_time: eTime ? `${eTime}:00` : null,
          intensity: eIntensity,
          notes: eNotes.trim() || null,
        })
        .eq("id", realId);
      if (error) {
        setErrorMsg(`Couldn't save: ${error.message}`);
        setSubmitting(false);
        return;
      }
    } else if (editEntry.source === "custom") {
      const title = eTitle.trim();
      if (!title) {
        setErrorMsg("Give the entry a title.");
        setSubmitting(false);
        return;
      }
      const { error } = await supabase
        .from("weekly_plans")
        .update({
          title,
          day_part: eDayPart,
          intensity: eIntensity,
          notes: eNotes.trim() || null,
        })
        .eq("id", realId);
      if (error) {
        setErrorMsg(`Couldn't save: ${error.message}`);
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    closeEditForm();
    loadAll();
  }

  /**
   * Delete an entry, routing to the right table by source. The confirm copy
   * is explicit that this erases the underlying record (and any notes) — the
   * old "Delete X?" wording read like "remove from this view" and made
   * accidental loss of real sessions too easy.
   */
  async function handleDelete(entry: Entry) {
    const LABEL: Record<Entry["source"], string> = {
      ma: "logged martial arts session",
      ma_planned: "planned class",
      lift: "logged lift session",
      cardio: "cardio session",
      custom: "custom plan",
    };
    const erasesNotes = entry.source === "ma" || entry.source === "lift";
    const msg = `Permanently delete this ${LABEL[entry.source]} ("${entry.title}")${
      erasesNotes ? ", including any notes and sets" : ""
    }? This can't be undone.`;
    if (!confirm(msg)) return;

    const realId = entry.id.split("-").slice(1).join("-");
    const TABLE: Record<Entry["source"], string> = {
      ma: "martial_arts_sessions",
      ma_planned: "planned_sessions",
      lift: "lift_sessions",
      cardio: "cardio_sessions",
      custom: "weekly_plans",
    };
    const table = TABLE[entry.source];

    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));

    const { error } = await supabase.from(table).delete().eq("id", realId);
    if (error) {
      console.error("Delete failed:", error.message);
      setErrorMsg(`Couldn't delete: ${error.message}`);
      setEntries(previous);
      return;
    }
    // If we were editing this entry, bail out of the sheet.
    if (editEntry?.id === entry.id) closeEditForm();
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
                          // cardio + custom edit inline; everything else
                          // routes to its own page (where deletion + full
                          // editing live behind explicit confirms).
                          const editable =
                            e.source === "cardio" || e.source === "custom";
                          const href =
                            e.source === "lift"
                              ? "/lift"
                              : e.source === "ma" || e.source === "ma_planned"
                                ? "/martial-arts"
                                : null;
                          const cls = `w-full text-left flex items-start gap-2 p-2 rounded-lg border ${cardClass} ${isPlanned ? "border-dashed" : ""} active:scale-[0.99] transition-transform`;
                          const inner = (
                            <>
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
                              <span className="text-zinc-400 text-sm flex-shrink-0 self-center">
                                ›
                              </span>
                            </>
                          );
                          return (
                            <li key={e.id}>
                              {editable ? (
                                <button
                                  onClick={() => openEditEntry(e)}
                                  className={cls}
                                >
                                  {inner}
                                </button>
                              ) : (
                                <Link href={href!} className={cls}>
                                  {inner}
                                </Link>
                              )}
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

      {/* Add-entry sheet (overlay).
          z-[60] sits above the bottom nav (z-50), so the sheet visually
          covers the tabs while it's open. Sheet itself uses a flex column
          with a scrollable middle so long forms can't push the Add button
          out of reach — only the body scrolls, not the page underneath. */}
      {addTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center"
          onClick={closeAddForm}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 sm:rounded-2xl rounded-t-2xl sm:border border-t border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col"
            style={{ maxHeight: "min(85vh, 720px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed header */}
            <div className="flex items-center justify-between p-5 pb-3 flex-shrink-0">
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

            {/* Scrollable body. overscroll-contain stops scroll chaining
                to the background page when the inner list reaches its end. */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5">

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

            {addType === "ma" && addTarget && (
              <div className="space-y-3">
                {!maCustomMode && (
                  <>
                    {/* Class list filtered by the slot's window */}
                    {(() => {
                      const available = classesForSlot(
                        addTarget.date,
                        addTarget.dayPart
                      );
                      const slotLabel =
                        DAY_PARTS.find((p) => p.id === addTarget.dayPart)
                          ?.label.toLowerCase() ?? "this slot";
                      if (available.length === 0) {
                        return (
                          <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                            No Elevate classes scheduled this {slotLabel}.
                            <button
                              onClick={() => setMaCustomMode(true)}
                              className="block mt-1.5 text-indigo-600 dark:text-indigo-400 font-medium"
                            >
                              Add a custom class instead →
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div>
                          <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                            Pick a class
                          </label>
                          <ul className="space-y-1.5">
                            {available.map((cls) => {
                              const isSelected =
                                maSelectedClass?.name === cls.name &&
                                maSelectedClass?.start === cls.start;
                              return (
                                <li key={`${cls.start}-${cls.name}`}>
                                  <button
                                    onClick={() => setMaSelectedClass(cls)}
                                    className={`w-full flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-colors ${
                                      isSelected
                                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                                    }`}
                                  >
                                    <span
                                      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${DISCIPLINE_COLOR[cls.discipline]}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-semibold truncate">
                                        {cls.name}
                                      </div>
                                      <div className="text-[11px] text-zinc-500">
                                        {cls.start}–{cls.end} ·{" "}
                                        {classDurationMin(cls)}m
                                      </div>
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })()}

                    <button
                      onClick={() => setMaCustomMode(true)}
                      className="w-full text-xs text-indigo-600 dark:text-indigo-400 font-medium py-1"
                    >
                      Or enter a custom class →
                    </button>
                  </>
                )}

                {maCustomMode && (
                  <>
                    <button
                      onClick={() => setMaCustomMode(false)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                    >
                      ← Back to class list
                    </button>
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
                    </div>
                  </>
                )}

                {addTarget.date > todayLocal() && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    Future date — will save as a planned class.
                  </p>
                )}

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
                    {["Day A", "Day B", "Day C", "Day 1", "Day 2", "Custom"].map((t) => (
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
                  <label className="text-xs font-medium text-zinc-500 ml-2">
                    Time
                  </label>
                  <input
                    type="time"
                    value={cardioTime}
                    onChange={(e) => setCardioTime(e.target.value)}
                    className="text-sm px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                  />
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

              {/* ── close the scrollable body ── */}
              <div className="h-4" />
            </div>

            {/* Pinned footer with the Add button — always reachable, even
                when the form's content is taller than the viewport. */}
            <div className="flex-shrink-0 p-5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={handleAddSubmit}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit sheet (cardio / custom). Same layout language as the add sheet. */}
      {editEntry && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center"
          onClick={closeEditForm}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-zinc-900 sm:rounded-2xl rounded-t-2xl sm:border border-t border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col"
            style={{ maxHeight: "min(85vh, 720px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 pb-3 flex-shrink-0">
              <h3 className="text-base font-bold">
                {editEntry.source === "cardio" ? "Edit cardio" : "Edit plan"}
              </h3>
              <button
                onClick={closeEditForm}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xl px-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5">
              {editEntry.source === "cardio" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                      Activity
                    </label>
                    <div className="flex gap-1 flex-wrap mb-2">
                      {CARDIO_PRESETS.map((p) => (
                        <button
                          key={p}
                          onClick={() => setEActivity(p)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            eActivity === p
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
                      value={eActivity}
                      onChange={(e) => setEActivity(e.target.value)}
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
                      value={eDuration}
                      onChange={(e) => setEDuration(e.target.value)}
                      className="w-16 text-sm px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                    />
                    <span className="text-xs text-zinc-500">min</span>
                    <label className="text-xs font-medium text-zinc-500 ml-2">
                      Time
                    </label>
                    <input
                      type="time"
                      value={eTime}
                      onChange={(e) => setETime(e.target.value)}
                      className="text-sm px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                    />
                  </div>
                  <IntensityPicker value={eIntensity} onChange={setEIntensity} />
                  <textarea
                    value={eNotes}
                    onChange={(e) => setENotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                  />
                </div>
              )}

              {editEntry.source === "custom" && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={eTitle}
                    onChange={(e) => setETitle(e.target.value)}
                    placeholder="e.g. Rest day, Stretching, Yoga…"
                    className="w-full text-sm px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                  />
                  <div>
                    <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                      When
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {DAY_PARTS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setEDayPart(p.id)}
                          className={`py-2 rounded-lg text-xs font-semibold border-2 ${
                            eDayPart === p.id
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                              : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          {p.emoji} {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <IntensityPicker value={eIntensity} onChange={setEIntensity} />
                  <textarea
                    value={eNotes}
                    onChange={(e) => setENotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                  />
                </div>
              )}
              <div className="h-4" />
            </div>

            <div className="flex-shrink-0 p-5 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
              <button
                onClick={() => handleDelete(editEntry)}
                className="py-2.5 px-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-semibold text-sm border border-red-200 dark:border-red-900/40"
              >
                Delete
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
