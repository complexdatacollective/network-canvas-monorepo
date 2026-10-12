import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RadioGroupField from '../RadioGroup';

describe('RadioGroupField option descriptions', () => {
  it('describes an option by its own description, apart from its name', () => {
    render(
      <RadioGroupField
        name="kind"
        options={[
          { value: 'adoptive', label: 'Adoptive parent' },
          {
            value: 'surrogate',
            label: 'Surrogate',
            disabled: true,
            description:
              '“Surrogate” is unavailable because someone carried them.',
          },
        ]}
        value={undefined}
        onChange={() => undefined}
      />,
    );
    const surrogate = screen.getByRole('radio', { name: 'Surrogate' });
    expect(surrogate).toHaveAccessibleDescription(
      '“Surrogate” is unavailable because someone carried them.',
    );
    expect(
      screen.getByRole('radio', { name: 'Adoptive parent' }),
    ).not.toHaveAttribute('aria-describedby');
  });
});
