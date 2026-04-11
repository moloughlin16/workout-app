// Tag parsing for martial arts notes.
// Tags are `#word` style, written inline in the note text.
// We allow letters, digits, underscores, and hyphens in tag bodies
// so users can write #guard-retention or #level_change.

const TAG_REGEX = /#[\w-]+/g;

/**
 * Returns all unique tags in a note string, lowercased, WITHOUT the leading #.
 * e.g. "worked on #Guard-Retention and #level-change" → ["guard-retention", "level-change"]
 */
export function extractTags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(TAG_REGEX) ?? [];
  const unique = new Set<string>();
  for (const m of matches) {
    unique.add(m.slice(1).toLowerCase());
  }
  return Array.from(unique);
}

/**
 * Splits a note string into a sequence of text and tag parts, preserving
 * order. Used by the NoteText component to render tags as pills inline
 * with the rest of the note.
 */
export type NotePart =
  | { type: "text"; content: string }
  | { type: "tag"; content: string; display: string };

export function parseNote(text: string): NotePart[] {
  const parts: NotePart[] = [];
  let lastIdx = 0;
  // We recreate the regex per call because `exec` with `/g` mutates
  // `lastIndex` on the shared regex object, which is a classic footgun.
  const re = new RegExp(TAG_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "text", content: text.slice(lastIdx, match.index) });
    }
    parts.push({
      type: "tag",
      content: match[0].slice(1).toLowerCase(), // canonical, for URLs
      display: match[0], // original casing, for display
    });
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push({ type: "text", content: text.slice(lastIdx) });
  }
  return parts;
}
