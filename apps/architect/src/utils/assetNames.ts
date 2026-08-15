/**
 * Names the Resource Library shows for resources whose stored names collide.
 *
 * Two files with the same filename are legitimately different data, so an
 * import stores whatever the researcher called their file and nothing is ever
 * renamed on disk. That leaves a library holding two cards nobody can tell
 * apart — same heading, same badges, same action labels, same typeahead key.
 * This derives a name that is unique within the protocol, for DISPLAY only, by
 * inserting a counter before the extension (`people.csv` → `people (2).csv`).
 *
 * DISPLAY ONLY, deliberately:
 * - the manifest keeps the researcher's own `name` and `source`, so a protocol
 *   that is saved, exported, or read by Interviewer/Fresco carries the names
 *   they chose, and nothing an author never typed reaches their file;
 * - a manifest that ALREADY holds duplicates — authored before this change, or
 *   imported from a colleague — is disambiguated on screen without its file
 *   being rewritten when it is merely opened.
 *
 * ORDER. Names are assigned in manifest key order. That is insertion order for
 * every manifest this app builds, the document order `JSON.parse` preserves for
 * one read from a protocol file, and the very order `withAssets` lays the cards
 * out in — so the numbering always matches the library's reading order, and
 * importing another file only ever appends, which is what makes it impossible
 * for a new import to renumber a card already on screen. Both properties are
 * pinned by tests in `__tests__/assetNames.test.ts`.
 */

/**
 * Splits a filename into the part a counter is inserted after, and its
 * extension. A leading dot is part of the name (`.gitignore`), not an
 * extension, and a name with no dot has no extension.
 */
const splitExtension = (name: string): [stem: string, extension: string] => {
  const index = name.lastIndexOf('.');
  if (index <= 0) return [name, ''];
  return [name.slice(0, index), name.slice(index)];
};

/** `people.csv` + 2 → `people (2).csv`. */
export const suffixAssetName = (name: string, counter: number): string => {
  const [stem, extension] = splitExtension(name);
  return `${stem} (${counter})${extension}`;
};

/**
 * Maps each asset id to the name the researcher should see for it.
 *
 * A resource whose stored name is already unique in the protocol ALWAYS keeps
 * it — that is the first pass, and it is what stops a derived name from
 * evicting a real filename. Only the members of a colliding group are
 * numbered, in manifest key order: the first keeps the shared name, and each
 * later one counts up until it reaches something nothing else holds. So a
 * manifest of `people.csv`, `people.csv`, `people (2).csv` displays as
 * `people.csv`, `people (3).csv`, `people (2).csv` — the researcher's own
 * `people (2).csv` is still called what they called it, and no two cards share
 * a name.
 */
export const deriveAssetDisplayNames = (
  assetManifest: Record<string, { name: string }>,
): Record<string, string> => {
  const entries = Object.entries(assetManifest);

  const occurrences = new Map<string, number>();
  for (const [, asset] of entries) {
    occurrences.set(asset.name, (occurrences.get(asset.name) ?? 0) + 1);
  }

  const displayNames: Record<string, string> = {};
  const taken = new Set<string>();

  // Pass 1: every stored name that nothing else shares is reserved as-is.
  for (const [id, asset] of entries) {
    if (occurrences.get(asset.name) !== 1) continue;
    displayNames[id] = asset.name;
    taken.add(asset.name);
  }

  // Pass 2: the colliding groups, in the order their cards render.
  for (const [id, asset] of entries) {
    if (id in displayNames) continue;

    let candidate = asset.name;
    let counter = 1;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = suffixAssetName(asset.name, counter);
    }

    taken.add(candidate);
    displayNames[id] = candidate;
  }

  return displayNames;
};
