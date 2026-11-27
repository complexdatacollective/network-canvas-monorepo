import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import Stage from '../Stage';
import StageWording from '../StageWording';

const protocol = {
  schemaVersion: 9,
  name: 'Wording protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [],
} as unknown as CurrentProtocol;

const inSummary = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] } as never}
      >
        {ui}
      </SummaryContext.Provider>
    </QueryClientProvider>,
  );

const renderWording = (
  type: string,
  configuration: Record<string, unknown>,
  omits?: (path: string) => boolean,
) =>
  inSummary(<StageWording stage={{ ...configuration, type }} omits={omits} />);

/** The whole stage, so the summary decides where and which words it prints. */
const renderStage = (type: string, configuration: Record<string, unknown>) =>
  inSummary(
    <Stage
      id="stage"
      label={{ en: 'A stage' }}
      stageNumber={1}
      type={type}
      configuration={configuration}
    />,
  );

/** The table row whose label is `label`, so its value can be checked. */
const rowFor = (label: string) => {
  const row = screen.getByText(label).closest('tr');
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${label}`);
  return row;
};

const MINIMUM_NOTICE = {
  en: '{count, plural, one {Add # more person} other {Add # more people}}',
};

describe('Protocol Summary name generator wording', () => {
  it.each(['NameGenerator', 'NameGeneratorRoster'])(
    'prints a %s minimum notice as a line for each version, each with the number as a pill',
    (type) => {
      renderWording(type, { minNodesNotice: MINIMUM_NOTICE });

      const row = rowFor('Minimum not reached');
      expect(row).not.toHaveTextContent('{count, plural');
      // The notice is nothing but a number's versions, so each is written out
      // under the numbers it is for, with the number itself as a pill.
      const versions = [...row.querySelectorAll('[data-version-summary]')];
      expect(versions.map((version) => version.textContent)).toEqual([
        'When it is 1Add Number more person',
        'When it is 0, 2, 3, …Add Number more people',
      ]);
      for (const version of versions) {
        expect(
          version.querySelector('data[data-attribute-type="placeholder"]'),
        ).toHaveTextContent('Number');
      }
    },
  );

  it('prints a notice that uses no arguments as it is written', () => {
    renderWording('NameGenerator', {
      maxNodesNotice: { en: 'That is everyone this step needs.' },
    });

    expect(rowFor('Maximum reached')).toHaveTextContent(
      'That is everyone this step needs.',
    );
  });

  it('prints the settings in the order the stage editor shows them', () => {
    renderWording('NameGeneratorRoster', {
      unnamedLabel: { en: 'Unnamed {number}' },
      allAddedNotice: { en: 'Everyone is added.' },
      maxNodesNotice: { en: 'That is everyone.' },
    });

    expect(
      screen.getAllByRole('row').map((row) => row.firstChild?.textContent),
    ).toEqual(['Maximum reached', 'Everything added', 'Unnamed label']);
  });

  it('leaves out a setting the caller omits', () => {
    renderWording(
      'NameGenerator',
      {
        minNodesNotice: { en: 'Add more.' },
        maxNodesNotice: { en: 'That is everyone.' },
      },
      (path) => path === 'minNodesNotice',
    );

    expect(screen.queryByText('Minimum not reached')).not.toBeInTheDocument();
    expect(rowFor('Maximum reached')).toHaveTextContent('That is everyone.');
  });
});

describe('Protocol Summary bin wording', () => {
  it.each(['OrdinalBin', 'CategoricalBin'])(
    'prints a %s unplaced nodes notice',
    (type) => {
      renderWording(type, {
        unplacedNodesNotice: { en: 'Place everyone to continue.' },
      });

      expect(rowFor('Nodes not yet placed')).toHaveTextContent(
        'Place everyone to continue.',
      );
    },
  );
});

describe('Protocol Summary canvas wording', () => {
  it('prints the words a Narrative stage holds under its heading', () => {
    renderStage('Narrative', {
      groupsHeading: { en: 'Clusters' },
      presets: [
        {
          id: 'p1',
          label: { en: 'Preset' },
          groupVariable: 'contactType',
        },
      ],
    });

    expect(screen.getByText('Customize built-in wording')).toBeInTheDocument();
    expect(
      within(rowFor('Groups heading')).getByText('Clusters'),
    ).toBeInTheDocument();
  });

  it('prints the narrative headings when a preset uses the matching feature', () => {
    renderStage('Narrative', {
      attributesHeading: { en: 'Important people' },
      presets: [
        {
          id: 'p1',
          label: { en: 'Preset' },
          highlight: [{ variable: 'age', label: { en: 'Age' } }],
        },
      ],
    });

    expect(
      within(rowFor('Attributes heading')).getByText('Important people'),
    ).toBeInTheDocument();
  });

  // The stage editor shows a heading only while a preset uses its feature,
  // and the participant never sees one that no preset uses.
  it('leaves out a narrative heading no preset uses', () => {
    renderStage('Narrative', {
      attributesHeading: { en: 'Important people' },
      presets: [{ id: 'p1', label: { en: 'Preset' } }],
    });

    expect(screen.queryByText('Attributes heading')).not.toBeInTheDocument();
    expect(screen.queryByText('Important people')).not.toBeInTheDocument();
  });

  it('prints the snapshot button of a narrative pedigree', () => {
    renderStage('NarrativePedigree', {
      saveSnapshot: { en: 'Keep a picture' },
    });

    expect(
      within(rowFor('Save snapshot button')).getByText('Keep a picture'),
    ).toBeInTheDocument();
  });

  // A snapshot title shows a name and a condition: the summary names its
  // placeholders, as the stage editor does, rather than printing its syntax.
  it('prints a snapshot title with its placeholders named', () => {
    renderStage('NarrativePedigree', {
      conditionText: { snapshotCondition: { en: '{title}: {condition}' } },
    });

    const row = rowFor('Snapshot title for a condition');
    expect(row).not.toHaveTextContent('{title}');
    expect(row).not.toHaveTextContent('{condition}');
    // Each placeholder is drawn as a pill, named by its label.
    expect(
      [...row.querySelectorAll('data[data-attribute-type="placeholder"]')].map(
        (pill) => pill.textContent,
      ),
    ).toEqual(['Stage title', 'Condition name']);
    expect(row).toHaveTextContent(/.+: .+/);
  });

  it('prints nothing for a stage whose settings hold no words', () => {
    const { container } = renderWording('Narrative', {});
    expect(container).toBeEmptyDOMElement();
  });

  it('prints nothing for a stage type that has no built-in wording', () => {
    const { container } = renderWording('NetworkComposer', {
      convexHullVariable: 'contactType',
    });
    expect(container).toBeEmptyDOMElement();
  });
});
