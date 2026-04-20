"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { relativeLabel } from "@/lib/date";
import { extractTags } from "@/lib/tags";
import NoteText from "@/components/NoteText";

// Minimal row shape — we only need what's rendered.
type Session = {
  id: string;
  date: string;
  discipline: string;
  notes: string | null;
  created_at: string;
};

// Kept in sync with martial arts page for the emoji lookup.
const DISCIPLINE_EMOJI: Record<string, string> = {
  MMA: "🥋",
  Kickboxing: "🥊",
  Grappling: "🤼",
  Sparring: "⚡",
};

/**
 * Client component that uses `useSearchParams`. It's wrapped in Suspense
 * at the page level because Next.js 15+ requires any component reading
 * search params to be inside a <Suspense> boundary for static export to
 * work correctly.
 */
function NotesBrowser() {
  const searchParams = useSearchParams();
  const tagFilter = searchParams.get("tag");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  // Free-text search — matches note body OR any hashtag in the note.
  // Debouncing isn't needed since filtering is instant (client-side, ~N rows).
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("martial_arts_sessions")
      .select("id, date, discipline, notes, created_at")
      .not("notes", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load notes:", error.message);
      setLoading(false);
      return;
    }
    const withText = (data ?? []).filter(
      (s) => (s.notes ?? "").trim().length > 0
    );
    setSessions(withText);
    setLoading(false);
  }

  // Two-stage filter applied client-side:
  //   1. If a tag is set via URL (?tag=xxx), keep only notes with that tag.
  //   2. If the user typed in the search box, keep only notes whose body
  //      OR any tag contains the search string (case-insensitive).
  const tagFiltered = tagFilter
    ? sessions.filter((s) => extractTags(s.notes).includes(tagFilter))
    : sessions;

  const searchTerm = search.trim().toLowerCase();
  // Strip a leading '#' so typing "#guard" and "guard" both work.
  const normalizedTerm = searchTerm.startsWith("#")
    ? searchTerm.slice(1)
    : searchTerm;

  const filtered = normalizedTerm
    ? tagFiltered.filter((s) => {
        const noteText = (s.notes ?? "").toLowerCase();
        const tags = extractTags(s.notes);
        return (
          noteText.includes(normalizedTerm) ||
          tags.some((t) => t.includes(normalizedTerm))
        );
      })
    : tagFiltered;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-md mx-auto">
      <header className="py-6">
        <h1 className="text-3xl font-bold">Notes</h1>
        <p className="text-sm text-zinc-500 mt-1">
          All training notes, newest first.
        </p>
      </header>

      {/* Search input — filters by note body or hashtag. */}
      <div className="mb-3 relative">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes or #tags…"
          className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        )}
      </div>

      {/* Active filter banner */}
      {tagFilter && (
        <div className="mb-4 flex items-center justify-between p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/20 border border-indigo-300 dark:border-indigo-900/50">
          <div className="text-sm">
            Filtered by{" "}
            <span className="font-semibold">#{tagFilter}</span>{" "}
            <span className="text-xs text-zinc-500">
              ({filtered.length} {filtered.length === 1 ? "note" : "notes"})
            </span>
          </div>
          <Link
            href="/notes"
            className="text-xs px-3 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
          >
            Clear
          </Link>
        </div>
      )}

      {loading && (
        <p className="text-xs text-zinc-500">Loading…</p>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-zinc-500">
          {normalizedTerm
            ? `No notes match "${search.trim()}".`
            : tagFilter
              ? `No notes with #${tagFilter} yet.`
              : "No notes yet. Tap a class on the Martial Arts tab and add one."}
        </p>
      )}

      <ul className="space-y-2">
        {filtered.map((s) => (
          <li
            key={s.id}
            className="p-4 rounded-xl bg-white dark:bg-zinc-900 border-l-4 border-l-indigo-500 border-y border-r border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
              <span>{DISCIPLINE_EMOJI[s.discipline] ?? "•"}</span>
              <span className="font-semibold">{s.discipline}</span>
              <span>·</span>
              <span>{relativeLabel(s.date)}</span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              <NoteText text={s.notes ?? ""} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Link
          href="/"
          className="text-xs text-zinc-500 underline"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}

export default function NotesPage() {
  // `useSearchParams` must be inside a Suspense boundary in Next.js 15+.
  return (
    <Suspense fallback={null}>
      <NotesBrowser />
    </Suspense>
  );
}
