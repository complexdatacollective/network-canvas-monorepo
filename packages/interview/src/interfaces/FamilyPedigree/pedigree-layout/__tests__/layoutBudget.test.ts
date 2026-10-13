/**
 * Laying out a family is interactive work: a cold layout of any family the
 * interview can realistically hold finishes well inside a frame budget. The
 * engine bounds every search by counted work, never by the clock (see
 * `alignPedigree`), so a family is drawn the same way on any machine; these
 * tests check that the work allowed is quick enough to draw.
 *
 * Each family's drawing time is held to a multiple of a calibration timed
 * in the same test: a fixed piece of arithmetic and map lookups, which
 * takes as much longer on a slower or busier machine as the drawing does,
 * and none longer if the engine slows. The multiples were set on a laptop
 * (where the calibration takes about 4ms) at the times the layout must keep
 * to there with the whole test suite running alongside: 250ms for forty
 * people, 60ms for a family the size of an interview's. A layout that takes
 * more work than that fails on any machine; one that keeps to it passes on
 * a machine several times slower.
 */
import { describe, expect, it } from 'vitest';

import { drawPedigree } from '../pedigreeAdapter';
import type { PedigreeLink, PedigreeSymbolShape } from '../types';
import { coverageFamilies } from './coverageFamilies';
import { INTERFACE_DIMENSIONS } from './fixtures';

/** The calibration on the laptop the multiples were set on, in ms. */
const LAPTOP_CALIBRATION_MS = 4;
/** What forty people may take to draw, and a family the size of an
 * interview's, as multiples of the calibration. */
const LARGE_FAMILY = 250 / LAPTOP_CALIBRATION_MS;
const INTERVIEW_FAMILY = 60 / LAPTOP_CALIBRATION_MS;

/**
 * How long this machine takes, now, for a fixed piece of work much like the
 * engine's (arithmetic on coordinates, and keeping values in a map by
 * them), in ms: the least of a few tries, so a moment's interruption does
 * not count.
 */
function calibration(): number {
  let least = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 5; attempt++) {
    const started = performance.now();
    const kept = new Map<string, number>();
    let total = 0;
    for (let k = 0; k < 60_000; k++) {
      const x = (k * 7919) % 1009;
      const y = (k * 104_729) % 997;
      total += Math.hypot(x - 504, y - 498);
      const key = `${x % 97},${y % 89}`;
      kept.set(key, (kept.get(key) ?? 0) + total);
    }
    expect(kept.size).toBeGreaterThan(0);
    least = Math.min(least, performance.now() - started);
  }
  return least;
}

const parent = (
  source: string,
  target: string,
  kind: PedigreeLink['kind'] = 'biological',
  carrier = false,
): PedigreeLink => ({
  source,
  target,
  kind,
  ...(carrier ? { isGestationalCarrier: true } : {}),
});
const partners = (a: string, b: string, isActive = true): PedigreeLink => ({
  source: a,
  target: b,
  kind: 'partner',
  isActive,
});

/** Each drawing timed is named afresh, so it is laid out afresh rather
 * than taken from the drawings kept (see `drawPedigree`): only whether a
 * person has a name plays any part in their drawing. */
let drawingsTimed = 0;

/** How long the family takes to lay out and draw, cold, in ms: the lesser
 * of two drawings, so a moment's interruption does not count. */
function timeToDraw(
  people: string[],
  links: PedigreeLink[],
  shape: PedigreeSymbolShape = 'circle',
): number {
  let least = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 2; attempt++) {
    const name = `drawing ${drawingsTimed++}`;
    const started = performance.now();
    const { positions } = drawPedigree({
      nodeIds: people,
      links,
      dimensions: INTERFACE_DIMENSIONS,
      nodeNames: new Map(people.map((id) => [id, `${id} (${name})`])),
      nodeShapes: new Map(people.map((id) => [id, shape])),
    });
    least = Math.min(least, performance.now() - started);
    expect(positions.size).toBe(people.length);
  }
  return least;
}

/** The engine's code compiled, as it is once an interview has drawn its
 * first family: a few families drawn untimed. */
function warmUp() {
  for (const { people, links } of [twelveSiblings(), siblingPreview()]) {
    timeToDraw(people, links);
  }
}

/** Twelve full siblings, the participant among them. */
function twelveSiblings() {
  const siblings = Array.from({ length: 12 }, (_, k) => `sib${k}`);
  return {
    people: ['mum', 'dad', ...siblings],
    links: [
      partners('mum', 'dad'),
      ...siblings.flatMap((sib) => [
        parent('mum', sib, 'biological', true),
        parent('dad', sib),
      ]),
    ],
  };
}

/** Twelve siblings who have three donors between them. */
function twelveSiblingsThreeDonors() {
  const siblings = Array.from({ length: 12 }, (_, k) => `sib${k}`);
  return {
    people: ['mum', 'donorA', 'donorB', 'donorC', ...siblings],
    links: siblings.flatMap((sib, k) => [
      parent('mum', sib, 'biological', true),
      parent(['donorA', 'donorB', 'donorC'][k % 3]!, sib, 'donor'),
    ]),
  };
}

/** Forty people across four generations, with donors and step-parents. */
function fortyPeople() {
  const people: string[] = [];
  const links: PedigreeLink[] = [];
  const add = (...ids: string[]) => people.push(...ids);
  // Generation 1: two grandparent couples.
  add('gpA1', 'gpA2', 'gpB1', 'gpB2');
  links.push(partners('gpA1', 'gpA2'), partners('gpB1', 'gpB2'));
  // Generation 2: four children of each couple, with partners, one former
  // partner and a step-parent.
  const sideA = ['a1', 'a2', 'a3', 'a4'];
  const sideB = ['b1', 'b2', 'b3', 'b4'];
  add(...sideA, ...sideB);
  for (const child of sideA) {
    links.push(
      parent('gpA1', child, 'biological', true),
      parent('gpA2', child),
    );
  }
  for (const child of sideB) {
    links.push(
      parent('gpB1', child, 'biological', true),
      parent('gpB2', child),
    );
  }
  add('pa2', 'pa3', 'pb2', 'pb3', 'formerA1', 'stepB4');
  links.push(
    partners('a1', 'b1'),
    partners('a2', 'pa2'),
    partners('a3', 'pa3'),
    partners('b2', 'pb2'),
    partners('b3', 'pb3'),
    partners('a1', 'formerA1', false),
    partners('b4', 'stepB4'),
  );
  // Generation 3: the participant's sibship (a1 and b1), with two donor-
  // conceived siblings and a half sibling; cousins, one by a surrogate; b4's
  // child raised by her step-parent.
  add('donor1', 'surrogate1');
  const ego = ['ego', 'sibE1', 'sibE2', 'sibE3', 'sibE4'];
  add(...ego);
  for (const child of ego.slice(0, 3)) {
    links.push(parent('b1', child, 'biological', true), parent('a1', child));
  }
  for (const child of ego.slice(3)) {
    links.push(
      parent('b1', child, 'biological', true),
      parent('donor1', child, 'donor'),
      parent('a1', child, 'social'),
    );
  }
  add('halfA1');
  links.push(
    parent('a1', 'halfA1'),
    parent('formerA1', 'halfA1', 'biological', true),
  );
  const cousins = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
  add(...cousins);
  links.push(
    parent('pa2', 'c1', 'biological', true),
    parent('a2', 'c1'),
    parent('pa2', 'c2', 'biological', true),
    parent('a2', 'c2'),
    parent('a3', 'c3'),
    parent('pa3', 'c3'),
    parent('surrogate1', 'c3', 'surrogate', true),
    parent('b2', 'c4', 'biological', true),
    parent('pb2', 'c4'),
    parent('b3', 'c5', 'biological', true),
    parent('pb3', 'c5'),
    parent('b3', 'c6', 'biological', true),
    parent('pb3', 'c6'),
    parent('b4', 'c7', 'biological', true),
    parent('stepB4', 'c7', 'social'),
  );
  // Generation 4: children of the participant and two cousins.
  add('egoPartner', 'c4Partner', 'g1', 'g2', 'g3', 'g4', 'g5');
  links.push(
    partners('ego', 'egoPartner'),
    partners('c4', 'c4Partner'),
    parent('ego', 'g1', 'biological', true),
    parent('egoPartner', 'g1'),
    parent('ego', 'g2', 'biological', true),
    parent('egoPartner', 'g2'),
    parent('c4', 'g3', 'biological', true),
    parent('c4Partner', 'g3'),
    parent('c4', 'g4', 'biological', true),
    parent('donor1', 'g4', 'donor'),
    parent('c4Partner', 'g4', 'adoptive'),
    parent('c1', 'g5', 'biological', true),
  );
  expect(people).toHaveLength(40);
  return { people, links };
}

/** The family the interface previews while a sibling's parents are asked
 * for: the participant's two birth parents, a social parent and a
 * surrogate, and the new sibling, one of whose parents is not yet named. */
function siblingPreview() {
  return {
    people: ['ego', 'amy', 'rob', 'sam', 'gail', 'sibling', 'unnamed'],
    links: [
      parent('amy', 'ego'),
      parent('rob', 'ego'),
      parent('sam', 'ego', 'social'),
      parent('gail', 'ego', 'surrogate', true),
      parent('rob', 'sibling'),
      parent('sam', 'sibling', 'social'),
      parent('unnamed', 'sibling'),
    ],
  };
}

describe('a family is laid out well inside a frame budget, whatever its size', () => {
  it('draws large families within the large-family budget', () => {
    warmUp();
    const unit = calibration();
    for (const [name, { people, links }] of Object.entries({
      'twelve full siblings': twelveSiblings(),
      'twelve siblings with three donors': twelveSiblingsThreeDonors(),
      'forty people across four generations': fortyPeople(),
    })) {
      const took = timeToDraw(people, links);
      expect(
        took / unit,
        `${name}: ${took.toFixed(0)}ms, against ${unit.toFixed(1)}ms`,
      ).toBeLessThan(LARGE_FAMILY);
    }
  }, 60_000);

  it('draws every family the size of an interview within its budget', () => {
    warmUp();
    const unit = calibration();
    const families = {
      'a sibling previewed while their parents are asked for': siblingPreview(),
      ...coverageFamilies,
    };
    for (const [name, { people, links }] of Object.entries(families)) {
      for (const shape of ['circle', 'square'] as const) {
        const took = timeToDraw(people, links, shape);
        expect(
          took / unit,
          `${name} (${shape}s): ${took.toFixed(0)}ms, against ${unit.toFixed(1)}ms`,
        ).toBeLessThan(INTERVIEW_FAMILY);
      }
    }
  }, 120_000);
});
