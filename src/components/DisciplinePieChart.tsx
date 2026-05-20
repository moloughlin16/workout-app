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
import { addDays, todayLocal } from "@/lib/date";

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

// Date-range presets shown in the filter row. "all" = no filter (earliest
// tracked date through today), the rest are rolling windows from today.
type RangePreset = "all" | "30d" | "90d" | "1y" | "custom";

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "1y", label: "1y" },
  { id: "custom", label: "Custom" },
];

export default function DisciplinePieChart() {
  const [slices, setSlices] = useState<Slice[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(0);

  // Filter state.
  const [preset, setPreset] = useState<RangePreset>("all");
  // Custom range inputs — only used when preset === "custom".
  // Default the custom-end to today and the custom-start to 30 days ago
  // so picking "Custom" gives a useful starting point.
  const [customStart, setCustomStart] = useState<string>(addDays(todayLocal(), -30));
  const [customEnd, setCustomEnd] = useState<string>(todayLocal());

  /** Resolves the current filter state to a concrete (start, end) date pair. */
  function computeRange(): { start: string | null; end: string | null } {
    if (preset === "all") return { start: null, end: null };
    if (preset === "custom") {
      return {
        start: customStart || null,
        end: customEnd || null,
      };
    }
    const days = preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
    return { start: addDays(todayLocal(), -days), end: todayLocal() };
  }

  // Re-fetch whenever the resolved range changes. We watch the preset and
  // the custom inputs directly — the resolver is pure so this is safe.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd]);

  async function loadData() {
    setLoading(true);
    const { start, end } = computeRange();
    let query = supabase
      .from("martial_arts_sessions")
      .select("discipline, duration_min, date");
    if (start) query = query.gte("date", start);
    if (end) query = query.lte("date", end);

    const { data, error } = await query;

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
      </div>

      {/* Preset filter row — horizontally scrollable on tight screens. */}
      <div className="flex gap-1 mb-3 overflow-x-auto -mx-1 px-1">
        {PRESETS.map((opt) => {
          const selected = preset === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setPreset(opt.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selected
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Custom range inputs — only expand when "Custom" is active. */}
      {preset === "custom" && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            value={customStart}
            max={customEnd || todayLocal()}
            onChange={(e) => setCustomStart(e.target.value)}
            className="flex-1 min-w-0 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5"
          />
          <span className="text-xs text-zinc-500">→</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || undefined}
            max={todayLocal()}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="flex-1 min-w-0 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5"
          />
        </div>
      )}

      {loading ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : slices.length === 0 ? (
        <p className="text-xs text-zinc-500">
          {preset === "all"
            ? "Log a martial arts class to see your breakdown."
            : "No classes logged in this range."}
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

          {/* Legend on the right — ordered by volume. */}
          <ul className="flex-1 space-y-1.5 text-xs">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-shrink-0">{s.emoji}</span>
                <span className="font-medium">{s.name}</span>
                <span className="ml-auto text-zinc-500">{s.hours}h</span>
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
