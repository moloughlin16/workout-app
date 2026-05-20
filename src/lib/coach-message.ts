// Build the "message for coach" that the user can copy+paste into Instagram.
//
// Pulls two data sets:
//   1. martial_arts_sessions from LAST week (prev Monday → prev Sunday)
//   2. planned_sessions for THIS week (current Monday → current Sunday)
//
// Formats them in the user's own shorthand style:
//
//     Last week:
//     M: mma fundamentals, kb
//     T: am no gi
//     W: no gi
//     Th: no gi, mma
//     F:
//     Sat: kb, open mat
//     Sun:
//
//     This week:
//     M: ...
//     ...
//
// Day labels: M T W Th F Sat Sun. Class names abbreviated ("kb" for
// Kickboxing, "no gi" for NoGi BJJ, etc). Morning classes are prefixed
// "am" so the coach can tell a 7:30am NoGi from an evening NoGi.

import { supabase } from "@/lib/supabase";
import { addDays, startOfWeekLocal } from "@/lib/date";

type SessionRow = {
  date: string;
  discipline: string;
  duration_min: number;
  class_name: string | null;
  start_time: string | null; // "HH:MM:SS" or null
};

type PlannedRow = {
  date: string;
  start_time: string;
  class_name: string;
  discipline: string;
};

// Mon=0 ... Sun=6, matching how groupByDay buckets things.
const DAY_LABEL = ["M", "T", "W", "Th", "F", "Sat", "Sun"];

/**
 * Convert a class name from the gym's schedule (e.g. "NoGi BJJ
 * Fundamentals") into the user's shorthand ("no gi fundamentals").
 *
 * Exact-match special cases come first, then general substitutions.
 * Anything we don't recognize just gets lowercased — coach can still read it.
 */
function abbreviateClass(name: string): string {
  const lower = name.toLowerCase().trim();

  // Exact-match overrides — these don't follow the general rules.
  const overrides: Record<string, string> = {
    "intro to mma": "mma fundamentals",
    "los lobos wrestling": "wrestling",
    "women & nonbinary open mat": "open mat",
    "ashtanga yoga": "yoga",
    "technical kickboxing sparring": "tech kb sparring",
  };
  if (overrides[lower]) return overrides[lower];

  // General lowercase abbreviations.
  return lower
    .replace(/nogi bjj/g, "no gi")
    .replace(/gi bjj/g, "gi")
    .replace(/kickboxing/g, "kb");
}

/** Fallback shorthand for a discipline when class_name is null (big-button log). */
function abbreviateDiscipline(d: string): string {
  switch (d) {
    case "MMA":
      return "mma";
    case "Kickboxing":
      return "kb";
    case "Grappling":
      return "no gi"; // user trains no-gi for grappling
    case "Sparring":
      return "sparring";
    default:
      return d.toLowerCase();
  }
}

/** Return "am " if start_time is before noon, "" otherwise. */
function morningPrefix(startTime: string | null | undefined): string {
  if (!startTime) return "";
  const hour = parseInt(startTime.split(":")[0], 10);
  return hour < 12 ? "am " : "";
}

/** Describe an attended class. Falls back to discipline when no class_name. */
function describeAttended(s: SessionRow): string {
  const name = s.class_name
    ? abbreviateClass(s.class_name)
    : abbreviateDiscipline(s.discipline);
  return `${morningPrefix(s.start_time)}${name}`;
}

/** Describe a planned class. start_time is always present in planned_sessions. */
function describePlanned(p: PlannedRow): string {
  return `${morningPrefix(p.start_time)}${abbreviateClass(p.class_name)}`;
}

/** Groups a list of dated items by day-of-week index (Mon=0 ... Sun=6). */
function groupByDay<T extends { date: string }>(
  items: T[],
  weekStart: string
): T[][] {
  const buckets: T[][] = Array.from({ length: 7 }, () => []);
  const start = new Date(weekStart + "T00:00:00");
  for (const item of items) {
    const d = new Date(item.date + "T00:00:00");
    const dayDiff = Math.round(
      (d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (dayDiff >= 0 && dayDiff < 7) buckets[dayDiff].push(item);
  }
  return buckets;
}

/** Renders the seven lines for one section (always all 7 days, even if empty). */
function renderWeek<T>(
  buckets: T[][],
  describe: (item: T) => string
): string[] {
  return buckets.map((items, i) => {
    if (items.length === 0) return `${DAY_LABEL[i]}:`;
    const summary = items.map(describe).join(", ");
    return `${DAY_LABEL[i]}: ${summary}`;
  });
}

/** Generate the full message. Returns the text, ready to paste. */
export async function buildCoachMessage(): Promise<string> {
  const thisWeek = startOfWeekLocal();
  const lastWeek = addDays(thisWeek, -7);
  const lastWeekEnd = thisWeek; // exclusive
  const thisWeekEnd = addDays(thisWeek, 7); // exclusive

  const [attendedResult, plannedResult] = await Promise.all([
    supabase
      .from("martial_arts_sessions")
      .select("date, discipline, duration_min, class_name, start_time")
      .gte("date", lastWeek)
      .lt("date", lastWeekEnd)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true }),
    supabase
      .from("planned_sessions")
      .select("date, start_time, class_name, discipline")
      .gte("date", thisWeek)
      .lt("date", thisWeekEnd)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  const attended = (attendedResult.data ?? []) as SessionRow[];
  const planned = (plannedResult.data ?? []) as PlannedRow[];

  const attendedByDay = groupByDay(attended, lastWeek);
  const plannedByDay = groupByDay(planned, thisWeek);

  const lines: string[] = [];
  lines.push("Last week:");
  lines.push(...renderWeek(attendedByDay, describeAttended));
  lines.push("");
  lines.push("This week:");
  lines.push(...renderWeek(plannedByDay, describePlanned));

  return lines.join("\n");
}
