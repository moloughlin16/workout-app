// Save/restore the in-progress lift workout to localStorage so the user
// doesn't lose their entered sets if they close the app or it crashes.
//
// Data is stored as a JSON blob under a single key. We only persist the
// fields we'd want to restore — everything else (last-time hints,
// past-sessions list) is re-fetched on mount.
//
// A TTL keeps stale workouts from sticking around forever. If you started
// a workout 3 days ago and forgot, opening the app today shouldn't dump
// you back into that half-finished state.

const STORAGE_KEY = "liftWorkout";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export type SetInput = { weight: string; reps: string };
export type ExerciseForm = { sets: SetInput[] };

export type SavedWorkout = {
  templateName: string;
  forms: Record<string, ExerciseForm>;
  hiddenExercises: string[]; // Sets aren't JSON-serializable; store as array.
  sessionNotes: string;
  sessionMood: 1 | 2 | 3 | 4 | 5 | null;
  logDate: string;
  savedAt: number; // epoch ms
};

/** Write the current workout state. Best-effort — silently no-ops if storage is full. */
export function saveWorkout(state: Omit<SavedWorkout, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SavedWorkout = { ...state, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded or storage disabled — nothing to do */
  }
}

/**
 * Read the saved workout back. Returns null if:
 *   - nothing's saved
 *   - the saved blob is too old (>TTL_MS)
 *   - the JSON is malformed (we treat that as "no saved workout").
 */
export function loadWorkout(): SavedWorkout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedWorkout;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      // Stale — clean up so we don't pay this check again.
      clearWorkout();
      return null;
    }
    return parsed;
  } catch {
    clearWorkout();
    return null;
  }
}

/** Wipe the stored workout. Called on finish + cancel. */
export function clearWorkout(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
