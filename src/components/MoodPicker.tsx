"use client";

// ============================================================
// MOOD PICKER
// Five-emoji scale tapped once per workout to record how you felt.
// Stored as an integer 1-5 in lift_sessions.mood.
// ============================================================

type Mood = 1 | 2 | 3 | 4 | 5;

type Props = {
  // Currently selected value, or null when nothing is picked yet.
  value: Mood | null;
  // Called when the user taps an emoji. Pass `null` if the user taps
  // the currently-selected emoji again (acts as a deselect).
  onChange: (value: Mood | null) => void;
};

// Single source of truth for the scale. Adding/reordering emojis here
// is enough to change the picker everywhere it appears.
const SCALE: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: "😩", label: "Drained" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "💪", label: "Strong" },
];

/** Convert a 1-5 mood int to its emoji. Returns "" for null/unknown. */
export function moodEmoji(value: number | null | undefined): string {
  if (value == null) return "";
  return SCALE.find((s) => s.value === value)?.emoji ?? "";
}

/** Convert a 1-5 mood int to its English label. */
export function moodLabel(value: number | null | undefined): string {
  if (value == null) return "";
  return SCALE.find((s) => s.value === value)?.label ?? "";
}

export default function MoodPicker({ value, onChange }: Props) {
  return (
    <div>
      <div className="text-xs font-medium text-zinc-500 mb-2">
        Mood {value && (
          <span className="ml-1 text-zinc-400">· {moodLabel(value)}</span>
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
              aria-label={s.label}
              aria-pressed={selected}
              className={`flex-1 aspect-square rounded-xl text-2xl transition-all ${
                selected
                  ? "bg-indigo-500/20 border-2 border-indigo-500 scale-110"
                  : "bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              {s.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
