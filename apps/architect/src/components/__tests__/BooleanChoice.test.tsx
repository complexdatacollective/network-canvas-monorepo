import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import Form from '@codaco/fresco-ui/form/Form';
import type { OptionValue } from '~/components/Form/arrayFields/Option';

import BooleanChoice from '../BooleanChoice';

// Every real caller sources this from the shared `asOptions(item.options)`
// helper (the Categorical/Ordinal shape), whose type does not capture a
// Boolean option's actual `value: boolean`/`negative` fields — see
// `normalizeInitialOptions` in BooleanChoice.tsx. Casting here matches what
// those call sites already have to do.
const booleanOptions = (
  options: { label: string; value: boolean; negative?: boolean }[],
) => options as unknown as OptionValue[];

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field into
  // view; jsdom implements no scrolling, so stub it (see ArchitectField.test.tsx).
  Element.prototype.scrollTo ??= () => undefined;
});

function renderInForm(children: React.ReactNode) {
  return render(<Form onSubmit={() => ({ success: true })}>{children}</Form>);
}

function submit(container: HTMLElement) {
  const form = container.querySelector('form');
  if (!form) throw new Error('no form was rendered');
  fireEvent.submit(form);
}

describe('BooleanChoice', () => {
  it('seeds Yes/No labels and the fixed true/false values by default', async () => {
    renderInForm(<BooleanChoice />);

    const labels = await screen.findAllByRole('textbox', { name: 'Label' });
    expect(labels).toHaveLength(2);
    expect(labels[0]).toHaveTextContent('Yes');
    expect(labels[1]).toHaveTextContent('No');
  });

  it('gives each negative toggle its own accessible name instead of a shared heading', () => {
    renderInForm(<BooleanChoice />);

    expect(
      screen.getByRole('switch', { name: 'Style Option One as negative' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Style Option Two as negative' }),
    ).toBeInTheDocument();
    // No leftover heading duplicating the toggle's own label.
    expect(
      screen.queryByRole('heading', { name: 'Style option as negative' }),
    ).not.toBeInTheDocument();
  });

  it('starts Option Two negative and Option One not', () => {
    renderInForm(<BooleanChoice />);

    expect(
      screen.getByRole('switch', { name: 'Style Option One as negative' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Style Option Two as negative' }),
    ).toBeChecked();
  });

  it('seeds from the caller-supplied initial options', async () => {
    renderInForm(
      <BooleanChoice
        initialValue={booleanOptions([
          { label: 'Consented', value: true },
          { label: 'Declined', value: false, negative: true },
        ])}
      />,
    );

    const labels = await screen.findAllByRole('textbox', { name: 'Label' });
    expect(labels[0]).toHaveTextContent('Consented');
    expect(labels[1]).toHaveTextContent('Declined');
  });

  // Regression: the committed `value` of each option used to be replaced by
  // its position (option one true, option two false), so saving a protocol
  // that stores its options false-first reversed which boolean each label
  // records — silently changing what already-collected answers mean.
  it('keeps each committed boolean with its own label when the options are stored false-first', async () => {
    const onSubmit = vi.fn(() => ({ success: true }) as const);
    const { container } = render(
      <Form onSubmit={onSubmit}>
        <BooleanChoice
          initialValue={booleanOptions([
            { label: 'No', value: false, negative: true },
            { label: 'Yes', value: true },
          ])}
        />
      </Form>,
    );

    submit(container);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [values] = onSubmit.mock.calls[0] as unknown as [
      Record<string, FieldValue>,
    ];
    expect(values.options).toEqual([
      { label: 'No', value: false, negative: true },
      { label: 'Yes', value: true },
    ]);
  });

  it('states the boolean each card actually records', () => {
    const { container } = render(
      <Form onSubmit={() => ({ success: true })}>
        <BooleanChoice
          initialValue={booleanOptions([
            { label: 'No', value: false, negative: true },
            { label: 'Yes', value: true },
          ])}
        />
      </Form>,
    );

    const [cardOne, cardTwo] = Array.from(container.querySelectorAll('h3')).map(
      (heading) => heading.parentElement?.textContent ?? '',
    );
    expect(cardOne).toContain('set the value false');
    expect(cardTwo).toContain('set the value true');
  });

  it('rejects a blank option label on submit', async () => {
    const { container } = renderInForm(
      <BooleanChoice
        initialValue={booleanOptions([
          { label: '', value: true },
          { label: 'No', value: false, negative: true },
        ])}
      />,
    );

    submit(container);

    expect(
      await screen.findByText('Both option labels are required'),
    ).toBeInTheDocument();
  });
});
