import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderBare, screen, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  testId,
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
  fieldBlockMarkdown,
} from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';

import SummaryContext from '../../SummaryContext';
import Stage from '../Stage';

const KNOWS = testTypeId('knows');
const PERSON = testTypeId('person');
const NICK = testVariableId('nick');
const LAYOUT = testVariableId('layout');
const HOURS = testVariableId('hours');
const NODE_NICK = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: NICK,
});
const EGO_HOURS = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: HOURS,
});

const protocol = {
  schemaVersion: 9,
  name: 'Summary protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [],
} satisfies CurrentProtocol;

const render = (ui: ReactElement) =>
  renderBare(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    ),
  });

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

  // A Language Chooser's page heading is a field of its own, where an
  // Information page's is part of its text.
  it('prints the page heading of a Language Chooser stage under its own section', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <Stage
          id="languages"
          label={{ en: 'Languages' }}
          stageNumber={1}
          type="LanguageChooser"
          configuration={{ title: { en: 'Choose a language' } }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Page Heading')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Choose a language' }),
    ).toBeInTheDocument();
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

describe('Protocol Summary edge labels participants see', () => {
  const withEdgeType = {
    ...protocol,
    codebook: {
      node: {},
      edge: { [KNOWS]: { name: 'knows', color: 'edge-color-seq-1' } },
      ego: {},
    },
  } satisfies CurrentProtocol;

  const renderConfigured = (
    type: string,
    configuration: Record<string, unknown>,
  ) =>
    render(
      <SummaryContext.Provider
        value={{
          protocol: withEdgeType,
          protocolName: withEdgeType.name,
          index: [],
        }}
      >
        <Stage
          id="stage"
          label={{ en: 'A stage' }}
          stageNumber={1}
          type={type}
          configuration={configuration}
        />
      </SummaryContext.Provider>,
    );

  it('prints each edge type a Narrative preset draws with its legend label', () => {
    renderConfigured('Narrative', {
      presets: [
        {
          id: 'preset',
          label: { en: 'Everyone' },
          layoutVariable: LAYOUT,
          edges: { display: [{ type: KNOWS, label: { en: 'Friends' } }] },
        },
      ],
    });

    const edges = screen.getByRole('row', { name: /Show edges/ });
    expect(within(edges).getByText('Friends')).toBeInTheDocument();
    expect(within(edges).getByText('knows')).toBeInTheDocument();
  });

  it('prints a Narrative preset’s own filter with that preset, and none for a preset without one', () => {
    renderConfigured('Narrative', {
      presets: [
        {
          id: 'filtered',
          label: { en: 'Friends only' },
          layoutVariable: LAYOUT,
          filter: {
            rules: [
              {
                id: 'rule',
                type: 'edge',
                options: { type: KNOWS, operator: 'EXISTS' },
              },
            ],
          },
        },
        { id: 'everyone', label: { en: 'Everyone' }, layoutVariable: LAYOUT },
      ],
    });

    const filtered = screen
      .getByRole('heading', { name: 'Friends only' })
      .closest('div');
    const everyone = screen
      .getByRole('heading', { name: 'Everyone' })
      .closest('div');
    if (!filtered || !everyone) throw new Error('A preset was not printed');
    const row = within(filtered).getByRole('row', { name: /Preset filter/ });
    expect(within(row).getByText('knows')).toBeInTheDocument();
    expect(
      within(everyone).queryByRole('row', { name: /Preset filter/ }),
    ).toBeNull();
  });

  it('prints each edge type a Network Composer stage lets participants draw with its label', () => {
    renderConfigured('NetworkComposer', {
      edges: [
        {
          subject: { entity: 'edge', type: KNOWS },
          label: { en: 'Friends' },
        },
      ],
    });

    const row = screen.getByRole('row', { name: /Friends/ });
    expect(within(row).getByText('knows')).toBeInTheDocument();
  });
});

describe('Protocol Summary stage wording that the interview fills in', () => {
  it('prints a notice’s versions as the pill of the argument its setting declares, not as a value the stage binds', () => {
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
    // The wording that fits the number folds to the number's pill, which the
    // declaration names; read as a value the stage shows, it would print
    // `count`.
    const pill = row.querySelector('data[data-attribute-type="placeholder"]');
    expect(pill).toHaveTextContent('Number');
    expect(within(row).queryByText('count')).not.toBeInTheDocument();
  });
});

describe('Protocol Summary form text that shows values', () => {
  it('names a value about the form’s subject by its attribute in a field’s prompt', () => {
    const formProtocol = {
      ...protocol,
      codebook: {
        node: {
          [PERSON]: {
            name: 'Person',
            color: 'node-color-seq-1',
            variables: {
              [NICK]: { name: 'Preferred name', type: 'text' },
              [testVariableId('age')]: { name: 'Age', type: 'number' },
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
            subject: { entity: 'node', type: PERSON },
            form: formOf([
              {
                id: testId('field/age'),
                variable: testVariableId('age'),
                prompt: { en: `How old is {${NODE_NICK}}?` },
              },
            ]),
          }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('How old is', { exact: false })).toHaveTextContent(
      'How old is Preferred name?',
    );
  });
});

describe('Protocol Summary form text', () => {
  const EMPLOYED = testVariableId('employed');
  const EMPLOYER = testVariableId('employer');
  const NAME_FIELD = testId('field/name');
  const EMPLOYER_FIELD = testId('field/employer');
  const employedName = dynamicValueNameFor({
    kind: 'attribute',
    role: 'ego',
    variableId: EMPLOYED,
  });
  const formProtocol = {
    ...protocol,
    codebook: {
      node: {},
      edge: {},
      ego: {
        variables: {
          [EMPLOYED]: { name: 'employed', type: 'boolean' },
          [EMPLOYER]: { name: 'employer', type: 'text' },
        },
      },
    },
  } as unknown as CurrentProtocol;
  const index = [
    {
      id: EMPLOYER,
      name: 'employer',
      type: 'text',
      component: 'Text',
      stages: [],
    },
  ];

  it('prints the text of a form with each field where the text places it, including a field inside a logic block', () => {
    render(
      <SummaryContext.Provider
        value={{
          protocol: formProtocol,
          protocolName: formProtocol.name,
          index,
        }}
      >
        <Stage
          id="ego-form"
          label={{ en: 'Your situation' }}
          stageNumber={2}
          type="EgoForm"
          configuration={{
            form: {
              content: {
                en: [
                  '# About you',
                  'Please answer these questions.',
                  fieldBlockMarkdown(NAME_FIELD),
                  `{${employedName}, select, missing {} true {${fieldBlockMarkdown(EMPLOYER_FIELD)}} other {}}`,
                ].join('\n\n'),
              },
              fields: [
                {
                  id: NAME_FIELD,
                  variable: EMPLOYED,
                  prompt: { en: 'Are you employed?' },
                },
                {
                  id: EMPLOYER_FIELD,
                  variable: EMPLOYER,
                  prompt: { en: 'Who is your employer?' },
                  hint: { en: 'The organisation that pays you.' },
                },
              ],
            },
          }}
        />
      </SummaryContext.Provider>,
    );

    // The text is drawn as markdown, never as its stored syntax.
    expect(
      screen.getByRole('heading', { name: 'About you', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Please answer these questions.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/field:/)).not.toBeInTheDocument();

    // A field outside the logic block is drawn in the text itself.
    const first = document.querySelector(
      `[data-field-summary="${NAME_FIELD}"]`,
    );
    expect(first).toHaveTextContent('Are you employed?');
    expect(first?.closest('[data-logic-summary]')).toBeNull();

    // The field inside the logic block is drawn in the branch that shows it,
    // with its hint, its attribute and its input control.
    const inBranch = document.querySelector(
      `[data-logic-summary="answers"] [data-branch-summary="true"] [data-field-summary="${EMPLOYER_FIELD}"]`,
    );
    expect(inBranch).toHaveTextContent('Who is your employer?');
    expect(inBranch).toHaveTextContent('The organisation that pays you.');
    expect(inBranch).toHaveTextContent('employer');
    expect(
      within(inBranch as HTMLElement).getByText('Input control'),
    ).toBeInTheDocument();
  });
});

describe('Protocol Summary text that reads by a number answer', () => {
  it('shows a logic block on a number answer as the number’s pill and a branch for each form of the number', () => {
    const czechProtocol = {
      ...protocol,
      localization: { defaultLocale: 'cs', locales: ['cs'] },
      codebook: {
        node: {},
        edge: {},
        ego: {
          variables: {
            [HOURS]: { name: 'Hours', type: 'number' },
          },
        },
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
            content: {
              cs: `{${EGO_HOURS}, select, missing {} other {{${EGO_HOURS}, plural, one {Jedna hodina.} few {Několik hodin.} many {Část hodiny.} other {Mnoho hodin.}}}}`,
            },
          }}
        />
      </SummaryContext.Provider>,
    );

    // The block is named by its logic and the number's pill, and each form
    // of the number in the protocol's language is a labelled branch.
    const block = document.querySelector('[data-logic-summary="number"]');
    expect(block).toHaveTextContent(
      'Content for singular or plural numbers: Hours',
    );
    expect(
      block?.querySelector('data[data-attribute-type="number"]'),
    ).toHaveTextContent('Hours');
    expect(
      [...(block?.querySelectorAll('[data-branch-summary]') ?? [])].map(
        (branch) => branch.getAttribute('data-branch-summary'),
      ),
    ).toEqual(['missing', 'one', 'few', 'many', 'other']);
    expect(
      block?.querySelector('[data-branch-summary="few"]'),
    ).toHaveTextContent('When it is 2, 3, 4Několik hodin.');
  });
});
