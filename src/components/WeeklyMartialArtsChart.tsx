"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import {
  lastNWeekStarts,
  shortWeekLabel,
  weekStartFor,
} from "@/lib/date";

// How many weeks to plot and the goal reference line value.
const WEEKS = 8;
const WEEKLY_GOAL_HOURS = 10;

// Shape of a single bar in the chart.
type WeekPoint = {
  weekStart: string; // YYYY-MM-DD
  label: string; // "Apr 7"
  hours: number;
};

// Minimal shape of the rows we need from martial_arts_sessions.
type SessionRow = {
  date: string;
  duration_min: number;
};

export default function WeeklyMartialArtsChart() {
  const [data, setData] = useState<WeekPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // We only need rows from the oldest week we'll display onward.
    const oldestWeek = lastNWeekStarts(WEEKS)[0];
    const { data: rows, error } = await supabase
      .from("martial_arts_sessions")
      .select("date, duration_min")
      .gte("date", oldestWeek);

    if (error) {
      console.error("Failed to load weekly chart data:", error.message);
      setLoading(false);
      return;
    }

    // Group minutes by week-start, filling every week (even empty ones)
    // so the chart has consistent X-axis spacing.
    const byWeek: Record<string, number> = {};
    for (const week of lastNWeekStarts(WEEKS)) {
      byWeek[week] = 0;
    }
    for (const row of (rows ?? []) as SessionRow[]) {
      const wk = weekStartFor(row.date);
      if (wk in byWeek) byWeek[wk] += row.duration_min;
    }

    const points: WeekPoint[] = lastNWeekStarts(WEEKS).map((wk) => ({
      weekStart: wk,
      label: shortWeekLabel(wk),
      hours: +(byWeek[wk] / 60).toFixed(1),
    }));

    setData(points);
    setLoading(false);
  }

  return (
    <section className="mb-6 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Training history
        </h2>
        <span className="text-xs text-zinc-500">Last {WEEKS} weeks</span>
      </div>
      {loading ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : (
        <div className="h-48 -ml-2">
          {/* ResponsiveContainer makes the chart fill whatever width its
              parent gives it — great for mobile. */}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-zinc-200 dark:text-zinc-800"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-zinc-500"
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
                stroke="#06b6d4"
                strokeDasharray="4 4"
                label={{
                  value: `${WEEKLY_GOAL_HOURS}h goal`,
                  position: "insideTopRight",
                  fill: "#06b6d4",
                  fontSize: 10,
                }}
              />
              <Bar
                dataKey="hours"
                fill="#06b6d4"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
