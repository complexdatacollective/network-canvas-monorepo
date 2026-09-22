import { cleanup, render, screen, within } from '@testing-library/react';
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

describe('printable summary attribute table', () => {
  it('renders each option value verbatim', () => {
    render(
      <ArchitectI18nProvider>
        <Variables variables={variables} />
      </ArchitectI18nProvider>,
    );

    const [, optionsTable] = screen.getAllByRole('table');
    if (!optionsTable) throw new Error('The attribute has no options table.');

    expect(within(optionsTable).getByText('preferNotToSay')).toBeVisible();
  });
});
