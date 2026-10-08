import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import Stage from '../Stage';

const protocol = {
  schemaVersion: 9,
  name: 'Summary protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [],
} satisfies CurrentProtocol;

const renderStage = (type: string) =>
  render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index: [] }}
    >
      <Stage
        id="stage"
        label={{ en: 'A stage' }}
        stageNumber={1}
        type={type}
        configuration={{}}
      />
    </SummaryContext.Provider>,
  );

const passphraseRow = () =>
  screen.queryByRole('row', { name: /Minimum passphrase length/ });

describe('Protocol Summary stage', () => {
  it('states the passphrase rules on an Anonymisation stage', () => {
    renderStage('Anonymisation');

    expect(passphraseRow()).toBeInTheDocument();
  });

  it('states no passphrase rules on any other stage', () => {
    renderStage('EgoForm');

    expect(passphraseRow()).not.toBeInTheDocument();
  });

  // The heading a participant reads on the finish stage is its `title`, not
  // its name: the summary prints it as the stage's page heading, with the
  // text and outcome below it.
  it('prints a finish stage’s heading, text and outcome, apart from its name', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <Stage
          id="finish"
          label={{ en: 'End of the interview' }}
          stageNumber={2}
          type="FinishSession"
          configuration={{
            title: { en: 'Thank you for taking part' },
            content: { en: 'Your answers have been recorded.' },
            outcome: 'ineligible',
          }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Thank you for taking part')).toBeInTheDocument();
    expect(
      screen.getByText('Your answers have been recorded.'),
    ).toBeInTheDocument();
    expect(screen.getByText('End of the interview')).toBeInTheDocument();
  });
});
