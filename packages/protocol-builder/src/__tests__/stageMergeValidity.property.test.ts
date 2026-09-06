/**
 * The one invariant every other rule in the merge is in service of: whatever
 * two researchers do to a stage, what comes out of the merge is a stage the
 * schema accepts.
 *
 * Each round of review on this work has found another shape the merge can
 * produce that the protocol schema refuses — a background carrying an image
 * AND concentric circles, a skip-logic rule with an action and no filter, a
 * sociogram prompt with highlighting on and no attribute to write. Each was
 * found by reading, and each was fixed by a rule of its own. This sweeps for
 * the rest of the family instead of waiting for the next one to be noticed.
 *
 * The documents are the REAL ones: every stage of `all-interfaces`, which is
 * one of each type the schema knows. The edits are random but not arbitrary —
 * a mutation is kept only if the side that made it still validates, so both
 * sides are documents a researcher could actually have saved, and the property
 * is about the merge rather than about the generator. That filter is what
 * makes a failure meaningful: base valid, local valid, arrival valid, merged
 * refused, is a document the merge invented.
 *
 * One class of refusal is deliberately not a failure: a rule about a LIST as a
 * group — no two form fields on one attribute, at least one field — broken by
 * rows that both came from one side or the other. Every row in the answer is
 * then a row a researcher wrote, and the refusal is their two decisions
 * disagreeing rather than a shape the merge invented; the draft's own
 * validation is what puts it in front of the only person who can say which row
 * to keep. `isConflict` draws that line, and it is drawn narrowly: a row
 * NEITHER side held is an invention wherever it sits.
 *
 * Deterministic: the seeds are the fixed run 1…`TRIALS`, so a failure
 * reproduces from the seed it prints. The vacuity counters below are what
 * keep it from passing by generating nothing worth merging.
 */
import { describe, expect, it } from 'vitest';

import { stageSchema } from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  applyCommands,
  canonicalize,
  type Command,
  type SectionDoc,
} from '@codaco/studio-sync/apply';

import { rebaseCommands } from '../listCommands.ts';
import { commandsFromDraftChange } from '../session.ts';

// ---------------------------------------------------------------- prng

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const int = (rng: Rng, n: number) => Math.floor(rng() * n);
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[int(rng, xs.length)]!;

// ---------------------------------------------------------------- documents

const isDictionary = (value: unknown): value is SectionDoc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stage as the session holds one: identity apart from the fields. */
type Stage = Readonly<{ id: string; type: string; fields: SectionDoc }>;

const asStage = (document: SectionDoc): Stage => {
  const { id, type, ...fields } = document;
  return {
    id: typeof id === 'string' ? id : 'stage',
    type: typeof type === 'string' ? type : 'Information',
    fields,
  };
};

const STAGES: readonly Stage[] = (
  allInterfaces.stages as unknown as SectionDoc[]
).map(asStage);

const validates = (stage: Stage, fields: SectionDoc): boolean =>
  stageSchema.safeParse({ ...fields, id: stage.id, type: stage.type }).success;

// ------------------------------------------------------------------- sites

/** Every place in a document an edit could reach, by kind. */
type Sites = Readonly<{
  /** Paths holding a string, a number or a boolean. */
  leaves: string[][];
  /** Paths holding an object, which a removal could take away. */
  members: string[][];
  /** Paths holding a non-empty list. */
  lists: string[][];
}>;

function collectSites(value: unknown, here: string[], into: Sites): void {
  if (Array.isArray(value)) {
    if (value.length > 0) into.lists.push([...here]);
    value.forEach((row) => {
      // A row's own place is not addressable, and neither this walk nor the
      // command vocabulary pretends otherwise: the rows are walked for the
      // sites INSIDE them, under the list's own path.
      collectSites(row, here, into);
    });
    return;
  }
  if (isDictionary(value)) {
    for (const [key, member] of Object.entries(value)) {
      const path = [...here, key];
      if (here.length > 0 || (key !== 'id' && key !== 'type')) {
        if (isDictionary(member)) into.members.push(path);
      }
      collectSites(member, path, into);
    }
    return;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    into.leaves.push([...here]);
  }
}

const sitesOf = (fields: SectionDoc): Sites => {
  const sites: Sites = { leaves: [], members: [], lists: [] };
  collectSites(fields, [], sites);
  return sites;
};

/**
 * The value at a path, where a list on the way is entered at a random row.
 *
 * A site's path names a place in the SHAPE rather than in the document, so a
 * path through a list can name several values. Which of them an edit reaches
 * is drawn here, so that two sides editing "the same" site can still be
 * editing different rows — which is most of what a merge is asked about.
 */
function mutateAt(
  rng: Rng,
  value: unknown,
  path: readonly string[],
  change: (held: unknown) => { keep: boolean; value?: unknown },
): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return value;
    const at = int(rng, value.length);
    const next = [...value];
    next[at] = mutateAt(rng, next[at], path, change);
    return next;
  }
  const [head, ...rest] = path;
  if (head === undefined || !isDictionary(value)) return value;
  const held = value[head];
  if (rest.length === 0) {
    const answer = change(held);
    if (!answer.keep) {
      const { [head]: _removed, ...remaining } = value;
      return remaining;
    }
    return { ...value, [head]: answer.value };
  }
  return { ...value, [head]: mutateAt(rng, held, rest, change) };
}

// --------------------------------------------------------------- mutations

type MutationKind =
  | 'leaf'
  | 'drop leaf'
  | 'drop member'
  | 'drop row'
  | 'move row'
  | 'copy row';

/**
 * `drop leaf` is what reaches the shapes the review rounds found: switching a
 * capability's own member off is how a collaborator produces the OTHER variant
 * of a container — highlighting on a sociogram prompt without the attribute it
 * names, a skip-logic rule without its filter — and every one of those hybrids
 * was a leaf one side removed while the other wrote beside it. It is listed
 * twice for the same reason `leaf` is: an edit that changes a value and one
 * that takes it away are the two halves of what a form submit does.
 */
const KINDS: readonly MutationKind[] = [
  'leaf',
  'leaf',
  'drop leaf',
  'drop leaf',
  'drop member',
  'drop row',
  'move row',
  'copy row',
];

/** A fresh id for a copied row, so a duplicate-id refinement is not tripped. */
let minted = 0;
const mintId = () => `copy-${String((minted += 1))}`;

const editedLeaf = (rng: Rng, held: unknown, tag: string): unknown => {
  if (typeof held === 'boolean') return !held;
  if (typeof held === 'number') return held + 1;
  return `${String(held)} ${tag}`;
};

const copiedRow = (row: unknown): unknown => {
  if (!isDictionary(row)) return row;
  return typeof row.id === 'string' ? { ...row, id: mintId() } : { ...row };
};

/** One candidate edit, which the caller keeps only if it still validates. */
function mutate(
  rng: Rng,
  fields: SectionDoc,
  tag: string,
): SectionDoc | undefined {
  const sites = sitesOf(fields);
  const kind = pick(rng, KINDS);

  if (kind === 'leaf' && sites.leaves.length > 0) {
    const path = pick(rng, sites.leaves);
    const next = mutateAt(rng, fields, path, (held) => ({
      keep: true,
      value: editedLeaf(rng, held, tag),
    }));
    return isDictionary(next) ? next : undefined;
  }

  if (kind === 'drop leaf' && sites.leaves.length > 0) {
    const path = pick(rng, sites.leaves);
    const next = mutateAt(rng, fields, path, () => ({ keep: false }));
    return isDictionary(next) ? next : undefined;
  }

  if (kind === 'drop member' && sites.members.length > 0) {
    const path = pick(rng, sites.members);
    const next = mutateAt(rng, fields, path, () => ({ keep: false }));
    return isDictionary(next) ? next : undefined;
  }

  if (sites.lists.length === 0) return undefined;
  const path = pick(rng, sites.lists);
  const next = mutateAt(rng, fields, path, (held) => {
    if (!Array.isArray(held) || held.length === 0)
      return { keep: true, value: held };
    const rows = [...held];
    if (kind === 'drop row') {
      rows.splice(int(rng, rows.length), 1);
      return { keep: true, value: rows };
    }
    if (kind === 'copy row') {
      const source = int(rng, rows.length);
      rows.splice(int(rng, rows.length + 1), 0, copiedRow(rows[source]));
      return { keep: true, value: rows };
    }
    const from = int(rng, rows.length);
    const [moved] = rows.splice(from, 1);
    rows.splice(int(rng, rows.length + 1), 0, moved);
    return { keep: true, value: rows };
  });
  return isDictionary(next) ? next : undefined;
}

/**
 * One side's edit: up to two mutations, each kept only if the document it
 * leaves is one the schema accepts.
 *
 * A rejected candidate is discarded rather than retried into oblivion — the
 * point is a supply of valid edits, not a particular number of them, and a
 * trial that produces none is counted as asking nothing.
 */
function editedSide(rng: Rng, stage: Stage, tag: string): SectionDoc {
  let fields = stage.fields;
  const attempts = 1 + int(rng, 3);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = mutate(rng, fields, `${tag}${String(attempt)}`);
    if (candidate !== undefined && validates(stage, candidate)) {
      fields = candidate;
    }
  }
  return fields;
}

// ----------------------------------------------------------------- trials

type Trial = Readonly<{
  seed: number;
  stage: Stage;
  local: SectionDoc;
  arrival: SectionDoc;
  commands: Command[];
  rebased: readonly Command[];
}>;

type Outcome =
  | Readonly<{ kind: 'threw'; error: string }>
  | Readonly<{ kind: 'ok'; merged: SectionDoc }>;

function runTrial(seed: number): Readonly<{ trial: Trial; outcome: Outcome }> {
  const rng = mulberry32(seed);
  const stage = pick(rng, STAGES);
  const local = editedSide(rng, stage, 'L');
  const arrival = editedSide(mulberry32(seed ^ 0x5bf03635), stage, 'R');
  const commands = commandsFromDraftChange(stage.fields, local);
  const trial = (rebased: readonly Command[]): Trial => ({
    seed,
    stage,
    local,
    arrival,
    commands,
    rebased,
  });

  try {
    const rebased = rebaseCommands(stage.fields, arrival, commands);
    return {
      trial: trial(rebased),
      outcome: {
        kind: 'ok',
        merged: applyCommands(arrival, [...rebased]),
      },
    };
  } catch (error: unknown) {
    return {
      trial: trial([]),
      outcome: {
        kind: 'threw',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// ------------------------------------------------------------- refusals

const valueAt = (document: unknown, path: readonly (string | number)[]) =>
  path.reduce<unknown>((cursor, segment) => {
    if (Array.isArray(cursor)) return cursor[Number(segment)];
    return isDictionary(cursor) ? cursor[String(segment)] : undefined;
  }, document);

const rowsAt = (document: unknown, path: readonly (string | number)[]) => {
  const held = valueAt(document, path);
  return Array.isArray(held) ? held : undefined;
};

/**
 * Whether one refusal is a CONFLICT between the two sides rather than a shape
 * the merge invented.
 *
 * The distinction is what this property is about. A hybrid — a background
 * carrying both variants, a rule with an action and no filter, a prompt with
 * highlighting on and nothing to write — is a value NEITHER researcher ever
 * held, and there is nothing for either of them to do about it but wonder
 * where it came from. A list that now holds two rows asking the same question,
 * or none at all, is different: every row in it is a row one of them wrote,
 * and the refusal is the two decisions disagreeing. The draft's own validation
 * puts that in front of the researcher, who is the only one who can say which
 * of the two rows to keep.
 *
 * So a refusal counts as a conflict when it is about a LIST — a rule over the
 * rows as a group, which is what a uniqueness or a count rule is — and every
 * row in that list came from one of the two sides. A row neither of them held
 * is an invention wherever it sits, which is what keeps this from excusing the
 * merge's own hybrids: those live inside rows too.
 */
function isConflict(
  trial: Trial,
  merged: SectionDoc,
  issuePath: readonly (string | number)[],
): boolean {
  for (let depth = issuePath.length; depth > 0; depth -= 1) {
    const here = issuePath.slice(0, depth);
    const rows = rowsAt(merged, here);
    if (rows === undefined) continue;
    const sides = [
      ...(rowsAt(trial.local, here) ?? []),
      ...(rowsAt(trial.arrival, here) ?? []),
    ].map((row) => canonicalize(row));
    return rows.every((row) => sides.includes(canonicalize(row)));
  }
  return false;
}

/**
 * The one shape this sweep still finds and this round does not close.
 *
 * A sociogram prompt's `edges` says which edges to draw and which to let the
 * participant create, and the schema requires at least one of the two: an
 * empty `edges` has no effect, so it is refused rather than ignored. Its two
 * members constrain each other, then — but they are NOT rivals, and the merge
 * being able to keep both people's work on them is the reason it goes leaf by
 * leaf in the first place (see `reseatEditedRow`). So the answer that closes
 * the exclusive-variant containers cannot be used here: writing `edges` whole
 * would throw away exactly the collaboration it was written to keep.
 *
 * The repro is one leaf removed on each side: the researcher clears
 * `edges.create` while a collaborator empties `edges.display`, and neither of
 * them held `{ display: [] }`. Closing it needs the merge to be able to ASK
 * whether the container it just assembled is one the schema accepts, and to
 * fall back to one side's whole container when it is not — which is schema
 * knowledge the merge does not have today, at a depth where it does not know
 * the stage type either.
 *
 * Pinned as an exact list rather than skipped: a refusal of any OTHER kind
 * fails, and so does this one going away, which is how the fix announces
 * itself.
 */
const KNOWN_UNCLOSED: readonly string[] = [
  'edges must set create and/or a non-empty display; an empty edges object has no effect.',
];

const describeTrial = (trial: Trial, extra: string) =>
  [
    `seed ${String(trial.seed)} (${trial.stage.type})`,
    `base     ${JSON.stringify(trial.stage.fields)}`,
    `local    ${JSON.stringify(trial.local)}`,
    `arrival  ${JSON.stringify(trial.arrival)}`,
    `commands ${JSON.stringify(trial.commands)}`,
    `rebased  ${JSON.stringify(trial.rebased)}`,
    extra,
  ].join('\n');

/**
 * How many trials this sweeps, and the floor under how many of them actually
 * put a question to the merge.
 *
 * A trial asks nothing when neither side changed anything, or when only one
 * of them did: the merge then has nothing to reconcile, and a sweep of those
 * would pass with any rule at all. The floor is measured rather than assumed —
 * raise `TRIALS` by hand to sweep wider, and the floors move with it.
 */
const TRIALS = 4000;
const CONTESTED_TRIALS = 900;
/**
 * And the floor under the conflicts, which are the refusals this deliberately
 * excuses. Measured at 14 for the committed seeds; a sweep that stopped
 * producing them would have stopped asking what the exclusion is for.
 */
const CONFLICT_TRIALS = 8;

describe('what the merge produces from two valid stages', () => {
  it('is always a stage the schema accepts', () => {
    const failures: string[] = [];
    let contested = 0;
    let conflicts = 0;
    const unclosed = new Set<string>();

    for (let seed = 1; seed <= TRIALS; seed += 1) {
      const { trial, outcome } = runTrial(seed);
      const bothEdited =
        trial.commands.length > 0 &&
        canonicalize(trial.arrival) !== canonicalize(trial.stage.fields);
      if (bothEdited) contested += 1;

      if (outcome.kind === 'threw') {
        if (failures.length < 3) {
          failures.push(describeTrial(trial, `threw ${outcome.error}`));
        }
        continue;
      }
      // The generator's own guarantee, checked rather than assumed: a failure
      // below is only about the merge while both sides are documents the
      // schema accepts.
      if (!validates(trial.stage, trial.arrival)) {
        if (failures.length < 3) {
          failures.push(describeTrial(trial, 'the arrival itself is invalid'));
        }
        continue;
      }
      const parsed = stageSchema.safeParse({
        ...outcome.merged,
        id: trial.stage.id,
        type: trial.stage.type,
      });
      if (parsed.success) continue;
      const invented = parsed.error.issues.filter(
        (issue) => !isConflict(trial, outcome.merged, issue.path),
      );
      if (invented.length === 0) {
        conflicts += 1;
        continue;
      }
      for (const issue of invented) {
        if (KNOWN_UNCLOSED.includes(issue.message)) unclosed.add(issue.message);
      }
      const inventions = invented.filter(
        (issue) => !KNOWN_UNCLOSED.includes(issue.message),
      );
      if (inventions.length === 0) continue;
      if (failures.length < 3) {
        failures.push(
          describeTrial(
            trial,
            [
              `merged   ${JSON.stringify(outcome.merged)}`,
              `refused  ${inventions
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join(' | ')}`,
            ].join('\n'),
          ),
        );
      }
    }

    expect(failures).toEqual([]);
    expect([...unclosed].toSorted()).toEqual(KNOWN_UNCLOSED);
    expect(contested).toBeGreaterThan(CONTESTED_TRIALS);
    // The conflicts are counted rather than ignored: see `CONFLICT_TRIALS`.
    expect(conflicts).toBeGreaterThan(CONFLICT_TRIALS);
  });
});
