// ============================================================
// TRAINING CONTEXT BUILDER (server-side)
// ============================================================
// Pre-aggregates the user's training history into a compact, signal-rich
// "brief" that the AI coach reads. The whole point: instead of dumping
// thousands of raw rows at Claude (expensive + noisy), we compute the
// signals a coach actually reasons about — trends, lift progression,
// fatigue indicators, note themes, and what's on the calendar next week —
// and hand over a few hundred tokens of distilled context.
//
// Pure TS (no React) so it can run inside an API route. Takes a Supabase
// client so the caller controls auth.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  startOfWeekLocal,
  weekStartFor,
  lastNWeekStarts,
  addDays,
  shortWeekLabel,
  todayLocal,
} from "@/lib/date";
import { extractTags } from "@/lib/tags";

// User goals (kept in sync with the Home dashboard scorecards).
export const WEEKLY_HOURS_GOAL = 10;
export const WEEKLY_LIFTS_GOAL = 2;
export const WEEKLY_CARDIO_GOAL_MIN = 150;

// The compound lifts worth tracking progression on (mirrors the lift page's
// TRACKED_FOR_PROGRESS set).
const TRACKED_LIFTS = [
  "Back Squat",
  "Trap Bar Deadlift",
  "Romanian Deadlift",
  "Dumbbell Bench Press",
  "Standing Overhead Press",
  "Pull-Ups or Chin-Ups",
  "Lat Pulldown",
];

const MOOD_LABELS = ["", "Drained", "Low", "Okay", "Good", "Strong"];

// Built-in fallback profile — used when the user hasn't filled in the
// editable training_profile yet. Encodes the coach's philosophy from the
// project notes so the AI always has a baseline to reason from.
const DEFAULT_PROFILE = {
  goals:
    "~10 hours/week of martial arts (MMA, kickboxing, BJJ/grappling, sparring) plus 2 strength sessions/week.",
  current_focus:
    "Build athletic lower body, shoulders/upper back/lats, and knee durability while supporting MMA/BJJ performance.",
  constraints:
    "High mat volume — recovery is the limiter. Bias lifting toward lats, upper back, side delts (plenty of pressing comes from striking).",
  available_days: "Lifts 2-3x/week around the mat schedule.",
};

export type TrainingProfile = {
  goals: string | null;
  current_focus: string | null;
  constraints: string | null;
  available_days: string | null;
};

type MaRow = {
  date: string;
  discipline: string;
  duration_min: number;
  notes: string | null;
  intensity: string | null;
};
type LiftRow = {
  id: string;
  date: string;
  template_name: string;
  mood: number | null;
  intensity: string | null;
  notes: string | null;
};
type SetRow = {
  exercise_name: string;
  weight_lb: number | null;
  reps: number | null;
  session_id: string;
  created_at: string;
};
type CardioRow = {
  date: string;
  activity: string;
  duration_min: number;
  intensity: string | null;
};

export type BuildOptions = {
  /** How many weeks of weekly-trend history to include. */
  trendWeeks?: number;
  /** Include per-lift strength progression. */
  includeProgression?: boolean;
  /** Include next week's planned classes + custom plans. */
  includeUpcoming?: boolean;
  /** Narrow the brief's framing to one discipline (e.g. "Grappling"). */
  disciplineFocus?: string;
};

/**
 * Fetch + aggregate the training history into a markdown brief string.
 */
export async function buildTrainingContext(
  supabase: SupabaseClient,
  opts: BuildOptions = {}
): Promise<string> {
  const {
    trendWeeks = 10,
    includeProgression = true,
    includeUpcoming = true,
    disciplineFocus,
  } = opts;

  const weekStarts = lastNWeekStarts(trendWeeks); // oldest → newest
  const windowStart = weekStarts[0];
  const thisMonday = startOfWeekLocal();
  const nextMonday = addDays(thisMonday, 7);
  const nextSunday = addDays(thisMonday, 14);

  // Fetch everything in parallel.
  const [
    profileRes,
    maRes,
    liftRes,
    setsRes,
    cardioRes,
    plannedRes,
    plansRes,
  ] = await Promise.all([
    supabase.from("training_profile").select("*").limit(1).maybeSingle(),
    supabase
      .from("martial_arts_sessions")
      .select("date, discipline, duration_min, notes, intensity")
      .gte("date", windowStart)
      .lt("date", nextMonday)
      .order("date", { ascending: true }),
    supabase
      .from("lift_sessions")
      .select("id, date, template_name, mood, intensity, notes")
      .gte("date", windowStart)
      .lt("date", nextMonday)
      .order("date", { ascending: true }),
    supabase
      .from("lift_sets")
      .select("exercise_name, weight_lb, reps, session_id, created_at")
      .in("exercise_name", TRACKED_LIFTS)
      .order("created_at", { ascending: true }),
    supabase
      .from("cardio_sessions")
      .select("date, activity, duration_min, intensity")
      .gte("date", windowStart)
      .lt("date", nextMonday),
    supabase
      .from("planned_sessions")
      .select("date, start_time, class_name, discipline, intensity")
      .gte("date", nextMonday)
      .lt("date", nextSunday)
      .order("date", { ascending: true }),
    supabase
      .from("weekly_plans")
      .select("date, day_part, title, intensity")
      .gte("date", nextMonday)
      .lt("date", nextSunday),
  ]);

  const profileRow = (profileRes.data ?? null) as TrainingProfile | null;
  const ma = (maRes.data ?? []) as MaRow[];
  const lifts = (liftRes.data ?? []) as LiftRow[];
  const sets = (setsRes.data ?? []) as SetRow[];
  const cardio = (cardioRes.error ? [] : cardioRes.data ?? []) as CardioRow[];

  // ── Profile block ──────────────────────────────────────────────
  const p = {
    goals: profileRow?.goals?.trim() || DEFAULT_PROFILE.goals,
    current_focus:
      profileRow?.current_focus?.trim() || DEFAULT_PROFILE.current_focus,
    constraints: profileRow?.constraints?.trim() || DEFAULT_PROFILE.constraints,
    available_days:
      profileRow?.available_days?.trim() || DEFAULT_PROFILE.available_days,
  };

  let out = "## Athlete profile\n";
  out += `- Goals: ${p.goals}\n`;
  out += `- Current focus: ${p.current_focus}\n`;
  out += `- Constraints / injuries: ${p.constraints}\n`;
  out += `- Availability: ${p.available_days}\n`;
  out += `- Weekly targets: ${WEEKLY_HOURS_GOAL}h martial arts, ${WEEKLY_LIFTS_GOAL} lifts, ${WEEKLY_CARDIO_GOAL_MIN} min cardio.\n`;
  if (disciplineFocus) out += `- (User is asking specifically about: ${disciplineFocus})\n`;
  out += "\n";

  // ── Weekly trend ───────────────────────────────────────────────
  out += `## Weekly trend (last ${trendWeeks} weeks)\n`;
  out += "Week | MA hrs | MA classes | high-intensity | lifts | cardio min | avg lift mood\n";
  for (const wk of weekStarts) {
    const wkMa = ma.filter((r) => weekStartFor(r.date) === wk);
    const wkLifts = lifts.filter((r) => weekStartFor(r.date) === wk);
    const wkCardio = cardio.filter((r) => weekStartFor(r.date) === wk);
    const hrs = wkMa.reduce((s, r) => s + r.duration_min, 0) / 60;
    const highCount =
      wkMa.filter((r) => r.intensity === "high").length +
      wkLifts.filter((r) => r.intensity === "high").length;
    const cardioMin = wkCardio.reduce((s, r) => s + r.duration_min, 0);
    const moods = wkLifts
      .map((r) => r.mood)
      .filter((m): m is number => m != null && m >= 1 && m <= 5);
    const avgMood =
      moods.length > 0
        ? (moods.reduce((s, m) => s + m, 0) / moods.length).toFixed(1)
        : "–";
    out += `${shortWeekLabel(wk)} | ${hrs.toFixed(1)} | ${wkMa.length} | ${highCount} | ${wkLifts.length} | ${cardioMin} | ${avgMood}\n`;
  }
  out += "\n";

  // ── Discipline balance over the window ─────────────────────────
  const byDiscipline = new Map<string, number>();
  for (const r of ma) {
    byDiscipline.set(
      r.discipline,
      (byDiscipline.get(r.discipline) ?? 0) + r.duration_min
    );
  }
  const totalMaMin = [...byDiscipline.values()].reduce((s, v) => s + v, 0);
  if (totalMaMin > 0) {
    out += "## Discipline balance (window total)\n";
    for (const [disc, min] of [...byDiscipline.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      const pct = Math.round((min / totalMaMin) * 100);
      out += `- ${disc}: ${(min / 60).toFixed(1)}h (${pct}%)\n`;
    }
    out += "\n";
  }

  // ── Strength progression ───────────────────────────────────────
  if (includeProgression && sets.length > 0) {
    out += "## Strength progression (tracked lifts)\n";
    for (const lift of TRACKED_LIFTS) {
      const liftSets = sets.filter((s) => s.exercise_name === lift);
      if (liftSets.length === 0) continue;
      // Top weight per session, in chronological order.
      const bySession = new Map<string, { w: number; date: string }>();
      for (const s of liftSets) {
        const w = s.weight_lb ?? 0;
        const cur = bySession.get(s.session_id);
        if (!cur || w > cur.w)
          bySession.set(s.session_id, { w, date: s.created_at });
      }
      const tops = [...bySession.values()].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      const last = tops[tops.length - 1];
      const best = Math.max(...tops.map((t) => t.w));
      // Simple trend: avg of last 2 top sets vs the 2 before that.
      let trend = "flat";
      if (tops.length >= 4) {
        const recent = (tops[tops.length - 1].w + tops[tops.length - 2].w) / 2;
        const prior = (tops[tops.length - 3].w + tops[tops.length - 4].w) / 2;
        if (recent > prior + 2) trend = "↑ rising";
        else if (recent < prior - 2) trend = "↓ dropping";
      } else if (tops.length < 2) {
        trend = "new";
      }
      const lastLabel = last.w > 0 ? `${last.w} lb` : "bodyweight";
      out += `- ${lift}: last top set ${lastLabel}, best ${best > 0 ? best + " lb" : "BW"}, ${tops.length} sessions, trend ${trend}\n`;
    }
    out += "\n";
  }

  // ── Recent note themes (last ~4 weeks) ─────────────────────────
  const noteCutoff = addDays(todayLocal(), -28);
  const recentNotes: { date: string; text: string }[] = [];
  for (const r of ma)
    if (r.notes && r.notes.trim() && r.date >= noteCutoff)
      recentNotes.push({ date: r.date, text: r.notes.trim() });
  for (const r of lifts)
    if (r.notes && r.notes.trim() && r.date >= noteCutoff)
      recentNotes.push({ date: r.date, text: r.notes.trim() });

  const tagCounts = new Map<string, number>();
  for (const n of recentNotes)
    for (const t of extractTags(n.text))
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

  if (recentNotes.length > 0) {
    out += "## Recent note themes (last 4 weeks)\n";
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (topTags.length > 0) {
      out += `Tags: ${topTags.map(([t, c]) => `#${t}(${c})`).join(", ")}\n`;
    }
    // A few representative note excerpts (most recent first), capped.
    const excerpts = recentNotes.slice(-8).reverse();
    for (const n of excerpts) {
      const short = n.text.length > 140 ? n.text.slice(0, 140) + "…" : n.text;
      out += `- ${n.date}: "${short}"\n`;
    }
    out += "\n";
  }

  // ── Upcoming week ──────────────────────────────────────────────
  if (includeUpcoming) {
    const planned = (plannedRes.data ?? []) as Array<{
      date: string;
      start_time: string | null;
      class_name: string;
      discipline: string;
      intensity: string | null;
    }>;
    const plans = (plansRes.error ? [] : plansRes.data ?? []) as Array<{
      date: string;
      day_part: string;
      title: string;
      intensity: string | null;
    }>;
    out += "## Next week (already on the calendar)\n";
    if (planned.length === 0 && plans.length === 0) {
      out += "- Nothing planned yet.\n";
    } else {
      for (const c of planned) {
        out += `- ${c.date}${c.start_time ? ` ${c.start_time.slice(0, 5)}` : ""}: ${c.class_name} (${c.discipline})${c.intensity ? ` [${c.intensity}]` : ""}\n`;
      }
      for (const pl of plans) {
        out += `- ${pl.date} (${pl.day_part}): ${pl.title}${pl.intensity ? ` [${pl.intensity}]` : ""}\n`;
      }
    }
    out += "\n";
  }

  return out.trim();
}
