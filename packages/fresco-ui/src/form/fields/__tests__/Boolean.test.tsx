import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BooleanField from '../Boolean';

const consentOptions = [
  { label: 'Yes', value: true },
  { label: 'No', value: false, negative: true },
];

describe('BooleanField negative options', () => {
  it('marks only the negative option', () => {
    render(
      <BooleanField
        name="consent"
        options={consentOptions}
        value={undefined}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('radio', { name: 'No' })).toHaveAttribute(
      'data-negative',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toHaveAttribute(
      'data-negative',
    );
  });

  it('applies the destructive treatment only while the negative option is selected', () => {
    const { rerender } = render(
      <BooleanField
        name="consent"
        options={consentOptions}
        value={true}
        onChange={() => undefined}
      />,
    );

    const negativeOption = screen.getByRole('radio', { name: 'No' });
    const negativeIndicator = negativeOption.querySelector('svg');
    expect(negativeOption.className).not.toContain('border-destructive');
    expect(negativeIndicator).toHaveClass('text-primary');
    expect(negativeIndicator).not.toHaveClass('text-destructive');

    rerender(
      <BooleanField
        name="consent"
        options={consentOptions}
        value={false}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('radio', { name: 'No' }).className).toContain(
      'border-destructive',
    );
    expect(negativeIndicator).toHaveClass('text-destructive');
    expect(negativeIndicator).not.toHaveClass('text-primary');
    expect(screen.getByRole('radio', { name: 'Yes' }).className).not.toContain(
      'border-destructive',
    );
  });

  it('reports the option value unchanged when a negative option is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BooleanField
        name="consent"
        options={consentOptions}
        value={undefined}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'No' }));

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
