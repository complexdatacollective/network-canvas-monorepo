import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import ArchitectField from '../../ArchitectField';
import NativeSelect from '../NativeSelect';

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field into
  // view; jsdom implements no scrolling at all.
  Element.prototype.scrollTo ??= () => undefined;
});

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const options = [
  { label: 'Alpha', value: 'alpha' },
  { label: 'Disabled', value: 'disabled', disabled: true },
];

type SetupOptions = {
  allowPlaceholderSelect?: boolean;
  onCreateOption?: (value: string) => Promise<void> | void;
  onCreateNew?: () => void;
  /** Labels already defined on the entity, for the duplicate check. */
  existingOptions?: { label: string; value: string; disabled?: boolean }[];
  /**
   * Rules applied to the typed name. Defaulted to the NMToken rule most
   * callers pass; a test about the duplicate check has to be able to drop it,
   * because NMToken refuses any character outside `[a-zA-Z0-9._\-:]` and so
   * short-circuits before the duplicate check is reached.
   */
  createValidation?: Record<string, unknown>;
};

const setup = ({
  allowPlaceholderSelect = false,
  onCreateOption,
  onCreateNew,
  existingOptions = options,
  createValidation = { allowedNMToken: 'choice name' },
}: SetupOptions = {}) => {
  storeApi = null;

  const view = render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <ArchitectField
        name="choice"
        label="Choice"
        component={NativeSelect}
        validation={{ required: true }}
        options={existingOptions}
        reserved={[{ label: 'Reserved', value: 'reserved' }]}
        entity="person"
        placeholder="Choose one"
        allowPlaceholderSelect={allowPlaceholderSelect}
        onCreateOption={onCreateOption}
        onCreateNew={onCreateNew}
        createInputLabel="New choice"
        createValidation={createValidation}
      />
      <button type="submit">Save</button>
    </Form>,
  );

  return {
    ...view,
    getChoice: () => {
      if (!storeApi) throw new Error('form store was not captured');
      return storeApi.getState().getFormValues().choice as string | undefined;
    },
  };
};

describe('NativeSelect', () => {
  it('maps selections and the placeholder to the form value contract', () => {
    const { getChoice } = setup({ allowPlaceholderSelect: true });
    const select = screen.getByRole('combobox', { name: /Choice/ });

    fireEvent.change(select, { target: { value: 'alpha' } });
    expect(getChoice()).toBe('alpha');

    fireEvent.change(select, { target: { value: '' } });
    expect(getChoice()).toBeUndefined();
  });

  it('preserves disabled placeholder and option semantics', () => {
    setup();

    expect(
      screen.getByRole('option', { name: '-- Choose one --' }),
    ).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Disabled' })).toBeDisabled();
  });

  it('shows field validation through the shared field error UI', async () => {
    setup();
    const select = screen.getByRole('combobox', { name: /Choice/ });

    expect(select).toHaveAttribute('aria-required', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByTestId('choice-field-error'),
    ).not.toBeEmptyDOMElement();
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'));
  });

  it('resets the create-option draft when creation is cancelled', async () => {
    setup({ onCreateOption: vi.fn() });
    let select = screen.getByRole('combobox', { name: /Choice/ });

    fireEvent.change(select, { target: { value: '_create' } });

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'New choice' }),
      { target: { value: 'Draft' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    select = await screen.findByRole('combobox', { name: /Choice/ });
    fireEvent.change(select, { target: { value: '_create' } });
    expect(
      await screen.findByRole('textbox', { name: 'New choice' }),
    ).toHaveValue('');
  });

  it('validates duplicate, reserved, and format errors before creation', async () => {
    setup({ onCreateOption: vi.fn() });
    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });
    const input = await screen.findByRole('textbox', { name: 'New choice' });
    const create = screen.getByRole('button', { name: 'Create' });

    fireEvent.change(input, { target: { value: 'Alpha' } });
    expect(screen.getByText(/already defined/)).toBeInTheDocument();
    expect(create).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Reserved' } });
    expect(screen.getByText(/already defined/)).toBeInTheDocument();
    expect(create).toBeDisabled();

    fireEvent.change(input, { target: { value: 'not allowed' } });
    expect(create).toBeDisabled();
  });

  /**
   * The uniqueness question this control asks has to be the one every other
   * Architect control asks — `normalizeForComparison`: case-insensitive AND
   * Unicode-canonical. It compared raw case, so a label whose accented
   * character was encoded the other way round was accepted as new here and
   * then refused by the schema's `findDuplicateName` on save. The pair also
   * reaches the participant as two choices nothing distinguishes.
   */
  it('refuses a created option that differs only in how an accent is encoded', async () => {
    setup({
      onCreateOption: vi.fn(),
      existingOptions: [{ label: 'Caf\u00e9', value: 'cafe' }],
      // No NMToken rule: it refuses any character outside
      // `[a-zA-Z0-9._\\-:]` and would short-circuit before the duplicate check.
      createValidation: {},
    });
    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });
    const input = await screen.findByRole('textbox', { name: 'New choice' });

    // The same text, spelled `e` + U+0301 rather than the precomposed U+00E9.
    fireEvent.change(input, { target: { value: 'Cafe\u0301' } });

    expect(screen.getByText(/already defined/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('submits a valid created option and returns to the select', async () => {
    const onCreateOption = vi.fn(async () => undefined);
    setup({ onCreateOption });
    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'New choice' }),
      { target: { value: 'NewChoice' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(onCreateOption).toHaveBeenCalledWith('NewChoice'),
    );
    expect(
      await screen.findByRole('combobox', { name: /Choice/ }),
    ).toBeInTheDocument();
  });

  it('keeps the create form open and reports creation failures', async () => {
    const onCreateOption = vi.fn(async () => {
      throw new Error('Could not create that option');
    });
    setup({ onCreateOption });
    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'New choice' }),
      { target: { value: 'NewChoice' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('Could not create that option'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New choice' })).toHaveValue(
      'NewChoice',
    );
  });

  it('delegates creation to an external create flow when configured', () => {
    const onCreateNew = vi.fn();
    setup({ onCreateNew });

    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });

    expect(onCreateNew).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox', { name: 'New choice' })).toBeNull();
  });
});
