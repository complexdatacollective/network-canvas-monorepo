import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';
import { getCanRedo, getCanUndo } from '~/selectors/protocol';

import createTimeline, {
  canRedo,
  canUndo,
  type Locus,
  timelineActions,
} from '../timeline';

/**
 * "Undo is impossible" and "redo is impossible" are decided in two places at
 * once: the timeline reducer, which silently drops the action, and
 * `getCanUndo`/`getCanRedo`, which decide whether to offer the control at all
 * and — through `undoWithNavigation` — whether to announce the result. When
 * those two answers drift apart the control advertises an operation that then
 * does nothing.
 *
 * `canUndo`/`canRedo` are the single statement of the rule, so this file pins
 * three things a future edit could break independently:
 *
 *  1. the reducer applies the action exactly when the predicate says it may,
 *  2. the selector never offers what the reducer would refuse, and
 *  3. the selector's ONE extra refusal (a null entry at the head of `past`) is
 *     still there, and is still the only place the two answers differ.
 */

type Point = { name: string } | null;

const locus = (id: string): Locus => ({ id, path: '' });

// The wrapped reducer is never reached: every case here dispatches a timeline
// action, which the reducer's own cases handle ahead of the default case.
const timelineReducer = createTimeline<Point>(
  (state: Point = null): Point => state,
);

const buildState = (past: Point[], present: Point, future: Point[] = []) => ({
  past,
  present,
  timeline: [...past.map((_, index) => locus(`past-${index}`)), locus('now')],
  future,
  futureTimeline: future.map((_, index) => locus(`future-${index}`)),
});

type TimelineFixture = ReturnType<typeof buildState>;

// Persisted state written before `future` existed. The reducer carries
// backwards-compatibility handling for exactly this shape, so the predicate
// has to survive it too.
const legacyStateWithoutFuture = {
  past: [],
  present: { name: 'b' },
  timeline: [locus('now')],
  futureTimeline: [],
} as unknown as TimelineFixture;

const asRootState = (activeProtocol: TimelineFixture): RootState =>
  ({ activeProtocol }) as unknown as RootState;

/**
 * Whether the reducer applied the action. Reference identity is the oracle
 * because a case reducer that returns without touching the draft makes immer
 * hand back the base state unchanged — which is precisely "silently dropped".
 */
const applies = (state: TimelineFixture, action: { type: string }) =>
  timelineReducer(state, action) !== state;

type Case = {
  name: string;
  state: TimelineFixture;
  /** Whether the reducer will actually apply the action. */
  reducerApplies: boolean;
  /** Whether the selector will offer the control. */
  selectorOffers: boolean;
};

const undoCases: Case[] = [
  {
    name: 'nothing in the past',
    state: buildState([], { name: 'b' }),
    reducerApplies: false,
    selectorOffers: false,
  },
  {
    name: 'no present to move into the future',
    state: buildState([{ name: 'a' }], null),
    reducerApplies: false,
    selectorOffers: false,
  },
  {
    name: 'neither a past nor a present',
    state: buildState([], null),
    reducerApplies: false,
    selectorOffers: false,
  },
  {
    name: 'a past entry and a present',
    state: buildState([{ name: 'a' }], { name: 'b' }),
    reducerApplies: true,
    selectorOffers: true,
  },
  {
    // The one case where the selector is deliberately stricter than the
    // reducer: undoing here would succeed, and land the editor on null.
    name: 'a null entry at the head of the past',
    state: buildState([null], { name: 'b' }),
    reducerApplies: true,
    selectorOffers: false,
  },
];

const redoCases: Case[] = [
  {
    name: 'nothing in the future',
    state: buildState([{ name: 'a' }], { name: 'b' }),
    reducerApplies: false,
    selectorOffers: false,
  },
  {
    name: 'a future entry and a present',
    state: buildState([{ name: 'a' }], { name: 'b' }, [{ name: 'c' }]),
    reducerApplies: true,
    selectorOffers: true,
  },
  {
    name: 'a future entry and no present',
    state: buildState([], null, [{ name: 'c' }]),
    reducerApplies: true,
    selectorOffers: true,
  },
  {
    name: 'persisted state with no future array at all',
    state: legacyStateWithoutFuture,
    reducerApplies: false,
    selectorOffers: false,
  },
];

describe('canUndo', () => {
  it.each(undoCases)(
    'answers what the undo reducer actually does with $name',
    ({ state, reducerApplies }) => {
      expect(canUndo(state)).toBe(reducerApplies);
      expect(applies(state, timelineActions.undo())).toBe(reducerApplies);
    },
  );

  it('resolves to "nothing to undo" when the slice is absent', () => {
    expect(canUndo(undefined)).toBe(false);
  });
});

describe('canRedo', () => {
  it.each(redoCases)(
    'answers what the redo reducer actually does with $name',
    ({ state, reducerApplies }) => {
      expect(canRedo(state)).toBe(reducerApplies);
      expect(applies(state, timelineActions.redo())).toBe(reducerApplies);
    },
  );

  it('resolves to "nothing to redo" when the slice is absent', () => {
    expect(canRedo(undefined)).toBe(false);
  });
});

describe('getCanUndo / getCanRedo', () => {
  it.each(undoCases)(
    'never offers an undo the reducer would drop with $name',
    ({ state, reducerApplies, selectorOffers }) => {
      expect(getCanUndo(asRootState(state))).toBe(selectorOffers);
      // The implication that matters: offering it means it happens.
      expect(selectorOffers && !reducerApplies).toBe(false);
    },
  );

  it.each(redoCases)(
    'never offers a redo the reducer would drop with $name',
    ({ state, reducerApplies, selectorOffers }) => {
      expect(getCanRedo(asRootState(state))).toBe(selectorOffers);
      expect(selectorOffers && !reducerApplies).toBe(false);
    },
  );

  it('refuses undo only where it is documented to be stricter', () => {
    // Anywhere else, disagreeing with the reducer means the two statements of
    // the rule have drifted apart again.
    const disagreements = undoCases.filter(
      ({ state }) => getCanUndo(asRootState(state)) !== canUndo(state),
    );

    expect(disagreements.map(({ name }) => name)).toEqual([
      'a null entry at the head of the past',
    ]);
  });

  it('refuses redo in exactly the cases the reducer does', () => {
    const disagreements = redoCases.filter(
      ({ state }) => getCanRedo(asRootState(state)) !== canRedo(state),
    );

    expect(disagreements).toEqual([]);
  });
});
