import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import {
  areConnected,
  availableParentChoices,
  canConnectPartners,
  planConnection,
  readFamily,
} from '../model';
import { config, link, person } from './fixtures';

const family = (nodes: NcNode[], edges: NcEdge[]) =>
  readFamily(nodes, edges, config);

const people = ['ego', 'mum', 'dad', 'nan', 'other'].map((id) =>
  person(id, id === 'ego' ? { isEgo: true } : {}),
);

describe('connecting two people', () => {
  test('people already linked in any way are connected', () => {
    const f = family(people, [
      link('mum', 'dad', 'partner'),
      link('mum', 'ego', 'social'),
    ]);
    expect(areConnected(f, 'dad', 'mum')).toBe(true);
    expect(areConnected(f, 'ego', 'mum')).toBe(true);
    expect(areConnected(f, 'ego', 'dad')).toBe(false);
  });

  test('partners: not when already partners, or parent and child', () => {
    const f = family(people, [
      link('mum', 'dad', 'partner'),
      link('mum', 'ego', 'biological'),
    ]);
    expect(canConnectPartners(f, 'mum', 'dad')).toBe(false);
    expect(canConnectPartners(f, 'dad', 'mum')).toBe(false);
    expect(canConnectPartners(f, 'ego', 'mum')).toBe(false);
    expect(canConnectPartners(f, 'ego', 'other')).toBe(true);
    expect(canConnectPartners(f, 'ego', 'ego')).toBe(false);
  });

  const kinds = (choices: ReturnType<typeof availableParentChoices>) =>
    choices.map(
      (choice) =>
        `${choice.parentKind}${choice.parentKind === 'biological' && choice.carriedPregnancy ? '+carried' : ''}`,
    );

  test('parents: every kind for two unrelated people', () => {
    expect(
      kinds(availableParentChoices(family(people, []), 'mum', 'ego')),
    ).toEqual([
      'biological',
      'biological+carried',
      'adoptive',
      'social',
      'donor',
      'surrogate',
    ]);
  });

  test('parents: none when already linked, either way round', () => {
    const f = family(people, [
      link('mum', 'ego', 'adoptive'),
      link('mum', 'dad', 'partner'),
    ]);
    expect(availableParentChoices(f, 'mum', 'ego')).toEqual([]);
    expect(availableParentChoices(f, 'ego', 'mum')).toEqual([]);
    expect(availableParentChoices(f, 'dad', 'mum')).toEqual([]);
  });

  test('parents: none that would make someone their own ancestor', () => {
    const f = family(people, [
      link('nan', 'mum', 'biological'),
      link('mum', 'ego', 'biological'),
    ]);
    expect(availableParentChoices(f, 'ego', 'nan')).toEqual([]);
    expect(availableParentChoices(f, 'nan', 'ego')).not.toEqual([]);
  });

  test('parents: at most two genetic parents and one surrogate', () => {
    const f = family(people, [
      link('mum', 'ego', 'biological'),
      link('dad', 'ego', 'donor'),
      link('nan', 'ego', 'surrogate', { carrier: true }),
    ]);
    expect(kinds(availableParentChoices(f, 'other', 'ego'))).toEqual([
      'adoptive',
      'social',
    ]);
  });

  test('parents: one person carried the pregnancy', () => {
    const f = family(people, [
      link('mum', 'ego', 'biological', { carrier: true }),
    ]);
    expect(kinds(availableParentChoices(f, 'dad', 'ego'))).toEqual([
      'biological',
      'adoptive',
      'social',
      'donor',
    ]);
  });

  test('the recorded link', () => {
    expect(
      planConnection({
        kind: 'partner',
        firstId: 'a',
        secondId: 'b',
        current: false,
      }),
    ).toEqual({
      source: 'a',
      target: 'b',
      kind: 'partner',
      isCurrentPartner: false,
    });
    expect(
      planConnection({
        kind: 'parent',
        parentId: 'p',
        childId: 'c',
        parentKind: 'biological',
        carriedPregnancy: true,
      }),
    ).toMatchObject({ kind: 'biological', isGestationalCarrier: true });
    expect(
      planConnection({
        kind: 'parent',
        parentId: 'p',
        childId: 'c',
        parentKind: 'surrogate',
        carriedPregnancy: true,
      }),
    ).toEqual({
      source: 'p',
      target: 'c',
      kind: 'surrogate',
      isGestationalCarrier: true,
    });
  });
});
