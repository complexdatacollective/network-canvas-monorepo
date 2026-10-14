import { render, screen, within } from '@testing-library/react';
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

describe('Protocol Summary stage wording that the interview fills in', () => {
  it('prints a notice’s versions by the arguments its setting declares, not as values the stage binds', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <Stage
          id="generator"
          label={{ en: 'Friends' }}
          stageNumber={4}
          type="NameGenerator"
          configuration={{
            minNodesNotice: {
              en: '{count, plural, one {Add # more person} other {Add # more people}}',
            },
          }}
        />
      </SummaryContext.Provider>,
    );

    const row = screen.getByRole('row', { name: /Minimum not reached/ });
    // The declaration names the number; a stage binding would print `count`.
    expect(within(row).getByText('When “Number” is 1')).toBeInTheDocument();
    expect(within(row).queryByText('count')).not.toBeInTheDocument();
  });
});

describe('Protocol Summary form text that shows values', () => {
  it('names a value about the form’s subject by its attribute in a field’s prompt', () => {
    const formProtocol = {
      ...protocol,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            variables: {
              nick: { name: 'Preferred name', type: 'text' },
              age: { name: 'Age', type: 'number' },
            },
          },
        },
        edge: {},
        ego: {},
      },
    } as unknown as CurrentProtocol;
    render(
      <SummaryContext.Provider
        value={{
          protocol: formProtocol,
          protocolName: formProtocol.name,
          index: [],
        }}
      >
        <Stage
          id="alter-form"
          label={{ en: 'About each person' }}
          stageNumber={5}
          type="AlterForm"
          configuration={{
            subject: { entity: 'node', type: 'person' },
            dynamicValues: { nick: { path: 'node.nick' } },
            form: {
              fields: [
                { variable: 'age', prompt: { en: 'How old is {nick}?' } },
              ],
            },
          }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('How old is', { exact: false })).toHaveTextContent(
      'How old is Preferred name?',
    );
  });
});

describe('Protocol Summary text that reads by a number answer', () => {
  it('shows text that reads by a number as the number’s pill, without listing its versions', () => {
    const czechProtocol = {
      ...protocol,
      localization: { defaultLocale: 'cs', locales: ['cs'] },
      codebook: {
        node: {},
        edge: {},
        ego: { variables: { hours: { name: 'Hours', type: 'number' } } },
      },
    } as unknown as CurrentProtocol;
    render(
      <SummaryContext.Provider
        value={{
          protocol: czechProtocol,
          protocolName: czechProtocol.name,
          index: [],
        }}
      >
        <Stage
          id="hours"
          label={{ cs: 'Hodiny' }}
          stageNumber={6}
          type="Information"
          configuration={{
            title: {
              cs: '{hours, select, missing {} other {{hours, plural, one {# hodina} few {# hodiny} many {# hodiny} other {# hodin}}}}',
            },
            dynamicValues: { hours: { path: 'ego.hours' } },
          }}
        />
      </SummaryContext.Provider>,
    );

    // The summary prints only the value the versions are on; the versions,
    // and the numbers each is for, are read in the editor.
    const pills = document.querySelectorAll('[data-token]');
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveAttribute('data-token', 'hours');
    expect(pills[0]).toHaveTextContent('Hours');
    expect(screen.queryByText(/When it is/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hodin/)).not.toBeInTheDocument();
  });
});
