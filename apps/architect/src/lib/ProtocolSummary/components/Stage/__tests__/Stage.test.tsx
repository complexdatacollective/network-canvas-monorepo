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

  // A finish stage's headings are part of its closing and finished text, so
  // the summary prints both texts, its mode, finishing words and outcome below
  // the stage's name.
  it('prints a finish stage’s mode, closing and finished text, finishing words and outcome, apart from its name', () => {
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
            mode: 'confirmation',
            content: {
              en: '# Thank you for taking part\n\nYour answers have been recorded.',
            },
            finishedContent: {
              en: '# All done\n\nYour answers are submitted.',
            },
            finishLabel: { en: 'Submit' },
            finishConfirmation: { en: 'Submit your answers?' },
            finishFailed: { en: 'Your answers could not be submitted.' },
            outcome: 'ineligible',
          }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Participants confirm')).toBeInTheDocument();
    expect(screen.getByText('Thank you for taking part')).toBeInTheDocument();
    expect(
      screen.getByText('Your answers have been recorded.'),
    ).toBeInTheDocument();
    expect(screen.getByText('All done')).toBeInTheDocument();
    expect(screen.getByText('Your answers are submitted.')).toBeInTheDocument();
    for (const [label, value] of [
      ['Finish button', 'Submit'],
      ['Confirmation question', 'Submit your answers?'],
      ['If finishing fails', 'Your answers could not be submitted.'],
    ] as const) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText('End of the interview')).toBeInTheDocument();
  });

  it('leaves out the closing text and question of a finish stage that finishes automatically', () => {
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
            mode: 'automatic',
            content: { en: 'Never shown.' },
            finishedContent: { en: 'Your answers are submitted.' },
            finishLabel: { en: 'Submit' },
            finishConfirmation: { en: 'Submit your answers?' },
            finishFailed: { en: 'Your answers could not be submitted.' },
            outcome: 'completed',
          }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Finish automatically')).toBeInTheDocument();
    expect(screen.getByText('Your answers are submitted.')).toBeInTheDocument();
    expect(screen.queryByText('Never shown.')).not.toBeInTheDocument();
    expect(screen.queryByText('Submit your answers?')).not.toBeInTheDocument();
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
