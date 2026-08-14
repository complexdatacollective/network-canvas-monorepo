import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import Validations from '~/components/Validations/Validations';

beforeAll(() => {
  Element.prototype.scrollTo ??= () => undefined;
});

/**
 * Issue #1383, at the seam that actually persists: `DialogArrayField`'s
 * `onBeforeSave` is what the plain Form editor uses to write the codebook
 * variable (see `fieldCommit.ts`'s `useFormFieldCommit`). Whatever the rule
 * editor does internally, the guarantee that matters is that a refused save
 * never reaches it — so nothing is written, and whatever the protocol already
 * held survives untouched.
 */
type Row = {
  id?: string;
  prompt: string;
  validation?: Record<string, unknown>;
};

const ALL_VARIABLES = {
  v1: { name: 'Answer', type: 'text' as const },
};

const EditorFields = (props: Record<string, unknown>) => (
  <Validations
    name="validation"
    initialValue={
      (props.validation as Record<string, never> | undefined) ?? undefined
    }
    variableType="text"
    entity="node"
    currentVariableId="v1"
    allVariables={ALL_VARIABLES}
    existingVariables={{}}
  />
);

const Preview = ({ prompt }: Record<string, unknown>) => (
  <span>{typeof prompt === 'string' ? prompt : ''}</span>
);

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

const setup = (initialRows: Row[]) => {
  let captured: StoreApi | null = null;
  const CaptureStore = () => {
    captured = useContext(FormStoreContext) ?? null;
    return null;
  };

  const onBeforeSave = vi.fn((value: unknown) => value);
  const store = configureStore({ reducer: (state = {}) => state });

  render(
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <ArchitectArrayField
          name="fields"
          label="Form fields"
          component={DialogArrayField}
          initialValue={initialRows}
          previewComponent={Preview}
          editorFieldsComponent={EditorFields}
          editorTitle="Edit field"
          addTitle="Add field"
          itemLabel="field"
          onBeforeSave={onBeforeSave}
        />
      </Form>
    </Provider>,
  );

  const rows = (): Row[] => {
    if (!captured) throw new Error('form store was not captured');
    return (captured.getState().getFormValues().fields ?? []) as Row[];
  };

  return { onBeforeSave, rows };
};

const toggle = (label: string) =>
  screen.getByRole('switch', { name: label, hidden: true });

const numberValue = (label: string) =>
  screen.getByRole('spinbutton', { name: label });

const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('the field editor dialog and an invalid rule map', () => {
  it('refuses the save, writes nothing, and keeps the entered value', async () => {
    const { onBeforeSave, rows } = setup([
      { id: 'row-1', prompt: 'How do you know them?', validation: {} },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit field' }));
    fireEvent.click(toggle('Minimum length'));
    fireEvent.blur(
      (() => {
        const input = numberValue('Minimum length');
        fireEvent.change(input, { target: { value: '10' } });
        return input;
      })(),
    );
    fireEvent.click(toggle('Maximum length'));
    fireEvent.blur(
      (() => {
        const input = numberValue('Maximum length');
        fireEvent.change(input, { target: { value: '3' } });
        return input;
      })(),
    );

    save();

    await waitFor(() => {
      expect(
        screen.getAllByText(/minLength \(10\) is greater than maxLength \(3\)/)
          .length,
      ).toBeGreaterThan(0);
    });
    expect(onBeforeSave).not.toHaveBeenCalled();
    // The dialog is still open with both values intact for correction.
    expect(numberValue('Minimum length')).toHaveValue(10);
    expect(numberValue('Maximum length')).toHaveValue(3);
    expect(rows()).toEqual([
      { id: 'row-1', prompt: 'How do you know them?', validation: {} },
    ]);
  });

  // The regression the issue is really about: the rule being edited already
  // held a valid value, and a contradictory edit used to delete it on the way
  // out — so the save both dropped the edit AND destroyed the old value.
  it('leaves a previously valid rule untouched when an edit to it contradicts', async () => {
    const { onBeforeSave, rows } = setup([
      {
        id: 'row-1',
        prompt: 'How do you know them?',
        validation: { minLength: 10, maxLength: 20 },
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit field' }));
    const input = numberValue('Maximum length');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);

    save();

    await waitFor(() => {
      expect(
        screen.getAllByText(/minLength \(10\) is greater than maxLength \(3\)/)
          .length,
      ).toBeGreaterThan(0);
    });
    expect(onBeforeSave).not.toHaveBeenCalled();
    expect(rows()).toEqual([
      {
        id: 'row-1',
        prompt: 'How do you know them?',
        validation: { minLength: 10, maxLength: 20 },
      },
    ]);
  });

  it('saves once the pair agrees', async () => {
    const { onBeforeSave, rows } = setup([
      {
        id: 'row-1',
        prompt: 'How do you know them?',
        validation: { minLength: 10, maxLength: 20 },
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit field' }));
    const input = numberValue('Maximum length');
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.blur(input);

    save();

    await waitFor(() => {
      expect(onBeforeSave).toHaveBeenCalledTimes(1);
    });
    expect(rows()).toEqual([
      {
        id: 'row-1',
        prompt: 'How do you know them?',
        validation: { minLength: 10, maxLength: 30 },
      },
    ]);
  });
});
