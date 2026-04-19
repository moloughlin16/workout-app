// POST /api/summary — AI-powered weekly training summary with caching.
//
// This is a Next.js "Route Handler" — it runs on the server, never in the
// browser. That's important because:
//   1. The CLAUDE_API_KEY env var is only available server-side (no NEXT_PUBLIC_ prefix).
//   2. We don't want to expose our API key in the browser's network tab.
//
// Caching strategy:
//   - Each generated summary is saved to the `weekly_summaries` table keyed
//     by week_start (Monday's date). If a cached summary exists, we return
//     it immediately without calling Claude — zero API cost.
//   - The client can pass ?force=true to regenerate (e.g. the "Regenerate"
//     button). This bypasses the cache and upserts the new summary.
//   - Past-week summaries are essentially permanent. Current-week summaries
//     can be refreshed as new training data comes in.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// Create a Supabase client for the server side.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Returns YYYY-MM-DD for Monday of the current week. */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

export async function POST(request: NextRequest) {
  // ── 1. Check for API key ──────────────────────────────────────────
  // Named CLAUDE_API_KEY (not ANTHROPIC_API_KEY) to avoid collision with
  // Claude Code's own environment variable of the same name.
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CLAUDE_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const weekStart = getWeekStart();

    // ── 2. Check cache (unless force=true) ──────────────────────────
    const force = request.nextUrl.searchParams.get("force") === "true";

    if (!force) {
      const { data: cached } = await supabase
        .from("weekly_summaries")
        .select("summary")
        .eq("week_start", weekStart)
        .single();

      if (cached) {
        // Cache hit — return immediately, no Claude API call needed.
        return NextResponse.json({ summary: cached.summary, cached: true });
      }
    }

    // ── 3. Fetch this week's training data in parallel ──────────────
    const [maResult, liftResult, setsResult] = await Promise.all([
      supabase
        .from("martial_arts_sessions")
        .select("date, discipline, duration_min, notes")
        .gte("date", weekStart)
        .order("date", { ascending: true }),

      supabase
        .from("lift_sessions")
        .select("id, date, template_name")
        .gte("date", weekStart)
        .order("date", { ascending: true }),

      supabase
        .from("lift_sets")
        .select("session_id, exercise_name, weight_lb, reps, set_number")
        .gte("created_at", `${weekStart}T00:00:00`)
        .order("set_number", { ascending: true }),
    ]);

    const maSessions = maResult.data ?? [];
    const liftSessions = liftResult.data ?? [];
    const liftSets = setsResult.data ?? [];

    // If there's no data at all, don't waste an API call
    if (maSessions.length === 0 && liftSessions.length === 0) {
      return NextResponse.json({
        summary:
          "No training data logged this week yet! Head to the Martial Arts or Lift page to log a session, then come back for your summary.",
      });
    }

    // ── 4. Build a text representation of the week's training ───────
    let trainingData = "## This Week's Training Data\n\n";

    if (maSessions.length > 0) {
      const totalMin = maSessions.reduce((s, r) => s + r.duration_min, 0);
      trainingData += `### Martial Arts (${maSessions.length} sessions, ${(totalMin / 60).toFixed(1)} hours)\n`;
      for (const s of maSessions) {
        trainingData += `- ${s.date} | ${s.discipline} | ${s.duration_min} min`;
        if (s.notes) trainingData += ` | Notes: "${s.notes}"`;
        trainingData += "\n";
      }
      trainingData += "\n";
    }

    if (liftSessions.length > 0) {
      trainingData += `### Lifting (${liftSessions.length} sessions)\n`;
      for (const session of liftSessions) {
        trainingData += `- ${session.date} | ${session.template_name}\n`;
        const sessionSets = liftSets.filter(
          (s) => s.session_id === session.id
        );
        const byExercise = new Map<
          string,
          { weight_lb: number | null; reps: number | null }[]
        >();
        for (const set of sessionSets) {
          if (!byExercise.has(set.exercise_name)) {
            byExercise.set(set.exercise_name, []);
          }
          byExercise.get(set.exercise_name)!.push({
            weight_lb: set.weight_lb,
            reps: set.reps,
          });
        }
        for (const [exercise, sets] of byExercise) {
          const setDescriptions = sets
            .map((s) => {
              if (s.weight_lb) return `${s.weight_lb}lb × ${s.reps}`;
              return `BW × ${s.reps}`;
            })
            .join(", ");
          trainingData += `    ${exercise}: ${setDescriptions}\n`;
        }
      }
      trainingData += "\n";
    }

    // ── 5. Call Claude ──────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are a knowledgeable and encouraging training coach reviewing a martial arts athlete's weekly training log. This person trains MMA, kickboxing, and grappling, and also does strength/power lifting twice a week.

Keep the tone conversational and coach-like — supportive but not over-the-top. Use "you" to address the athlete directly. Format with short paragraphs, not bullet points. Don't use markdown headers. Don't repeat the raw data back — synthesize and interpret it.`,
      messages: [
        {
          role: "user",
          content: `Here is my training data for this week:

${trainingData}

Write a concise weekly training summary (150-250 words). Include:

1. Volume overview — total martial arts hours, number of sessions, lifting sessions
2. Themes from notes — if I wrote notes about techniques, struggles, or focus areas, highlight the key themes and connect them (e.g. "You've been working a lot on guard retention across both grappling and MMA")
3. Lifting highlights — mention notable exercises or weights if data is there
4. Encouragement + one suggestion — something positive about my consistency or progress, plus one actionable suggestion for next week`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const summary = textBlock ? textBlock.text : "No summary generated.";

    // ── 6. Cache the summary ────────────────────────────────────────
    // Upsert: if a row for this week already exists (from a previous
    // "Regenerate"), update it instead of creating a duplicate.
    await supabase.from("weekly_summaries").upsert(
      {
        week_start: weekStart,
        summary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "week_start" }
    );

    return NextResponse.json({ summary, cached: false });
  } catch (err) {
    console.error("Summary generation failed:", err);
    let errorMessage = "Failed to generate summary. Please try again.";
    if (err instanceof Error) {
      if (err.message.includes("401") || err.message.includes("authentication")) {
        errorMessage = "Invalid API key — check CLAUDE_API_KEY in .env.local";
      } else if (err.message.includes("429")) {
        errorMessage = "Rate limit hit — wait a minute and try again.";
      } else if (err.message.includes("insufficient")) {
        errorMessage = "Insufficient API credits — add credits at console.anthropic.com";
      }
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
