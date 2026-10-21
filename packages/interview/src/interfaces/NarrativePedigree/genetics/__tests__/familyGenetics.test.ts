import { describe, expect, it } from 'vitest';

import type { PedigreeSexAssignedAtBirth } from '@codaco/protocol-validation';

import {
  config,
  link,
  person,
} from '../../../FamilyPedigree/__tests__/fixtures';
import { gameteLookup, inferGametes } from '../../../FamilyPedigree/gametes';
import { readFamily } from '../../../FamilyPedigree/model';
import { computeStatuses } from '../computeStatuses';
import { geneticSexResolver } from '../familyGenetics';
import { buildGeneticGraph } from '../geneticGraph';

const withSex = (id: string, sex?: PedigreeSexAssignedAtBirth) =>
  person(id, sex ? { sex: [sex] } : {});

/** A child of `a` and `b`, both biological parents, with the sexes given. */
function trio(
  aSex: PedigreeSexAssignedAtBirth | undefined,
  bSex: PedigreeSexAssignedAtBirth | undefined,
) {
  return readFamily(
    [withSex('a', aSex), withSex('b', bSex), withSex('child', 'male')],
    [
      link('a', 'b', 'partner'),
      link('a', 'child', 'biological'),
      link('b', 'child', 'biological'),
    ],
    config,
  );
}

describe('geneticSexResolver', () => {
  it('reads female and male from sex assigned at birth', () => {
    const resolve = geneticSexResolver(trio('female', 'male'));
    expect(resolve('a')).toBe('female');
    expect(resolve('b')).toBe('male');
  });

  it('never infers a sex for someone recorded intersex', () => {
    const resolve = geneticSexResolver(trio('intersex', 'male'));
    expect(resolve('a')).toBe('unknown');
  });

  it.each(['unknown', 'preferNotToSay', undefined] as const)(
    'infers the sex of someone recorded %s from the gamete they gave',
    (sex) => {
      expect(geneticSexResolver(trio(sex, 'male'))('a')).toBe('female');
      expect(geneticSexResolver(trio(sex, 'female'))('a')).toBe('male');
    },
  );

  it('leaves someone with no recorded sex and no child unknown', () => {
    const family = readFamily([withSex('solo')], [], config);
    expect(geneticSexResolver(family)('solo')).toBe('unknown');
  });

  it('leaves someone unknown when the gametes they gave disagree', () => {
    const family = readFamily(
      [
        withSex('x'),
        withSex('mum', 'female'),
        withSex('dad', 'male'),
        withSex('c1'),
        withSex('c2'),
      ],
      [
        link('x', 'c1', 'biological'),
        link('mum', 'c1', 'biological'),
        link('x', 'c2', 'biological'),
        link('dad', 'c2', 'biological'),
      ],
      config,
    );
    expect(geneticSexResolver(family)('x')).toBe('unknown');
  });

  it('ignores gender identity', () => {
    const family = readFamily(
      [person('a', { sex: ['female'], gender: ['man'] })],
      [],
      config,
    );
    expect(geneticSexResolver(family)('a')).toBe('female');
  });
});

describe('mtDNA follows the egg', () => {
  it('passes a mitochondrial condition from an intersex parent who gave the egg', () => {
    const family = trio('intersex', 'male');
    const gametes = inferGametes(family);
    const resolveSex = geneticSexResolver(family, gametes);
    const graph = buildGeneticGraph(family, resolveSex, gameteLookup(gametes));
    expect(graph.mitochondrialParentsOf('child')).toEqual(['a']);
    const statuses = computeStatuses(
      graph,
      new Set(['a']),
      'mitochondrial',
      resolveSex,
    );
    expect(statuses.get('child')).toBe('atRiskAffected');
  });

  it('leaves the mtDNA source unknown when no egg can be inferred', () => {
    const family = trio('intersex', 'unknown');
    const gametes = inferGametes(family);
    const graph = buildGeneticGraph(
      family,
      geneticSexResolver(family, gametes),
      gameteLookup(gametes),
    );
    expect(graph.mitochondrialParentsOf('child')).toEqual([]);
  });
});
