// Date helpers.
// IMPORTANT: we use LOCAL time everywhere, not UTC.
// Using `new Date().toISOString()` would convert to UTC first,
// which can give the wrong day near midnight (e.g. late-night logging).

/** Returns today's date as YYYY-MM-DD in the user's local timezone. */
export function todayLocal(): string {
  return formatLocalDate(new Date());
}

/** Formats a Date as YYYY-MM-DD in the user's local timezone. */
export function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns YYYY-MM-DD for the Monday of the current real-world week. */
export function startOfWeekLocal(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return formatLocalDate(monday);
}

/**
 * Returns YYYY-MM-DD for the Monday of the week containing `dateStr`.
 * Used to bucket sessions into weeks for the weekly chart.
 */
export function weekStartFor(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return formatLocalDate(monday);
}

/**
 * Returns an array of the last N week-start dates (YYYY-MM-DD), oldest first.
 * Used to build chart data with empty-week placeholders.
 */
export function lastNWeekStarts(n: number): string[] {
  const thisWeek = startOfWeekLocal();
  const [yyyy, mm, dd] = thisWeek.split("-").map(Number);
  const base = new Date(yyyy, mm - 1, dd);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i * 7);
    out.push(formatLocalDate(d));
  }
  return out;
}

/** Short label for a week-start date, e.g. "Apr 7". */
export function shortWeekLabel(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Returns a YYYY-MM-DD date string `days` days after `dateStr`.
 * Parses `dateStr` as local midnight so it doesn't drift across time zones.
 */
export function addDays(dateStr: string, days: number): string {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

/**
 * Returns a short label for a week starting on `weekStart` (Monday),
 * e.g. "Apr 6–12" or "Apr 28–May 4". The Sunday is weekStart + 6 days.
 */
export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const finish = new Date(ey, em - 1, ed);
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  // If both dates are in the same month, drop the month from the end.
  // Otherwise show "Apr 28–May 4".
  const sameMonth = sm === em;
  const endLabel = sameMonth
    ? finish.toLocaleDateString(undefined, { day: "numeric" })
    : finish.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel}–${endLabel}`;
}

/** Format "HH:MM" or "HH:MM:SS" to "5:45pm" style. */
export function formatClockTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${m.toString().padStart(2, "0")}${suffix}`;
}

/**
 * Human-friendly label for a YYYY-MM-DD date string.
 * "Today", "Yesterday", or e.g. "Mon, Apr 7".
 */
export function relativeLabel(dateStr: string): string {
  const today = todayLocal();
  if (dateStr === today) return "Today";

  // Build "yesterday" without timezone weirdness.
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateStr === formatLocalDate(y)) return "Yesterday";

  // Otherwise show e.g. "Mon, Apr 7".
  // Parse YYYY-MM-DD as local midnight (not UTC) to avoid off-by-one display.
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
