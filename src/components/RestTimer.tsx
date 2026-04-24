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

// Internal state machine. Using a discriminated union makes the four
// phases unambiguous — there's never an in-between "running but no endsAt"
// state to think about.
type Phase =
  | { kind: "idle" }
  | { kind: "running"; endsAt: number; initial: number }
  | { kind: "paused"; remaining: number; initial: number }
  | { kind: "finished"; initial: number };

// Wake Lock API isn't in lib.dom.d.ts in older TS targets, so spell out
// the bit we use.
type WakeLockSentinel = { release: () => Promise<void> };

/**
 * Sticky rest timer used on the active lift workout view.
 *
 * Robustness vs the previous version:
 *   - Time-keeping is **timestamp-based**, not tick-decrement. We store the
 *     epoch-ms instant the timer should hit 0 and compute `remaining` from
 *     `endsAt - now()` on every render. So when the OS throttles JS in the
 *     background, the timer doesn't drift — when the page wakes back up,
 *     it sees the correct elapsed time immediately.
 *   - **Wake Lock API**: while running we hold a screen wake lock so the
 *     phone won't auto-sleep mid-rest. The browser auto-releases the lock
 *     when the page is hidden (e.g. you switch apps); the visibilitychange
 *     handler re-acquires it when you come back.
 *   - Caveat: if you switch apps or lock the phone, JS pauses entirely
 *     (a real PWA limitation, not something we can fix in the browser).
 *     When you return to the app, the timer recomputes — if it should have
 *     ended while you were away, it fires the beep + "Done!" banner immediately.
 *
 * Audio note: on iOS Safari, the AudioContext must be created during a
 * user gesture, so we lazily create it on the first preset tap and reuse
 * it for the beep when the timer ends.
 */
export default function RestTimer() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Forces a re-render every 250ms while running, so the displayed
  // countdown updates. We don't store seconds-remaining as state — that's
  // derived from `phase.endsAt` and `Date.now()`.
  const [, setTick] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Guards against firing the beep twice if the "ran out" effect re-runs
  // before phase has settled to "finished". Reset whenever we leave running.
  const beepFiredRef = useRef(false);

  // ── Tick: re-render at 250ms while running ──────────────────────
  useEffect(() => {
    if (phase.kind !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [phase.kind]);

  // ── Detect zero crossing on every render while running ──────────
  // No deps array — runs after every commit. The `beepFiredRef` guard
  // ensures the beep only fires once per timer.
  useEffect(() => {
    if (phase.kind !== "running") {
      beepFiredRef.current = false;
      return;
    }
    if (Date.now() >= phase.endsAt && !beepFiredRef.current) {
      beepFiredRef.current = true;
      playBeep();
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      releaseWakeLock();
      setPhase({ kind: "finished", initial: phase.initial });
    }
  });

  // ── Visibility: re-acquire wake lock + recompute when returning ──
  useEffect(() => {
    function onVisChange() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        phase.kind === "running"
      ) {
        requestWakeLock();
        setTick((t) => t + 1); // force a render to re-eval `remaining`
      }
    }
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", onVisChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisChange);
  }, [phase.kind]);

  // ── Release wake lock on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      releaseWakeLock();
    };
  }, []);

  /** Lazily create (and resume, if suspended) the AudioContext. */
  function ensureAudioCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const w = window as WebkitWindow;
      const Ctor = window.AudioContext || w.webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }

  /** Play a 500ms A5 sine beep. Silent if audio isn't available. */
  function playBeep() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      /* best-effort */
    }
  }

  async function requestWakeLock() {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (kind: "screen") => Promise<WakeLockSentinel> };
      };
      const sentinel = await nav.wakeLock?.request("screen");
      if (sentinel) wakeLockRef.current = sentinel;
    } catch {
      // Some browsers throw when the page is hidden; safe to ignore.
    }
  }

  async function releaseWakeLock() {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    }
  }

  // ── Actions ─────────────────────────────────────────────────────
  function start(seconds: number) {
    ensureAudioCtx();
    requestWakeLock();
    setPhase({
      kind: "running",
      endsAt: Date.now() + seconds * 1000,
      initial: seconds,
    });
  }

  function togglePause() {
    if (phase.kind === "running") {
      const remaining = Math.max(
        0,
        Math.ceil((phase.endsAt - Date.now()) / 1000)
      );
      releaseWakeLock();
      setPhase({ kind: "paused", remaining, initial: phase.initial });
    } else if (phase.kind === "paused") {
      requestWakeLock();
      setPhase({
        kind: "running",
        endsAt: Date.now() + phase.remaining * 1000,
        initial: phase.initial,
      });
    }
  }

  function adjust(delta: number) {
    if (phase.kind === "running") {
      const newEnd = phase.endsAt + delta * 1000;
      if (newEnd <= Date.now()) {
        // Adjusted past zero — just end now.
        playBeep();
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
        releaseWakeLock();
        setPhase({ kind: "finished", initial: phase.initial });
      } else {
        setPhase({ ...phase, endsAt: newEnd });
      }
    } else if (phase.kind === "paused") {
      const next = Math.max(0, phase.remaining + delta);
      setPhase({ ...phase, remaining: next });
    } else if (phase.kind === "finished" && delta > 0) {
      // +10s on the "Done!" card — restart with that much time.
      start(delta);
    }
  }

  function dismiss() {
    releaseWakeLock();
    setPhase({ kind: "idle" });
  }

  // ── Derived values for render ───────────────────────────────────
  const remaining =
    phase.kind === "running"
      ? Math.max(0, Math.ceil((phase.endsAt - Date.now()) / 1000))
      : phase.kind === "paused"
        ? phase.remaining
        : 0;

  const initial = phase.kind === "idle" ? 0 : phase.initial;
  const progress = initial > 0 ? ((initial - remaining) / initial) * 100 : 0;
  const running = phase.kind === "running";

  // ── Idle: compact preset row ────────────────────────────────────
  if (phase.kind === "idle") {
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
  if (phase.kind === "finished") {
    return (
      <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800">
        <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✅</span>
            <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              Rest done — go!
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => start(initial)}
              className="px-2.5 py-1 text-xs font-medium rounded bg-white dark:bg-zinc-900 border border-indigo-300 dark:border-indigo-800"
              title="Restart same duration"
            >
              Repeat
            </button>
            <button
              onClick={dismiss}
              className="px-2 py-1 text-xs rounded bg-white dark:bg-zinc-900 border border-indigo-300 dark:border-indigo-800"
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
        <div className="mt-2 h-1.5 w-full rounded-full bg-indigo-200 dark:bg-indigo-900/60 overflow-hidden">
          <div
            className="h-full bg-cyan-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
