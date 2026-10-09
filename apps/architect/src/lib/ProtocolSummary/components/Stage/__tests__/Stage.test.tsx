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
  it('prints a finish stage’s heading, text, finishing words and outcome, apart from its name', () => {
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
            finishLabel: { en: 'Submit' },
            finishConfirmation: { en: 'Submit your answers?' },
            finishedNotice: { en: 'Your answers are submitted.' },
            finishFailed: { en: 'Your answers could not be submitted.' },
            outcome: 'ineligible',
          }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Thank you for taking part')).toBeInTheDocument();
    for (const [label, value] of [
      ['Finish button', 'Submit'],
      ['Confirmation question', 'Submit your answers?'],
      ['Finished notice', 'Your answers are submitted.'],
      ['If finishing fails', 'Your answers could not be submitted.'],
    ] as const) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(
      screen.getByText('Your answers have been recorded.'),
    ).toBeInTheDocument();
    expect(screen.getByText('End of the interview')).toBeInTheDocument();
  });

  it('prints the heading a roster stage shows over the people it offers', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <Stage
          id="roster"
          label={{ en: 'Classmates' }}
          stageNumber={3}
          type="NameGeneratorRoster"
          configuration={{ panelTitle: { en: 'Your classmates' } }}
        />
      </SummaryContext.Provider>,
    );

    expect(
      screen.getByRole('heading', { name: 'Roster panel' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Your classmates')).toBeInTheDocument();
  });
});
