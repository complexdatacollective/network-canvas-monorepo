import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CheckboxGroupField from './CheckboxGroup';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('CheckboxGroup readOnly', () => {
  it('marks every option, and its wrapping label, pointer-inert', () => {
    render(
      <CheckboxGroupField
        name="options"
        options={options}
        value={['a']}
        readOnly
        onChange={() => undefined}
      />,
    );

    for (const option of options) {
      const checkbox = screen.getByRole('checkbox', { name: option.label });
      expect(checkbox.className).toContain('pointer-events-none');

      const label = checkbox.closest('label');
      expect(label).not.toBeNull();
      expect(label?.className).toContain('pointer-events-none');
    }
  });

  it('does not report a change when an option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <CheckboxGroupField
        name="options"
        options={options}
        value={['a']}
        readOnly
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Option B' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not report a change when the label text is clicked', async () => {
    // The `<label for>` is associated with the checkbox's hidden native
    // input, not its visible pointer-events-none control — clicking the
    // label text still forwards a native label-click activation to that
    // hidden input unless the label itself is also pointer-inert.
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <CheckboxGroupField
        name="options"
        options={options}
        value={['a']}
        readOnly
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('Option B'));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CheckboxGroup with nothing to tick', () => {
  it('keeps the named group and says so inside it', () => {
    // A group with no boxes is still the element the field's label names, so
    // the sentence standing in for the boxes goes INSIDE it. Rendered in
    // place of the `<fieldset>`, the field loses its accessible name: a
    // `<label for>` cannot label a paragraph, and the `aria-labelledby` the
    // field injects goes with the element it was spread onto.
    render(
      <>
        <span id="edge-types-label">Edge types</span>
        <CheckboxGroupField
          name="options"
          options={[]}
          aria-labelledby="edge-types-label"
          emptyState={<p>Nothing to choose from yet.</p>}
          onChange={() => undefined}
        />
      </>,
    );

    const group = screen.getByRole('group', { name: 'Edge types' });
    expect(
      within(group).getByText('Nothing to choose from yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
