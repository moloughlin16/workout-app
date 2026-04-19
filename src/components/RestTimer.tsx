"use client";

import { useEffect, useRef, useState } from "react";

// Preset rest durations in seconds. Tweak freely — the buttons auto-render.
// Common strength-training rests: 30s for core/accessory, 60–90s for
// hypertrophy, 2–3min for heavy compound lifts.
const PRESETS = [30, 60, 90, 120, 180];

/** Format N seconds as "M:SS" (e.g. 95 -> "1:35"). */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Short label for a preset button ("45s" or "2m"). */
function labelFor(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/**
 * Sticky rest timer used on the active lift workout view.
 *
 * State machine:
 *   idle     — no timer configured. Show preset buttons only.
 *   running  — counting down. Show big countdown + controls.
 *   paused   — countdown frozen at `remaining`. Same card, "Resume" button.
 *   finished — countdown hit 0. Show "Done!" until user acknowledges.
 *
 * Implementation notes:
 *   - `useEffect` + `setInterval` drives the countdown. We subtract one from
 *     `remaining` every second and tear the interval down when the effect
 *     re-runs or the component unmounts.
 *   - When `remaining` hits 0 we play a beep and vibrate (Android only).
 *     The AudioContext is created inside the user's tap handler because
 *     iOS Safari blocks audio that wasn't triggered by user interaction.
 *   - `tabular-nums` Tailwind class keeps the digits the same width so the
 *     countdown doesn't jiggle as it changes (e.g. 1→2 is different width).
 */
export default function RestTimer() {
  // Remaining seconds. Counts down from `initial` to 0.
  const [remaining, setRemaining] = useState(0);
  // Whether the countdown is actively ticking.
  const [running, setRunning] = useState(false);
  // The duration we started with — used for the progress bar percentage
  // and to distinguish "idle" (initial=0) from "finished" (initial>0).
  const [initial, setInitial] = useState(0);

  // Cache the AudioContext across renders. Created once on the first
  // user interaction (preset tap) so iOS Safari will allow sound.
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Countdown tick ──────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // Timer hit 0 — stop, beep, vibrate.
          setRunning(false);
          playBeep();
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    // Cleanup: stop the interval whenever `running` flips off or the
    // component unmounts. Without this, stale intervals would leak.
    return () => clearInterval(id);
  }, [running]);

  /** Lazily create (and resume, if suspended) the AudioContext. */
  function ensureAudioCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      // The `webkit` fallback is for older Safari; modern browsers use AudioContext.
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const w = window as WebkitWindow;
      const Ctor = window.AudioContext || w.webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    // If the context was suspended (e.g. backgrounded), try to resume it.
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }

  /** Play a 500ms A5 (880Hz) sine beep. Silent if audio isn't available. */
  function playBeep() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      // Quick attack, exponential decay — rings like a kitchen timer.
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      /* best-effort — never crash the UI over a beep */
    }
  }

  function start(seconds: number) {
    ensureAudioCtx(); // Created here (user tap) so iOS will allow the beep later.
    setInitial(seconds);
    setRemaining(seconds);
    setRunning(true);
  }

  function togglePause() {
    setRunning((r) => !r);
  }

  function dismiss() {
    setRunning(false);
    setRemaining(0);
    setInitial(0);
  }

  function adjust(delta: number) {
    setRemaining((r) => Math.max(0, r + delta));
    // If we were finished and the user hits "+10s", resume the countdown.
    if (!running && remaining === 0 && delta > 0) setRunning(true);
  }

  const isIdle = remaining === 0 && !running && initial === 0;
  const isFinished = remaining === 0 && !running && initial > 0;
  const progress = initial > 0 ? ((initial - remaining) / initial) * 100 : 0;

  // ── Idle: compact preset row ────────────────────────────────────
  if (isIdle) {
    return (
      <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-medium text-zinc-500 shrink-0">
            ⏱️ Rest:
          </span>
          {PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => start(s)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {labelFor(s)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Finished: "Done!" banner ────────────────────────────────────
  if (isFinished) {
    return (
      <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800">
        <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✅</span>
            <span className="text-sm font-semibold text-green-900 dark:text-green-200">
              Rest done — go!
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => start(initial)}
              className="px-2.5 py-1 text-xs font-medium rounded bg-white dark:bg-zinc-900 border border-green-300 dark:border-green-800"
              title="Restart same duration"
            >
              Repeat
            </button>
            <button
              onClick={dismiss}
              className="px-2 py-1 text-xs rounded bg-white dark:bg-zinc-900 border border-green-300 dark:border-green-800"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Running or paused: big countdown card ───────────────────────
  return (
    <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800">
      <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
        <div className="flex items-center justify-between gap-3">
          <div className="text-4xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums font-mono">
            {formatTime(remaining)}
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            <button
              onClick={() => adjust(-10)}
              className="px-2 py-1 text-xs font-medium rounded bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
            >
              −10s
            </button>
            <button
              onClick={() => adjust(10)}
              className="px-2 py-1 text-xs font-medium rounded bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
            >
              +10s
            </button>
            <button
              onClick={togglePause}
              className="px-3 py-1 text-xs font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {running ? "Pause" : "Resume"}
            </button>
            <button
              onClick={dismiss}
              className="px-2 py-1 text-xs rounded bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
        </div>
        {/* Progress bar — smooth linear fill from 0 to 100% over the rest. */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-indigo-200 dark:bg-indigo-900/60 overflow-hidden">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
