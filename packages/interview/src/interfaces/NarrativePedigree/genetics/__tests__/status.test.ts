import { describe, expect, it } from 'vitest';

import type { NcNode, VariableValue } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { affectedSet, mergeStatus } from '../status';

const makeNode = (
  id: string,
  attrs: Record<string, VariableValue>,
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: attrs,
  type: 'person',
});

describe('mergeStatus', () => {
  it('returns the higher-precedence status: affected beats atRiskCarrier', () => {
    expect(mergeStatus('atRiskCarrier', 'affected')).toBe('affected');
  });

  it('returns the higher-precedence status: atRiskAffected beats unknown', () => {
    expect(mergeStatus('unknown', 'atRiskAffected')).toBe('atRiskAffected');
  });

  it('affected > obligateAffected', () => {
    expect(mergeStatus('affected', 'obligateAffected')).toBe('affected');
  });

  it('obligateAffected > obligateCarrier', () => {
    expect(mergeStatus('obligateAffected', 'obligateCarrier')).toBe(
      'obligateAffected',
    );
  });

  it('obligateCarrier > atRiskAffected', () => {
    expect(mergeStatus('obligateCarrier', 'atRiskAffected')).toBe(
      'obligateCarrier',
    );
  });

  it('atRiskAffected > atRiskCarrier', () => {
    expect(mergeStatus('atRiskAffected', 'atRiskCarrier')).toBe(
      'atRiskAffected',
    );
  });

  it('atRiskCarrier > unknown', () => {
    expect(mergeStatus('atRiskCarrier', 'unknown')).toBe('atRiskCarrier');
  });

  it('returns the same status when both inputs are equal', () => {
    expect(mergeStatus('obligateCarrier', 'obligateCarrier')).toBe(
      'obligateCarrier',
    );
  });
});

describe('affectedSet', () => {
  const DISEASE = 'hasDisease';

  it('includes only nodes whose disease attribute is strictly true', () => {
    const nodes: NcNode[] = [
      makeNode('a', { [DISEASE]: true }),
      makeNode('b', { [DISEASE]: false }),
      makeNode('c', {}),
    ];

    const result = affectedSet(nodes, DISEASE);

    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(false);
    expect(result.has('c')).toBe(false);
    expect(result.size).toBe(1);
  });
});
