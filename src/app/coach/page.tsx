"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { startOfWeekLocal, addDays } from "@/lib/date";

// ── Plan section parsing ──────────────────────────────────────────────
// The game-plan prompt asks Claude for four fixed headers. We split on any
// markdown header and render each chunk as a card. If parsing finds none
// (model drifted), we fall back to showing the raw text so nothing is lost.
const SECTION_EMOJI: Record<string, string> = {
  focus: "🎯",
  "push here": "📈",
  "watch-outs": "⚠️",
  "watch outs": "⚠️",
  "suggested week": "🗓️",
};

function parseSections(text: string): { title: string; body: string }[] | null {
  const lines = text.split("\n");
  const sections: { title: string; body: string }[] = [];
  let current: { title: string; body: string } | null = null;
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1].replace(/[#*]/g, "").trim(), body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current) sections.push(current);
  return sections.length > 0 ? sections : null;
}

const ASK_PRESETS = [
  "Am I doing too much right now?",
  "How's my squat trending?",
  "Am I balanced between striking and grappling?",
  "What have I been drilling in grappling lately?",
];

const DISCIPLINES = ["MMA", "Kickboxing", "Grappling", "Sparring"];

type Profile = {
  id?: string;
  goals: string;
  current_focus: string;
  constraints: string;
  available_days: string;
};

const EMPTY_PROFILE: Profile = {
  goals: "",
  current_focus: "",
  constraints: "",
  available_days: "",
};

export default function CoachPage() {
  // Profile
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Game plan
  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Ask
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Look-back summaries
  const [lookback, setLookback] = useState<string | null>(null);
  const [lookbackLabel, setLookbackLabel] = useState<string>("");
  const [lookbackLoading, setLookbackLoading] = useState(false);
  const [lookbackError, setLookbackError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    loadCachedPlan();
  }, []);

  async function loadProfile() {
    const { data } = await supabase
      .from("training_profile")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) {
      setProfile({
        id: data.id,
        goals: data.goals ?? "",
        current_focus: data.current_focus ?? "",
        constraints: data.constraints ?? "",
        available_days: data.available_days ?? "",
      });
    }
  }

  async function loadCachedPlan() {
    const weekStart = addDays(startOfWeekLocal(), 7);
    const { data } = await supabase
      .from("coach_plans")
      .select("plan")
      .eq("week_start", weekStart)
      .maybeSingle();
    if (data?.plan) setPlan(data.plan);
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileSaved(false);
    const payload = {
      goals: profile.goals.trim() || null,
      current_focus: profile.current_focus.trim() || null,
      constraints: profile.constraints.trim() || null,
      available_days: profile.available_days.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (profile.id) {
      await supabase.from("training_profile").update(payload).eq("id", profile.id);
    } else {
      const { data } = await supabase
        .from("training_profile")
        .insert(payload)
        .select()
        .single();
      if (data) setProfile((p) => ({ ...p, id: data.id }));
    }
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }

  async function callCoach(
    body: Record<string, unknown>,
    force = false
  ): Promise<string> {
    const url = force ? "/api/coach?force=true" : "/api/coach";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data.result as string;
  }

  async function generatePlan(force = false) {
    setPlanLoading(true);
    setPlanError(null);
    try {
      setPlan(await callCoach({ mode: "plan" }, force));
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPlanLoading(false);
    }
  }

  async function askCoach(q: string) {
    const query = q.trim();
    if (!query) return;
    setQuestion(query);
    setAskLoading(true);
    setAskError(null);
    setAnswer(null);
    try {
      setAnswer(await callCoach({ mode: "ask", question: query }));
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Failed");
    } finally {
      setAskLoading(false);
    }
  }

  async function runLookback(scope: string, label: string) {
    setLookbackLoading(true);
    setLookbackError(null);
    setLookback(null);
    setLookbackLabel(label);
    try {
      setLookback(await callCoach({ mode: "summary", scope }));
    } catch (e) {
      setLookbackError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLookbackLoading(false);
    }
  }

  const sections = plan ? parseSections(plan) : null;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto pb-24">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Coach</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Your AI training partner — looks at everything you&apos;ve logged.
        </p>
      </header>

      {/* ── Profile (collapsible) ── */}
      <section className="mb-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
          aria-expanded={profileOpen}
        >
          <span className="text-sm font-semibold">⚙️ Coaching profile</span>
          <span className="text-xs text-zinc-400">
            {profileOpen ? "Hide" : "Edit"}
          </span>
        </button>
        {profileOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
            <p className="text-xs text-zinc-500">
              The coach reads this every time. Keep it short — goals, what
              you&apos;re focused on, any injuries or limits, and when you can
              train. Leave blank to use sensible defaults.
            </p>
            {(
              [
                ["goals", "Goals", "e.g. 10h MA/week, 2 lifts, lean out a bit"],
                [
                  "current_focus",
                  "Current focus",
                  "e.g. sharpen wrestling, build pull strength",
                ],
                [
                  "constraints",
                  "Injuries / constraints",
                  "e.g. cranky left knee — easy on deep squats",
                ],
                [
                  "available_days",
                  "Availability",
                  "e.g. lift Mon/Thu mornings, mats most evenings",
                ],
              ] as const
            ).map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">
                  {label}
                </label>
                <textarea
                  value={profile[key]}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, [key]: e.target.value }))
                  }
                  rows={2}
                  placeholder={placeholder}
                  className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 resize-y"
                />
              </div>
            ))}
            <button
              onClick={saveProfile}
              disabled={profileSaving}
              className="w-full py-2.5 rounded-xl bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-sm disabled:opacity-50"
            >
              {profileSaving ? "Saving…" : profileSaved ? "Saved ✓" : "Save profile"}
            </button>
          </div>
        )}
      </section>

      {/* ── Next-week game plan ── */}
      <section className="mb-5">
        <h2 className="text-sm font-semibold text-zinc-500 mb-2">
          🧠 Next week&apos;s game plan
        </h2>
        {!plan && !planLoading && (
          <button
            onClick={() => generatePlan()}
            className="w-full py-3.5 rounded-2xl bg-violet-600 text-white font-semibold text-sm active:scale-[0.98] transition-transform"
          >
            ✨ Generate my game plan
          </button>
        )}
        {planLoading && (
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
            <span className="inline-block animate-spin mr-2">✨</span>
            <span className="text-sm text-zinc-500">
              Reading your history…
            </span>
          </div>
        )}
        {planError && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {planError}
            <button
              onClick={() => generatePlan()}
              className="ml-2 underline font-medium"
            >
              Retry
            </button>
          </div>
        )}
        {plan && !planLoading && (
          <div className="space-y-3">
            {sections ? (
              sections.map((s, i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                >
                  <h3 className="text-sm font-bold mb-1.5">
                    {SECTION_EMOJI[s.title.toLowerCase()] ?? "•"} {s.title}
                  </h3>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {s.body.trim()}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {plan}
                </p>
              </div>
            )}
            <button
              onClick={() => generatePlan(true)}
              className="text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline"
            >
              ↻ Regenerate
            </button>
          </div>
        )}
      </section>

      {/* ── Ask your training ── */}
      <section className="mb-5">
        <h2 className="text-sm font-semibold text-zinc-500 mb-2">
          💬 Ask your training
        </h2>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ASK_PRESETS.map((q) => (
            <button
              key={q}
              onClick={() => askCoach(q)}
              disabled={askLoading}
              className="px-2.5 py-1.5 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") askCoach(question);
            }}
            placeholder="Ask anything about your training…"
            className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          <button
            onClick={() => askCoach(question)}
            disabled={askLoading}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white font-semibold text-sm disabled:opacity-50"
          >
            Ask
          </button>
        </div>
        {askLoading && (
          <p className="text-sm text-zinc-500 mt-3">
            <span className="inline-block animate-spin mr-2">✨</span>Thinking…
          </p>
        )}
        {askError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3">{askError}</p>
        )}
        {answer && !askLoading && (
          <div className="mt-3 p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {answer}
            </p>
          </div>
        )}
      </section>

      {/* ── Look back ── */}
      <section className="mb-5">
        <h2 className="text-sm font-semibold text-zinc-500 mb-2">
          🔭 Look back
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => runLookback("month", "This month")}
            disabled={lookbackLoading}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
          >
            Month
          </button>
          <button
            onClick={() => runLookback("all-time", "All-time")}
            disabled={lookbackLoading}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
          >
            All-time
          </button>
          {DISCIPLINES.map((d) => (
            <button
              key={d}
              onClick={() => runLookback(`discipline:${d}`, d)}
              disabled={lookbackLoading}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
            >
              {d}
            </button>
          ))}
        </div>
        {lookbackLoading && (
          <p className="text-sm text-zinc-500 mt-3">
            <span className="inline-block animate-spin mr-2">✨</span>
            Reviewing {lookbackLabel.toLowerCase()}…
          </p>
        )}
        {lookbackError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3">
            {lookbackError}
          </p>
        )}
        {lookback && !lookbackLoading && (
          <div className="mt-3 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-500 mb-2">
              {lookbackLabel}
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {lookback}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
