import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The sub-editor as it is mounted in the create-attribute dialog: what it puts
 * on screen, and what the created variable ends up carrying.
 *
 * The dialog shell is stubbed down to a form store and a submit button — the
 * real one is a modal with its own animation — but everything under test (the
 * section, its controls, and the merge into the configuration) is real.
 */

vi.mock('~/components/DialogForm/DialogForm', async () => {
  const { default: FormStoreProvider } =
    await import('@codaco/fresco-ui/form/store/formStoreProvider');
  const { default: useFormStore } =
    await import('@codaco/fresco-ui/form/hooks/useFormStore');

  const Submit = ({
    onSubmit,
  }: {
    onSubmit: (values: Record<string, unknown>) => void;
  }) => {
    const getFormValues = useFormStore((state) => state.getFormValues);
    return (
      <button type="button" onClick={() => onSubmit(getFormValues())}>
        Save and Close
      </button>
    );
  };

  return {
    default: (props: {
      children?: ReactNode;
      onSubmit: (values: Record<string, unknown>) => void;
    }) => (
      <FormStoreProvider>
        <div>
          {props.children}
          <Submit onSubmit={props.onSubmit} />
        </div>
      </FormStoreProvider>
    ),
  };
});

vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Subsection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('~/selectors/codebook', () => ({ getVariablesForSubject: () => ({}) }));

// The attribute-type control is a Base UI select whose popup jsdom cannot
// open. Everything under test needs from it is the value it reports, so it is
// stood in for by the native element it is built to replace.
vi.mock('@codaco/fresco-ui/form/fields/Select/Styled', () => ({
  default: ({
    value,
    onChange,
    options,
    placeholder: _placeholder,
    ...rest
  }: {
    value?: string;
    onChange?: (next: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
  }) => (
    <select
      {...rest}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">Select attribute type</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const createVariableAsync = vi.fn((argument: unknown) => argument);
vi.mock('~/ducks/modules/protocol/codebook', () => ({
  createVariableAsync: (argument: unknown) => createVariableAsync(argument),
}));

const dispatchSpy = vi.fn(() => ({
  unwrap: async () => ({ variable: 'created' }),
}));
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

import NewVariableWindow from '../NewVariableWindow';

const renderWindow = (
  initialValues: Record<string, unknown> | null = {
    name: 'age',
    type: 'number',
  },
) =>
  render(
    <NewVariableWindow
      show
      entity="node"
      type="person"
      initialValues={initialValues}
      onComplete={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save and Close' }));

const configuration = () => {
  const call = createVariableAsync.mock.calls.at(-1)?.[0] as
    | { configuration: Record<string, unknown> }
    | undefined;
  return call?.configuration;
};

describe('authoring synthetic parameters while creating an attribute', () => {
  it('renders the sub-editor for the chosen attribute type', () => {
    renderWindow();
    expect(
      screen.getByRole('button', { name: /^Synthetic data/ }),
    ).toBeInTheDocument();
  });

  it('carries an authored block into the created variable', () => {
    renderWindow();
    fireEvent.click(screen.getByRole('button', { name: /^Synthetic data/ }));

    const field = screen.getByRole('spinbutton', {
      name: 'Chance of no answer',
    });
    fireEvent.change(field, { target: { value: '0.2' } });
    fireEvent.blur(field);

    submit();
    expect(configuration()).toMatchObject({
      name: 'age',
      type: 'number',
      synthetic: { missingProbability: 0.2 },
    });
  });

  it('creates no synthetic key at all when nothing is authored', () => {
    renderWindow();
    submit();

    const created = configuration();
    expect(created).toBeDefined();
    expect(created && 'synthetic' in created).toBe(false);
  });

  it('discards what was authored when the attribute changes kind', () => {
    renderWindow(null);

    const typeField = screen.getByRole('combobox', { name: 'Attribute type' });
    fireEvent.change(typeField, { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: /^Synthetic data/ }));

    const chance = screen.getByRole('spinbutton', {
      name: 'Chance of answering yes',
    });
    fireEvent.change(chance, { target: { value: '0.7' } });
    fireEvent.blur(chance);

    // A chance of answering yes describes a boolean and nothing else; the
    // schema would refuse it on a text attribute.
    fireEvent.change(typeField, { target: { value: 'text' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Attribute name' }), {
      target: { value: 'nickname' },
    });

    submit();
    const created = configuration();
    expect(created).toMatchObject({ type: 'text' });
    expect(created && 'synthetic' in created).toBe(false);
  });
});
