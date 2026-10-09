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
    'prints a %s minimum notice as its versions, one for each number it reads differently for',
    (type) => {
      renderWording(type, { minNodesNotice: MINIMUM_NOTICE });

      const row = rowFor('Minimum not reached');
      expect(row).not.toHaveTextContent('{count, plural');
      expect(row).toHaveTextContent('more person');
      expect(row).toHaveTextContent('more people');
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
