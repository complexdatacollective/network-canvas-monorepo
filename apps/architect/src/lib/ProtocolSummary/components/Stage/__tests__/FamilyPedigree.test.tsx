import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import FamilyPedigree from '../FamilyPedigree';

const protocol = {
  schemaVersion: 8,
  name: 'Pedigree protocol',
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          gender: {
            name: 'Gender',
            type: 'categorical',
            options: [
              { value: 'woman', label: 'Woman' },
              { value: 'transWoman', label: 'Trans **woman**' },
              { value: 'agender', label: 'Agender' },
            ],
          },
        },
      },
    },
    edge: {},
    ego: {},
  },
  assetManifest: {},
  stages: [],
} satisfies CurrentProtocol;

describe('Protocol Summary family pedigree', () => {
  it('lists the words each gender identity option takes, neutral where none is given', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={{
            genderIdentityVariable: 'gender',
            genderIdentityTerms: [
              { value: 'woman', words: 'feminine' },
              { value: 'transWoman', words: 'feminine' },
            ],
          }}
          edgeConfiguration={null}
          completeness={null}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Gender identity words')).toBeInTheDocument();
    expect(
      screen.getByText('Woman: Feminine words (mother, sister)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Trans woman: Feminine words (mother, sister)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Agender: Neutral words (parent, sibling)'),
    ).toBeInTheDocument();
  });
});
