"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { todayLocal, relativeLabel } from "@/lib/date";
import ExerciseProgressChart from "@/components/ExerciseProgressChart";
import RestTimer from "@/components/RestTimer";

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
  name: "Full Body 1" | "Full Body 2";
  subtitle: string;
  exercises: ExerciseDef[];
};

const TEMPLATES: Template[] = [
  {
    name: "Full Body 1",
    subtitle: "Strength — controlled, submaximal",
    exercises: [
      { name: "Squat (or Trap Bar DL)", targetSets: 4, targetReps: "3-5" },
      { name: "Bench Press", targetSets: 3, targetReps: "4-6" },
      { name: "Chest-Supported Row", targetSets: 3, targetReps: "6-10" },
      { name: "Assisted Pull-ups", targetSets: 3, targetReps: "6-10" },
      { name: "Bulgarian Split Squat", targetSets: 3, targetReps: "6-8 ea" },
      { name: "Step-ups", targetSets: 3, targetReps: "6-10 ea", note: "bodyweight, controlled" },
      { name: "Hamstring Curls", targetSets: 3, targetReps: "8-12" },
      { name: "Deadbugs", targetSets: 3, targetReps: "8-12 ea", note: "slow, full extension" },
      { name: "Plank", targetSets: 3, targetReps: "max", unit: "sec" },
      { name: "Hip Abduction (optional)", targetSets: 2, targetReps: "12-15" },
    ],
  },
  {
    name: "Full Body 2",
    subtitle: "Power — explosive, upper-body bias",
    exercises: [
      { name: "Box Jumps", targetSets: 4, targetReps: "5-8", note: "full recovery" },
      { name: "Kettlebell Swings", targetSets: 4, targetReps: "8-12", note: "hip hinge, explosive" },
      { name: "RDL (or SLDL)", targetSets: 3, targetReps: "5-8" },
      { name: "Overhead Press", targetSets: 3, targetReps: "5-8" },
      { name: "Row (DB or cable)", targetSets: 3, targetReps: "6-10" },
      { name: "Lateral Raises", targetSets: 3, targetReps: "12-15" },
      { name: "Face Pulls / Rear Delts", targetSets: 3, targetReps: "12-15" },
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

// One row from the lift_sessions table, used for the "Recent sessions" list
// on the picker view and the edit view.
type PastSession = {
  id: string;
  date: string;
  template_name: string;
  created_at: string;
  set_count?: number;
};

// One row from the lift_sets table, used when editing an existing session.
type SavedSet = {
  id: string;
  exercise_name: string;
  set_number: number;
  weight_lb: number | null;
  reps: number | null;
};

// Shape of the edit-view state: grouped by exercise, each with editable rows.
// We reuse the same `SetInput` shape as the active-workout form so the UI
// component for a set row can be shared if we ever extract it.
type EditExerciseGroup = {
  name: string;
  sets: SetInput[];
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

  // Past lift sessions shown on the picker view. Loaded on mount.
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
  const [loadingPast, setLoadingPast] = useState(true);

  // Distinct exercise names that have at least one logged set, ordered
  // by most recent first. Drives the "Progress" section on the picker view.
  const [exerciseHistory, setExerciseHistory] = useState<string[]>([]);
  // Which exercise's chart is currently expanded in the Progress section.
  const [openExercise, setOpenExercise] = useState<string | null>(null);

  // Personal records detected in the just-finished workout. Cleared when
  // the user starts a new session or dismisses the celebration banner.
  // Each PR records the exercise, the new value, and whether it was a
  // weight PR or a reps PR (so the UI can label it correctly).
  type PR = {
    exerciseName: string;
    metric: "weight" | "reps";
    newValue: number;
    previous: number;
    unit: "lb" | "reps" | "sec";
  };
  const [newPRs, setNewPRs] = useState<PR[]>([]);

  // Edit mode: when non-null, we're editing a past session instead of
  // logging a new one. `editGroups` holds the exercise→sets structure that
  // the edit view renders.
  const [editingSession, setEditingSession] = useState<PastSession | null>(null);
  const [editGroups, setEditGroups] = useState<EditExerciseGroup[]>([]);

  // Names of exercises the user chose to skip in the current workout only.
  // A Set is used because lookup is O(1) and we don't care about order.
  // Resets every time a new template is started.
  const [hiddenExercises, setHiddenExercises] = useState<Set<string>>(new Set());

  // The date we're logging FOR. Defaults to today; user can change it
  // to back-date a workout they did earlier but forgot to log.
  const [logDate, setLogDate] = useState<string>(todayLocal());
  const isBackdating = logDate !== todayLocal();

  // Load the recent past sessions list when the picker view first mounts.
  useEffect(() => {
    loadPastSessions();
    loadExerciseHistory();
  }, []);

  // Fetch distinct exercise names across all time, ordered by most recent.
  // Supabase/PostgREST has no DISTINCT operator, so we fetch the name column
  // ordered by created_at desc and dedupe client-side using a Set. For the
  // data volumes we expect (hundreds of rows max) this is fine.
  async function loadExerciseHistory() {
    const { data, error } = await supabase
      .from("lift_sets")
      .select("exercise_name, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load exercise history:", error.message);
      return;
    }

    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of (data ?? []) as { exercise_name: string }[]) {
      if (!seen.has(row.exercise_name)) {
        seen.add(row.exercise_name);
        ordered.push(row.exercise_name);
      }
    }
    setExerciseHistory(ordered);
  }

  // Look up an exercise's `unit` from the templates so the chart knows
  // whether to label the Y axis "reps" or "sec". Returns undefined if
  // the exercise isn't in any current template (e.g. renamed/removed).
  function unitFor(exerciseName: string): "reps" | "sec" | undefined {
    for (const t of TEMPLATES) {
      const match = t.exercises.find((e) => e.name === exerciseName);
      if (match) return match.unit ?? "reps";
    }
    return undefined;
  }

  async function loadPastSessions() {
    setLoadingPast(true);
    // Fetch the 10 most recent sessions with a COUNT of their sets joined in.
    // In Supabase/PostgREST, `lift_sets(count)` in the select string tells
    // the server to return a `lift_sets` array with a single `{ count: N }`
    // row for each session — much faster than fetching every set row.
    const { data, error } = await supabase
      .from("lift_sessions")
      .select("id, date, template_name, created_at, lift_sets(count)")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Failed to load past sessions:", error.message);
      setLoadingPast(false);
      return;
    }

    // Normalize the nested count into a flat `set_count` field.
    type Row = PastSession & { lift_sets: { count: number }[] };
    const rows = (data ?? []) as Row[];
    const normalized: PastSession[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      template_name: r.template_name,
      created_at: r.created_at,
      set_count: r.lift_sets?.[0]?.count ?? 0,
    }));
    setPastSessions(normalized);
    setLoadingPast(false);
  }

  // When user picks a template, initialize empty form state for each exercise
  // and kick off a fetch of last-time data for each.
  function startTemplate(template: Template) {
    setActiveTemplate(template);
    setSuccessMsg(null);
    setErrorMsg(null);
    // Dismiss any lingering PR celebration from the previous workout.
    setNewPRs([]);
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

  // Detect PRs for the just-saved workout.
  //
  // For each exercise in the workout:
  //   1. Fetch all historical sets for that exercise, excluding the current
  //      session's rows (one query, filtered by `session_id`).
  //   2. Compute the historical max weight and max reps.
  //   3. Compute the workout's best weight and best reps.
  //   4. If the exercise has *any* history and the new best strictly beats
  //      the historical max on the "natural" metric, it's a PR.
  //        - Natural metric = weight if there's any historical or new weight.
  //        - Otherwise = reps (which covers BW exercises and Plank seconds).
  //   5. First-ever session for an exercise: no PR.
  async function detectPRs(
    currentSessionId: string,
    savedSets: {
      exercise_name: string;
      weight_lb: number | null;
      reps: number | null;
    }[]
  ): Promise<PR[]> {
    // Group new best values by exercise.
    const newBestWeight: Record<string, number> = {};
    const newBestReps: Record<string, number> = {};
    for (const s of savedSets) {
      if (s.weight_lb != null && s.weight_lb > (newBestWeight[s.exercise_name] ?? -Infinity)) {
        newBestWeight[s.exercise_name] = s.weight_lb;
      }
      if (s.reps != null && s.reps > (newBestReps[s.exercise_name] ?? -Infinity)) {
        newBestReps[s.exercise_name] = s.reps;
      }
    }

    const exercises = Array.from(
      new Set(savedSets.map((s) => s.exercise_name))
    );

    // Fetch historical data for just these exercises, excluding the current
    // session we just saved. We use `in` to batch the exercise names into
    // one query.
    const { data, error } = await supabase
      .from("lift_sets")
      .select("exercise_name, weight_lb, reps")
      .in("exercise_name", exercises)
      .neq("session_id", currentSessionId);

    if (error) {
      console.error("Failed to load history for PR check:", error.message);
      return [];
    }

    type HistRow = {
      exercise_name: string;
      weight_lb: number | null;
      reps: number | null;
    };
    const histMaxWeight: Record<string, number> = {};
    const histMaxReps: Record<string, number> = {};
    const hasHistory: Record<string, boolean> = {};
    for (const row of (data ?? []) as HistRow[]) {
      hasHistory[row.exercise_name] = true;
      if (
        row.weight_lb != null &&
        row.weight_lb > (histMaxWeight[row.exercise_name] ?? -Infinity)
      ) {
        histMaxWeight[row.exercise_name] = row.weight_lb;
      }
      if (
        row.reps != null &&
        row.reps > (histMaxReps[row.exercise_name] ?? -Infinity)
      ) {
        histMaxReps[row.exercise_name] = row.reps;
      }
    }

    const prs: PR[] = [];
    for (const name of exercises) {
      // First-ever session for this exercise → no PR (every value would
      // technically be a "record" and that's just noise).
      if (!hasHistory[name]) continue;

      // Pick the metric: if either historical or new data has a weight,
      // compare on weight. Otherwise compare on reps.
      const hasWeight =
        (histMaxWeight[name] ?? 0) > 0 || (newBestWeight[name] ?? 0) > 0;

      if (hasWeight) {
        const newMax = newBestWeight[name] ?? -Infinity;
        const prevMax = histMaxWeight[name] ?? -Infinity;
        if (newMax > prevMax && newMax > 0) {
          prs.push({
            exerciseName: name,
            metric: "weight",
            newValue: newMax,
            previous: prevMax === -Infinity ? 0 : prevMax,
            unit: "lb",
          });
        }
      } else {
        const newMax = newBestReps[name] ?? -Infinity;
        const prevMax = histMaxReps[name] ?? -Infinity;
        if (newMax > prevMax && newMax > 0) {
          // Plank stores seconds in the reps column — look up the template
          // to label correctly.
          const u = unitFor(name);
          prs.push({
            exerciseName: name,
            metric: "reps",
            newValue: newMax,
            previous: prevMax === -Infinity ? 0 : prevMax,
            unit: u === "sec" ? "sec" : "reps",
          });
        }
      }
    }

    return prs;
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

    // Check for PRs against historical data (excluding the session we
    // just saved). This runs in the background but we `await` it so the
    // success banner shows the right count before we navigate away.
    const prs = await detectPRs(sessionData.id, allSets);
    setNewPRs(prs);

    setSuccessMsg(`Saved ${allSets.length} sets 💪`);
    setSaving(false);
    // Go back to the template picker.
    setActiveTemplate(null);
    setForms({});
    // Refresh the recent-sessions list so the new workout shows up.
    loadPastSessions();
    loadExerciseHistory();
  }

  function cancelWorkout() {
    if (confirm("Cancel workout? Entered sets will be lost.")) {
      setActiveTemplate(null);
      setForms({});
      setErrorMsg(null);
    }
  }

  // ============================================================
  // EDIT PAST SESSION
  // ============================================================

  // Enter edit mode: load all saved sets for the session and group them
  // by exercise in the order they appear. Each set becomes an editable row.
  async function startEditing(session: PastSession) {
    setErrorMsg(null);
    setSuccessMsg(null);

    const { data, error } = await supabase
      .from("lift_sets")
      .select("id, exercise_name, set_number, weight_lb, reps")
      .eq("session_id", session.id)
      .order("exercise_name", { ascending: true })
      .order("set_number", { ascending: true });

    if (error) {
      setErrorMsg(`Failed to load session: ${error.message}`);
      return;
    }

    // Group sets by exercise_name. We use a Map (rather than a plain object)
    // so insertion order is preserved — exercises will render in the order
    // they first appear in the query.
    const groupsMap = new Map<string, SetInput[]>();
    for (const row of (data ?? []) as SavedSet[]) {
      const inputRow: SetInput = {
        weight: row.weight_lb != null ? String(row.weight_lb) : "",
        reps: row.reps != null ? String(row.reps) : "",
      };
      const existing = groupsMap.get(row.exercise_name);
      if (existing) {
        existing.push(inputRow);
      } else {
        groupsMap.set(row.exercise_name, [inputRow]);
      }
    }

    const groups: EditExerciseGroup[] = Array.from(groupsMap.entries()).map(
      ([name, sets]) => ({ name, sets })
    );

    setEditGroups(groups);
    setEditingSession(session);
  }

  function cancelEditing() {
    setEditingSession(null);
    setEditGroups([]);
    setErrorMsg(null);
  }

  function updateEditSet(
    exerciseIdx: number,
    setIdx: number,
    field: "weight" | "reps",
    value: string
  ) {
    setEditGroups((prev) =>
      prev.map((g, gi) =>
        gi !== exerciseIdx
          ? g
          : {
              ...g,
              sets: g.sets.map((s, si) =>
                si === setIdx ? { ...s, [field]: value } : s
              ),
            }
      )
    );
  }

  function addEditSet(exerciseIdx: number) {
    setEditGroups((prev) =>
      prev.map((g, gi) =>
        gi !== exerciseIdx
          ? g
          : { ...g, sets: [...g.sets, { weight: "", reps: "" }] }
      )
    );
  }

  function removeEditSet(exerciseIdx: number, setIdx: number) {
    setEditGroups((prev) =>
      prev.map((g, gi) =>
        gi !== exerciseIdx
          ? g
          : { ...g, sets: g.sets.filter((_, si) => si !== setIdx) }
      )
    );
  }

  // Save edits by the "nuke and replace" strategy: delete every set tied
  // to this session, then bulk-insert the edited rows. Simpler than diffing
  // individual UPDATE/INSERT/DELETE calls, and the parent `lift_sessions`
  // row is untouched so its id/date/template_name stay stable.
  async function saveEdit() {
    if (!editingSession) return;
    setSaving(true);
    setErrorMsg(null);

    // Collect non-empty sets, same filter as finishWorkout.
    const allSets: {
      session_id: string;
      exercise_name: string;
      set_number: number;
      weight_lb: number | null;
      reps: number | null;
    }[] = [];

    for (const group of editGroups) {
      group.sets.forEach((s, idx) => {
        const weight = s.weight.trim() ? parseFloat(s.weight) : null;
        const reps = s.reps.trim() ? parseInt(s.reps, 10) : null;
        if (reps !== null || weight !== null) {
          allSets.push({
            session_id: editingSession.id,
            exercise_name: group.name,
            set_number: idx + 1,
            weight_lb: weight,
            reps,
          });
        }
      });
    }

    // Step 1: delete existing sets for this session.
    const { error: deleteError } = await supabase
      .from("lift_sets")
      .delete()
      .eq("session_id", editingSession.id);

    if (deleteError) {
      setErrorMsg(`Failed to update: ${deleteError.message}`);
      setSaving(false);
      return;
    }

    // Step 2: insert the edited rows. If all rows were emptied out we skip
    // this — the session will be left with zero sets (user can delete it
    // from the list if they want it gone entirely).
    if (allSets.length > 0) {
      const { error: insertError } = await supabase
        .from("lift_sets")
        .insert(allSets);
      if (insertError) {
        setErrorMsg(`Failed to save sets: ${insertError.message}`);
        setSaving(false);
        return;
      }
    }

    setSuccessMsg(`Updated session · ${allSets.length} sets`);
    setSaving(false);
    setEditingSession(null);
    setEditGroups([]);
    // Refresh the picker list so counts and most-recent order are correct.
    loadPastSessions();
    loadExerciseHistory();
  }

  // Delete an entire session. The FK on lift_sets has ON DELETE CASCADE,
  // so removing the parent row automatically drops its sets too.
  async function deleteSession(session: PastSession) {
    if (
      !confirm(
        `Delete ${session.template_name} from ${relativeLabel(
          session.date
        )}? This can't be undone.`
      )
    ) {
      return;
    }
    // Optimistic update — remove from the list immediately.
    const previous = pastSessions;
    setPastSessions((curr) => curr.filter((s) => s.id !== session.id));

    const { error } = await supabase
      .from("lift_sessions")
      .delete()
      .eq("id", session.id);

    if (error) {
      setPastSessions(previous);
      setErrorMsg(`Failed to delete: ${error.message}`);
      return;
    }

    // If we were editing this session, bail out of edit mode too.
    if (editingSession?.id === session.id) {
      setEditingSession(null);
      setEditGroups([]);
    }
    // Refresh exercise history in case this was the only session for
    // some exercise — that exercise should disappear from Progress.
    loadExerciseHistory();
  }

  // ============================================================
  // RENDER
  // ============================================================

  // View 0: editing a past session. Takes priority over picker/active views.
  if (editingSession) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
        <header className="py-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Edit session</h1>
            <p className="text-xs text-zinc-500 mt-1">
              {editingSession.template_name} ·{" "}
              {relativeLabel(editingSession.date)}
            </p>
          </div>
          <button
            onClick={cancelEditing}
            className="text-xs text-zinc-500 underline"
          >
            Cancel
          </button>
        </header>

        {editGroups.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No sets saved for this session.
          </p>
        ) : (
          <div className="space-y-4">
            {editGroups.map((group, gi) => (
              <section
                key={group.name}
                className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              >
                <h2 className="font-semibold leading-tight">{group.name}</h2>
                <div className="mt-3 space-y-2">
                  {group.sets.map((s, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-400 w-6">
                        #{si + 1}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="lb"
                        value={s.weight}
                        onChange={(e) =>
                          updateEditSet(gi, si, "weight", e.target.value)
                        }
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm"
                      />
                      <span className="text-zinc-400 text-sm">×</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="reps"
                        value={s.reps}
                        onChange={(e) =>
                          updateEditSet(gi, si, "reps", e.target.value)
                        }
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm"
                      />
                      <button
                        onClick={() => removeEditSet(gi, si)}
                        className="text-zinc-400 hover:text-red-500 text-lg px-1"
                        aria-label="Remove set"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addEditSet(gi)}
                    className="text-xs text-green-600 dark:text-green-400 font-medium"
                  >
                    + Add set
                  </button>
                </div>
              </section>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-4 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-200 text-center text-sm">
            {errorMsg}
          </div>
        )}

        <button
          onClick={saveEdit}
          disabled={saving}
          className="mt-6 w-full py-4 rounded-2xl bg-green-600 text-white font-semibold text-lg active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>

        <button
          onClick={() => deleteSession(editingSession)}
          className="mt-3 w-full py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-medium text-sm border border-red-200 dark:border-red-900/30"
        >
          Delete entire session
        </button>

        <p className="mt-4 text-xs text-zinc-500 text-center">
          Tip: edit mode only shows exercises that already had saved sets. To
          add a new exercise, log a fresh session instead.
        </p>
      </main>
    );
  }

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

        {/* PR celebration banner — only renders if the last workout beat
            any historical records. Dismissable. */}
        {newPRs.length > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                  🏆 New PR{newPRs.length > 1 ? "s" : ""}!
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200">
                  {newPRs.map((pr) => (
                    <li key={pr.exerciseName}>
                      <span className="font-semibold">{pr.exerciseName}</span>
                      {" — "}
                      <span>
                        {pr.newValue} {pr.unit}
                      </span>
                      {pr.previous > 0 && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          {" "}
                          (was {pr.previous})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setNewPRs([])}
                className="text-amber-700 dark:text-amber-400 text-xl leading-none px-1"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
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

        {/* Recent sessions — tap to edit, × to delete */}
        <section className="mt-8">
          <h3 className="text-sm font-medium text-zinc-500 mb-2">
            Recent sessions
          </h3>
          {loadingPast && (
            <p className="text-xs text-zinc-500">Loading…</p>
          )}
          {!loadingPast && pastSessions.length === 0 && (
            <p className="text-xs text-zinc-500">No sessions logged yet.</p>
          )}
          <ul className="space-y-2">
            {pastSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              >
                <button
                  onClick={() => startEditing(s)}
                  className="flex-1 min-w-0 text-left"
                  aria-label={`Edit ${s.template_name} from ${relativeLabel(
                    s.date
                  )}`}
                >
                  <div className="text-sm font-semibold truncate">
                    🏋️ {s.template_name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {relativeLabel(s.date)} · {s.set_count ?? 0} sets
                  </div>
                </button>
                <button
                  onClick={() => deleteSession(s)}
                  className="text-zinc-400 hover:text-red-500 text-xl px-2"
                  aria-label="Delete session"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Progress — tap an exercise to see its history chart */}
        {exerciseHistory.length > 0 && (
          <section className="mt-8 mb-4">
            <h3 className="text-sm font-medium text-zinc-500 mb-2">
              Progress
            </h3>
            <ul className="space-y-2">
              {exerciseHistory.map((name) => {
                const isOpen = openExercise === name;
                return (
                  <li
                    key={name}
                    className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setOpenExercise(isOpen ? null : name)
                      }
                      className="w-full text-left p-3 flex items-center justify-between gap-3"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-semibold truncate flex-1 min-w-0">
                        {name}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {isOpen ? "Hide" : "View"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                        <ExerciseProgressChart
                          exerciseName={name}
                          unit={unitFor(name)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
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

      {/* Rest timer — sticky at the top of the scroll container.
          Tap a preset to start counting down between sets. */}
      <RestTimer />

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
