import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import FamilyPedigree from '../FamilyPedigree';

const protocol = {
  schemaVersion: 9,
  name: 'Pedigree protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    node: {
      person: {
        name: 'Person',
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          gender: {
            name: 'Gender',
            label: 'Gender',
            type: 'categorical',
            options: [
              { value: 'woman', label: { en: 'Woman' } },
              { value: 'transWoman', label: { en: 'Trans **woman**' } },
              { value: 'agender', label: { en: 'Agender' } },
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
            genderIdentity: {
              attribute: 'gender',
              terms: [
                { value: 'woman', words: 'feminine' },
                { value: 'transWoman', words: 'feminine' },
              ],
            },
          }}
          edgeConfiguration={null}
          completeness={null}
          framing={null}
          nominationPrompts={null}
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

  it('says relatives follow sex assigned at birth when gender identity is not asked', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={{ nameAttribute: 'name' }}
          edgeConfiguration={null}
          completeness={null}
          framing={null}
          nominationPrompts={null}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Gender identity')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Not asked. Words such as mother or brother follow sex assigned at birth.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Gender identity words')).toBeNull();
  });

  it('says everyday words are used when the stage stores no wording', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={{ nameAttribute: 'name' }}
          edgeConfiguration={null}
          completeness={null}
          framing={null}
          nominationPrompts={null}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Words for family members')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Everyday kinship words (mother, father, sister, brother)',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nomination prompts')).toBeNull();
  });

  it('names the wording the stage chose', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={{ nameAttribute: 'name' }}
          edgeConfiguration={null}
          completeness={null}
          framing="participantPreference"
          nominationPrompts={null}
        />
      </SummaryContext.Provider>,
    );

    expect(
      screen.getByText('The participant chooses between the two'),
    ).toBeInTheDocument();
  });

  it('lists each nomination prompt with its attribute and any sex limit', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={null}
          edgeConfiguration={null}
          completeness={null}
          framing={null}
          nominationPrompts={[
            {
              id: 'nomination-1',
              text: { en: 'Who has had **ovarian** cancer?' },
              attribute: 'gender',
              onlyForSexAssignedAtBirth: 'female',
            },
            {
              id: 'nomination-2',
              text: { en: 'Who has had diabetes?' },
              attribute: 'gender',
            },
          ]}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Nomination prompts')).toBeInTheDocument();
    expect(screen.getByText('ovarian')).toBeInTheDocument();
    expect(screen.getByText('Who has had diabetes?')).toBeInTheDocument();
    // Said once: only the first prompt carries a limit.
    expect(screen.getAllByText('Who can be selected')).toHaveLength(1);
    expect(
      screen.getByText('Anyone except people assigned male at birth'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Attribute')).toHaveLength(2);
  });
});
