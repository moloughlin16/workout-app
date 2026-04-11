"use client";

import { useState } from "react";

// The four martial arts disciplines we want to track.
// Storing them in an array means we don't have to copy-paste button code four times.
const DISCIPLINES = [
  { key: "mma", label: "MMA", emoji: "🥋" },
  { key: "kickboxing", label: "Kickboxing", emoji: "🥊" },
  { key: "bjj", label: "Grappling", emoji: "🤼" },
  { key: "sparring", label: "Sparring", emoji: "⚡" },
] as const;

export default function Home() {
  // `useState` is a React "hook" that gives us a variable that re-renders the
  // page whenever it changes. Here we're using it to track the most recent tap
  // so we can show a little confirmation message.
  const [lastLogged, setLastLogged] = useState<string | null>(null);

  function handleLog(label: string) {
    setLastLogged(label);
    // TODO: later, this will actually save to Supabase.
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Workout Tracker</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Tap a discipline to log a class.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 mt-4">
        {DISCIPLINES.map((d) => (
          <button
            key={d.key}
            onClick={() => handleLog(d.label)}
            className="aspect-square rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <span className="text-4xl">{d.emoji}</span>
            <span className="text-lg font-semibold">{d.label}</span>
          </button>
        ))}
      </section>

      {lastLogged && (
        <div className="mt-8 p-4 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200 text-center">
          Logged {lastLogged} ✓ (not yet saved to database)
        </div>
      )}
    </main>
  );
}
