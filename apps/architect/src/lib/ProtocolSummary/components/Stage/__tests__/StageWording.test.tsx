import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import StageWording from '../StageWording';

const protocol = {
  schemaVersion: 9,
  name: 'Wording protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [],
} as unknown as CurrentProtocol;

const renderWording = (type: string, configuration: Record<string, unknown>) =>
  render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index: [] } as never}
    >
      <StageWording type={type} configuration={configuration} />
    </SummaryContext.Provider>,
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
        expect(version.querySelector('[data-token]')).toHaveAttribute(
          'data-token',
          'count',
        );
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
