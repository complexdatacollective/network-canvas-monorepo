import { describe, expect, it } from 'vitest';

import {
  type Codebook,
  type LocalizedString,
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
} from '@codaco/protocol-validation';

import { ownedOptionLabels } from '../options';
import { config } from './fixtures';

const options = (values: readonly string[], label: (value: string) => string) =>
  values.map((value) => ({
    value,
    label: { en: `${label(value)} (en)`, es: `${label(value)} (es)` },
  }));

const codebook = {
  node: {
    person: {
      name: 'person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        sex: {
          name: 'sex',
          type: 'categorical',
          options: options(PEDIGREE_SEX_ASSIGNED_AT_BIRTH, (v) => `Sex ${v}`),
        },
      },
    },
  },
  edge: {
    family: {
      name: 'family',
      color: 'edge-color-seq-1',
      variables: {
        kind: {
          name: 'kind',
          type: 'categorical',
          options: options(PEDIGREE_RELATIONSHIP_KINDS, (v) => `Kind ${v}`),
        },
      },
    },
  },
} as unknown as Codebook;

const inSpanish = (value: LocalizedString) => value.es ?? '';

describe('ownedOptionLabels', () => {
  it('labels each answer as the codebook labels it, in the interview language', () => {
    const labels = ownedOptionLabels(codebook, config, inSpanish);
    expect(labels.sexAssignedAtBirth).toEqual({
      female: 'Sex female (es)',
      male: 'Sex male (es)',
      intersex: 'Sex intersex (es)',
      unknown: 'Sex unknown (es)',
      preferNotToSay: 'Sex preferNotToSay (es)',
    });
    expect(labels.parentKind).toEqual({
      biological: 'Kind biological (es)',
      adoptive: 'Kind adoptive (es)',
      social: 'Kind social (es)',
      donor: 'Kind donor (es)',
      surrogate: 'Kind surrogate (es)',
    });
  });

  it('reads a value the codebook has no option for as the value itself', () => {
    const labels = ownedOptionLabels({ node: {}, edge: {} }, config, inSpanish);
    expect(labels.sexAssignedAtBirth.female).toBe('female');
    expect(labels.parentKind.donor).toBe('donor');
  });
});
