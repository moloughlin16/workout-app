"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { todayLocal, relativeLabel } from "@/lib/date";

// ============================================================
// TEMPLATE DEFINITIONS
// Edit these to change your lifting routine. Everything else
// in this file reads from this data structure.
// ============================================================
type ExerciseDef = {
  name: string;
  targetSets: number;
  targetReps: string; // string because ranges like "3-5" are common
  note?: string;
  // Unit for the second field. Defaults to "reps". Set to "sec" for time-based
  // holds like plank — the placeholder + history label change accordingly.
  // The DB column is still `reps` (an integer); we just relabel it in the UI.
  unit?: "reps" | "sec";
};

type Template = {
  name: "Day A" | "Day B";
  subtitle: string;
  exercises: ExerciseDef[];
};

const TEMPLATES: Template[] = [
  {
    name: "Day A",
    subtitle: "Strength — controlled, submaximal",
    exercises: [
      { name: "Squat (or Trap Bar DL)", targetSets: 4, targetReps: "3-5" },
      { name: "Bench Press", targetSets: 3, targetReps: "4-6" },
      { name: "Chest-Supported Row", targetSets: 3, targetReps: "6-10" },
      { name: "Bulgarian Split Squat", targetSets: 3, targetReps: "6-8 ea" },
      { name: "Step-ups", targetSets: 3, targetReps: "6-10 ea", note: "bodyweight, controlled" },
      { name: "Deadbugs", targetSets: 3, targetReps: "8-12 ea", note: "slow, full extension" },
      { name: "Plank", targetSets: 3, targetReps: "max", unit: "sec" },
      { name: "Hip Abduction (optional)", targetSets: 2, targetReps: "12-15" },
    ],
  },
  {
    name: "Day B",
    subtitle: "Power — explosive, upper-body bias",
    exercises: [
      { name: "Box Jumps", targetSets: 4, targetReps: "5-8", note: "full recovery" },
      { name: "Kettlebell Swings", targetSets: 4, targetReps: "8-12", note: "hip hinge, explosive" },
      { name: "RDL (or SLDL)", targetSets: 3, targetReps: "5-8" },
      { name: "Overhead Press", targetSets: 3, targetReps: "5-8" },
      { name: "Row (DB or cable)", targetSets: 3, targetReps: "6-10" },
      { name: "Lateral Raises", targetSets: 3, targetReps: "12-15" },
      { name: "Face Pulls / Rear Delts", targetSets: 3, targetReps: "12-15" },
      { name: "Hamstring Curls", targetSets: 3, targetReps: "8-12" },
      { name: "Bicep Curls (optional)", targetSets: 2, targetReps: "10-15" },
      { name: "Tricep Pushdowns (optional)", targetSets: 2, targetReps: "10-15" },
    ],
  },
];

// ============================================================
// TYPES
// ============================================================

// A single set row in the form (what the user is currently typing).
type SetInput = {
  weight: string;
  reps: string;
};

// The state for one exercise's form.
type ExerciseForm = {
  sets: SetInput[];
};

// "Last time" data fetched from the database for an exercise.
type LastTime = {
  weight_lb: number | null;
  reps: number | null;
  date: string;
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function LiftPage() {
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [forms, setForms] = useState<Record<string, ExerciseForm>>({});
  const [lastTimes, setLastTimes] = useState<Record<string, LastTime | null>>({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Names of exercises the user chose to skip in the current workout only.
  // A Set is used because lookup is O(1) and we don't care about order.
  // Resets every time a new template is started.
  const [hiddenExercises, setHiddenExercises] = useState<Set<string>>(new Set());

  // The date we're logging FOR. Defaults to today; user can change it
  // to back-date a workout they did earlier but forgot to log.
  const [logDate, setLogDate] = useState<string>(todayLocal());
  const isBackdating = logDate !== todayLocal();

  // When user picks a template, initialize empty form state for each exercise
  // and kick off a fetch of last-time data for each.
  function startTemplate(template: Template) {
    setActiveTemplate(template);
    setSuccessMsg(null);
    setErrorMsg(null);
    // Start with no exercises hidden — fresh workout, full template visible.
    setHiddenExercises(new Set());

    // Initialize the form: each exercise starts with `targetSets` empty rows.
    const initial: Record<string, ExerciseForm> = {};
    for (const ex of template.exercises) {
      initial[ex.name] = {
        sets: Array.from({ length: ex.targetSets }, () => ({ weight: "", reps: "" })),
      };
    }
    setForms(initial);

    // Fetch "last time" for each exercise in parallel.
    fetchLastTimes(template.exercises.map((e) => e.name));
  }

  // Hide one exercise from the active workout (e.g., "skip optional curls").
  // Doesn't touch the underlying TEMPLATES — next workout it'll be back.
  function hideExercise(name: string) {
    setHiddenExercises((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  }

  // Bring all skipped exercises back into view.
  function unhideAll() {
    setHiddenExercises(new Set());
  }

  async function fetchLastTimes(exerciseNames: string[]) {
    const results: Record<string, LastTime | null> = {};
    // Fire all queries in parallel with Promise.all — faster than sequential.
    await Promise.all(
      exerciseNames.map(async (name) => {
        const { data, error } = await supabase
          .from("lift_sets")
          .select("weight_lb, reps, created_at")
          .eq("exercise_name", name)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error || !data || data.length === 0) {
          results[name] = null;
        } else {
          results[name] = {
            weight_lb: data[0].weight_lb,
            reps: data[0].reps,
            date: data[0].created_at,
          };
        }
      })
    );
    setLastTimes(results);
  }

  function updateSet(exerciseName: string, setIdx: number, field: "weight" | "reps", value: string) {
    setForms((prev) => {
      const copy = { ...prev };
      const exerciseForm = { ...copy[exerciseName] };
      const newSets = exerciseForm.sets.map((s, i) =>
        i === setIdx ? { ...s, [field]: value } : s
      );
      exerciseForm.sets = newSets;
      copy[exerciseName] = exerciseForm;
      return copy;
    });
  }

  function addSet(exerciseName: string) {
    setForms((prev) => {
      const copy = { ...prev };
      const exerciseForm = { ...copy[exerciseName] };
      exerciseForm.sets = [...exerciseForm.sets, { weight: "", reps: "" }];
      copy[exerciseName] = exerciseForm;
      return copy;
    });
  }

  function removeSet(exerciseName: string, setIdx: number) {
    setForms((prev) => {
      const copy = { ...prev };
      const exerciseForm = { ...copy[exerciseName] };
      exerciseForm.sets = exerciseForm.sets.filter((_, i) => i !== setIdx);
      copy[exerciseName] = exerciseForm;
      return copy;
    });
  }

  async function finishWorkout() {
    if (!activeTemplate) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Collect all non-empty sets across all exercises.
    const allSets: {
      exercise_name: string;
      set_number: number;
      weight_lb: number | null;
      reps: number | null;
    }[] = [];

    for (const ex of activeTemplate.exercises) {
      // Skip exercises the user hid from this workout — don't save empty rows
      // for them and don't accidentally count them as part of the session.
      if (hiddenExercises.has(ex.name)) continue;
      const form = forms[ex.name];
      if (!form) continue;
      form.sets.forEach((s, idx) => {
        // Only save sets where user entered at least reps.
        const weight = s.weight.trim() ? parseFloat(s.weight) : null;
        const reps = s.reps.trim() ? parseInt(s.reps, 10) : null;
        if (reps !== null || weight !== null) {
          allSets.push({
            exercise_name: ex.name,
            set_number: idx + 1,
            weight_lb: weight,
            reps,
          });
        }
      });
    }

    if (allSets.length === 0) {
      setErrorMsg("No sets entered — nothing to save.");
      setSaving(false);
      return;
    }

    // Step 1: create the parent session row and get its ID back.
    // Pass logDate explicitly to support back-dating workouts.
    const { data: sessionData, error: sessionError } = await supabase
      .from("lift_sessions")
      .insert({ template_name: activeTemplate.name, date: logDate })
      .select()
      .single();

    if (sessionError || !sessionData) {
      setErrorMsg(`Failed to create session: ${sessionError?.message}`);
      setSaving(false);
      return;
    }

    // Step 2: insert all sets with the session_id we just got.
    const setsToInsert = allSets.map((s) => ({
      ...s,
      session_id: sessionData.id,
    }));

    const { error: setsError } = await supabase.from("lift_sets").insert(setsToInsert);

    if (setsError) {
      setErrorMsg(`Failed to save sets: ${setsError.message}`);
      setSaving(false);
      return;
    }

    setSuccessMsg(`Saved ${allSets.length} sets 💪`);
    setSaving(false);
    // Go back to the template picker.
    setActiveTemplate(null);
    setForms({});
  }

  function cancelWorkout() {
    if (confirm("Cancel workout? Entered sets will be lost.")) {
      setActiveTemplate(null);
      setForms({});
      setErrorMsg(null);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================

  // View 1: template picker (nothing active yet)
  if (!activeTemplate) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
        <header className="py-6">
          <h1 className="text-3xl font-bold">Lift</h1>
          <p className="text-sm text-zinc-500 mt-1">Pick today&apos;s workout.</p>
        </header>

        {/* Date selector — allows back-dating a workout */}
        <div
          className={`mb-4 flex items-center justify-between p-3 rounded-xl border ${
            isBackdating
              ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Logging for:</span>
            <span className="text-sm font-semibold">{relativeLabel(logDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={logDate}
              max={todayLocal()}
              onChange={(e) => setLogDate(e.target.value)}
              className="text-xs bg-transparent border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1"
            />
            {isBackdating && (
              <button
                onClick={() => setLogDate(todayLocal())}
                className="text-xs text-green-600 dark:text-green-400 font-medium"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {successMsg && (
          <div className="mb-4 p-4 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200 text-center">
            {successMsg}
          </div>
        )}

        <div className="space-y-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => startTemplate(t)}
              className="w-full text-left p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm active:scale-[0.98] transition-transform"
            >
              <div className="text-xl font-bold">{t.name}</div>
              <div className="text-sm text-zinc-500 mt-1">{t.subtitle}</div>
              <div className="text-xs text-zinc-400 mt-2">
                {t.exercises.length} exercises
              </div>
            </button>
          ))}
        </div>
      </main>
    );
  }

  // View 2: active workout
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{activeTemplate.name}</h1>
          <p className="text-xs text-zinc-500 mt-1">{activeTemplate.subtitle}</p>
          <p
            className={`text-xs mt-1 ${
              isBackdating
                ? "text-amber-600 dark:text-amber-400 font-medium"
                : "text-zinc-500"
            }`}
          >
            For {relativeLabel(logDate)}
          </p>
        </div>
        <button
          onClick={cancelWorkout}
          className="text-xs text-zinc-500 underline"
        >
          Cancel
        </button>
      </header>

      <div className="space-y-4">
        {activeTemplate.exercises
          // Drop hidden exercises before rendering. They still exist in the
          // template, just not on screen for this workout.
          .filter((ex) => !hiddenExercises.has(ex.name))
          .map((ex) => {
          const form = forms[ex.name];
          const last = lastTimes[ex.name];
          return (
            <section
              key={ex.name}
              className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold leading-tight flex-1 min-w-0">{ex.name}</h2>
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  {ex.targetSets} × {ex.targetReps}
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Skip ${ex.name} for this workout?`)) {
                      hideExercise(ex.name);
                    }
                  }}
                  className="text-zinc-400 hover:text-red-500 text-lg leading-none px-1"
                  aria-label={`Skip ${ex.name}`}
                  title="Skip this exercise"
                >
                  ×
                </button>
              </div>
              {ex.note && (
                <p className="text-xs text-zinc-500 mt-1">{ex.note}</p>
              )}
              {last ? (
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  Last: {last.weight_lb ?? "BW"} lb × {last.reps ?? "–"}{" "}
                  {ex.unit === "sec" ? "sec" : ""}
                </p>
              ) : (
                <p className="text-xs text-zinc-400 mt-1">No history yet</p>
              )}

              {/* Set input rows */}
              <div className="mt-3 space-y-2">
                {form?.sets.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-400 w-6">
                      #{idx + 1}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="lb"
                      value={s.weight}
                      onChange={(e) => updateSet(ex.name, idx, "weight", e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm"
                    />
                    <span className="text-zinc-400 text-sm">×</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={ex.unit === "sec" ? "sec" : "reps"}
                      value={s.reps}
                      onChange={(e) => updateSet(ex.name, idx, "reps", e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm"
                    />
                    <button
                      onClick={() => removeSet(ex.name, idx)}
                      className="text-zinc-400 hover:text-red-500 text-lg px-1"
                      aria-label="Remove set"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addSet(ex.name)}
                  className="text-xs text-green-600 dark:text-green-400 font-medium"
                >
                  + Add set
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {/* "Show skipped" undo strip — only renders when at least one is hidden */}
      {hiddenExercises.size > 0 && (
        <button
          onClick={unhideAll}
          className="mt-4 w-full py-2 text-xs text-zinc-500 hover:text-green-600 dark:hover:text-green-400 underline"
        >
          Show {hiddenExercises.size} skipped exercise
          {hiddenExercises.size === 1 ? "" : "s"}
        </button>
      )}

      {errorMsg && (
        <div className="mt-4 p-4 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-200 text-center text-sm">
          {errorMsg}
        </div>
      )}

      <button
        onClick={finishWorkout}
        disabled={saving}
        className="mt-6 w-full py-4 rounded-2xl bg-green-600 text-white font-semibold text-lg active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {saving ? "Saving…" : "Finish Workout"}
      </button>
    </main>
  );
}
