import { describe, expect, it } from 'vitest';

import {
  type NumericWindow,
  stepSize,
  steppedValue,
  withinWindow,
} from '../useNumericDraft';

/**
 * The stepper arithmetic every synthetic numeric parameter shares.
 *
 * Stepping had to be written rather than left to the input's native
 * `stepUp()`: a continuous parameter declares `step="any"` (any value inside
 * its window is one the schema takes), and a native step of `any` both
 * disables the +/- buttons and throws if called — so the mean and standard
 * deviation of every distribution could be typed but not stepped.
 *
 * The windows below are the ones the schemas actually state, so a step that
 * would land outside one is a step the editor would have had to refuse.
 */

/** A count's mean: `z.number().max(MAX_SYNTHETIC_POPULATION)` — open below. */
const OPEN_MEAN: NumericWindow = {
  max: 1000,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

/** Every distribution's spread: `z.number().min(0)` — open above. */
const SPREAD: NumericWindow = {
  min: 0,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

/** A density or a scalar: `z.number().min(0).max(1)`. */
const PROBABILITY: NumericWindow = {
  min: 0,
  max: 1,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

/** A beta's mean: `z.number().gt(0).lt(1)` — strictly inside. */
const BETA_MEAN: NumericWindow = {
  min: 0,
  max: 1,
  exclusiveMin: true,
  exclusiveMax: true,
  integer: false,
};

/** An option weight: `z.number().min(0).max(MAX_SYNTHETIC_OPTION_WEIGHT)`. */
const WEIGHT: NumericWindow = {
  min: 0,
  max: 1_000_000,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

/** A count: `z.number().int().min(0).max(MAX_SYNTHETIC_POPULATION)`. */
const POPULATION: NumericWindow = {
  min: 0,
  max: 1000,
  exclusiveMin: false,
  exclusiveMax: false,
  integer: true,
};

describe('stepSize', () => {
  it('moves an integral parameter by one, the only legal step', () => {
    expect(stepSize(POPULATION, 12)).toBe(1);
  });

  it('divides a closed window rather than assuming a unit', () => {
    // A probability stepped by 1 would only ever reach its two endpoints.
    expect(stepSize(PROBABILITY, 0.5)).toBe(0.05);
    expect(stepSize(BETA_MEAN, 0.5)).toBe(0.05);
  });

  it('follows the value’s own scale where the window is open', () => {
    expect(stepSize(OPEN_MEAN, 40)).toBe(1);
    expect(stepSize(OPEN_MEAN, 5)).toBe(1);
    expect(stepSize(SPREAD, 0.2)).toBe(0.1);
    expect(stepSize(SPREAD, 0.05)).toBe(0.01);
  });

  it('falls back to whole units where nothing states a scale', () => {
    expect(stepSize(SPREAD, 0)).toBe(1);
    expect(stepSize(OPEN_MEAN, undefined)).toBe(1);
  });
});

describe('steppedValue', () => {
  it('steps an open-window mean up and down', () => {
    expect(steppedValue(3, 'up', OPEN_MEAN)).toBe(4);
    expect(steppedValue(3, 'down', OPEN_MEAN)).toBe(2);
  });

  it('steps an open-window mean below zero, which its schema allows', () => {
    // "Usually none, occasionally a few" is a negative mean with spread.
    expect(steppedValue(0, 'down', OPEN_MEAN)).toBe(-1);
  });

  it('steps an integral parameter by one', () => {
    expect(steppedValue(12, 'up', POPULATION)).toBe(13);
    expect(steppedValue(12, 'down', POPULATION)).toBe(11);
  });

  it('lands on whole numbers from a value that is not one', () => {
    expect(steppedValue(5.5, 'up', POPULATION)).toBe(6);
    expect(steppedValue(5.5, 'down', POPULATION)).toBe(5);
  });

  it('refuses to step a spread below its floor', () => {
    // `sd` is bounded at 0 by every distribution that carries one.
    expect(steppedValue(0, 'down', SPREAD)).toBeUndefined();
    expect(steppedValue(0, 'up', SPREAD)).toBe(1);
  });

  it('clamps to a floor the window closes on rather than overshooting it', () => {
    expect(steppedValue(0.4, 'down', SPREAD)).toBe(0.3);
    expect(steppedValue(0.05, 'down', SPREAD)).toBe(0.04);
    expect(steppedValue(0.02, 'down', PROBABILITY)).toBe(0);
  });

  it('clamps to a ceiling the window closes on', () => {
    expect(steppedValue(0.98, 'up', PROBABILITY)).toBe(1);
    expect(steppedValue(1, 'up', PROBABILITY)).toBeUndefined();
  });

  it('stays put where the window excludes the endpoint it would reach', () => {
    // A beta's mean lives strictly inside 0 and 1: there is no smallest value
    // to clamp to, and 0 is one the schema refuses just as firmly.
    expect(steppedValue(0.05, 'down', BETA_MEAN)).toBeUndefined();
    expect(steppedValue(0.95, 'up', BETA_MEAN)).toBeUndefined();
    expect(steppedValue(0.5, 'down', BETA_MEAN)).toBe(0.45);
  });

  it('shows the number a researcher would have typed', () => {
    // 0.2 + 0.1 is 0.30000000000000004 in binary floating point.
    expect(steppedValue(0.2, 'up', SPREAD)).toBe(0.3);
    expect(steppedValue(0.35, 'down', PROBABILITY)).toBe(0.3);
  });

  it('steps an empty box one step from nothing', () => {
    // Counted from the window's own zero, not from the middle of it: an option
    // weight is bounded by a ceiling of a million, and a first press that
    // opened at half of that would be nobody's idea of one step.
    expect(steppedValue(undefined, 'up', WEIGHT)).toBe(1);
    expect(steppedValue(undefined, 'up', PROBABILITY)).toBe(0.05);
    expect(steppedValue(undefined, 'up', OPEN_MEAN)).toBe(1);
    expect(steppedValue(undefined, 'down', OPEN_MEAN)).toBe(-1);
  });

  it('writes the floor into an empty box that cannot step past it', () => {
    // Putting a number in an empty box is a change even where the step itself
    // moves nothing.
    expect(steppedValue(undefined, 'down', PROBABILITY)).toBe(0);
    expect(steppedValue(undefined, 'down', SPREAD)).toBe(0);
  });

  it('starts an empty box a window excludes zero from inside it', () => {
    const first = steppedValue(undefined, 'up', BETA_MEAN);
    expect(first).toBeDefined();
    expect(withinWindow(first!, BETA_MEAN)).toBe(true);
  });

  it('never settles on a value the window refuses', () => {
    const windows = [
      OPEN_MEAN,
      SPREAD,
      PROBABILITY,
      BETA_MEAN,
      POPULATION,
      WEIGHT,
    ];
    const starts = [0, 0.05, 0.5, 0.95, 1, 3, 12];

    for (const window of windows) {
      for (const start of starts) {
        if (!withinWindow(start, window)) continue;
        for (const direction of ['up', 'down'] as const) {
          const next = steppedValue(start, direction, window);
          if (next === undefined) continue;
          expect(withinWindow(next, window)).toBe(true);
        }
      }
    }
  });
});
