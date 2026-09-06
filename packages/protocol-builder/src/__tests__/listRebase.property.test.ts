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

type Row = { id?: string; text: string };

/** How a trial identifies a row for the reference model. */
type Mode = 'identified' | 'idless';

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
 */
const rowsOf = (rng: Rng, mode: Mode, count: number): Row[] =>
  Array.from({ length: count }, (_, i) =>
    mode === 'identified'
      ? { id: `r${String(i)}`, text: `r${String(i)}-0` }
      : { text: `r${String(int(rng, Math.max(1, count - 1)))}` },
  );

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
      next[at] = {
        ...next[at]!,
        text: `${next[at]!.id ?? ''}-${String(int(rng, 1000))}`,
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

/** What the reference model calls a row: its id, or its whole content. */
const keyOf = (row: Row): string => row.id ?? canonicalize(row);

// ------------------------------------------------------- reference merge

type Merged = Readonly<{ ids: string[]; byId: Map<string, Row> }>;

const index = (list: readonly Row[]) =>
  new Map(list.map((row) => [keyOf(row), row] as const));

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
 * - a row the local edit changed keeps the local content, otherwise the
 *   arrival's content stands.
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
    const localChanged =
      localRow !== undefined &&
      (baseRow === undefined ||
        canonicalize(localRow) !== canonicalize(baseRow));
    const row = localChanged ? localRow : (remoteById.get(id) ?? localRow);
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
 * `anything` is the general sweep. `inserts` is the arrival that says nothing
 * about where the rows already there belong — it only adds — which is what
 * makes the researcher's own order for them the one answer a merge can give,
 * and so the only arrival an order can be asserted against at all.
 */
type Arrival = 'anything' | 'inserts';

type Outcome =
  | { kind: 'threw'; error: unknown }
  | { kind: 'ok'; result: Row[]; rebased: Command[][] };

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

  let minted = 0;
  const mintLocal = (): Row => {
    minted += 1;
    const tag = `L${String(minted)}`;
    return mode === 'identified' ? { id: tag, text: tag } : { text: tag };
  };
  let mintedRemote = 0;
  const mintRemote = (): Row => {
    mintedRemote += 1;
    const tag = `R${String(mintedRemote)}`;
    return mode === 'identified' ? { id: tag, text: tag } : { text: tag };
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

  let remote: Row[] = base.map((row) => ({ ...row }));
  const remoteSteps = 1 + int(rng, 3);
  for (let step = 0; step < remoteSteps; step += 1) {
    remote =
      arrival === 'inserts'
        ? randomInsert(rng, remote, mintRemote)
        : randomEdit(rng, mode, remote, mintRemote);
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
    let fields = docWith(path, remote);
    const rebased: Command[][] = [];
    for (const batch of batches) {
      const next = rebaseCommands(basis, fields, batch);
      rebased.push([...next]);
      fields = applyCommands(fields, [...next]);
      basis = applyCommands(basis, [...batch]);
    }
    return {
      trial,
      outcome: { kind: 'ok', result: readList(fields, path), rebased },
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
};

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
 * whose anchor row it cannot tell from another — an id-less list holding the
 * same row twice, where the row a moved one will follow names two places — and
 * that refusal is this file's deliberate answer to a guess that would write
 * onto the wrong row, not something the order of a merge decides. See
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

/** Whether a trial's diff fell back to writing a whole list out. */
const carriesAWholeListSet = (trial: Trial): boolean =>
  trial.batches.some((batch) =>
    batch.some(
      (command) => command.op === 'set' && Array.isArray(command.value),
    ),
  );

describe('rebasing a list edit onto a collaborator’s arrival', () => {
  for (const mode of ['identified', 'idless'] as const) {
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
    });
  }
});
