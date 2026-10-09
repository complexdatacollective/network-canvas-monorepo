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
          wording={null}
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

  it('lists the attribute that records each person’s relationship to the participant', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={{
            nameAttribute: 'name',
            relationshipToParticipantAttribute: 'gender',
          }}
          edgeConfiguration={null}
          completeness={null}
          framing={null}
          wording={null}
          nominationPrompts={null}
        />
      </SummaryContext.Provider>,
    );

    expect(
      screen.getByText('Relationship to the participant'),
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
          wording={null}
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
          wording={null}
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
          wording={null}
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
          wording={null}
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

  it('shows the wording participants read, a version for each case a text distinguishes', () => {
    const recommended = {
      scope: 'parents',
      enforcement: 'recommended',
      itemText: {
        parents: {
          listItem: {
            en: '{isYou, select, true {Add your parents} other {Parents of {name}}}',
          },
        },
        siblings: {
          listItem: { en: 'Brothers and sisters' },
          noneButton: { en: 'None' },
          question: { en: 'Any brothers or sisters?' },
        },
        children: {
          listItem: { en: 'Children' },
          noneButton: { en: 'None' },
          question: { en: 'Any children?' },
        },
        details: { listItem: { en: 'About {name}' } },
      },
      recommendedNote: { en: 'You may skip these.' },
    } as const;
    const { rerender } = render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={{
            nameField: {
              prompt: { en: 'What is their name?' },
              hint: { en: 'A nickname is fine.' },
            },
          }}
          edgeConfiguration={null}
          completeness={recommended}
          framing={null}
          wording={null}
          nominationPrompts={null}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('What is their name?')).toBeInTheDocument();
    expect(screen.getByText('A nickname is fine.')).toBeInTheDocument();
    // The message reads as its versions, its placeholders named, never as
    // the syntax it is stored in.
    expect(screen.getByText('Add your parents')).toBeInTheDocument();
    expect(screen.getByText('Parents of [Name]')).toBeInTheDocument();
    expect(screen.getByText('About [Name]')).toBeInTheDocument();
    expect(screen.queryByText(/isYou/)).toBeNull();
    expect(screen.getByText('You may skip these.')).toBeInTheDocument();

    rerender(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <FamilyPedigree
          personType="person"
          prompt={null}
          nodeConfiguration={null}
          edgeConfiguration={null}
          completeness={{ ...recommended, enforcement: 'required' }}
          framing={null}
          wording={null}
          nominationPrompts={null}
        />
      </SummaryContext.Provider>,
    );
    // Participants never read the note when the list must be completed.
    expect(screen.queryByText('You may skip these.')).toBeNull();
  });
  it('prints each participant-facing word the stage holds, under its name in the builder', () => {
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
          wording={{
            alsoParentOfLabel: { en: 'Are they also the parent of…' },
          }}
          nominationPrompts={null}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Also parent of question')).toBeInTheDocument();
    expect(
      screen.getByText('Are they also the parent of…'),
    ).toBeInTheDocument();
  });
});
