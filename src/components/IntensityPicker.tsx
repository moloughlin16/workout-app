"use client";

// ============================================================
// INTENSITY PICKER
// Three-button selector for low / medium / high intensity.
// Stored as a string ("low" | "medium" | "high") on martial_arts_sessions
// and planned_sessions.
//
// Color semantics: emerald = chill / recovery-friendly, amber = standard
// effort, red = hard. (Red in this context means "intense" not "bad".)
// ============================================================

export type Intensity = "low" | "medium" | "high";

type Props = {
  value: Intensity | null;
  onChange: (value: Intensity | null) => void;
  /** Optional label rendered above the buttons. */
  label?: string;
};

// Single source of truth for the scale. Add a level here to add a new
// option everywhere it's used.
const SCALE: {
  value: Intensity;
  label: string;
  // Tailwind classes for the selected state (filled + readable text).
  filled: string;
  // Tailwind classes for the unselected state (subtle hint of the color).
  outline: string;
  // Dot color used for compact badges elsewhere in the app.
  dotClass: string;
}[] = [
  {
    value: "low",
    label: "Low",
    filled: "bg-emerald-600 text-white border-emerald-600",
    outline: "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
    dotClass: "bg-emerald-500",
  },
  {
    value: "medium",
    label: "Med",
    filled: "bg-amber-500 text-white border-amber-500",
    outline: "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-amber-50 dark:hover:bg-amber-950/30",
    dotClass: "bg-amber-500",
  },
  {
    value: "high",
    label: "High",
    filled: "bg-red-600 text-white border-red-600",
    outline: "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/30",
    dotClass: "bg-red-500",
  },
];

/** Tailwind dot class for a given intensity, used by badges elsewhere. */
export function intensityDotClass(value: Intensity | null | undefined): string {
  if (!value) return "";
  return SCALE.find((s) => s.value === value)?.dotClass ?? "";
}

/** Human label for a given intensity. */
export function intensityLabel(value: Intensity | null | undefined): string {
  if (!value) return "";
  return SCALE.find((s) => s.value === value)?.label ?? "";
}

export default function IntensityPicker({ value, onChange, label }: Props) {
  return (
    <div>
      <div className="text-xs font-medium text-zinc-500 mb-2">
        {label ?? "Intensity"}
        {value && (
          <span className="ml-1 text-zinc-400">· {intensityLabel(value)}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {SCALE.map((s) => {
          const selected = value === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(selected ? null : s.value)}
              aria-pressed={selected}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${
                selected ? s.filled : s.outline
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Small inline badge for showing intensity in a row. Renders nothing if null. */
export function IntensityBadge({
  value,
  className,
}: {
  value: Intensity | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  const dot = intensityDotClass(value);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${className ?? ""}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
      {intensityLabel(value)}
    </span>
  );
}
