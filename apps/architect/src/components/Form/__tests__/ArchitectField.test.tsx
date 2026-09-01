import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { startCase } from 'es-toolkit/compat';
import { beforeAll, describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import ArchitectArrayField from '../ArchitectArrayField';
import ArchitectField from '../ArchitectField';

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field into
  // view; jsdom implements no scrolling at all, so the call throws out of the
  // deferred handler and Vitest reports it as an unhandled error.
  Element.prototype.scrollTo ??= () => undefined;
});

type ProbeInputProps = {
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

/** Minimal field component: the value/onChange pair plus whatever Field injects. */
function ProbeInput({ value, onChange, ...rest }: ProbeInputProps) {
  return (
    <input
      {...rest}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}

type ProbeListProps = {
  value?: string[];
  onChange?: (value: string[] | undefined) => void;
};

/** Minimal array component: the whole array arrives as one field value. */
function ProbeList({ value, onChange }: ProbeListProps) {
  return (
    <div>
      <span data-testid="item-count">{value?.length ?? 0}</span>
      <button type="button" onClick={() => onChange?.([...(value ?? []), 'x'])}>
        add item
      </button>
    </div>
  );
}

function renderInForm(children: React.ReactNode) {
  return render(<Form onSubmit={() => ({ success: true })}>{children}</Form>);
}

function submit(container: HTMLElement) {
  const form = container.querySelector('form');
  if (!form) throw new Error('no form was rendered');
  fireEvent.submit(form);
}

describe('ArchitectField', () => {
  it('renders the issue anchor before the field so trailing field margins are preserved', () => {
    const { container } = renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        component={ProbeInput}
        validation={{ required: true }}
      />,
    );

    const anchor = container.querySelector('#field_myField__error');
    const input = screen.getByRole('textbox', { name: 'My field' });

    expect(anchor).not.toBeNull();
    if (!anchor) throw new Error('issue anchor was not rendered');
    expect(anchor.getAttribute('data-name')).toBe('My field');
    expect(
      anchor.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * The Issues panel harvests `data-name` off this anchor and prints it as the
   * row's name for the field. It used to be `startCase(name)`, which reads as a
   * real label only where a field's path happens to start-case into one — for
   * everything else the researcher was shown the internal path, spaced out:
   * "Search Options Match Properties", "Behaviours Min Nodes", "Prompts 0 Text"
   * (#1400).
   *
   * `myField`/`My field` cannot catch that (`startCase('myField')` is "My
   * Field", one capital away), so this pins a field whose authored label shares
   * no words with its path.
   */
  it('names the field for the Issues panel by its label, not its internal path', () => {
    const { container } = renderInForm(
      <ArchitectField
        name="searchOptions.matchProperties"
        label="Which attributes should be searchable?"
        component={ProbeInput}
      />,
    );

    const anchor = container.querySelector(
      '#field_searchOptions_matchProperties__error',
    );
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('data-name')).toBe(
      'Which attributes should be searchable?',
    );
    expect(anchor?.getAttribute('data-name')).not.toBe(
      startCase('searchOptions.matchProperties'),
    );
  });

  it('emits the data-field-name seam the Issues panel and E2E specs key on', () => {
    const { container } = renderInForm(
      <ArchitectField
        name="prompts[0].text"
        label="Prompt text"
        component={ProbeInput}
      />,
    );

    expect(
      container.querySelector('[data-field-name="prompts[0].text"]'),
    ).not.toBeNull();
  });

  it('renders label and hint through the BaseField slots', () => {
    renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        hint="Shown beneath the label"
        component={ProbeInput}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'My field' });
    expect(screen.getByText('Shown beneath the label')).toBeInTheDocument();
    expect(input.getAttribute('aria-describedby')).toContain('-hint');
  });

  it('keeps a hidden label as the accessible name', () => {
    renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        labelHidden
        component={ProbeInput}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'My field' }),
    ).toBeInTheDocument();
  });

  it('forwards arbitrary component props', () => {
    renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        component={ProbeInput}
        placeholder="Type here..."
      />,
    );

    expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
  });

  it('seeds the field from initialValue', () => {
    renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        component={ProbeInput}
        initialValue="seeded"
      />,
    );

    expect(screen.getByRole('textbox', { name: 'My field' })).toHaveValue(
      'seeded',
    );
  });

  it('surfaces a natively-mapped rule on submit', async () => {
    const { container } = renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        component={ProbeInput}
        validation={{ required: true }}
      />,
    );

    submit(container);

    // fresco-ui owns the message for natively-mapped rules, so assert that the
    // field reports an error rather than pinning its copy.
    const errors = await screen.findByTestId('myField-field-error');
    expect(errors).not.toBeEmptyDOMElement();
    expect(screen.getByRole('textbox', { name: 'My field' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('surfaces a custom-routed Architect rule on submit, message intact', async () => {
    const { container } = renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        component={ProbeInput}
        initialValue="not a date"
        validation={{ ISODate: 'YYYY-MM-DD' }}
      />,
    );

    submit(container);

    expect(
      await screen.findByText('Date is not valid (YYYY-MM-DD)'),
    ).toBeInTheDocument();
  });

  it('passes the resolved field name to name-sensitive validators', async () => {
    const { container } = renderInForm(
      <ArchitectField
        name="options[0].label"
        label="Label"
        component={ProbeInput}
        initialValue="Apple"
        validation={{
          nameEcho: (
            _value: unknown,
            _all: unknown,
            _props: unknown,
            name?: string,
          ) => `saw ${name}`,
        }}
      />,
    );

    submit(container);

    expect(await screen.findByText('saw options[0].label')).toBeInTheDocument();
  });

  it('ignores a caller onChange rather than letting it replace the store write', () => {
    let callerCalls = 0;
    renderInForm(
      <ArchitectField
        name="myField"
        label="My field"
        component={ProbeInput}
        // The prop is typed away; a runtime spread could still carry it, and
        // Field merges caller props last, so it must be stripped.
        {...{ onChange: () => (callerCalls += 1) }}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'My field' });
    fireEvent.change(input, { target: { value: 'typed' } });

    expect(callerCalls).toBe(0);
    expect(input).toHaveValue('typed');
  });

  it('re-derives validation when the config changes shape', async () => {
    function Harness({ required }: { required: boolean }) {
      return (
        <Form onSubmit={() => ({ success: true })}>
          <ArchitectField
            name="myField"
            label="My field"
            component={ProbeInput}
            validation={{ required }}
          />
        </Form>
      );
    }

    const { container, rerender } = render(<Harness required={false} />);
    submit(container);
    await waitFor(() =>
      expect(screen.queryByTestId('myField-field-error')).toBeNull(),
    );

    rerender(<Harness required />);
    submit(container);
    expect(
      await screen.findByTestId('myField-field-error'),
    ).not.toBeEmptyDOMElement();
  });
});

describe('ArchitectArrayField', () => {
  it('anchors issues under the same ${name}._error id', () => {
    const { container } = renderInForm(
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        component={ProbeList}
      />,
    );

    expect(container.querySelector('#field_prompts__error')).not.toBeNull();
    expect(
      container.querySelector('[data-field-name="prompts"]'),
    ).not.toBeNull();
  });

  it('runs an array-level rule against the whole array value', async () => {
    const notEmpty = (value: unknown) =>
      Array.isArray(value) && value.length > 0
        ? undefined
        : 'You must create at least one prompt';

    const { container } = renderInForm(
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        component={ProbeList}
        initialValue={[]}
        validation={{ notEmpty }}
      />,
    );

    submit(container);
    expect(
      await screen.findByText('You must create at least one prompt'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'add item' }));
    expect(screen.getByTestId('item-count')).toHaveTextContent('1');

    submit(container);
    await waitFor(() =>
      expect(screen.queryByTestId('prompts-field-error')).toBeNull(),
    );
  });
});
