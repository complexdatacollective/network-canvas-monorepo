import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

vi.mock('~/components/VariablePill', () => ({
  ConnectedVariablePill: () => (
    <div data-testid="connected-variable-pill">ConnectedVariablePill</div>
  ),
  VariablePill: () => <div data-testid="variable-pill">VariablePill</div>,
}));

vi.mock('../VariableSpotlight', () => ({
  default: ({
    open,
    onSelect,
    onCancel,
    onCreateOption,
  }: {
    open: boolean;
    onSelect: (value: string) => void;
    onCancel: () => void;
    onCreateOption: (value: string) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Variable library">
        <button type="button" onClick={() => onSelect('age')}>
          Choose age
        </button>
        <button type="button" onClick={() => onCreateOption('height')}>
          Create new variable called height
        </button>
        <button type="button" onClick={onCancel}>
          Cancel selection
        </button>
      </div>
    ) : null,
}));

import ArchitectField from '../../../ArchitectField';
import { VariablePickerControl as VariablePicker } from '../VariablePicker';

const options = [
  { label: 'Age', value: 'age', type: 'number' },
  { label: 'New variable', value: 'new-variable' },
];

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const reduxStore = configureStore({
  reducer: {
    protocol: () => ({
      present: {
        codebook: {
          node: { person: { variables: { age: {} } } },
          edge: {},
          ego: {},
        },
      },
    }),
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

const renderPicker = (field: ReactNode) => {
  storeApi = null;

  return render(
    <Provider store={reduxStore}>
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        {field}
        <button type="submit">Save</button>
      </Form>
    </Provider>,
  );
};

const setup = (initialValue?: string) => {
  const view = renderPicker(
    <ArchitectField
      name="variable"
      label="Variable"
      component={VariablePicker}
      initialValue={initialValue}
      validation={{ required: true }}
      options={options}
    />,
  );

  return {
    ...view,
    getValue: () => {
      if (!storeApi) throw new Error('form store was not captured');
      return storeApi.getState().getFormValues().variable as string | undefined;
    },
  };
};

describe('VariablePicker', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field
    // into view; jsdom implements no scrolling at all.
    Element.prototype.scrollTo ??= () => undefined;
  });

  it('uses the shared field label and group semantics', () => {
    setup();

    expect(screen.getByRole('group', { name: 'Variable' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Variable' }),
    ).toHaveAccessibleDescription(/Required/);
    expect(
      screen.getByRole('button', { name: 'Select variable' }),
    ).toBeInTheDocument();
  });

  it('renders label, hint and errors through the BaseField slots only', async () => {
    const { container } = renderPicker(
      <ArchitectField
        name="variable"
        label="Layout variable"
        hint="Positions are stored against this variable."
        component={VariablePicker}
        validation={{ required: true }}
        options={options}
      />,
    );

    // The picker used to hand-roll BaseField's label/hint/required/error
    // layout. One implementation now owns all four, keyed on the same seam
    // the Issues panel and the E2E specs target.
    const field = container.querySelector('[data-field-name="variable"]');
    expect(field).not.toBeNull();
    expect(field?.querySelectorAll('label')).toHaveLength(1);

    const group = screen.getByRole('group', { name: 'Layout variable' });
    expect(group).toHaveAccessibleDescription(
      /Positions are stored against this variable\./,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId('variable-field-error')).toHaveTextContent(
      'This field is required.',
    );
  });

  it('renders the selected variable using the appropriate pill', () => {
    setup('age');

    expect(screen.getByTestId('connected-variable-pill')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change variable' }),
    ).toBeInTheDocument();
  });

  it('renders an untyped selected variable using the unconnected pill', () => {
    setup('new-variable');

    expect(screen.getByTestId('variable-pill')).toBeInTheDocument();
  });

  it('persists a spotlight selection to the form store', () => {
    const { getValue } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Select variable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose age' }));

    expect(getValue()).toBe('age');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /**
   * Creating a variable is a two-step write: the picker clears the field
   * (`onChange('')`, which validates and raises "This field is required.")
   * and the host then writes the real id with `setFieldValue`. The host write
   * used to leave the message and the invalid styling in place, so the field
   * showed the new variable's pill and a red "required" error at the same
   * time.
   *
   * Filed as persisting "until reopen"; it in fact also cleared on the next
   * save attempt, because submit revalidates everything. Both are pinned here
   * — reopening the editor is NOT what fixes it, and this must not degrade
   * into the reported behaviour either.
   */
  describe('creating a variable from the picker', () => {
    const createVariable = () => {
      const view = setup();
      const setFieldValue = () => {
        if (!storeApi) throw new Error('form store was not captured');
        return storeApi.getState().setFieldValue;
      };

      // Raise the error first, exactly as a failed save does.
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      return { ...view, setFieldValue };
    };

    it('clears the required error as soon as the created variable is written', async () => {
      const { setFieldValue, getValue } = createVariable();

      expect(
        await screen.findByTestId('variable-field-error'),
      ).toHaveTextContent('This field is required.');

      fireEvent.click(screen.getByRole('button', { name: 'Select variable' }));
      // The picker's own create path: clear, close, hand the name to the host.
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Create new variable called height',
        }),
      );
      // What `withFieldsHandlers.handleNewVariable` does next.
      act(() => {
        setFieldValue()('variable', 'height');
      });

      expect(getValue()).toBe('height');
      expect(screen.queryByTestId('variable-field-error')).toBeNull();
      expect(
        screen.getByRole('group', { name: 'Variable' }),
      ).not.toHaveAttribute('aria-invalid', 'true');
      // And the control itself has moved on.
      expect(
        screen.getByRole('button', { name: 'Change variable' }),
      ).toBeInTheDocument();
    });

    it('does not need the editor reopened, or a second save, to clear it', async () => {
      const { setFieldValue } = createVariable();
      await screen.findByTestId('variable-field-error');

      fireEvent.click(screen.getByRole('button', { name: 'Select variable' }));
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Create new variable called height',
        }),
      );
      act(() => {
        setFieldValue()('variable', 'height');
      });

      // No remount, no second submit — the assertion the filed description
      // would fail.
      expect(screen.queryByTestId('variable-field-error')).toBeNull();
    });
  });
});
