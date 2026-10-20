import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { findDanglingIdReferences } from '../../utils/ariaIdReferences';
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

describe('CheckboxGroup with option values that are not identifiers', () => {
  // An option value is whatever the researcher typed, so none of these may
  // reach an element id: ids cannot contain whitespace, and the `aria-*`
  // reference lists that point at them are split on it.
  const unrestrictedOptions = [
    { value: 'close friend', label: 'close friend' },
    { value: '朋友', label: '朋友' },
    { value: 'école "A" [1]', label: 'école "A" [1]' },
  ];

  it('gives every option an id without whitespace, distinct from the others', () => {
    const { container } = render(
      <CheckboxGroupField
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
      <CheckboxGroupField
        name="relationship"
        options={unrestrictedOptions}
        value={[]}
        aria-label="Relationship"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('朋友'));
    expect(onChange).toHaveBeenLastCalledWith(['朋友']);

    await user.click(screen.getByText('close friend'));
    expect(onChange).toHaveBeenLastCalledWith(['close friend']);
  });

  it('checks the option whose label is clicked', async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [value, setValue] = useState<(string | number)[]>([]);
      return (
        <CheckboxGroupField
          name="relationship"
          options={unrestrictedOptions}
          value={value}
          aria-label="Relationship"
          onChange={(next) => setValue(next ?? [])}
        />
      );
    }

    render(<Controlled />);

    for (const { label } of unrestrictedOptions) {
      await user.click(screen.getByText(label));
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    }
  });
});
