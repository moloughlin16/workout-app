"use client";

import Link from "next/link";
import { parseNote } from "@/lib/tags";

type Props = {
  // The raw note string, possibly containing #tag tokens.
  text: string;
  // Tailwind class for the surrounding text node. Pass this to match
  // the text styling of the parent (size, color, etc.).
  className?: string;
  // When true, tags are rendered as non-clickable spans. Useful for
  // contexts where we already have an outer click target (like a card
  // that opens a notes editor).
  staticTags?: boolean;
};

/**
 * Renders a note string, highlighting #tags as pills. By default the
 * tags are <Link>s to the /notes page filtered by that tag. Clicking
 * a tag navigates — and since the outer context (e.g. a notes card)
 * may also be clickable, we call stopPropagation on the tag so the
 * two click targets don't fight.
 */
export default function NoteText({ text, className, staticTags }: Props) {
  const parts = parseNote(text);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === "text") {
          return <span key={i}>{p.content}</span>;
        }
        if (staticTags) {
          return (
            <span
              key={i}
              className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 text-[0.85em] font-medium mx-0.5"
            >
              {p.display}
            </span>
          );
        }
        return (
          <Link
            key={i}
            href={`/notes?tag=${encodeURIComponent(p.content)}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 text-[0.85em] font-medium mx-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
          >
            {p.display}
          </Link>
        );
      })}
    </span>
  );
}
