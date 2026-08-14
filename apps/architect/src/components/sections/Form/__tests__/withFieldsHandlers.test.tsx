import { configureStore } from '@reduxjs/toolkit';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useContext, type ContextType, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

// Standing in for the codebook: three text variables (all have input controls,
// so all three survive the pre-existing VARIABLE_TYPES_WITH_COMPONENTS filter)
// plus a layout variable that never does. Each selector returns a stable
// reference so useSelector sees an unchanged result across re-renders.
vi.mock('~/selectors/codebook', () => {
  const variables = {
    v1: {
      name: 'alpha',
      type: 'text',
      component: 'TextInput',
      validation: { required: true },
      parameters: { min: 1 },
    },
    v2: { name: 'beta', type: 'text', component: 'TextArea' },
    v3: { name: 'gamma', type: 'text', component: 'TextInput' },
    v4: { name: 'delta', type: 'layout' },
    // Carries all four pieces of per-variable configuration at once, so one
    // selection exercises the whole adopt-and-reset path. No real variable
    // type offers options AND parameters (the two lists are disjoint), but the
    // codebook does not forbid it and splitting this across two fixtures would
    // only make these tests longer without testing anything more.
    v5: {
      name: 'closeness',
      type: 'ordinal',
      component: 'LikertScale',
      options: [
        { label: 'Low', value: 1 },
        { label: 'High', value: 2 },
      ],
      validation: { required: true, minSelected: 2 },
      parameters: { type: 'year', max: '2020-01-01' },
    },
  };
  const options = [
    { label: 'alpha', value: 'v1', type: 'text' },
    { label: 'beta', value: 'v2', type: 'text' },
    { label: 'gamma', value: 'v3', type: 'text' },
    { label: 'delta', value: 'v4', type: 'layout' },
    { label: 'closeness', value: 'v5', type: 'ordinal' },
  ];
  return {
    getVariablesForSubjectSelector: () => variables,
    getVariableOptionsForSubjectSelector: () => options,
  };
});

// Standing in for the role map: this suite is only concerned with the
// sibling-field exclusion below, so the role-based exclusion is a passthrough
// here. Its own behaviour is covered by
// `src/components/sections/__tests__/pickerExclusions.test.ts`.
// The interface-owned option map is derived from the whole protocol, which
// this suite's minimal store does not carry. Its own behaviour is covered by
// `src/selectors/__tests__` and the protocol-validation package; here it only
// needs to report "nothing is interface-owned".
vi.mock('~/selectors/indexes', () => ({
  getInterfaceOwnedOptionMap: () => ({}),
  roleMapKey: (
    subject: { entity: string; type?: string },
    variableId: string,
  ) => JSON.stringify([subject.entity, subject.type ?? null, variableId]),
}));

vi.mock('~/selectors/roleFilters', () => ({
  excludeUnvalidatedUses: (
    _state: unknown,
    _subject: unknown,
    options: unknown[],
  ) => options,
  excludeInterfaceOwned: (
    _state: unknown,
    _subject: unknown,
    options: unknown[],
  ) => options,
}));

import {
  CREATE_NEW_VARIABLE_FIELD,
  HiddenFieldValue,
  useFieldHandlers,
} from '../withFieldsHandlers';

type RenderArgs = {
  values?: Record<string, string>;
  siblingFields?: unknown;
  editIndex?: number;
};

/**
 * The editor's controls live in the dialog's own form store, so the hook is
 * rendered inside a real one. `variable` is registered by a stand-in control
 * because the hook distinguishes "not registered yet" from "cleared".
 */
const renderFieldHandlers = ({
  values = {},
  siblingFields,
  editIndex,
}: RenderArgs = {}) => {
  const store = configureStore({ reducer: () => ({}) });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <Form onSubmit={() => ({ success: true })}>
        <Field
          name="variable"
          label="Variable"
          component={InputField}
          initialValue={values.variable}
        />
        <Field
          name="component"
          label="Input control"
          component={InputField}
          initialValue={values.component}
        />
        {children}
      </Form>
    </Provider>
  );
  return renderHook(
    () =>
      useFieldHandlers({
        entity: 'node',
        type: 'person',
        siblingFields,
        editIndex,
      }),
    { wrapper },
  );
};

const offeredVariables = (args?: RenderArgs) =>
  renderFieldHandlers(args).result.current.variableOptions.map(
    (option) => option.value,
  );

describe('useFieldHandlers variable options', () => {
  it('does not offer a variable a sibling composer field already collects', () => {
    expect(
      offeredVariables({ siblingFields: [{ variable: 'v2' }] }),
    ).not.toContain('v2');
  });

  it('still offers a variable no sibling composer field collects', () => {
    const offered = offeredVariables({ siblingFields: [{ variable: 'v2' }] });
    expect(offered).toContain('v1');
    expect(offered).toContain('v3');
  });

  it('does not exclude the edited row’s own variable', () => {
    // Row 0 claims v1 and row 1 claims v2; editing row 0 must still offer v1.
    const offered = offeredVariables({
      siblingFields: [{ variable: 'v1' }, { variable: 'v2' }],
      editIndex: 0,
    });
    expect(offered).toContain('v1');
    expect(offered).not.toContain('v2');
  });

  // A picker whose value is absent from its options renders blank and silently
  // drops the selection, so the held value survives even a sibling claiming it
  // — a state the save-time gate rejects, but which the editor must still be
  // able to display and let the researcher correct.
  it('keeps the currently selected variable offered even when a sibling claims it', () => {
    expect(
      offeredVariables({
        values: { variable: 'v2' },
        siblingFields: [{ variable: 'v2' }],
      }),
    ).toContain('v2');
  });

  it('leaves the options untouched when no sibling fields are supplied', () => {
    // The regular Form editor's path: its schema permits two fields naming one
    // variable, so only the input-control filter applies (v4 is a layout
    // variable, which has no input control).
    expect(offeredVariables()).toEqual(['v1', 'v2', 'v3', 'v5']);
    expect(offeredVariables({ values: { variable: 'v2' } })).toEqual([
      'v1',
      'v2',
      'v3',
      'v5',
    ]);
  });
});

// The two cross-field resets are observer effects rather than field
// `onChange` handlers. They must fire on a real change and
// stay silent while the dialog is settling, or opening a committed row would
// wipe the very values it opened on.
describe('useFieldHandlers cross-field observers', () => {
  const renderEditor = (
    values: Record<string, string>,
    { showParametersMax = true }: { showParametersMax?: boolean } = {},
  ) => {
    const store = configureStore({ reducer: () => ({}) });
    let storeApi: StoreApi | null = null;
    let handlers: ReturnType<typeof useFieldHandlers> | null = null;
    const CaptureStore = () => {
      storeApi = useContext(FormStoreContext) ?? null;
      return null;
    };
    const Editor = () => {
      handlers = useFieldHandlers({ entity: 'node', type: 'person' });
      return null;
    };

    render(
      <Provider store={store}>
        <Form onSubmit={() => ({ success: true })}>
          <CaptureStore />
          <Field
            name="variable"
            label="Variable"
            component={InputField}
            initialValue={values.variable}
          />
          <Field
            name="component"
            label="Input control"
            component={InputField}
            initialValue={values.component}
          />
          <Field
            name="validation"
            label="Validation"
            component={InputField}
            initialValue={values.validation}
          />
          {/* Both editors carry these without a control of their own: the
              typed-name placeholder always, and `options` through the custom
              options editor rather than a plain field. */}
          <HiddenFieldValue
            name={CREATE_NEW_VARIABLE_FIELD}
            initialValue={values.createNewVariable}
          />
          <HiddenFieldValue name="options" initialValue={values.options} />
          {/* The real parameter editors register LEAVES under `parameters`,
              never `parameters` itself — the shape the container reset has to
              cope with. `parameters.max` starts mounted and is unmounted below
              to prove a dormant leaf is cleared too. */}
          <Field
            name="parameters.type"
            label="Resolution"
            component={InputField}
            initialValue={values.parameterType}
          />
          {showParametersMax && (
            <Field
              name="parameters.max"
              label="Maximum"
              component={InputField}
              initialValue={values.parameterMax}
            />
          )}
          <Editor />
        </Form>
      </Provider>,
    );

    const getState = () => {
      if (!storeApi) throw new Error('form store was not captured');
      return storeApi.getState();
    };
    const getHandlers = () => {
      if (!handlers) throw new Error('field handlers were not captured');
      return handlers;
    };

    return {
      getValues: () => getState().getFormValues(),
      getDormant: (name: string) => getState().dormantValues.get(name)?.value,
      setValue: (name: string, value: string) =>
        act(() => {
          getState().setFieldValue(name, value);
        }),
      // The picker's "create a new variable" affordance, exactly as
      // VariablePicker performs it: blank its own value, then hand the typed
      // name to `handleNewVariable`, which writes it to both
      // `_createNewVariable` and `variable` in the same batched tick.
      createNewVariable: (name: string) =>
        act(() => {
          getState().setFieldValue('variable', '');
          getHandlers().handleNewVariable(name);
        }),
    };
  };

  it('leaves a committed row alone while its fields register', () => {
    const { getValues } = renderEditor({
      variable: 'v1',
      component: 'TextInput',
      validation: 'kept',
    });

    expect(getValues()).toMatchObject({
      variable: 'v1',
      component: 'TextInput',
      validation: 'kept',
    });
  });

  it('adopts the codebook rendering and rules when an existing variable is picked', async () => {
    const { getValues, setValue } = renderEditor({
      variable: 'v1',
      component: 'TextInput',
    });

    setValue('variable', 'v2');

    await waitFor(() => {
      expect(getValues().component).toBe('TextArea');
    });
    // v2 has neither, so both are cleared rather than inherited from v1.
    expect(getValues().validation).toBeUndefined();
  });

  // The counterpart to the reset below: a real codebook selection must still
  // bring the whole of that variable's configuration with it.
  it('adopts every configured value of the picked codebook variable', async () => {
    const { getValues, setValue } = renderEditor({
      variable: 'v2',
      component: 'TextArea',
    });

    setValue('variable', 'v5');

    await waitFor(() => {
      expect(getValues().component).toBe('LikertScale');
    });
    expect(getValues().options).toEqual([
      { label: 'Low', value: 1 },
      { label: 'High', value: 2 },
    ]);
    expect(getValues().validation).toEqual({ required: true, minSelected: 2 });
    expect(getValues().parameters).toEqual({
      type: 'year',
      max: '2020-01-01',
    });
  });

  // A name typed into the create affordance is absent from the codebook by
  // definition, so the observer must reset rather than adopt. Carrying the
  // previous variable's `component` over would silently fix the NEW variable's
  // type, which Architect never lets a researcher change afterwards; carrying
  // its `validation` over would be invisible in the composer editor, which
  // renders no validation UI at all.
  it('resets the previous variable’s configuration when a new variable is named', async () => {
    const { getValues, getDormant, setValue, createNewVariable } = renderEditor(
      {
        variable: 'v5',
        component: 'LikertScale',
        validation: 'inherited-validation',
        options: 'inherited-options',
        parameterType: 'year',
        parameterMax: '2020-01-01',
      },
    );

    // A leaf the mounted controls do not cover, parked dormant: `registerField`
    // prefers a dormant value over `initialValue`, so leaving it behind would
    // reinstate the old control's bound later in the same session.
    setValue('parameters.min', '1900-01-01');
    expect(getDormant('parameters.min')).toBe('1900-01-01');

    createNewVariable('Trust');

    await waitFor(() => {
      expect(getValues().component).toBeUndefined();
    });
    expect(getValues().options).toBeUndefined();
    expect(getValues().validation).toBeUndefined();
    expect(getValues().parameters).toEqual({
      type: undefined,
      max: undefined,
    });
    expect(getDormant('parameters.min')).toBeUndefined();

    // The create flow itself must survive the reset.
    expect(getValues().variable).toBe('Trust');
    expect(getValues()[CREATE_NEW_VARIABLE_FIELD]).toBe('Trust');
  });

  // The store's field map is exact-string-keyed, so `parameters` itself is
  // never registered: clearing it has to reach every leaf, mounted or not.
  it('resets the control-specific parameter leaves when the input control changes', async () => {
    const { getValues, setValue } = renderEditor({
      variable: 'v1',
      component: 'TextInput',
      parameterType: 'year',
      parameterMax: '2020-01-01',
    });

    expect(getValues().parameters).toEqual({
      type: 'year',
      max: '2020-01-01',
    });
    setValue('component', 'TextArea');

    await waitFor(() => {
      expect(getValues().parameters).toEqual({
        type: undefined,
        max: undefined,
      });
    });
  });

  it('clears a parameter leaf the previous control had already unmounted', async () => {
    const { getDormant, setValue } = renderEditor(
      { variable: 'v1', component: 'TextInput', parameterType: 'year' },
      { showParametersMax: false },
    );

    // An unmounted leaf's value is parked dormant, and `registerField` prefers
    // a dormant value over `initialValue` — so leaving it behind would
    // reinstate the old control's bound the moment a control using the same
    // leaf is chosen.
    setValue('parameters.max', '2020-01-01');
    expect(getDormant('parameters.max')).toBe('2020-01-01');

    setValue('component', 'TextArea');

    await waitFor(() => {
      expect(getDormant('parameters.max')).toBeUndefined();
    });
  });
});
