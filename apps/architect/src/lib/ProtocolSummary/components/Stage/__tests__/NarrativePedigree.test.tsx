import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { familyPedigreeWordingIn } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import NarrativePedigree from '../NarrativePedigree';

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
          has_condition: {
            name: 'has_condition',
            label: 'has_condition',
            type: 'boolean',
          },
        },
      },
    },
    edge: {},
    ego: {},
  },
  assetManifest: {},
  stages: [
    {
      id: 'family',
      type: 'FamilyPedigree',
      wording: familyPedigreeWordingIn(),
      label: { en: 'Your family' },
      subject: { entity: 'node', type: 'person' },
      prompt: { en: 'Draw your family.' },
      nodeConfiguration: {
        nameAttribute: 'name',
        sexAssignedAtBirthAttribute: 'sex',
        egoAttribute: 'is_ego',
      },
      edgeConfiguration: {
        type: 'family',
        kindAttribute: 'kind',
        gestationalCarrierAttribute: 'carrier',
        currentPartnerAttribute: 'current',
      },
    },
  ],
} as unknown as CurrentProtocol;

const index = [
  {
    id: 'has_condition',
    name: 'has_condition',
    type: 'boolean',
    stages: [],
  },
];

const renderSummary = (
  props: Partial<Parameters<typeof NarrativePedigree>[0]> = {},
) =>
  render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index } as never}
    >
      <NarrativePedigree
        sourceStageId="family"
        showAtRiskStatuses={false}
        diseases={[
          {
            id: 'condition',
            label: { en: 'This condition' },
            color: 'node-color-seq-3',
            attribute: 'has_condition',
            inheritancePattern: 'xLinkedRecessive',
          },
        ]}
        {...props}
      />
    </SummaryContext.Provider>,
  );

describe('Protocol Summary narrative pedigree', () => {
  it('names the Family Pedigree it draws, linked to that stage', () => {
    renderSummary();

    const source = screen.getByRole('link', { name: 'Your family' });
    expect(source).toHaveAttribute('href', '#stage-family');
  });

  it('says whether the possible statuses are shown', () => {
    const { unmount } = renderSummary();
    expect(screen.getByText('Not shown')).toBeInTheDocument();
    unmount();

    renderSummary({ showAtRiskStatuses: true });
    expect(screen.getByText('Shown')).toBeInTheDocument();
  });

  it('lists each disease with the attribute that records it and how it is inherited', () => {
    renderSummary();

    const disease = screen.getByText('This condition').closest('li');
    if (!(disease instanceof HTMLElement)) throw new Error('No disease item');
    expect(within(disease).getByText('has_condition')).toBeInTheDocument();
    expect(within(disease).getByText('X-linked recessive')).toBeInTheDocument();
  });

  it('shows the stored source when the stage it names is gone', () => {
    renderSummary({ sourceStageId: 'deleted-stage' });

    expect(screen.getByText('deleted-stage')).toBeInTheDocument();
  });
});
