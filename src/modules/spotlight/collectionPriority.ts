/**
 * Collection priority configuration.
 *
 * The configuration is stored as a JSON string in a single pref
 * (`collectionPriorities`) and is the single source of truth for both
 * search ranking and any future GUI. All reads/writes go through this
 * module so the data model can evolve without touching consumers.
 *
 * Model: one ranked list ("order") with two node types. Libraries are
 * ranked first-class; collections add refinement within their library.
 * Hierarchy is a presentation concern — the flat order is authoritative.
 */

export const LIBRARY_BOOST_STEP = 8;
export const COLLECTION_BOOST_STEP = 4;

export type PriorityEntry =
  | { type: "library"; libraryID: number }
  | { type: "collection"; libraryID: number; key: string };

export interface PriorityConfig {
  order: PriorityEntry[];
  unlisted: "low";
}

export function emptyPriorityConfig(): PriorityConfig {
  return { order: [], unlisted: "low" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEntry(raw: unknown): PriorityEntry | null {
  if (!isRecord(raw)) {
    return null;
  }
  const libraryID = raw.libraryID;
  if (typeof libraryID !== "number" || !Number.isFinite(libraryID)) {
    return null;
  }
  if (raw.type === "library") {
    return { type: "library", libraryID };
  }
  if (raw.type === "collection" && typeof raw.key === "string" && raw.key) {
    return { type: "collection", libraryID, key: raw.key };
  }
  return null;
}

/**
 * Parse user-authored JSON. Tolerates unknown fields (e.g. display names),
 * drops malformed entries, and falls back to an empty config on failure.
 */
export function parsePriorityConfig(
  raw: string | null | undefined,
): PriorityConfig {
  if (!raw || typeof raw !== "string") {
    return emptyPriorityConfig();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return emptyPriorityConfig();
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.order)) {
    return emptyPriorityConfig();
  }
  const order: PriorityEntry[] = [];
  const seen = new Set<string>();
  for (const rawEntry of parsed.order) {
    const entry = parseEntry(rawEntry);
    if (!entry) {
      continue;
    }
    const dedupeKey =
      entry.type === "library"
        ? `L${entry.libraryID}`
        : `C${entry.libraryID}:${entry.key}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    order.push(entry);
  }
  return { order, unlisted: "low" };
}

export function serializePriorityConfig(config: PriorityConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Pure scoring helper used by SearchService. Boosts are additive:
 *
 * - Listed libraries get `(listedCount - rank) * LIBRARY_BOOST_STEP`.
 *   First-listed gets the largest boost; unlisted libraries get 0.
 * - Within a library, listed collections get
 *   `(listedCountInLibrary - rank) * COLLECTION_BOOST_STEP`. An item in
 *   multiple prioritized collections takes the best (largest) boost.
 */
export function getPriorityBoost(
  libraryID: number | null | undefined,
  collectionIDs: readonly number[] | undefined,
  entries: readonly ResolvedPriorityEntry[],
): number {
  let boost = 0;

  const libraries = entries.filter((entry) => entry.type === "library");
  const libraryRank = libraries.findIndex(
    (entry) => entry.libraryID === libraryID,
  );
  if (libraryRank >= 0) {
    boost += (libraries.length - libraryRank) * LIBRARY_BOOST_STEP;
  }

  if (collectionIDs?.length) {
    const collectionSet = new Set(collectionIDs);
    const collectionsInLibrary = entries.filter(
      (entry) => entry.type === "collection" && entry.libraryID === libraryID,
    );
    // Best (highest) matching rank wins for multi-collection items.
    for (let rank = 0; rank < collectionsInLibrary.length; rank += 1) {
      const entry = collectionsInLibrary[rank];
      if (
        entry.type === "collection" &&
        collectionSet.has(entry.collectionID)
      ) {
        boost += (collectionsInLibrary.length - rank) * COLLECTION_BOOST_STEP;
        break;
      }
    }
  }

  return boost;
}

/** Config entries resolved against live Zotero state: keys become IDs and
 * stale entries (deleted collections/libraries) are dropped. */
export type ResolvedPriorityEntry =
  | { type: "library"; libraryID: number }
  | { type: "collection"; libraryID: number; collectionID: number };

/**
 * Resolve key-based config entries to numeric collection IDs via a lookup
 * callback, dropping entries that cannot be resolved. Pure aside from the
 * callback, so it is unit-testable.
 */
export function resolvePriorityEntries(
  config: PriorityConfig,
  lookupCollectionID: (libraryID: number, key: string) => number | null,
): ResolvedPriorityEntry[] {
  const cache = new Map<string, number | null>();
  const resolved: ResolvedPriorityEntry[] = [];
  for (const entry of config.order) {
    if (entry.type === "library") {
      resolved.push({ type: "library", libraryID: entry.libraryID });
      continue;
    }
    const cacheKey = `${entry.libraryID}:${entry.key}`;
    let collectionID = cache.get(cacheKey);
    if (collectionID === undefined) {
      collectionID = lookupCollectionID(entry.libraryID, entry.key);
      cache.set(cacheKey, collectionID);
    }
    if (collectionID !== null) {
      resolved.push({
        type: "collection",
        libraryID: entry.libraryID,
        collectionID,
      });
    }
  }
  return resolved;
}

/** Resolve using the running Zotero instance. */
export function resolvePriorityEntriesFromZotero(
  config: PriorityConfig,
): ResolvedPriorityEntry[] {
  const byLibrary = new Map<number, Map<string, number>>();
  return resolvePriorityEntries(config, (libraryID, key) => {
    let keyMap = byLibrary.get(libraryID);
    if (!keyMap) {
      keyMap = new Map();
      try {
        for (const collection of Zotero.Collections.getByLibrary(
          libraryID,
          true,
        ) as Zotero.Collection[]) {
          keyMap.set(collection.key, collection.id);
        }
      } catch (_) {
        // Library may no longer exist.
      }
      byLibrary.set(libraryID, keyMap);
    }
    return keyMap.get(key) ?? null;
  });
}

export interface CollectionTemplateInfo {
  libraryID: number;
  name: string;
  key?: string;
  path?: string[];
}

/**
 * Build the clipboard/prefs-editor template from live Zotero state.
 * Extra fields (`name`, `path`) are ignored by parsePriorityConfig and
 * exist purely to make hand-editing feasible.
 */
export function buildPriorityTemplate(
  libraries: CollectionTemplateInfo[],
  collections: CollectionTemplateInfo[],
): string {
  type TemplateEntry = PriorityEntry & Record<string, unknown>;
  const order: TemplateEntry[] = [];
  for (const library of libraries) {
    order.push({
      type: "library",
      libraryID: library.libraryID,
      name: library.name,
    });
    const children = collections.filter(
      (entry) => entry.libraryID === library.libraryID && !!entry.key,
    );
    for (const collection of children) {
      order.push({
        type: "collection",
        libraryID: collection.libraryID,
        key: collection.key as string,
        name: [...(collection.path || []), collection.name].join(" › "),
      });
    }
  }
  return serializePriorityConfig({ order, unlisted: "low" });
}
