import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

// PR #1107 eighteenth-wave Finding 2: `makeFieldEditorValidate` keys its
// contradiction messages at `validation`, but the composer attribute editor
// has no validation field at all — and redux-form only fails a submit over
// errors on REGISTERED fields (see its `isValid` selector, which iterates
// `registeredFields`). The error was therefore inert: the dialog saved and
// `onBeforeSave` wrote the contradictory edit back to the codebook. These
// tests drive the two real pieces together — the wiring in
// EditableAttributesList and the fields the editor actually renders — so the
// save gate is asserted end to end rather than by error-key inspection alone.

vi.mock('~/components/Form/DialogArrayField', () => ({
  default: () => null,
}));

let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { editIndex?: number },
    ) => Record<string, unknown>)
  | undefined;

vi.mock('~/components/Form/ValidatedFieldArray', () => ({
  default: ({
    componentProps,
  }: {
    componentProps?: Record<string, unknown>;
  }) => {
    capturedEditorValidate = componentProps?.editorValidate as
      | typeof capturedEditorValidate
      | undefined;
    return null;
  },
}));

// One categorical variable whose committed `minSelected: 3` contradicts any
// draft that shrinks its options below three, a pair of year-resolution
// DatePickers joined by `sameAs` for the parameter-inheritance cases below,
// and a pair of explicit-Boolean singleton-options variables joined by
// `differentFrom` for the stage-effective boolean-domain cases below.
const codebookVariables = {
  colors: {
    name: 'colors',
    type: 'categorical',
    options: [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
      { label: 'Green', value: 'green' },
    ],
    validation: { minSelected: 3 },
  },
  startDate: {
    name: 'startDate',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'year' },
    validation: { sameAs: 'endDate' },
  },
  endDate: {
    name: 'endDate',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'year' },
    validation: {},
  },
  boolA: {
    name: 'boolA',
    type: 'boolean',
    component: 'Boolean',
    options: [{ label: 'Yes', value: true }],
    validation: { differentFrom: 'boolB' },
  },
  boolB: {
    name: 'boolB',
    type: 'boolean',
    component: 'Boolean',
    options: [{ label: 'Yes', value: true }],
    validation: {},
  },
};

vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubjectSelector: () => codebookVariables,
  getVariablesForSubject: () => codebookVariables,
}));

vi.mock('~/components/EditorLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Subsection: ({
    children,
    title,
  }: {
    children: ReactNode;
    title?: ReactNode;
  }) => (
    <section>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  ),
}));

// Leaf controls only — `ValidatedField` itself stays real so every field the
// editor renders registers with redux-form exactly as it does in the app.
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: () => <div data-testid="variable-picker" />,
}));
vi.mock('~/components/Form/Fields/InputPreview', () => ({
  default: () => <div data-testid="input-preview" />,
}));
vi.mock('~/components/Options', () => ({
  default: () => <div data-testid="options" />,
}));
vi.mock('~/components/Parameters', () => ({
  default: () => <div data-testid="parameters" />,
}));
vi.mock('~/components/BooleanChoice', () => ({
  default: () => <div data-testid="boolean-choice" />,
}));
vi.mock('~/components/ExternalLink', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('~/components/sections/Form/withFieldsHandlers', () => ({
  useFieldHandlers: () => ({
    variable: 'colors',
    variableType: 'categorical',
    isNewVariable: false,
    variableOptions: [],
    component: 'CheckboxGroup',
    componentOptions: [],
    metaForType: { label: 'Checkbox Group' },
    existingVariables: {},
    handleNewVariable: vi.fn(),
    handleChangeVariable: vi.fn(),
    handleChangeComponent: vi.fn(),
  }),
}));

import ComposerAttributeFields from '../ComposerAttributeFields';
import EditableAttributesList from '../EditableAttributesList';

const EDITOR_FORM = 'composer-attribute-editor-behaviour-test';

type OwnProps = { onSubmit: (values: Record<string, unknown>) => void };
type HarnessProps = InjectedFormProps<Record<string, unknown>, OwnProps> &
  OwnProps;

const Harness = ({ handleSubmit, onSubmit }: HarnessProps) => (
  // `noValidate`, matching InlineEditScreen/Form — the dialog this editor
  // really renders inside.
  <form noValidate onSubmit={handleSubmit(onSubmit)}>
    <ComposerAttributeFields form={EDITOR_FORM} entity="node" type="person" />
    <button type="submit">Save</button>
  </form>
);

// redux-form's own error map only carries strings (or elements), so narrow
// the captured validator's result the same way FieldFields' form does.
const validate = (values: Record<string, unknown>) => {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    capturedEditorValidate?.(values) ?? {},
  )) {
    if (typeof value === 'string') errors[key] = value;
  }
  return errors;
};

const ReduxHarness = reduxForm<Record<string, unknown>, OwnProps>({
  form: EDITOR_FORM,
  touchOnBlur: false,
  touchOnChange: true,
  validate,
})(Harness);

const renderEditor = ({
  composerFields,
  draft,
}: {
  composerFields: Record<string, unknown>[];
  draft: Record<string, unknown>;
}) => {
  const store = configureStore({
    reducer: { form: formReducer },
    // The stage form holding this list's committed attributes, which
    // `editorValidate` closes over for its sibling overlay and duplicate gate.
    preloadedState: {
      form: {
        'edit-stage': {
          values: { nodeForm: { fields: composerFields } },
          // Nothing registers into the stage form here — it is only read
          // through `formValueSelector`.
          registeredFields: [],
        },
      },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  const onSubmit = vi.fn();

  render(
    <Provider store={store}>
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        form="edit-stage"
        handleChangeFields={() => undefined}
      />
      <ReduxHarness onSubmit={onSubmit} initialValues={draft} />
    </Provider>,
  );

  return { onSubmit };
};

const threeOptions = [
  { label: 'Red', value: 'red' },
  { label: 'Blue', value: 'blue' },
  { label: 'Green', value: 'green' },
];

describe('the composer attribute editor’s contradiction gate', () => {
  it('blocks the save and shows the contradiction when a draft shrinks the options below minSelected', () => {
    const { onSubmit } = renderEditor({
      composerFields: [],
      draft: {
        variable: 'colors',
        component: 'CheckboxGroup',
        validation: { minSelected: 3 },
        options: threeOptions.slice(0, 2),
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/minSelected/)).toBeInTheDocument();
  });

  it('saves a draft that introduces no contradiction', () => {
    const { onSubmit } = renderEditor({
      composerFields: [],
      draft: {
        variable: 'colors',
        component: 'CheckboxGroup',
        validation: { minSelected: 3 },
        options: threeOptions,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/minSelected/)).not.toBeInTheDocument();
    // The gate's own field is error-only: it must never contribute a value to
    // the item the dialog writes back.
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      variable: 'colors',
      component: 'CheckboxGroup',
      validation: { minSelected: 3 },
      options: threeOptions,
    });
  });

  // Sixteenth-wave Finding 1's duplicate gate returns a plain string keyed at
  // `variable` — a registered field of its own, so it blocked the save before
  // this fix and must keep doing so after it.
  it('still blocks a draft naming a variable a sibling attribute already collects', () => {
    const { onSubmit } = renderEditor({
      composerFields: [{ variable: 'colors', component: 'CheckboxGroup' }],
      draft: {
        variable: 'colors',
        component: 'CheckboxGroup',
        validation: { minSelected: 3 },
        options: threeOptions,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// Nineteenth-wave Finding 3: changing a composer field's input control resets
// its `parameters` to null (withFieldsHandlers' `handleChangeComponent`). The
// stage commit prunes that null away, and the interview runtime resolves
// `fieldParameters ?? codebookParameters` — so null MEANS "inherit the
// codebook parameters". Passing the raw null into the prospective views
// installed it OVER those parameters and read the picker at full resolution,
// falsely rejecting a coherent edit.
describe('null composer parameters mean inheritance', () => {
  it('inherits the codebook parameters for a draft whose parameters were reset', () => {
    const { onSubmit } = renderEditor({
      composerFields: [],
      draft: {
        variable: 'startDate',
        component: 'DatePicker',
        parameters: null,
        validation: { sameAs: 'endDate' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByText(/different resolutions/)).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('inherits the codebook parameters for a sibling field whose parameters were reset', () => {
    const { onSubmit } = renderEditor({
      composerFields: [
        { variable: 'endDate', component: 'DatePicker', parameters: null },
      ],
      draft: {
        variable: 'startDate',
        component: 'DatePicker',
        parameters: { type: 'year' },
        validation: { sameAs: 'endDate' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByText(/different resolutions/)).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('still lets a sibling field’s real parameters override the codebook', () => {
    const { onSubmit } = renderEditor({
      composerFields: [
        {
          variable: 'endDate',
          component: 'DatePicker',
          parameters: { type: 'month' },
        },
      ],
      draft: {
        variable: 'startDate',
        component: 'DatePicker',
        parameters: { type: 'year' },
        validation: { sameAs: 'endDate' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/different resolutions/)).toBeInTheDocument();
  });

  it('leaves an absent parameters key inheriting exactly as before', () => {
    const { onSubmit } = renderEditor({
      composerFields: [{ variable: 'endDate', component: 'DatePicker' }],
      draft: {
        variable: 'startDate',
        component: 'DatePicker',
        validation: { sameAs: 'endDate' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

// protocol-validation commit 8900da73b gated options-derived boolean domains
// (an explicit `component: 'Boolean'` with singleton `options` pinning the
// variable's value) on a new `stageEffectiveComponents` analyser option,
// since a NetworkComposer field can override even an explicit codebook
// `component: 'Boolean'` to `Toggle` (which ignores `options` and is always
// two-valued). Only schema.ts's stage-effective composer overlay passes that
// flag; this editor's `editorValidate` must match it — pre-warning about
// exactly the `differentFrom` contradiction the schema will reject at save
// time, while still accepting the pair once every occurrence renders Toggle.
describe('stage-effective boolean domains', () => {
  it('blocks the save when the sibling field still renders the Boolean choice control', () => {
    const { onSubmit } = renderEditor({
      composerFields: [{ variable: 'boolB', component: 'Boolean' }],
      draft: {
        variable: 'boolA',
        component: 'Boolean',
        options: [{ label: 'Yes', value: true }],
        validation: { differentFrom: 'boolB' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/must differ/)).toBeInTheDocument();
  });

  it('accepts the same pair once the sibling field renders Toggle instead', () => {
    const { onSubmit } = renderEditor({
      composerFields: [{ variable: 'boolB', component: 'Toggle' }],
      draft: {
        variable: 'boolA',
        component: 'Toggle',
        options: [{ label: 'Yes', value: true }],
        validation: { differentFrom: 'boolB' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/must differ/)).not.toBeInTheDocument();
  });
});
