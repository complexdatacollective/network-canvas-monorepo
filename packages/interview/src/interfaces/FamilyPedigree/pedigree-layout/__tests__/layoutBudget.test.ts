/**
 * Every search in the layout engine is bounded by its budget before it does
 * the work: no enumeration builds more candidates than it will consider, so
 * how long a family takes to draw does not grow with the number of orders,
 * seatings or routes it could be drawn in. These tests draw large families
 * as the interface draws them (`drawPedigree`) and hold each to a time
 * budget far above what a bounded search needs, and far below what an
 * unbounded one takes.
 */
import { describe, expect, it } from 'vitest';

import { drawPedigree } from '../pedigreeAdapter';
import type { PedigreeLink } from '../types';
import { INTERFACE_DIMENSIONS } from './fixtures';

const BUDGET_MS = 1000;

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

/** How long the family takes to draw, in milliseconds. */
function timeToDraw(people: string[], links: PedigreeLink[]): number {
  const started = performance.now();
  const { positions } = drawPedigree({
    nodeIds: people,
    links,
    dimensions: INTERFACE_DIMENSIONS,
    nodeNames: new Map(people.map((id) => [id, id])),
    nodeShapes: new Map(people.map((id) => [id, 'circle'])),
  });
  const took = performance.now() - started;
  expect(positions.size).toBe(people.length);
  return took;
}

describe('a family is drawn within a time budget, whatever its size', () => {
  it('draws twelve full siblings, the participant among them', () => {
    const siblings = Array.from({ length: 12 }, (_, k) => `sib${k}`);
    const people = ['mum', 'dad', ...siblings];
    const links = [
      partners('mum', 'dad'),
      ...siblings.flatMap((sib) => [
        parent('mum', sib, 'biological', true),
        parent('dad', sib),
      ]),
    ];
    expect(timeToDraw(people, links)).toBeLessThan(BUDGET_MS);
  }, 60_000);

  it('draws twelve siblings who have three donors between them', () => {
    const siblings = Array.from({ length: 12 }, (_, k) => `sib${k}`);
    const people = ['mum', 'donorA', 'donorB', 'donorC', ...siblings];
    const links = siblings.flatMap((sib, k) => [
      parent('mum', sib, 'biological', true),
      parent(['donorA', 'donorB', 'donorC'][k % 3]!, sib, 'donor'),
    ]);
    expect(timeToDraw(people, links)).toBeLessThan(BUDGET_MS);
  }, 60_000);

  it('draws forty people across four generations, with donors and step-parents', () => {
    const people: string[] = [];
    const links: PedigreeLink[] = [];
    const add = (...ids: string[]) => people.push(...ids);
    // Generation 1: two grandparent couples.
    add('gpA1', 'gpA2', 'gpB1', 'gpB2');
    links.push(partners('gpA1', 'gpA2'), partners('gpB1', 'gpB2'));
    // Generation 2: four children of each couple, with partners, one
    // former partner and a step-parent.
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
    // conceived siblings and a half sibling; cousins, one by a surrogate;
    // b4's child raised by her step-parent.
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
    expect(timeToDraw(people, links)).toBeLessThan(BUDGET_MS);
  }, 120_000);
});
