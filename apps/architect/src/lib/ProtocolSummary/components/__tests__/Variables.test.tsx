import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import Variables from '../Variables';

afterEach(cleanup);

const variables = {
  'consent-preference': {
    name: 'consentPreference',
    type: 'categorical',
    options: [
      { value: 'preferNotToSay', label: 'Prefer not to say' },
      { value: 'yes', label: 'Yes' },
    ],
  } as unknown as Variable,
};

const selectorsFor = (table: Element, utility: string) =>
  [...table.classList]
    .filter((token) => token.endsWith(`]:${utility}`))
    .map((token) =>
      token
        .slice(1, token.lastIndexOf(']:'))
        .replaceAll('_', ' ')
        .replace('&', ':scope'),
    );

const renderVariables = () => {
  const { container } = render(
    <ArchitectI18nProvider>
      <Variables variables={variables} />
    </ArchitectI18nProvider>,
  );

  const tables = container.querySelectorAll('table');
  const [outerTable, miniTable] = tables;

  if (!outerTable || !miniTable) {
    throw new Error('expected the attribute table to nest an options table');
  }

  return { outerTable, miniTable };
};

describe('printable summary attribute table', () => {
  it('renders each option value verbatim', () => {
    const { miniTable } = renderVariables();

    expect(miniTable.textContent).toContain('preferNotToSay');
  });

  it.each(['wrap-break-word', 'hyphens-auto'])(
    'keeps %s off the nested options table',
    (utility) => {
      const { outerTable, miniTable } = renderVariables();
      const selectors = selectorsFor(outerTable, utility);

      expect(selectors).toHaveLength(1);

      for (const selector of selectors) {
        const matched = [...outerTable.querySelectorAll(selector)];

        expect(matched.length).toBeGreaterThan(0);
        expect(matched.filter((cell) => miniTable.contains(cell))).toEqual([]);
      }
    },
  );
});
