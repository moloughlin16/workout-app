// POST /api/coach — AI "personal trainer" over the user's full history.
//
// Three modes (JSON body { mode, ... }):
//   - "plan"    → forward-looking game plan for the upcoming week.
//                 Cached in coach_plans by next-week Monday; ?force=true regenerates.
//   - "ask"     → answer a question about the training history (not cached).
//   - "summary" → scoped look-back: month | all-time | a discipline name.
//
// Server-only so CLAUDE_API_KEY stays off the client. Mirrors the patterns
// in /api/summary (key handling, Anthropic SDK call, error mapping) and
// reuses the shared context builder for the pre-aggregated brief.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { buildTrainingContext } from "@/lib/training-context";
import { startOfWeekLocal, addDays } from "@/lib/date";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Opus 4.8 — the coach benefits from stronger reasoning, and it runs
// infrequently (the weekly plan is cached in the DB). Easy to swap to
// claude-sonnet-4-6 here if cost ever matters.
const MODEL = "claude-opus-4-8";

const BASE_SYSTEM = `You are an experienced strength & conditioning coach and martial-arts performance advisor. You are reviewing one athlete's real training logs.

Voice: direct, warm, specific. Talk to the athlete as "you". No fluff, no generic platitudes. Ground every point in their actual data — reference real numbers, disciplines, lifts, or note themes from the brief. Never invent data that isn't there.

This athlete trains a LOT of martial arts (target ~10h/week) and lifts 2-3x. Recovery is the real constraint, so weigh fatigue signals heavily: if weekly load is climbing while lift mood is dropping or high-intensity days are stacking up, say so plainly and recommend pulling back. Their coach biases lifting toward lats / upper back / side delts and knee durability — respect that.

Output the final answer only. Do not narrate your reasoning or restate the raw data table back to them.`;

function planUserPrompt(brief: string): string {
  return `Here is the athlete's training brief:

${brief}

Write a game plan for the UPCOMING week. Use exactly these four markdown section headers, in this order, each with 2-4 short bullet points:

## Focus
What to prioritize next week and why (tie to goals + what the data shows).

## Push here
Where they have room to push — a lift to add weight/reps to, a discipline that's under their goal, a skill theme from their notes to keep developing.

## Watch-outs
Recovery / overtraining flags. If load is climbing while mood drops or high-intensity days are stacking, call it out. If they're well-recovered, say that instead.

## Suggested week
A concrete day-by-day suggestion that fits what's already on their calendar and their availability. Keep it realistic.

Keep the whole thing scannable — roughly 200-300 words total.`;
}

function askUserPrompt(brief: string, question: string): string {
  return `Here is the athlete's training brief:

${brief}

The athlete asks: "${question}"

Answer concisely (under ~180 words), grounded in their data. If the brief doesn't contain enough to answer, say what's missing and what they could log to get a better answer.`;
}

function summaryUserPrompt(brief: string, scopeLabel: string): string {
  return `Here is the athlete's training brief:

${brief}

Write a ${scopeLabel} review of their training (~180-250 words): volume and consistency vs their goals, discipline balance, strength progression, recurring themes from their notes, and one or two things to carry forward. Conversational coach voice, short paragraphs, no headers.`;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CLAUDE_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { mode?: string; question?: string; scope?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body → default to plan
  }
  const mode = body.mode ?? "plan";

  try {
    let userPrompt: string;

    if (mode === "plan") {
      // Cache key = the upcoming week's Monday.
      const weekStart = addDays(startOfWeekLocal(), 7);
      const force = request.nextUrl.searchParams.get("force") === "true";
      if (!force) {
        const { data: cached } = await supabase
          .from("coach_plans")
          .select("plan")
          .eq("week_start", weekStart)
          .maybeSingle();
        if (cached?.plan) {
          return NextResponse.json({ result: cached.plan, cached: true });
        }
      }
      const brief = await buildTrainingContext(supabase, {
        trendWeeks: 10,
        includeProgression: true,
        includeUpcoming: true,
      });
      userPrompt = planUserPrompt(brief);

      const message = await callClaude(apiKey, userPrompt);
      await supabase.from("coach_plans").upsert(
        {
          week_start: weekStart,
          plan: message,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "week_start" }
      );
      return NextResponse.json({ result: message, cached: false });
    }

    if (mode === "ask") {
      const question = (body.question ?? "").trim();
      if (!question) {
        return NextResponse.json(
          { error: "No question provided." },
          { status: 400 }
        );
      }
      const brief = await buildTrainingContext(supabase, {
        trendWeeks: 12,
        includeProgression: true,
        includeUpcoming: true,
      });
      userPrompt = askUserPrompt(brief, question);
      const message = await callClaude(apiKey, userPrompt);
      return NextResponse.json({ result: message, cached: false });
    }

    if (mode === "summary") {
      const scope = body.scope ?? "month";
      let trendWeeks = 5;
      let scopeLabel = "monthly";
      let disciplineFocus: string | undefined;
      if (scope === "all-time") {
        trendWeeks = 26;
        scopeLabel = "all-time";
      } else if (scope.startsWith("discipline:")) {
        disciplineFocus = scope.slice("discipline:".length);
        trendWeeks = 26;
        scopeLabel = `${disciplineFocus}-focused`;
      }
      const brief = await buildTrainingContext(supabase, {
        trendWeeks,
        includeProgression: true,
        includeUpcoming: false,
        disciplineFocus,
      });
      userPrompt = summaryUserPrompt(brief, scopeLabel);
      const message = await callClaude(apiKey, userPrompt);
      return NextResponse.json({ result: message, cached: false });
    }

    return NextResponse.json({ error: "Unknown mode." }, { status: 400 });
  } catch (err) {
    console.error("Coach generation failed:", err);
    let errorMessage = "Failed to generate. Please try again.";
    if (err instanceof Error) {
      if (err.message.includes("401") || err.message.includes("authentication")) {
        errorMessage = "Invalid API key — check CLAUDE_API_KEY in .env.local";
      } else if (err.message.includes("429")) {
        errorMessage = "Rate limit hit — wait a minute and try again.";
      } else if (err.message.includes("insufficient") || err.message.includes("credit")) {
        errorMessage = "Insufficient API credits — add credits at console.anthropic.com";
      } else if (err.message.includes("404") || err.message.includes("model")) {
        errorMessage = "Model unavailable on this API key. Try claude-sonnet-4-6.";
      }
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function callClaude(apiKey: string, userPrompt: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: BASE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "No response generated.";
}
