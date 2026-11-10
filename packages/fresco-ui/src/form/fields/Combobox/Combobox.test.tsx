import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

describe('ComboboxField optionFromSearch', () => {
  // The label deliberately does not contain the text it is offered for, so
  // the option can only be listed because the search asked for it.
  const offer = (search: string) =>
    search === 'a'
      ? { value: 'a', label: 'Option A' }
      : { value: `new:${search}`, label: 'Something new' };

  const Harness = ({ onChange }: { onChange?: (value: unknown) => void }) => {
    const [value, setValue] = useState<(string | number)[]>([]);
    return (
      <ComboboxField
        name="topics"
        aria-label="Topics"
        options={OPTIONS}
        optionFromSearch={offer}
        showSelectAll={false}
        searchPlaceholder="Find"
        value={value}
        onChange={(next) => {
          setValue(next ?? []);
          onChange?.(next);
        }}
      />
    );
  };

  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('combobox', { name: 'Topics' }));
    return await screen.findByPlaceholderText('Find');
  };

  const optionNames = () =>
    screen.queryAllByRole('option').map((option) => option.textContent);

  it('lists the offered option after the matches, whatever its label says', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(await open(user), 'opt');
    expect(optionNames()).toEqual(['Option A', 'Option B', 'Something new']);

    await user.clear(screen.getByPlaceholderText('Find'));
    await user.type(screen.getByPlaceholderText('Find'), 'zzz');
    expect(optionNames()).toEqual(['Something new']);
  });

  it('offers nothing before anything is typed, or for blank text', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const search = await open(user);
    expect(optionNames()).toEqual(['Option A', 'Option B']);
    await user.type(search, '   ');
    expect(optionNames()).not.toContain('Something new');
  });

  it('does not list an option twice when it is already one of the options', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(await open(user), 'a');
    expect(optionNames().filter((name) => name === 'Option A')).toHaveLength(1);
  });

  it('keeps a chosen offered option chosen after the search is cleared, and drops it when unchosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const search = await open(user);
    await user.type(search, 'zzz');
    await user.click(screen.getByRole('option', { name: 'Something new' }));
    expect(onChange).toHaveBeenLastCalledWith(['new:zzz']);

    await user.clear(search);
    expect(optionNames()).toEqual(['Option A', 'Option B', 'Something new']);
    expect(
      screen.getByRole('option', { name: 'Something new' }),
    ).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('option', { name: 'Something new' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(optionNames()).toEqual(['Option A', 'Option B']);
  });
});

describe('ComboboxField single', () => {
  const Harness = ({ onChange }: { onChange: (value: unknown) => void }) => {
    const [value, setValue] = useState<(string | number)[]>([]);
    return (
      <ComboboxField
        name="topic"
        aria-label="Topic"
        single
        options={OPTIONS}
        optionFromSearch={(search) => ({
          value: `new:${search}`,
          label: `New ${search}`,
        })}
        searchPlaceholder="Find"
        value={value}
        onChange={(next) => {
          setValue(next ?? []);
          onChange(next);
        }}
      />
    );
  };

  it('chooses one option, replaces it with the next and closes the list each time', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Topic' }));
    expect(screen.queryByRole('button', { name: 'Select All' })).toBeNull();
    await user.click(await screen.findByRole('option', { name: 'Option A' }));
    expect(onChange).toHaveBeenLastCalledWith(['a']);
    await vi.waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    await user.click(screen.getByRole('combobox', { name: 'Topic' }));
    await user.click(await screen.findByRole('option', { name: 'Option B' }));
    expect(onChange).toHaveBeenLastCalledWith(['b']);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('keeps the choice when it is chosen again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Topic' }));
    await user.click(await screen.findByRole('option', { name: 'Option A' }));
    await user.click(screen.getByRole('combobox', { name: 'Topic' }));
    await user.click(await screen.findByRole('option', { name: 'Option A' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });

  it('offers an option from the search text and keeps it chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Topic' }));
    await user.type(await screen.findByPlaceholderText('Find'), 'zzz');
    await user.click(await screen.findByRole('option', { name: 'New zzz' }));

    expect(onChange).toHaveBeenLastCalledWith(['new:zzz']);
    await user.click(screen.getByRole('combobox', { name: 'Topic' }));
    expect(
      await screen.findByRole('option', { name: 'New zzz' }),
    ).toHaveAttribute('aria-selected', 'true');
  });
});
