"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { shortWeekLabel } from "@/lib/date";

type Props = {
  exerciseName: string;
  // If the exercise is time-based (e.g. Plank), we stored seconds in the
  // `reps` column. Pass `unit="sec"` so the chart labels it correctly.
  unit?: "reps" | "sec";
};

// One point on the line chart: the top set of a session for this exercise.
type Point = {
  date: string; // YYYY-MM-DD
  label: string; // "Apr 7"
  weight: number | null;
  reps: number | null;
  // The value we actually plot on the Y axis.
  value: number;
};

// Row shape from the lift_sets query.
type SetRow = {
  weight_lb: number | null;
  reps: number | null;
  created_at: string;
  session_id: string;
};

export default function ExerciseProgressChart({
  exerciseName,
  unit = "reps",
}: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  // "weight" means Y axis is pounds; "reps" means Y axis is rep/sec count.
  // Chosen automatically based on whether the exercise has any weighted sets.
  const [metric, setMetric] = useState<"weight" | "reps">("weight");

  useEffect(() => {
    loadData();
    // We intentionally ignore the eslint warning about exerciseName —
    // when it changes, we want a full reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseName]);

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase
      .from("lift_sets")
      .select("weight_lb, reps, created_at, session_id")
      .eq("exercise_name", exerciseName)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load exercise history:", error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as SetRow[];

    // Decide which metric to plot: if any row has a weight, plot weight;
    // otherwise plot reps/seconds.
    const hasWeight = rows.some((r) => (r.weight_lb ?? 0) > 0);
    const chosenMetric: "weight" | "reps" = hasWeight ? "weight" : "reps";
    setMetric(chosenMetric);

    // Group by session_id. For each session, keep the "top set" — the row
    // with the highest value of the chosen metric.
    const bySession = new Map<string, SetRow>();
    for (const row of rows) {
      const existing = bySession.get(row.session_id);
      if (!existing) {
        bySession.set(row.session_id, row);
        continue;
      }
      const cur =
        chosenMetric === "weight"
          ? (row.weight_lb ?? 0)
          : (row.reps ?? 0);
      const prev =
        chosenMetric === "weight"
          ? (existing.weight_lb ?? 0)
          : (existing.reps ?? 0);
      if (cur > prev) bySession.set(row.session_id, row);
    }

    // Turn the winning rows into plot points, sorted by date ascending.
    const ps: Point[] = Array.from(bySession.values())
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      .map((r) => {
        const dateStr = r.created_at.slice(0, 10);
        return {
          date: dateStr,
          label: shortWeekLabel(dateStr),
          weight: r.weight_lb,
          reps: r.reps,
          value:
            chosenMetric === "weight"
              ? (r.weight_lb ?? 0)
              : (r.reps ?? 0),
        };
      });

    setPoints(ps);
    setLoading(false);
  }

  const yAxisLabel =
    metric === "weight" ? "lb" : unit === "sec" ? "sec" : "reps";

  if (loading) {
    return <p className="text-xs text-zinc-500 py-2">Loading…</p>;
  }

  if (points.length === 0) {
    return (
      <p className="text-xs text-zinc-500 py-2">
        No history yet — log a set to see the chart.
      </p>
    );
  }

  // Give the chart a sensible Y-axis padding so the line isn't flush with
  // the top/bottom of the panel. Recharts' default autoscale can look too
  // tight when you only have 1-2 data points.
  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = Math.max(1, Math.round((maxVal - minVal) * 0.15));

  return (
    <div>
      <div className="h-44 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
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
              domain={[Math.max(0, minVal - pad), maxVal + pad]}
              width={34}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "none",
                background: "#18181b",
                color: "#fafafa",
              }}
              formatter={(_value, _name, item) => {
                // `item.payload` is the full Point for this tooltip row.
                const p = (item as { payload?: Point } | undefined)?.payload;
                if (!p) return ["—", "Top set"];
                const secSuffix = unit === "sec" ? " sec" : "";
                if (metric === "weight") {
                  return [
                    `${p.weight ?? "BW"} lb × ${p.reps ?? "–"}${secSuffix}`,
                    "Top set",
                  ];
                }
                return [
                  `${p.weight ? `${p.weight} lb × ` : "BW × "}${
                    p.reps ?? "–"
                  }${secSuffix}`,
                  "Top set",
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: "#3b82f6" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-zinc-500 mt-1 text-center">
        Top set per session ({yAxisLabel})
      </p>
    </div>
  );
}
