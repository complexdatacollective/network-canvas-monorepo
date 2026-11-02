import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import UnconnectedField from '../../Field/UnconnectedField';
import ComboboxField from './Combobox';

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('ComboboxField popup', () => {
  it('is a dialog named by the field label', async () => {
    render(
      <UnconnectedField
        name="topics"
        label="Topics"
        component={ComboboxField}
        options={OPTIONS}
        value={[]}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Topics' }));

    expect(
      await screen.findByRole('dialog', { name: 'Topics' }),
    ).toBeInTheDocument();
  });

  it('is named by a caller’s aria-label', async () => {
    render(
      <ComboboxField
        name="topics"
        aria-label="Topics"
        options={OPTIONS}
        value={[]}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Topics' }));

    expect(
      await screen.findByRole('dialog', { name: 'Topics' }),
    ).toBeInTheDocument();
  });
});
