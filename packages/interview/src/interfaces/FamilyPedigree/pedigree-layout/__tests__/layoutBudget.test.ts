/**
 * Laying out a family is interactive work: a layout of any family the
 * interview can realistically hold finishes well inside a frame budget. The
 * engine bounds every search by counted work, never by the clock (see
 * `alignPedigree`), and counts every step a layout takes, so these tests
 * hold each family's counted work to a limit: the same on every machine,
 * however busy, and failing whenever a change lets the engine do more.
 *
 * A step is about a tenth of a microsecond on a laptop (from about 0.05 to
 * 0.12 across every family the tests draw), so the limits are the times
 * the layout must keep to there: 250ms for forty people, 60ms for a family
 * the size of an interview's. A generous ceiling on the time a drawing
 * actually takes stands guard only against work the count misses
 * altogether.
 */
import { describe, expect, it } from 'vitest';

import { drawPedigree } from '../pedigreeAdapter';
import type { PedigreeLink, PedigreeSymbolShape } from '../types';
import { coverageFamilies } from './coverageFamilies';
import { INTERFACE_DIMENSIONS } from './fixtures';

/** About how long a step of counted work takes on a laptop, in ms. */
const STEP_MS = 0.0001;
/** What forty people, and a family the size of an interview's, may take
 * to draw, in steps. */
const LARGE_FAMILY = 250 / STEP_MS;
const INTERVIEW_FAMILY = 60 / STEP_MS;
/** For a family of seven: the one budget of every drawing's lines
 * (`LINE_SEARCH_WORK`, 300,000 steps), passed at most by a drawing's first
 * routing, which is always done in full (under 100,000 steps for seven
 * people), with the seatings and setting each drawing up. */
const LINE_WORK_ALL_IN = 400_000;
/** How long any drawing may take, in ms, on any machine, however busy: far
 * past the frame budget, so it fails only for work the count misses. */
const CEILING_MS = 3000;

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

/** Each drawing is named afresh, so it is laid out afresh rather than
 * taken from the drawings kept (see `drawPedigree`): only whether a person
 * has a name plays any part in their drawing. */
let drawingsMade = 0;

/** The work the family takes to lay out and draw, cold, held to the
 * ceiling on the time it takes. */
function workToDraw(
  people: string[],
  links: PedigreeLink[],
  shape: PedigreeSymbolShape = 'circle',
): number {
  const name = `drawing ${drawingsMade++}`;
  const started = performance.now();
  const { positions, work } = drawPedigree({
    nodeIds: people,
    links,
    dimensions: INTERFACE_DIMENSIONS,
    nodeNames: new Map(people.map((id) => [id, `${id} (${name})`])),
    nodeShapes: new Map(people.map((id) => [id, shape])),
  });
  const took = performance.now() - started;
  expect(positions.size).toBe(people.length);
  expect(took, `${took.toFixed(0)}ms`).toBeLessThan(CEILING_MS);
  return work;
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
    for (const [name, { people, links }] of Object.entries({
      'twelve full siblings': twelveSiblings(),
      'twelve siblings with three donors': twelveSiblingsThreeDonors(),
      'forty people across four generations': fortyPeople(),
    })) {
      const work = workToDraw(people, links);
      expect(work, name).toBeLessThan(LARGE_FAMILY);
    }
  }, 60_000);

  it('draws every family the size of an interview within its budget', () => {
    const families = {
      'a sibling previewed while their parents are asked for': siblingPreview(),
      ...coverageFamilies,
    };
    for (const [name, { people, links }] of Object.entries(families)) {
      for (const shape of ['circle', 'square'] as const) {
        const work = workToDraw(people, links, shape);
        expect(work, `${name} (${shape}s)`).toBeLessThan(INTERVIEW_FAMILY);
      }
    }
  }, 120_000);

  // No drawing of the preview keeps every hard constraint (its strict line
  // checks fail at any budget), so its layout spends the work held back for
  // finding one: that work is part of the one budget, not added to it.
  it('spends no more than one budget on a family no drawing of which keeps every hard constraint', () => {
    const { people, links } = siblingPreview();
    for (const shape of ['circle', 'square'] as const) {
      expect(workToDraw(people, links, shape)).toBeLessThan(LINE_WORK_ALL_IN);
    }
  });

  it('counts the same work for a family however often, and on whatever machine, it is drawn', () => {
    const { people, links } = siblingPreview();
    expect(workToDraw(people, links)).toBe(workToDraw(people, links));
  });
});
