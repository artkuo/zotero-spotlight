/**
 * Query-to-entry scoring.
 *
 * "field" mode scores the query against each indexed field (title,
 * authors, tags, abstract, ...) independently and takes the best
 * single-field score. This prevents subsequence matches that trace
 * across field boundaries in the concatenated search text.
 *
 * "loose" mode preserves the pre-per-field behavior: one fuzzy
 * subsequence match over the whole concatenated text.
 */

export type MatchMode = "field" | "loose";

export const DEFAULT_MATCH_MODE: MatchMode = "field";

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function fuzzyScore(query: string, text: string): number {
  const q = normalize(query);
  const t = normalize(text);
  if (!q || !t) {
    return -1;
  }
  let score = 0;
  let tIndex = 0;
  let lastMatch = -1;
  let consecutive = 0;
  for (let i = 0; i < q.length; i += 1) {
    const char = q[i];
    let found = false;
    while (tIndex < t.length) {
      if (t[tIndex] === char) {
        found = true;
        break;
      }
      tIndex += 1;
    }
    if (!found) {
      return -1;
    }
    if (tIndex === lastMatch + 1) {
      consecutive += 1;
      score += 5 + consecutive;
    } else {
      consecutive = 0;
      score += 1;
    }
    if (tIndex === 0 || " /-_".includes(t[tIndex - 1])) {
      score += 3;
    }
    lastMatch = tIndex;
    tIndex += 1;
  }
  if (t.includes(q)) {
    score += 8;
  }
  score += Math.max(0, 10 - (t.length - q.length));
  return score;
}

/** Score a query against an entry. Returns -1 when nothing matches. */
export function scoreQuery(
  query: string,
  searchFields: readonly string[],
  searchText: string,
  mode: MatchMode,
): number {
  if (!query.trim()) {
    return -1;
  }
  if (mode === "loose") {
    return fuzzyScore(query, searchText);
  }
  let best = -1;
  for (const field of searchFields) {
    const score = fuzzyScore(query, field);
    if (score > best) {
      best = score;
    }
  }
  return best;
}
