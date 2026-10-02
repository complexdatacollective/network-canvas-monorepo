import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { findDanglingIdReferences } from '../../utils/ariaIdReferences';
import RadioGroupField from './RadioGroup';

describe('RadioGroup with option values that are not identifiers', () => {
  // An option value is whatever the researcher typed, so none of these may
  // reach an element id: ids cannot contain whitespace, and the `aria-*`
  // reference lists that point at them are split on it.
  const unrestrictedOptions = [
    { value: 'close friend', label: 'close friend' },
    { value: '朋友', label: '朋友' },
    { value: 'école "A" [1]', label: 'école "A" [1]' },
    { value: 7, label: 'seven' },
  ];

  it('gives every option an id without whitespace, distinct from the others', () => {
    const { container } = render(
      <RadioGroupField
        name="relationship"
        options={unrestrictedOptions}
        aria-label="Relationship"
        onChange={() => undefined}
      />,
    );

    const ids = Array.from(container.querySelectorAll('[id]'), (el) => el.id);
    expect(ids.length).toBeGreaterThanOrEqual(unrestrictedOptions.length);
    for (const id of ids) {
      expect(id).not.toMatch(/\s/);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(findDanglingIdReferences(container)).toEqual([]);
  });

  it('reports the typed value of the option whose label is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RadioGroupField
        name="relationship"
        options={unrestrictedOptions}
        value=""
        aria-label="Relationship"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('朋友'));
    expect(onChange).toHaveBeenLastCalledWith('朋友');

    await user.click(screen.getByText('close friend'));
    expect(onChange).toHaveBeenLastCalledWith('close friend');

    await user.click(screen.getByText('seven'));
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('checks the option whose label is clicked', async () => {
    const user = userEvent.setup();

    render(
      <RadioGroupField
        name="relationship"
        options={unrestrictedOptions}
        aria-label="Relationship"
      />,
    );

    for (const { label } of unrestrictedOptions.slice(0, 3)) {
      await user.click(screen.getByText(label));
      expect(screen.getByRole('radio', { name: label })).toBeChecked();
    }
  });
});
