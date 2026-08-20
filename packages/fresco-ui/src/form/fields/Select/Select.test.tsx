import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NativeSelectField from './Native';
import StyledSelectField from './Styled';

/**
 * Collects everything React and Base UI say on `console.error` while `run`
 * executes.
 *
 * Both libraries report their state and key complaints there and nowhere else:
 * they do not throw, and they do not change the rendered output. A test that
 * only asserts on the DOM cannot see them, which is how 18 duplicate-key errors
 * per variable creation survived in the field editor.
 */
const captureConsoleErrors = async (run: () => void | Promise<void>) => {
  const consoleError = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  try {
    await run();
    return consoleError.mock.calls.map((call) => call.map(String).join(' '));
  } finally {
    consoleError.mockRestore();
  }
};

const GROUPED_OPTIONS = [
  {
    label: 'Number Types',
    options: [{ label: 'Number Input', value: 'Number' }],
  },
  {
    label: 'Text Types',
    options: [
      { label: 'Text Input', value: 'Text' },
      { label: 'Text Area', value: 'TextArea' },
    ],
  },
  {
    label: 'Boolean Types',
    options: [
      { label: 'Boolean Choice', value: 'Boolean' },
      { label: 'Toggle', value: 'Toggle' },
    ],
  },
];

/**
 * Every way React complains about the keys of a list.
 *
 * Both halves are needed and neither implies the other: headings that all
 * collapse to one key produce "Encountered two children with the same key",
 * while children carrying no key at all produce "Each child in a list should
 * have a unique key prop". Filtering for only the first is how a key test
 * comes to pass against source that renders no groups whatsoever — measured:
 * the pre-fix component fed the grouped list below logs exactly `Each child in
 * a list should have a unique "key" prop.`
 */
const KEY_COMPLAINT = /unique "key" prop|the same key/;

describe('native select with grouped options', () => {
  /**
   * React reports a given key complaint ONCE per parent element type per
   * module lifetime — measured: a second `<select>` rendered from the same
   * broken children in the same file logs nothing at all. So exactly one test
   * here can claim the console is silent about keys, and it must be the first
   * one to render a native select; a second would pass against source that
   * warns. That is why this assertion lives inside the structural test rather
   * than in one of its own.
   */
  it('renders each group as an optgroup holding its own options, and complains about no key', async () => {
    const messages = await captureConsoleErrors(() => {
      render(
        <NativeSelectField
          name="component"
          aria-label="Input control"
          options={GROUPED_OPTIONS}
          placeholder="Select an input control"
        />,
      );
    });

    expect(messages.filter((message) => KEY_COMPLAINT.test(message))).toEqual(
      [],
    );

    const select = screen.getByRole('combobox', { name: 'Input control' });
    const groups = [...select.querySelectorAll('optgroup')];

    expect(groups.map((group) => group.getAttribute('label'))).toEqual([
      'Number Types',
      'Text Types',
      'Boolean Types',
    ]);
    expect(
      groups.map((group) =>
        [...group.querySelectorAll('option')].map((option) => option.value),
      ),
    ).toEqual([['Number'], ['Text', 'TextArea'], ['Boolean', 'Toggle']]);

    // The heading is the group's label, not a disabled option pretending to be
    // one — nothing outside a group but the placeholder.
    expect(
      [...select.children].filter((child) => child.tagName === 'OPTION'),
    ).toHaveLength(1);
  });

  it('reports the chosen option even when it is inside a group', () => {
    const onChange = vi.fn();
    render(
      <NativeSelectField
        name="component"
        aria-label="Input control"
        options={GROUPED_OPTIONS}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Input control' }), {
      target: { value: 'TextArea' },
    });

    expect(onChange).toHaveBeenCalledWith('TextArea');
  });

  it('shows a grouped value as selected rather than falling back to the placeholder', () => {
    render(
      <NativeSelectField
        name="component"
        aria-label="Input control"
        options={GROUPED_OPTIONS}
        placeholder="Select an input control"
        value="Toggle"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Input control' })).toHaveValue(
      'Toggle',
    );
  });

  it('still accepts a flat list', () => {
    render(
      <NativeSelectField
        name="component"
        aria-label="Input control"
        options={[
          { label: 'Text Input', value: 'Text' },
          { label: 'Text Area', value: 'TextArea' },
        ]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Input control' });
    expect(select.querySelectorAll('optgroup')).toHaveLength(0);
    expect(
      [...select.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['', 'Text', 'TextArea']);
  });
});

describe('styled select', () => {
  it('mounts controlled with no value, so the first choice is not a state change', async () => {
    const messages = await captureConsoleErrors(() => {
      const { rerender } = render(
        <StyledSelectField
          name="type"
          aria-label="Variable type"
          placeholder="Select a variable type"
          options={[
            { label: 'Number', value: 'number' },
            { label: 'Text', value: 'text' },
          ]}
          value={undefined}
        />,
      );

      // The first selection: previously this was the moment Base UI saw an
      // uncontrolled Select become controlled, and said so.
      rerender(
        <StyledSelectField
          name="type"
          aria-label="Variable type"
          placeholder="Select a variable type"
          options={[
            { label: 'Number', value: 'number' },
            { label: 'Text', value: 'text' },
          ]}
          value="number"
        />,
      );
    });

    expect(
      messages.filter(
        (message) =>
          message.includes('uncontrolled') || message.includes('controlled'),
      ),
    ).toEqual([]);
  });

  it('shows the placeholder while nothing is selected', () => {
    render(
      <StyledSelectField
        name="type"
        aria-label="Variable type"
        placeholder="Select a variable type"
        options={[{ label: 'Number', value: 'number' }]}
        value={undefined}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Variable type' }),
    ).toHaveTextContent('Select a variable type');
  });
});
