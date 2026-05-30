"use client";

import { useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import {
  addDays,
  shortWeekLabel,
  todayLocal,
  weekStartFor,
} from "@/lib/date";
import DateRangeFilter, { type DateRange } from "./DateRangeFilter";

// 10 hours/week is the user's training goal — rendered as a dashed
// horizontal reference line across the chart.
const WEEKLY_GOAL_HOURS = 10;

// When the visible range covers more than this many weeks, the chart
// auto-aggregates points by month (avg weekly hours per month) instead
// of plotting one point per week.
const MONTHLY_THRESHOLD_WEEKS = 26;

// Shape of a single point on the line chart.
type Point = {
  /** YYYY-MM-DD key used to sort / dedupe points. */
  key: string;
  /** Human-readable label rendered on the X axis. */
  label: string;
  /** Hours of training represented by this point. */
  hours: number;
};

// Minimal shape of rows we pull from Supabase.
type SessionRow = {
  date: string;
  duration_min: number;
};

/** Calendar days between two YYYY-MM-DD strings (inclusive of both ends). */
function daysBetween(start: string, end: string): number {
  const a = new Date(start + "T00:00:00").getTime();
  const b = new Date(end + "T00:00:00").getTime();
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1);
}

/** "YYYY-MM" key for a date string. */
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** "Apr" label for a "YYYY-MM" month key. */
function monthLabel(mKey: string): string {
  const [y, m] = mKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

export default function WeeklyMartialArtsChart() {
  const [points, setPoints] = useState<Point[]>([]);
  const [avgPerWeek, setAvgPerWeek] = useState<number>(0);
  const [totalHours, setTotalHours] = useState<number>(0);
  const [aggregation, setAggregation] = useState<"weekly" | "monthly">("weekly");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ start: null, end: null });

  // Re-fetch whenever the resolved range changes.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function loadData() {
    setLoading(true);

    // Build the query — apply optional start/end filters.
    let query = supabase
      .from("martial_arts_sessions")
      .select("date, duration_min");
    if (range.start) query = query.gte("date", range.start);
    if (range.end) query = query.lte("date", range.end);

    const { data, error } = await query;
    if (error) {
      console.error("Failed to load chart data:", error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SessionRow[];

    // Total minutes across the whole range (drives the scorecard).
    let totalMinutes = 0;
    for (const r of rows) totalMinutes += r.duration_min;

    // Concrete start/end for aggregation. If range is "All time" we use
    // the earliest session's date (or today as a fallback for empty data).
    const today = todayLocal();
    const earliestRow = rows
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const startDate =
      range.start ?? earliestRow?.date ?? today;
    const endDate = range.end ?? today;

    const totalDays = daysBetween(startDate, endDate);
    const weeksInRange = totalDays / 7;
    const computedAvg = totalMinutes / 60 / weeksInRange;

    setTotalHours(+(totalMinutes / 60).toFixed(1));
    setAvgPerWeek(+computedAvg.toFixed(1));

    // Choose aggregation level based on weeks in the visible range.
    const useMonthly = weeksInRange > MONTHLY_THRESHOLD_WEEKS;
    setAggregation(useMonthly ? "monthly" : "weekly");

    if (useMonthly) {
      // ── Monthly aggregation ──────────────────────────────────────
      // For each month in range, sum minutes then divide by the month's
      // own weeks-in-range to get avg weekly hours for that month.
      // (Months partially inside the range only count their visible days.)
      const monthMinutes: Record<string, number> = {};
      const monthDays: Record<string, number> = {};
      for (const r of rows) {
        const k = monthKey(r.date);
        monthMinutes[k] = (monthMinutes[k] ?? 0) + r.duration_min;
      }
      // Count days per month within [startDate, endDate].
      let cursor = startDate;
      while (cursor <= endDate) {
        const k = monthKey(cursor);
        monthDays[k] = (monthDays[k] ?? 0) + 1;
        cursor = addDays(cursor, 1);
      }
      const sortedKeys = Object.keys(monthDays).sort();
      const monthlyPoints: Point[] = sortedKeys.map((k) => {
        const minutes = monthMinutes[k] ?? 0;
        const days = monthDays[k] || 1;
        const weeks = days / 7;
        const hours = +(minutes / 60 / weeks).toFixed(1);
        return { key: k, label: monthLabel(k), hours };
      });
      setPoints(monthlyPoints);
    } else {
      // ── Weekly aggregation ───────────────────────────────────────
      // For each week-start (Monday) covered by the range, sum hours.
      const byWeek: Record<string, number> = {};
      // Initialize each week in the range to 0 so the line stays
      // continuous through gaps. Walk Monday-to-Monday from the week
      // containing startDate to the week containing endDate.
      let cursor = weekStartFor(startDate);
      const lastWeek = weekStartFor(endDate);
      while (cursor <= lastWeek) {
        byWeek[cursor] = 0;
        cursor = addDays(cursor, 7);
      }
      for (const r of rows) {
        const wk = weekStartFor(r.date);
        if (wk in byWeek) byWeek[wk] += r.duration_min;
      }
      const weeklyPoints: Point[] = Object.keys(byWeek)
        .sort()
        .map((wk) => ({
          key: wk,
          label: shortWeekLabel(wk),
          hours: +(byWeek[wk] / 60).toFixed(1),
        }));
      setPoints(weeklyPoints);
    }

    setLoading(false);
  }

  return (
    <section className="mb-6 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Training history
        </h2>
        <span className="text-xs text-zinc-500">
          {aggregation === "monthly" ? "Avg hours/week, by month" : "Hours per week"}
        </span>
      </div>

      <div className="mb-3">
        <DateRangeFilter onChange={setRange} />
      </div>

      {/* Scorecard: average weekly hours across the visible range */}
      <div className="mb-4 flex items-baseline gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-zinc-500">Avg / week</span>
          <span className="text-2xl font-bold tabular-nums">
            {avgPerWeek.toFixed(1)}h
          </span>
        </div>
        <div className="ml-auto text-right">
          <span className="block text-xs text-zinc-500">Total</span>
          <span className="text-sm font-semibold tabular-nums">
            {totalHours.toFixed(1)}h
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : points.length === 0 ? (
        <p className="text-xs text-zinc-500">No data in this range.</p>
      ) : (
        <div className="h-48 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-zinc-200 dark:text-zinc-800"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                stroke="currentColor"
                className="text-zinc-500"
                // For dense weekly data, show every other label so they don't collide.
                interval={points.length > 12 ? "preserveStartEnd" : 0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-zinc-500"
                width={28}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "none",
                  background: "#18181b",
                  color: "#fafafa",
                }}
                formatter={(value) => [`${value}h`, "Training"]}
              />
              {/* Goal reference line */}
              <ReferenceLine
                y={WEEKLY_GOAL_HOURS}
                stroke="#4f46e5"
                strokeDasharray="4 4"
                label={{
                  value: `${WEEKLY_GOAL_HOURS}h goal`,
                  position: "insideTopRight",
                  fill: "#4f46e5",
                  fontSize: 10,
                }}
              />
              {/* Soft area underneath for visual weight. */}
              <Area
                type="monotone"
                dataKey="hours"
                stroke="none"
                fill="url(#hoursGradient)"
              />
              {/* The actual line. */}
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ r: 3, fill: "#06b6d4", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
