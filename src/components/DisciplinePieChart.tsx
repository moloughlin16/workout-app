"use client";

import { useEffect, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { supabase } from "@/lib/supabase";

// Map each discipline to a distinct color. We reuse the same palette across
// the app (e.g. MMA always red) so the visual language stays consistent.
const DISCIPLINE_META: Record<
  string,
  { emoji: string; color: string }
> = {
  MMA: { emoji: "🥋", color: "#ef4444" }, // red
  Kickboxing: { emoji: "🥊", color: "#f97316" }, // orange
  Grappling: { emoji: "🤼", color: "#3b82f6" }, // blue
  Sparring: { emoji: "⚡", color: "#a855f7" }, // purple
};

type Row = { discipline: string; duration_min: number };

type Slice = {
  name: string;
  minutes: number;
  hours: number;
  percent: number;
  color: string;
  emoji: string;
};

export default function DisciplinePieChart() {
  const [slices, setSlices] = useState<Slice[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data, error } = await supabase
      .from("martial_arts_sessions")
      .select("discipline, duration_min");

    if (error) {
      console.error("Failed to load pie chart data:", error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Row[];

    // Sum minutes per discipline.
    const byDiscipline: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byDiscipline[r.discipline] =
        (byDiscipline[r.discipline] ?? 0) + r.duration_min;
      total += r.duration_min;
    }

    const computed: Slice[] = Object.entries(byDiscipline)
      .map(([name, minutes]) => ({
        name,
        minutes,
        hours: +(minutes / 60).toFixed(1),
        percent: total === 0 ? 0 : +((minutes / total) * 100).toFixed(0),
        color: DISCIPLINE_META[name]?.color ?? "#71717a",
        emoji: DISCIPLINE_META[name]?.emoji ?? "•",
      }))
      .sort((a, b) => b.minutes - a.minutes);

    setSlices(computed);
    setTotalMinutes(total);
    setLoading(false);
  }

  return (
    <section className="mb-6 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Discipline breakdown
        </h2>
        <span className="text-xs text-zinc-500">All time</span>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : slices.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Log a martial arts class to see your breakdown.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          {/* Pie chart on the left */}
          <div className="w-32 h-32 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="minutes"
                  nameKey="name"
                  innerRadius={28}
                  outerRadius={60}
                  strokeWidth={2}
                  stroke="var(--color-bg, #fff)"
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "none",
                    background: "#18181b",
                    color: "#fafafa",
                  }}
                  formatter={(value, name) => {
                    const minutes = typeof value === "number" ? value : 0;
                    const hours = (minutes / 60).toFixed(1);
                    return [`${hours}h`, name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend on the right — ordered by volume, with hours + percent. */}
          <ul className="flex-1 space-y-1.5 text-xs">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-shrink-0">{s.emoji}</span>
                <span className="font-medium">{s.name}</span>
                <span className="ml-auto text-zinc-500">
                  {s.hours}h · {s.percent}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalMinutes > 0 && (
        <p className="mt-3 text-xs text-zinc-400">
          Total: {(totalMinutes / 60).toFixed(1)}h across {slices.length}{" "}
          disciplines
        </p>
      )}
    </section>
  );
}
