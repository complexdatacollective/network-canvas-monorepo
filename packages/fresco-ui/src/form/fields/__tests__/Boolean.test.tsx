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

describe('BooleanField answers that cannot be chosen', () => {
  const options = [
    {
      label: 'Yes',
      value: true,
      disabled: true,
      description: 'Someone else carried them.',
    },
    { label: 'No', value: false },
  ];

  it('disables only that answer, says why, and leaves the other to choose', async () => {
    const onChange = vi.fn();
    render(
      <BooleanField
        name="carried"
        options={options}
        value={undefined}
        onChange={onChange}
      />,
    );
    const yes = screen.getByRole('radio', { name: 'Yes' });
    const no = screen.getByRole('radio', { name: 'No' });
    expect(yes).toBeDisabled();
    expect(yes).toHaveAccessibleDescription('Someone else carried them.');
    expect(no).toBeEnabled();
    // With nothing chosen, focus lands on the answer that can be chosen.
    expect(no).toHaveAttribute('tabindex', '0');

    await userEvent.click(yes);
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(no);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('keeps the group in the tab order when the chosen answer is the one that cannot be chosen', () => {
    render(
      <BooleanField
        name="carried"
        options={options}
        value={true}
        onChange={() => undefined}
      />,
    );
    // A disabled button leaves the tab order, so the tab stop moves to the
    // first answer that can be chosen.
    expect(screen.getByRole('radio', { name: 'Yes' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    expect(screen.getByRole('radio', { name: 'No' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });
});
