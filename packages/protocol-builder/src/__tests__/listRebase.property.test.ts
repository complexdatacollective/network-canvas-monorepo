/**
 * A property sweep over the list-aware draft diff (`commandsFromDraftChange`),
 * the rebase (`rebaseCommands`) and the apply engine, checking the invariants
 * the code comments promise against a reference three-way merge.
 *
 * Randomised, but not flaky: the seeds are the fixed run 1…`TRIALS`, so every
 * run of this file exercises the same trials in the same order and a failure
 * reproduces from the seed it prints. Raise `TRIALS` by hand to sweep wider
 * when changing the merge — the counterexamples that produced
 * `listRebase.merge.test.ts` were found at 20,000 and minimised from the same
 * printout; the committed count is the one that keeps this file well under a
 * second.
 */
import { describe, expect, it } from 'vitest';

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

// ---------------------------------------------------------------- rows

/**
 * A row, with two properties an edit can reach independently.
 *
 * Two, and not one, because a row is where the two sides can both have edited
 * and still not disagree: one changes the question, the other the input
 * control. A single-property row cannot ask that.
 */
type Row = { id?: string; text?: string; hint?: string };

/** The properties an edit reaches, which is what a leaf merge is asked of. */
const LEAVES = ['text', 'hint'] as const;

/**
 * How a trial identifies a row for the reference model.
 *
 * `duplicated` is `identified` with the ids drawn from an alphabet smaller
 * than the list, so the same id names two rows — a roster imported a second
 * time, a row copy-pasted. An id is then still what tells a row from the rows
 * around it and no longer what tells it from its own copy, so the copies are
 * the question `idless` asks of content, asked of an id.
 */
type Mode = 'identified' | 'idless' | 'duplicated';

/**
 * The rows a trial starts from.
 *
 * Identified rows are all distinct, because an id is minted per row. Id-less
 * rows are drawn from an alphabet SMALLER than the list, so the same row
 * appears in it twice — which a real document holds (a form asking one question
 * twice, an options list with two blank rows) and which is the whole difficulty
 * of an identity that is content: two such rows are two rows nothing tells
 * apart, and every correspondence this code draws has to pair them off one
 * apiece rather than answer both with the same partner.
 *
 * A duplicated row is drawn from that same smaller alphabet and carries the id
 * to match, so two copies are one row said twice at both ends: the reference
 * model below keys a row on its id when it has one, which makes a duplicated id
 * exactly what a duplicated content is — a key the list holds twice, whose
 * copies the model counts rather than merely notes the presence of.
 */
const rowsOf = (rng: Rng, mode: Mode, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => {
    if (mode === 'identified') {
      return {
        id: `r${String(i)}`,
        text: `r${String(i)}-0`,
        hint: `h${String(i)}-0`,
      };
    }
    const drawn = `r${String(int(rng, Math.max(1, count - 1)))}`;
    return mode === 'idless' ? { text: drawn } : { id: drawn, text: drawn };
  });

/** Applies one random edit to a list, returning the new list. */
function randomEdit(
  rng: Rng,
  mode: Mode,
  list: readonly Row[],
  mint: () => Row,
): Row[] {
  const next = list.map((row) => ({ ...row }));
  // An idless row's identity IS its content, so rewriting one in place is
  // indistinguishable from deleting it and adding another — there is no
  // question to ask about it, and it is left out of that mode.
  //
  // A duplicated row is left out for the mirror image of that reason: its
  // identity is an id its copy also carries, so an edit to one copy leaves two
  // rows that are the same row by identity and different by content — a state
  // the model below cannot say (it keeps one content per key), and one no
  // merge rule could answer without deciding which copy is which. The copies
  // stay interchangeable, which is what makes them copies.
  const kinds =
    mode === 'identified'
      ? (['append', 'insert', 'remove', 'move', 'edit'] as const)
      : (['append', 'insert', 'remove', 'move'] as const);
  const kind: 'append' | 'insert' | 'remove' | 'move' | 'edit' =
    next.length === 0 ? 'append' : pick(rng, kinds);
  switch (kind) {
    case 'append':
      next.push(mint());
      return next;
    case 'insert':
      next.splice(int(rng, next.length + 1), 0, mint());
      return next;
    case 'remove':
      next.splice(int(rng, next.length), 1);
      return next;
    case 'move': {
      const from = int(rng, next.length);
      const to = int(rng, next.length);
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    }
    case 'edit': {
      const at = int(rng, next.length);
      // ONE leaf, chosen at random, so the two sides can edit the same row
      // without disagreeing about anything.
      const leaf = pick(rng, LEAVES);
      next[at] = {
        ...next[at]!,
        [leaf]: `${next[at]!.id ?? ''}-${leaf}-${String(int(rng, 1000))}`,
      };
      return next;
    }
  }
}

/** Adds one row at a random position, which is all an `inserts` arrival does. */
function randomInsert(rng: Rng, list: readonly Row[], mint: () => Row): Row[] {
  const next = list.map((row) => ({ ...row }));
  next.splice(int(rng, next.length + 1), 0, mint());
  return next;
}

/**
 * Adds or deletes one row, which is all a `comings and goings` arrival does.
 *
 * A deletion says no more about where the rows still there belong than an
 * insertion does, so the researcher's order for them is still the one answer —
 * but it takes rows OUT from between them, which is what the anchors an added
 * row is put back beside are read off.
 */
function randomInsertOrRemove(
  rng: Rng,
  list: readonly Row[],
  mint: () => Row,
): Row[] {
  const next = list.map((row) => ({ ...row }));
  if (next.length === 0 || rng() < 0.5) {
    next.splice(int(rng, next.length + 1), 0, mint());
    return next;
  }
  next.splice(int(rng, next.length), 1);
  return next;
}

/** What the reference model calls a row: its id, or its whole content. */
const keyOf = (row: Row): string => row.id ?? canonicalize(row);

// ------------------------------------------------------- reference merge

type Merged = Readonly<{ ids: string[]; byId: Map<string, Row> }>;

const index = (list: readonly Row[]) =>
  new Map(list.map((row) => [keyOf(row), row] as const));

/**
 * The row a leaf merge leaves, for a row the local edit changed.
 *
 * The arrival's row with the local side's decisions written over it: a
 * property they changed is theirs, and one they left as they found it is
 * whatever reached it meanwhile. With nothing to merge against — a row the
 * local side ADDED, or one the arrival does not hold — the local row is the
 * whole answer.
 */
const mergedLeaves = (
  base: Row | undefined,
  local: Row,
  remote: Row | undefined,
): Row => {
  if (base === undefined || remote === undefined) return local;
  const merged: Row = { ...remote };
  for (const leaf of LEAVES) {
    const value = local[leaf];
    if (value === base[leaf]) continue;
    if (value === undefined) Reflect.deleteProperty(merged, leaf);
    else merged[leaf] = value;
  }
  return merged;
};

/** How many copies of each row a list holds. */
const copies = (list: readonly Row[]) =>
  list.reduce<Map<string, number>>(
    (counted, row) =>
      counted.set(keyOf(row), (counted.get(keyOf(row)) ?? 0) + 1),
    new Map(),
  );

/**
 * The three-way merge every route through this code claims to perform, stated
 * over row identity alone:
 *
 * - a row present in the ancestor survives only if BOTH sides kept it;
 * - a row either side added is present;
 * - a row the local edit changed keeps the local content PROPERTY by property,
 *   so a property only the arrival changed keeps the arrival's value and one
 *   they both changed keeps the local value; a row the local edit left alone
 *   is the arrival's outright.
 *
 * Said as a COUNT rather than as presence, because an id-less row's identity is
 * its content and a list may hold two of them: the question is then not whether
 * that row survives but how many copies do. The three rules become
 *
 *   min(base, local, remote) + max(0, local - base) + max(0, remote - base)
 *
 * — the ancestor copies BOTH sides kept, plus the copies each side added. For a
 * row no list holds twice that is exactly the three rules; for one held twice
 * it says the ancestor's copies are paired off with each side's, so two people
 * who each delete a copy have deleted the same copy rather than two of them.
 *
 * Order is deliberately not asserted here — a refused move legitimately leaves
 * the arrival's order — so this is purely the data-loss dimension.
 */
function referenceMerge(
  base: readonly Row[],
  local: readonly Row[],
  remote: readonly Row[],
): Merged {
  const baseById = index(base);
  const localById = index(local);
  const remoteById = index(remote);
  const inBase = copies(base);
  const inLocal = copies(local);
  const inRemote = copies(remote);
  const ids: string[] = [];
  const byId = new Map<string, Row>();
  const consider = (id: string) => {
    if (byId.has(id)) return;
    const ancestral = inBase.get(id) ?? 0;
    const locally = inLocal.get(id) ?? 0;
    const remotely = inRemote.get(id) ?? 0;
    const present =
      Math.min(ancestral, locally, remotely) +
      Math.max(0, locally - ancestral) +
      Math.max(0, remotely - ancestral);
    if (present === 0) return;
    const localRow = localById.get(id);
    const baseRow = baseById.get(id);
    const remoteRow = remoteById.get(id);
    const localChanged =
      localRow !== undefined &&
      (baseRow === undefined ||
        canonicalize(localRow) !== canonicalize(baseRow));
    const row = localChanged
      ? mergedLeaves(baseRow, localRow, remoteRow)
      : (remoteRow ?? localRow);
    if (row === undefined) return;
    for (let copy = 0; copy < present; copy += 1) ids.push(id);
    byId.set(id, row);
  };
  for (const row of local) consider(keyOf(row));
  for (const row of remote) consider(keyOf(row));
  return { ids: ids.toSorted(), byId };
}

const readList = (doc: SectionDoc, path: readonly string[]): Row[] => {
  let cursor: unknown = doc;
  for (const segment of path) {
    if (typeof cursor !== 'object' || cursor === null) return [];
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return Array.isArray(cursor) ? (cursor as Row[]) : [];
};

const docWith = (path: readonly string[], list: readonly Row[]): SectionDoc => {
  if (path.length === 1) return { label: 'S', [path[0]!]: [...list] };
  return { label: 'S', nodeConfig: { type: 'x', [path[1]!]: [...list] } };
};

/**
 * Whether a document holds the container an arrival's dropped capability took
 * away.
 *
 * The stage document is the container for a top-level list and holds it under
 * its own key, so it is the same question at both depths: is the key the
 * collaborator removed there?
 */
const heldTheContainer = (document: SectionDoc, path: readonly string[]) =>
  Object.hasOwn(document, path[0]!);

// ---------------------------------------------------------------- fuzz

type Trial = Readonly<{
  seed: number;
  mode: Mode;
  path: readonly string[];
  base: Row[];
  local: Row[];
  remote: Row[];
  batches: Command[][];
  appendedLast: Row | null;
}>;

/**
 * What the collaborator did while the researcher was editing.
 *
 * `anything` is the general sweep. `inserts` and `comings and goings` are the
 * arrivals that say nothing about where the rows already there belong — they
 * only add, or add and delete — which is what makes the researcher's own order
 * for them the one answer a merge can give, and so the only arrivals an order
 * can be asserted against at all.
 *
 * `dropped container` is not a list edit at all: the collaborator switched off
 * the capability the list lives inside, so the key above it is gone and the
 * list reads as empty at every depth. Every ancestor row went with it, which
 * leaves only the rows the researcher added — and a command carrying none of
 * those has nothing to write, into a container that is not there to write it
 * into.
 */
type Arrival =
  | 'anything'
  | 'inserts'
  | 'comings and goings'
  | 'dropped container';

const arrivalStep = (
  arrival: Arrival,
  rng: Rng,
  mode: Mode,
  list: readonly Row[],
  mint: () => Row,
): Row[] => {
  if (arrival === 'inserts') return randomInsert(rng, list, mint);
  if (arrival === 'comings and goings')
    return randomInsertOrRemove(rng, list, mint);
  return randomEdit(rng, mode, list, mint);
};

type Outcome =
  | { kind: 'threw'; error: unknown }
  | {
      kind: 'ok';
      result: Row[];
      rebased: Command[][];
      /**
       * Whole-list `set`s the rebase emitted that write the list ALREADY at
       * their key, reading an absent one as empty the way the rebase and the
       * apply engine both read it.
       *
       * Such a command has nothing to say, and it does not land inertly: a
       * `set` writes every container on the way to its key, so one whose rows
       * the arrival has all taken away puts the container itself back.
       */
      inert: Command[];
      /**
       * How many whole-list `set`s the rebase refused into a container that is
       * no longer there — the shape above, answered.
       */
      refusedIntoNothing: number;
    };

function runTrial(
  seed: number,
  mode: Mode,
  arrival: Arrival = 'anything',
): Readonly<{
  trial: Trial;
  outcome: Outcome;
}> {
  const rng = mulberry32(seed);
  const path = rng() < 0.5 ? ['prompts'] : ['nodeConfig', 'form'];
  const base = rowsOf(rng, mode, int(rng, 5));

  // A row either side adds is a row of its own, in every mode: the copies a
  // trial is about are the ones the BASE holds — the roster imported twice,
  // the row copy-pasted before this editing session began. A minted copy would
  // put an added row under a key the base also holds, and the model below reads
  // the two lists' end states rather than the steps between them: a researcher
  // who deletes a row and pastes a copy back leaves the same count as one who
  // never touched it, which is a question about the model rather than about the
  // merge.
  let minted = 0;
  const mintLocal = (): Row => {
    minted += 1;
    const tag = `L${String(minted)}`;
    return mode === 'idless' ? { text: tag } : { id: tag, text: tag };
  };
  let mintedRemote = 0;
  const mintRemote = (): Row => {
    mintedRemote += 1;
    const tag = `R${String(mintedRemote)}`;
    return mode === 'idless' ? { text: tag } : { id: tag, text: tag };
  };

  // One local "step" is one or two edits diffed together and dispatched as ONE
  // batch — so a step no single row operation explains falls back to a
  // whole-list `set`, which is exactly the case the merge exists for, and a
  // trial with several steps exercises the batch-by-batch walk `rebasePending`
  // performs.
  let local: Row[] = base.map((row) => ({ ...row }));
  const batches: Command[][] = [];
  let appendedLast: Row | null = null;
  const steps = 1 + int(rng, 3);
  for (let step = 0; step < steps; step += 1) {
    const before = local;
    let after = randomEdit(rng, mode, local, mintLocal);
    const wasAppend =
      after.length === before.length + 1 &&
      canonicalize(after.slice(0, before.length)) === canonicalize(before);
    if (rng() < 0.35) {
      after = randomEdit(rng, mode, after, mintLocal);
      appendedLast = null;
    } else {
      appendedLast = wasAppend ? after.at(-1)! : null;
    }
    const commands = commandsFromDraftChange(
      docWith(path, before),
      docWith(path, after),
    );
    if (commands.length > 0) batches.push(commands);
    local = after;
  }

  // A dropped container took every ancestor row with it, which is the empty
  // list the rebase reads at that path — and there is no list edit to make.
  const dropped = arrival === 'dropped container';
  let remote: Row[] = dropped ? [] : base.map((row) => ({ ...row }));
  const remoteSteps = dropped ? 0 : 1 + int(rng, 3);
  for (let step = 0; step < remoteSteps; step += 1) {
    remote = arrivalStep(arrival, rng, mode, remote, mintRemote);
  }

  const trial: Trial = {
    seed,
    mode,
    path,
    base,
    local,
    remote,
    batches,
    appendedLast,
  };

  try {
    // Exactly `ProtocolBuilderSessionStore.rebasePending`: each batch is
    // rebased against the document it was made on (the old base plus every
    // earlier batch, as issued) onto the new base plus every earlier REBASED
    // batch.
    let basis = docWith(path, base);
    let fields: SectionDoc = dropped ? { label: 'S' } : docWith(path, remote);
    const rebased: Command[][] = [];
    const inert: Command[] = [];
    let refusedIntoNothing = 0;
    for (const batch of batches) {
      const next = rebaseCommands(basis, fields, batch);
      const here = readList(fields, path);
      for (const command of next) {
        if (command.op !== 'set' || !Array.isArray(command.value)) continue;
        if (canonicalize(command.value) === canonicalize(here))
          inert.push(command);
      }
      if (
        next.length < batch.length &&
        batch.some(
          (command) => command.op === 'set' && Array.isArray(command.value),
        ) &&
        !heldTheContainer(fields, path)
      ) {
        refusedIntoNothing += 1;
      }
      rebased.push([...next]);
      fields = applyCommands(fields, [...next]);
      basis = applyCommands(basis, [...batch]);
    }
    return {
      trial,
      outcome: {
        kind: 'ok',
        result: readList(fields, path),
        rebased,
        inert,
        refusedIntoNothing,
      },
    };
  } catch (error) {
    return { trial, outcome: { kind: 'threw', error } };
  }
}

const describeTrial = (trial: Trial, extra: string) =>
  [
    `seed ${String(trial.seed)} (${trial.mode}) at ${trial.path.join('.')}`,
    `base    ${JSON.stringify(trial.base)}`,
    `local   ${JSON.stringify(trial.local)}`,
    `arrival ${JSON.stringify(trial.remote)}`,
    `batches ${JSON.stringify(trial.batches)}`,
    extra,
  ].join('\n');

const TRIALS = 400;

/**
 * The order sweep runs wider than the rest, because the case it is about has to
 * be GENERATED to be asked: a submit that reorders rows the merge can tell
 * apart, and that no single row operation explains. Id-less rows are drawn from
 * an alphabet smaller than the list, so most of them are copies of one another
 * and there is no fact about the order of two of those — which makes the case
 * rare enough in that mode to need the wider run.
 */
const ORDER_TRIALS = 2000;

/**
 * How many trials of each mode must actually produce that submit. Without this
 * the sweep would pass by never asking the question.
 */
const REORDERING_TRIALS: Readonly<Record<Mode, number>> = {
  identified: 100,
  idless: 5,
  duplicated: 5,
};

/**
 * And how many must produce a new row whose neighbour above it the arrival
 * deleted, which is the shape the anchoring rule exists for.
 */
const ORPHANED_TRIALS: Readonly<Record<Mode, number>> = {
  identified: 300,
  idless: 100,
  duplicated: 100,
};

/**
 * And how many must move a row to a place whose immediate neighbours the
 * arrival deleted, and have the rebase keep every command all the same — the
 * move the rows further out are what anchor.
 */
const ANCHORED_MOVE_TRIALS: Readonly<Record<Mode, number>> = {
  identified: 8,
  idless: 1,
  duplicated: 1,
};

/**
 * And how many must have both sides edit one row, the arrival changing a
 * property the researcher's submit left alone.
 */
const CROSS_EDIT_TRIALS = 75;

/**
 * And how many whole-list `set`s the dropped-container sweep must actually
 * refuse: the command that had nothing left to write, into the container that
 * is not there to write it into.
 */
const DROPPED_CONTAINER_TRIALS: Readonly<Record<Mode, number>> = {
  identified: 75,
  idless: 5,
  duplicated: 5,
};

/**
 * The leaf sweep runs wider than the general one for the same reason the order
 * sweep does: both sides have to edit the SAME row, and different properties
 * of it, which a short run of random edits rarely produces.
 */
const LEAF_TRIALS = 4000;

function sweep(
  mode: Mode,
  check: (trial: Trial, outcome: Outcome) => string | null,
): string[] {
  const failures: string[] = [];
  for (let seed = 1; seed <= TRIALS; seed += 1) {
    const { trial, outcome } = runTrial(seed, mode);
    const problem = check(trial, outcome);
    if (problem === null) continue;
    failures.push(describeTrial(trial, problem));
    if (failures.length >= 3) break;
  }
  return failures;
}

const neverRefused = (_trial: Trial, outcome: Outcome) =>
  outcome.kind === 'threw' ? `THREW ${String(outcome.error)}` : null;

function mergesLikeTheModel(trial: Trial, outcome: Outcome): string | null {
  if (outcome.kind !== 'ok') return null;
  const expected = referenceMerge(trial.base, trial.local, trial.remote);
  const actual = outcome.result.map(keyOf);
  // A row held more times than the merge accounts for. Not "held twice": a
  // list may legitimately hold the same id-less row twice, and the model says
  // how many copies of it should survive.
  const held = copies(outcome.result);
  const duplicated = [...held].some(
    ([id, count]) => count > expected.ids.filter((each) => each === id).length,
  );
  const sameIds =
    canonicalize(actual.toSorted()) === canonicalize(expected.ids);
  const sameContent = outcome.result.every(
    (row) =>
      expected.byId.has(keyOf(row)) &&
      canonicalize(row) === canonicalize(expected.byId.get(keyOf(row))),
  );
  if (!duplicated && sameIds && sameContent) return null;
  return [
    `rebased  ${JSON.stringify(outcome.rebased)}`,
    `got      ${JSON.stringify(outcome.result)}`,
    `expected ${JSON.stringify([...expected.byId.values()])}`,
    duplicated ? 'DUPLICATED ROWS' : '',
  ].join('\n');
}

/**
 * The rows a trial can say anything about the ORDER of: those the
 * researcher's list and the answer hold the same number of times.
 *
 * A list may hold the same id-less row twice, and there is no fact about which
 * of the copies is which — but there IS a fact about where they sit among the
 * rows that are not copies of them. `[a, b, a]` with the first `a` deleted is
 * `[b, a]`, and an answer of `[a, b]` has kept the wrong one: the copies are
 * indistinguishable, their positions are not. So the copies are compared by
 * OCCURRENCE, which is exactly what comparing the two projections as sequences
 * does, rather than being left out.
 *
 * Equal counts is what makes that comparison well posed. A row the arrival
 * added a copy of, or one the merge legitimately kept a different number of,
 * has no occurrence-to-occurrence correspondence to check, and the count
 * itself is the data-loss question `mergesLikeTheModel` already asks.
 */
const orderableKeys = (
  trial: Trial,
  result: readonly Row[],
): ((key: string) => boolean) => {
  const inLocal = copies(trial.local);
  const inResult = copies(result);
  return (key) => {
    const locally = inLocal.get(key);
    return locally !== undefined && locally === inResult.get(key);
  };
};

/** How many commands a trial made, and how many the rebase kept. */
const commandCount = (batches: readonly (readonly Command[])[]): number =>
  batches.reduce((total, batch) => total + batch.length, 0);

/**
 * An arrival that only ADDED rows says nothing about where the rows already
 * there belong, so the order the researcher left them in is the answer — every
 * one of their steps is in it, whether the diff could say it structurally or
 * had to fall back to a whole-list `set`.
 *
 * Asked only of a rebase that kept every command, because a REFUSED one is a
 * step of the researcher's the merge never saw. `resolveMove` refuses a move
 * whose row the arrival took away, and one no surviving row is left to anchor
 * — the merge has already decided that row is gone, and a move landed on a
 * guess would reorder rows the researcher never touched. That refusal is this
 * file's deliberate answer, not something the order of a merge decides. See
 * `resolveMove` in `form/arrayFields/arrayFieldCommands.ts`.
 */
function keepsTheLocalOrder(trial: Trial, outcome: Outcome): string | null {
  if (outcome.kind !== 'ok') return null;
  if (commandCount(outcome.rebased) !== commandCount(trial.batches))
    return null;
  const orderable = orderableKeys(trial, outcome.result);
  const ordering = (list: readonly Row[]) => list.map(keyOf).filter(orderable);
  const local = ordering(trial.local);
  const got = ordering(outcome.result);
  if (canonicalize(local) === canonicalize(got)) return null;
  return [
    `got      ${JSON.stringify(outcome.result)}`,
    `the researcher left ${JSON.stringify(local)}, and the merge gave ${JSON.stringify(got)}`,
  ].join('\n');
}

/**
 * Whether a trial's arrival can be told from a REORDER at all.
 *
 * An id-less row's identity is its content, so a list holding the same row
 * twice and arriving back holding it once has not said which copy went. Every
 * correspondence here pairs the copies off in order, which reads that arrival
 * as the FIRST copy surviving — and where the survivor sits at the other end
 * of the list, that reading is a reorder, which the researcher's order does not
 * win against (a collaborator who moves a row while the researcher only edits
 * one keeps their move). There is no fact in either document that says
 * otherwise, so those trials have no order to assert and are left out of this
 * sweep rather than asserted about wrongly.
 */
function deletionsAreUnambiguous(trial: Trial): boolean {
  const inBase = copies(trial.base);
  const inRemote = copies(trial.remote);
  return [...inBase].every(
    ([key, count]) => count === 1 || (inRemote.get(key) ?? 0) >= count,
  );
}

/**
 * Whether a trial asks the question the anchoring rule exists for: a row the
 * researcher added whose neighbour above it the arrival deleted.
 *
 * That is the only shape in which a new row has nothing immediately beside it
 * to be put back after, and so the only one that reaches the rest of the rule.
 */
function addedRowLostItsPredecessor(trial: Trial): boolean {
  const inBase = copies(trial.base);
  const inLocal = copies(trial.local);
  const inRemote = copies(trial.remote);
  const added = (key: string) =>
    (inLocal.get(key) ?? 0) > (inBase.get(key) ?? 0);
  const deletedByTheArrival = (key: string) =>
    (inRemote.get(key) ?? 0) < (inBase.get(key) ?? 0);
  return trial.local.some((row, at) => {
    const above = at === 0 ? undefined : trial.local[at - 1];
    return (
      above !== undefined &&
      added(keyOf(row)) &&
      deletedByTheArrival(keyOf(above))
    );
  });
}

/**
 * Whether a trial asks the anchoring question of a MOVE: the researcher put a
 * row somewhere whose immediate neighbours — the row it lands after, and the
 * row it lands before — the arrival then deleted, or which are not there at all
 * because it landed at one end of the list.
 *
 * That is the only shape in which a move has nothing immediately beside it to
 * be anchored on, and so the only one that reaches the rest of the rule: the
 * rows further out, which still say where the moved row belongs.
 */
function movedPastADeletedNeighbour(trial: Trial): boolean {
  const inBase = copies(trial.base);
  const inRemote = copies(trial.remote);
  const lost = (row: Row | undefined) =>
    row === undefined ||
    (inRemote.get(keyOf(row)) ?? 0) < (inBase.get(keyOf(row)) ?? 0);
  let document = docWith(trial.path, trial.base);
  let asked = false;
  for (const batch of trial.batches) {
    for (const command of batch) {
      const before = readList(document, trial.path);
      document = applyCommands(document, [command]);
      if (command.op !== 'moveItem') continue;
      const landed = [...before];
      const [row] = landed.splice(command.from, 1);
      if (row === undefined) continue;
      landed.splice(command.to, 0, row);
      if (lost(landed[command.to - 1]) && lost(landed[command.to + 1]))
        asked = true;
    }
  }
  return asked;
}

/** Whether the researcher's steps gave the rows they kept a NEW order. */
function localReordered(trial: Trial): boolean {
  const inBase = copies(trial.base);
  const inLocal = copies(trial.local);
  const kept = (key: string) => inBase.get(key) === 1 && inLocal.get(key) === 1;
  const ordering = (list: readonly Row[]) => list.map(keyOf).filter(kept);
  return (
    canonicalize(ordering(trial.base)) !== canonicalize(ordering(trial.local))
  );
}

/**
 * Whether a trial asks the leaf question: one row both sides edited, where the
 * arrival changed a property the researcher's submit left alone.
 */
function sidesEditedDifferentLeaves(trial: Trial): boolean {
  const localById = index(trial.local);
  const remoteById = index(trial.remote);
  return trial.base.some((baseRow) => {
    const local = localById.get(keyOf(baseRow));
    const remote = remoteById.get(keyOf(baseRow));
    if (local === undefined || remote === undefined) return false;
    return (
      LEAVES.some((leaf) => local[leaf] !== baseRow[leaf]) &&
      LEAVES.some(
        (leaf) =>
          remote[leaf] !== baseRow[leaf] && local[leaf] === baseRow[leaf],
      )
    );
  });
}

/**
 * Whether the rebase emitted a whole-list `set` with nothing left to say.
 *
 * The merge can answer with the list the arrival already holds — every row the
 * `set` carried is one the arrival took away — and the command is then a
 * command about nothing. Emitting it anyway is not inert: a `set` writes every
 * container on the way to its key, so one merged to an empty list put back the
 * capability the collaborator had just switched off, holding nothing.
 */
function saysNothing(_trial: Trial, outcome: Outcome): string | null {
  if (outcome.kind !== 'ok' || outcome.inert.length === 0) return null;
  return [
    `rebased  ${JSON.stringify(outcome.rebased)}`,
    `wrote the list already there: ${JSON.stringify(outcome.inert)}`,
  ].join('\n');
}

/** Whether a trial's diff fell back to writing a whole list out. */
const carriesAWholeListSet = (trial: Trial): boolean =>
  trial.batches.some((batch) =>
    batch.some(
      (command) => command.op === 'set' && Array.isArray(command.value),
    ),
  );

describe('rebasing a list edit onto a collaborator’s arrival', () => {
  for (const mode of ['identified', 'idless', 'duplicated'] as const) {
    describe(`rows ${mode}`, () => {
      it('never emits a command the apply engine refuses', () => {
        expect(sweep(mode, neverRefused)).toEqual([]);
      });

      it('loses no row either side kept, and keeps no row either side deleted', () => {
        expect(sweep(mode, mergesLikeTheModel)).toEqual([]);
      });

      it('keeps an append an append', () => {
        expect(
          sweep(mode, (trial, outcome) => {
            const appended = trial.appendedLast;
            if (appended === null || outcome.kind !== 'ok') return null;
            const last = outcome.result.at(-1);
            if (last !== undefined && keyOf(last) === keyOf(appended))
              return null;
            return `the last local edit appended ${JSON.stringify(appended)}, which is not last in ${JSON.stringify(outcome.result)}`;
          }),
        ).toEqual([]);
      });

      /**
       * The order dimension, which the reference merge above deliberately says
       * nothing about: against an arrival that reordered rows itself there are
       * two defensible answers, so the sweep asks the question of an arrival
       * that only ADDED rows, where there is one.
       *
       * A submit that moves a row and adds another is a whole-list `set`, and
       * such a `set` used to be merged in the arrival's order for every
       * surviving row — which discarded the move. The count below is what keeps
       * this from passing vacuously: it is the number of trials that actually
       * produced that submit.
       */
      it('keeps the researcher’s order when the arrival only added rows', () => {
        const failures: string[] = [];
        let reordering = 0;
        for (let seed = 1; seed <= ORDER_TRIALS; seed += 1) {
          const { trial, outcome } = runTrial(seed, mode, 'inserts');
          if (localReordered(trial) && carriesAWholeListSet(trial))
            reordering += 1;
          const problem = keepsTheLocalOrder(trial, outcome);
          if (problem !== null && failures.length < 3)
            failures.push(describeTrial(trial, problem));
        }
        expect(failures).toEqual([]);
        expect(reordering).toBeGreaterThan(REORDERING_TRIALS[mode]);
      });

      /**
       * The same order question, asked of an arrival that also DELETES.
       *
       * Deleting says no more about where the surviving rows belong than
       * inserting does, so the researcher's order is still the one answer —
       * but it takes away the rows their new ones were written beside, which
       * is what says where a new row goes. Anchoring only on the row directly
       * above and falling back to a position the moment that row was gone sent
       * a new row past rows that had survived: `[a, b, c]` submitted as
       * `[a, x, c]` and rebased onto an arrival that deleted `a` answered
       * `[c, x]`, with `x` behind the very row it was written in front of.
       *
       * A MOVED row is anchored by the same rule and asks the same question,
       * which is the second count: how many trials moved a row to a place
       * whose immediate neighbours the arrival deleted, and had every command
       * survive the rebase. Refusing such a move outright — which is what
       * reading only the immediate neighbours did — leaves the researcher's
       * reorder out of the answer, so that count is zero for the rule this
       * replaces and every trial in it is one where a move is asserted about.
       */
      it('keeps the researcher’s order when the arrival only added and deleted rows', () => {
        const failures: string[] = [];
        let orphaned = 0;
        let anchoredMoves = 0;
        for (let seed = 1; seed <= ORDER_TRIALS; seed += 1) {
          const { trial, outcome } = runTrial(seed, mode, 'comings and goings');
          if (!deletionsAreUnambiguous(trial)) continue;
          if (addedRowLostItsPredecessor(trial)) orphaned += 1;
          if (
            outcome.kind === 'ok' &&
            commandCount(outcome.rebased) === commandCount(trial.batches) &&
            movedPastADeletedNeighbour(trial)
          ) {
            anchoredMoves += 1;
          }
          const problem = keepsTheLocalOrder(trial, outcome);
          if (problem !== null && failures.length < 3)
            failures.push(describeTrial(trial, problem));
        }
        expect(failures).toEqual([]);
        expect(orphaned).toBeGreaterThan(ORPHANED_TRIALS[mode]);
        expect(anchoredMoves).toBeGreaterThan(ANCHORED_MOVE_TRIALS[mode]);
      });

      /**
       * The arrival that is not a list edit at all: the collaborator switched
       * OFF the capability the list lives inside, so the container above it is
       * gone and every ancestor row with it.
       *
       * That leaves a whole-list `set` carrying only the rows the researcher
       * ADDED — and where they added none, carrying nothing. Such a command
       * has to be refused rather than emitted, because a `set` writes every
       * container on the way to its key: comparing the merge with what the
       * RESEARCHER wrote called it changed and put the switched-off capability
       * back, holding an empty list.
       *
       * `mergesLikeTheModel` is the half of the question that keeps this from
       * being answered by refusing everything: a row the researcher added is
       * one the arrival never saw, so it is written back — container and all,
       * exactly as an `insertItem` into a dropped container is.
       *
       * The count is what keeps the refusal itself from going unexercised: the
       * number of batches whose whole-list `set` was refused into a container
       * that is no longer there. It is zero for the rule this replaces.
       */
      it('never puts back a container the arrival dropped', () => {
        const failures: string[] = [];
        let refused = 0;
        for (let seed = 1; seed <= TRIALS; seed += 1) {
          const { trial, outcome } = runTrial(seed, mode, 'dropped container');
          if (outcome.kind === 'ok') refused += outcome.refusedIntoNothing;
          const problem =
            neverRefused(trial, outcome) ??
            saysNothing(trial, outcome) ??
            mergesLikeTheModel(trial, outcome);
          if (problem !== null && failures.length < 3)
            failures.push(describeTrial(trial, problem));
        }
        expect(failures).toEqual([]);
        expect(refused).toBeGreaterThan(DROPPED_CONTAINER_TRIALS[mode]);
      });
    });
  }

  /**
   * The leaf dimension, asked of identified rows alone.
   *
   * An id-less row's identity IS its content, so there is no such thing as an
   * edit to one property of one: a rewritten id-less row is a row removed and
   * a row added, which the sweeps above already say.
   *
   * `mergesLikeTheModel` is the same check the general sweep makes — the model
   * states the leaf rule, so it already asks this — and what is added here is
   * the count that keeps it from passing vacuously: the trials in which the
   * arrival really did change a property the researcher's submit left alone.
   */
  it('keeps a collaborator’s edit to a property the submit left alone', () => {
    const failures: string[] = [];
    let asked = 0;
    for (let seed = 1; seed <= LEAF_TRIALS; seed += 1) {
      const { trial, outcome } = runTrial(seed, 'identified');
      if (sidesEditedDifferentLeaves(trial)) asked += 1;
      const problem = mergesLikeTheModel(trial, outcome);
      if (problem !== null && failures.length < 3)
        failures.push(describeTrial(trial, problem));
    }
    expect(failures).toEqual([]);
    expect(asked).toBeGreaterThan(CROSS_EDIT_TRIALS);
  });
});
