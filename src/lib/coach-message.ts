// Build the "message for coach" that the user can copy+paste into Instagram.
//
// Pulls two data sets:
//   1. martial_arts_sessions from LAST week (prev Monday → prev Sunday)
//   2. planned_sessions for THIS week (current Monday → current Sunday)
//
// Formats them into a friendly bulleted message grouped by day.

import { supabase } from "@/lib/supabase";
import {
  addDays,
  formatClockTime,
  startOfWeekLocal,
  weekRangeLabel,
} from "@/lib/date";

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

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Describes one attended/planned class as a short string, e.g. "NoGi BJJ (5:45pm)". */
function describeAttended(s: SessionRow): string {
  const name = s.class_name ?? s.discipline;
  if (s.start_time) return `${name} (${formatClockTime(s.start_time)})`;
  return name;
}

function describePlanned(p: PlannedRow): string {
  return `${p.class_name} (${formatClockTime(p.start_time)})`;
}

/** Groups a list of dated items by the day-of-week index (Mon=0 ... Sun=6). */
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

/** Generate the full message. Returns the text, ready to paste. */
export async function buildCoachMessage(): Promise<string> {
  const thisWeek = startOfWeekLocal();
  const lastWeek = addDays(thisWeek, -7);
  const lastWeekEnd = thisWeek; // exclusive
  const thisWeekEnd = addDays(thisWeek, 7); // exclusive

  // Fetch in parallel
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

  // Sort each within its day by start_time so the bullet order makes sense.
  const attendedByDay = groupByDay(attended, lastWeek);
  const plannedByDay = groupByDay(planned, thisWeek);

  const lines: string[] = [];
  lines.push("Hey coach! Here's my week.");
  lines.push("");
  lines.push(`Last week (${weekRangeLabel(lastWeek)}):`);

  let hadAny = false;
  for (let i = 0; i < 7; i++) {
    const dayItems = attendedByDay[i];
    if (dayItems.length === 0) continue;
    hadAny = true;
    const summary = dayItems.map(describeAttended).join(", ");
    lines.push(`• ${DAY_SHORT[i]} — ${summary}`);
  }
  if (!hadAny) lines.push("• (no classes logged)");

  lines.push("");
  lines.push(`Plan for this week (${weekRangeLabel(thisWeek)}):`);

  let hadPlan = false;
  for (let i = 0; i < 7; i++) {
    const dayItems = plannedByDay[i];
    if (dayItems.length === 0) continue;
    hadPlan = true;
    const summary = dayItems.map(describePlanned).join(", ");
    lines.push(`• ${DAY_SHORT[i]} — ${summary}`);
  }
  if (!hadPlan) lines.push("• (nothing planned yet — heading to the Schedule tab now)");

  return lines.join("\n");
}
