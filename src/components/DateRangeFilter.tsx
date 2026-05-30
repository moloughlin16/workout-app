"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, todayLocal } from "@/lib/date";

// Date-range presets shown in the chip row. "all" = no filter (no start
// or end date applied to the query). Other presets are rolling windows
// from today.
export type RangePreset = "all" | "30d" | "90d" | "1y" | "custom";

/** Resolved date range. `null` means "no bound" (use the data's actual edge). */
export type DateRange = { start: string | null; end: string | null };

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "1y", label: "1y" },
  { id: "custom", label: "Custom" },
];

type Props = {
  /** Initial preset on mount. Defaults to "all". */
  initialPreset?: RangePreset;
  /** Called whenever the resolved range changes. */
  onChange: (range: DateRange) => void;
};

/**
 * Reusable date-range filter. Renders the preset chip row and (when
 * "Custom" is selected) two date inputs. Calls `onChange` with the
 * resolved range whenever the user changes anything.
 *
 * State lives inside this component — parent just listens for the range.
 */
export default function DateRangeFilter({
  initialPreset = "all",
  onChange,
}: Props) {
  const [preset, setPreset] = useState<RangePreset>(initialPreset);
  // Default custom range to "last 30 days" so picking Custom for the first
  // time gives a useful starting point instead of empty inputs.
  const [customStart, setCustomStart] = useState<string>(
    addDays(todayLocal(), -30)
  );
  const [customEnd, setCustomEnd] = useState<string>(todayLocal());

  // Keep a ref to the latest onChange to avoid the effect dep loop while
  // still calling the most recent callback.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Resolve preset + custom inputs into a concrete (start, end) pair.
  // Defined inline (not memoized) — cheap to compute, runs only when deps change.
  useEffect(() => {
    let range: DateRange;
    if (preset === "all") {
      range = { start: null, end: null };
    } else if (preset === "custom") {
      range = { start: customStart || null, end: customEnd || null };
    } else {
      const days = preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
      range = { start: addDays(todayLocal(), -days), end: todayLocal() };
    }
    onChangeRef.current(range);
  }, [preset, customStart, customEnd]);

  return (
    <div>
      {/* Preset chips — horizontally scrollable on tight screens */}
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
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

      {/* Custom range inputs — only when "Custom" is active */}
      {preset === "custom" && (
        <div className="mt-2 flex items-center gap-2">
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
    </div>
  );
}
