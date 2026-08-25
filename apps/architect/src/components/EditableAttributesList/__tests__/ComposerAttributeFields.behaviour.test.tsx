import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import Form from '@codaco/fresco-ui/form/Form';
import type * as SelectorsIndexes from '~/selectors/indexes';

// Eighteenth-wave Finding 2: `makeFieldEditorValidate` keys its contradiction
// messages at `validation`, but the composer attribute editor has no
// validation field at all — and a form-level result only surfaces on a field
// that exists, so the error was inert and `onBeforeSave` wrote the
// contradictory edit back to the codebook. These tests drive the two real
// pieces together — the `editorValidate` the list wires up and the fields the
// editor actually renders — so the save gate is asserted end to end rather
// than by error-key inspection alone.

let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { editIndex?: number },
    ) => Record<string, unknown>)
  | undefined;
// Read through a call so control-flow analysis keeps the declared type: the
// only write happens inside the mocked field, which CFA cannot see.
const takeEditorValidate = () => capturedEditorValidate;

// The list's row editor is exercised separately below; here the array field
// exists only to hand over the real `editorValidate` it was configured with.
vi.mock('~/components/Form/arrayFields/DialogArrayField', () => ({
  default: ({
    editorValidate,
  }: {
    editorValidate?: typeof capturedEditorValidate;
  }) => {
    capturedEditorValidate = editorValidate;
    return null;
  },
}));

// One categorical variable whose committed `minSelected: 3` contradicts any
// draft that shrinks its options below three, a pair of year-resolution
// DatePickers joined by `sameAs` for the parameter-inheritance cases below,
// and a pair of explicit-Boolean singleton-options variables joined by
// `differentFrom` for the stage-effective boolean-domain cases below.
const codebookVariables: Record<string, Record<string, unknown>> = {
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
  // A sameAs-joined pair whose CODEBOOK definitions are both full-resolution
  // DatePickers, for the cross-form rendering cases below (thirty-fifth-wave
  // finding): only composer stage fields render them coarser.
  beginFull: {
    name: 'beginFull',
    type: 'datetime',
    component: 'DatePicker',
    validation: { sameAs: 'finishFull' },
  },
  finishFull: {
    name: 'finishFull',
    type: 'datetime',
    component: 'DatePicker',
    validation: {},
  },
};

vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubjectSelector: () => codebookVariables,
  getVariablesForSubject: () => codebookVariables,
  getVariableOptionsForSubjectSelector: () => [],
}));

// The committed protocol the cross-form rendering scan reads (only
// `present.stages` is consulted).
let protocolStages: Record<string, unknown>[] = [];
vi.mock('~/selectors/protocol', () => ({
  getProtocol: () => ({ stages: protocolStages }),
}));

// The Task 9 cross-class gate's hasUnvalidatedUse closure reads
// getVariableRoleMap; a conflict-free stub keeps this file's contradiction-
// gate coverage unaffected. The gate itself is covered in
// contradictions.test.ts (pure-function level) and in
// EditableAttributesList.crossClassGate.test.tsx (mount level, with a REAL
// role map).
vi.mock('~/selectors/indexes', async (importOriginal) => {
  const actual = await importOriginal<typeof SelectorsIndexes>();
  return { ...actual, getVariableRoleMap: () => ({}) };
});

vi.mock('~/components/EditorLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Leaf controls only — `ArchitectField`/`ArchitectArrayField` stay real so
// every field the editor renders registers exactly as it does in the app.
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: () => <div data-testid="variable-picker" />,
}));
vi.mock('~/components/Form/arrayFields/Options', () => ({
  default: () => <div data-testid="options" />,
  optionsValidation: {},
}));
vi.mock('~/components/BooleanChoice', () => ({
  default: () => <div data-testid="boolean-choice" />,
}));
// The real parameters editor seeds a default date resolution on mount, which
// would make every draft explicit. Standing in for it keeps `parameters`
// exactly as the row holds it, which is what the inheritance rule is about.
vi.mock('~/components/Parameters', async () => {
  const { useField } = await import('@codaco/fresco-ui/form/hooks/useField');
  const ParametersStub = ({
    initialParameters,
  }: {
    initialParameters?: Record<string, unknown>;
  }) => {
    useField({ name: 'parameters', initialValue: initialParameters });
    return <div data-testid="parameters" />;
  };
  return { default: ParametersStub };
});
vi.mock('~/components/ExternalLink', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

// Driven per test from the codebook variable the draft names — the real hook
// derives exactly this from the picker selection.
let fieldHandlers: Record<string, unknown> = {};
// `HiddenFieldValue` stays REAL: the composer editor carries the variable's
// committed validation rules through it, and those rules are exactly what the
// contradiction check judges the draft against.
vi.mock(
  '~/components/sections/Form/withFieldsHandlers',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('~/components/sections/Form/withFieldsHandlers')
      >();
    return { ...actual, useFieldHandlers: () => fieldHandlers };
  },
);

import { withFormLevelValidate } from '~/components/DialogForm/formLevelValidate';
import EditableAttributesList from '~/components/Form/arrayFields/EditableAttributesList';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import ComposerAttributeFields from '../ComposerAttributeFields';

/** The harness's stage id — the "this stage" of the exclusion cases below. */
const THIS_STAGE = 'stage-1';

const toFieldErrors = (errors: Record<string, unknown>) => {
  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (typeof value === 'string') fieldErrors[key] = value;
  }
  return fieldErrors;
};

const renderEditor = ({
  composerFields,
  draft,
  stages = [],
}: {
  composerFields: Record<string, unknown>[];
  draft: Record<string, unknown>;
  /** The committed protocol's stages, for the cross-form rendering scan. */
  stages?: Record<string, unknown>[];
}) => {
  protocolStages = stages;
  capturedEditorValidate = undefined;

  const variable = draft.variable as string;
  const codebookVariable = codebookVariables[variable] ?? {};
  fieldHandlers = {
    variable,
    variableType: codebookVariable.type,
    isNewVariable: false,
    variableOptions: [],
    component: draft.component,
    componentOptions: [],
    metaForType: undefined,
    existingVariables: codebookVariables,
    handleNewVariable: vi.fn(),
  };

  // The list reads its stage's committed attributes through the stage form.
  renderStageForm({
    committedStage: asStage({
      id: THIS_STAGE,
      nodeForm: { fields: composerFields },
    }),
    children: (
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        addButtonLabel="Create new node attribute"
        handleChangeFields={(value) => value}
      />
    ),
  });

  const editorValidate = takeEditorValidate();
  if (!editorValidate) {
    throw new Error('editorValidate was not captured');
  }

  // Records what actually reached the save, so "blocked" is asserted as the
  // save never running rather than as an absent error message.
  const submitted: Record<string, FieldValue>[] = [];
  const onSubmit = (values: Record<string, FieldValue>) => {
    submitted.push(values);
    return { success: true } as const;
  };
  const store = configureStore({ reducer: () => ({}) });

  render(
    <Provider store={store}>
      <Form
        onSubmit={withFormLevelValidate(onSubmit, (values) =>
          toFieldErrors(editorValidate(values)),
        )}
      >
        <ComposerAttributeFields
          entity="node"
          type="person"
          // `composerItemSelector` merges the codebook variable's rules into
          // the row the editor opens on; the draft supplies the live edits.
          item={{ validation: codebookVariable.validation, ...draft }}
        />
        <button type="submit">Save</button>
      </Form>
    </Provider>,
  );

  return { submitted };
};

const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

const threeOptions = [
  { label: 'Red', value: 'red' },
  { label: 'Blue', value: 'blue' },
  { label: 'Green', value: 'green' },
];

beforeEach(() => {
  protocolStages = [];
});

describe('the composer attribute editor’s contradiction gate', () => {
  it('blocks the save and shows the contradiction when a draft shrinks the options below minSelected', async () => {
    const { submitted } = renderEditor({
      composerFields: [],
      draft: {
        variable: 'colors',
        component: 'CheckboxGroup',
        options: threeOptions.slice(0, 2),
      },
    });

    save();

    expect(await screen.findByText(/minSelected/)).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
  });

  it('saves a draft that introduces no contradiction', async () => {
    const { submitted } = renderEditor({
      composerFields: [],
      draft: {
        variable: 'colors',
        component: 'CheckboxGroup',
        options: threeOptions,
      },
    });

    save();

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(screen.queryByText(/minSelected/)).not.toBeInTheDocument();
    // The gate's own field is error-only: it must never contribute a value to
    // the item the dialog writes back.
    expect(submitted[0]).toMatchObject({
      variable: 'colors',
      component: 'CheckboxGroup',
      options: threeOptions,
    });
  });

  // Sixteenth-wave Finding 1's duplicate gate returns a plain string keyed at
  // `variable` — a registered field of its own, so it blocked the save before
  // this fix and must keep doing so after it.
  it('still blocks a draft naming a variable a sibling attribute already collects', async () => {
    const { submitted } = renderEditor({
      composerFields: [{ variable: 'colors', component: 'CheckboxGroup' }],
      draft: {
        variable: 'colors',
        component: 'CheckboxGroup',
        options: threeOptions,
      },
    });

    save();

    expect(
      await screen.findByText(/already collected by another attribute/),
    ).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
  });
});

// Nineteenth-wave Finding 3: a composer field's `parameters` is reset when its
// input control changes. The stage commit prunes the reset away, and the
// interview runtime resolves `fieldParameters ?? codebookParameters` — so an
// absent value MEANS "inherit the codebook parameters". Installing it OVER
// those parameters read the picker at full resolution and falsely rejected a
// coherent edit.
describe('absent composer parameters mean inheritance', () => {
  it('inherits the codebook parameters for a draft whose parameters were reset', async () => {
    const { submitted } = renderEditor({
      composerFields: [],
      draft: { variable: 'startDate', component: 'DatePicker' },
    });

    save();

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(screen.queryByText(/different resolutions/)).not.toBeInTheDocument();
  });

  it('inherits the codebook parameters for a sibling field whose parameters were reset', async () => {
    const { submitted } = renderEditor({
      composerFields: [
        { variable: 'endDate', component: 'DatePicker', parameters: null },
      ],
      draft: {
        variable: 'startDate',
        component: 'DatePicker',
        parameters: { type: 'year' },
      },
    });

    save();

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(screen.queryByText(/different resolutions/)).not.toBeInTheDocument();
  });

  it('still lets a sibling field’s real parameters override the codebook', async () => {
    const { submitted } = renderEditor({
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
      },
    });

    save();

    expect(
      await screen.findByText(/different resolutions/),
    ).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
  });
});

// protocol-validation commit 8900da73b gated options-derived boolean domains
// (an explicit `component: 'Boolean'` with singleton `options` pinning the
// variable's value) on a `stageEffectiveComponents` analyser option, since a
// NetworkComposer field can override even an explicit codebook
// `component: 'Boolean'` to `Toggle` (which ignores `options` and is always
// two-valued). This editor's `editorValidate` must match it — pre-warning
// about exactly the `differentFrom` contradiction the schema will reject at
// save time, while still accepting the pair once every occurrence renders
// Toggle.
describe('stage-effective boolean domains', () => {
  it('blocks the save when the sibling field still renders the Boolean choice control', async () => {
    const { submitted } = renderEditor({
      composerFields: [{ variable: 'boolB', component: 'Boolean' }],
      draft: { variable: 'boolA', component: 'Boolean' },
    });

    save();

    expect(await screen.findByText(/must differ/)).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
  });

  it('accepts the same pair once the sibling field renders Toggle instead', async () => {
    const { submitted } = renderEditor({
      composerFields: [{ variable: 'boolB', component: 'Toggle' }],
      draft: { variable: 'boolA', component: 'Toggle' },
    });

    save();

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(screen.queryByText(/must differ/)).not.toBeInTheDocument();
  });
});

// Thirty-fifth-wave finding: `beginFull`/`finishFull` are sameAs-joined and
// both full-resolution in the codebook, but each is rendered as a YEAR picker
// by a DIFFERENT NetworkComposer stage — a protocol schema.ts accepts, because
// its per-stage view drops variables whose rendering another form owns
// (`unknownRenderingFor`). The editor used to read the partner through its
// unused codebook default and falsely block the save of either field; it must
// mirror the schema's omission instead.
describe('variables another composer stage renders', () => {
  const composerStage = (id: string, fieldVariable: string) => ({
    id,
    type: 'NetworkComposer',
    subject: { entity: 'node', type: 'person' },
    nodeForm: {
      fields: [
        {
          variable: fieldVariable,
          component: 'DatePicker',
          parameters: { type: 'year' },
        },
      ],
    },
  });
  const yearDraftForBeginFull = {
    variable: 'beginFull',
    component: 'DatePicker',
    parameters: { type: 'year' },
  };

  it('saves a year draft whose sameAs partner a different composer stage renders as a year picker', async () => {
    const { submitted } = renderEditor({
      composerFields: [],
      stages: [composerStage('other-stage', 'finishFull')],
      draft: yearDraftForBeginFull,
    });

    save();

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(screen.queryByText(/different resolutions/)).not.toBeInTheDocument();
  });

  it('ignores the edited stage’s own committed copy when deciding what renders elsewhere', async () => {
    // The committed protocol still holds THIS stage with a finishFull year
    // field the draft has since removed. Post-save nothing renders finishFull,
    // so its full-resolution codebook default is effective again and the year
    // draft for beginFull is genuinely contradictory.
    const { submitted } = renderEditor({
      composerFields: [],
      stages: [composerStage(THIS_STAGE, 'finishFull')],
      draft: yearDraftForBeginFull,
    });

    save();

    expect(
      await screen.findByText(/different resolutions/),
    ).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
  });

  it('still judges the partner by THIS form’s sibling field when both render it', async () => {
    // A sibling field of the current form renders finishFull at full
    // resolution; another stage renders it as a year picker. The current
    // form's own field determines the rendering here, so the year draft still
    // contradicts it.
    const { submitted } = renderEditor({
      composerFields: [
        { variable: 'finishFull', component: 'DatePicker', parameters: {} },
      ],
      stages: [composerStage('other-stage', 'finishFull')],
      draft: yearDraftForBeginFull,
    });

    save();

    expect(
      await screen.findByText(/different resolutions/),
    ).toBeInTheDocument();
    expect(submitted).toHaveLength(0);
  });
});
