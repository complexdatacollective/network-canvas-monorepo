import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { expect, it, vi } from 'vitest';

import { COMPOSER_CONTRADICTION_FIELD } from '../ComposerAttributeFields';
import EditableAttributesList from '../EditableAttributesList';

vi.mock('~/components/Form/DialogArrayField', () => ({
  default: ({ requestedEditFormName }: { requestedEditFormName?: string }) => (
    <div
      data-testid="dialog-array-field"
      data-editform={requestedEditFormName}
    />
  ),
}));

let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { editIndex?: number },
    ) => Record<string, unknown>)
  | undefined;
let capturedEditorProps: Record<string, unknown> | undefined;

vi.mock('~/components/Form/ValidatedFieldArray', () => ({
  default: ({
    name,
    component: Component,
    componentProps,
    validation,
  }: {
    name: string;
    component: ComponentType<Record<string, unknown>>;
    componentProps?: Record<string, unknown>;
    validation?: Record<string, unknown>;
  }) => {
    capturedEditorValidate = componentProps?.editorValidate as
      | typeof capturedEditorValidate
      | undefined;
    capturedEditorProps = componentProps?.editorProps as
      | Record<string, unknown>
      | undefined;
    return (
      <div
        data-testid="validated-field"
        data-fieldname={name}
        data-validation-keys={Object.keys(validation ?? {}).join(',')}
      >
        <Component {...componentProps} />
      </div>
    );
  },
}));

// Standing in for the codebook: one categorical variable whose committed
// `minSelected: 3` would contradict a draft that shrinks its options below 3.
// Memoized on the `subject` object's own identity (a self-contained stand-in
// for getVariablesForSubjectSelector's real reselect memoization) so the
// referential-stability test below can exercise Finding 1's actual contract:
// a fresh subject reference per call (the bug) produces a fresh result, while
// a stable subject reference (the fix, via EditableAttributesList's useMemo)
// hits the cache and returns the same result.
vi.mock('~/selectors/codebook', () => {
  const cache = new WeakMap<object, Record<string, unknown>>();
  return {
    getVariablesForSubjectSelector: (_state: unknown, subject: object) => {
      if (!cache.has(subject)) {
        cache.set(subject, {
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
          // Both full-resolution DatePickers in the codebook, joined by
          // sameAs — used by the sibling-composer-field-overlay test below
          // (PR #1107 Finding 4).
          a: {
            name: 'a',
            type: 'datetime',
            component: 'DatePicker',
            validation: { sameAs: 'b' },
          },
          b: {
            name: 'b',
            type: 'datetime',
            component: 'DatePicker',
            validation: {},
          },
        });
      }
      return cache.get(subject);
    },
  };
});

// Every store carries an empty committed protocol: the cross-form rendering
// scan (thirty-fifth-wave finding) reads `activeProtocol.present.stages`
// through getProtocol, and these tests exercise the single-stage behaviours.
const store = configureStore({
  reducer: () => ({ activeProtocol: { present: null } }),
});

const listTree = () => (
  <Provider store={store}>
    <EditableAttributesList
      fieldName="nodeForm.fields"
      entity="node"
      type="person"
      form="edit-stage"
      editFormName="node-attr-edit"
      handleChangeFields={() => undefined}
    />
  </Provider>
);

const renderList = () => render(listTree());

// A stage whose committed composer fields are `fields`, rendered through the
// same component tree so `editorValidate` closes over them exactly as it does
// in the app.
const renderListWithComposerFields = (fields: Record<string, unknown>[]) =>
  render(
    <Provider
      store={configureStore({
        reducer: () => ({
          activeProtocol: { present: null },
          form: { 'edit-stage': { values: { nodeForm: { fields } } } },
        }),
      })}
    >
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        form="edit-stage"
        editFormName="node-attr-edit"
        handleChangeFields={() => undefined}
      />
    </Provider>,
  );

it('binds the dialog array field to the given fieldName + editFormName', () => {
  renderList();
  expect(screen.getByTestId('validated-field').dataset.fieldname).toBe(
    'nodeForm.fields',
  );
  expect(screen.getByTestId('dialog-array-field').dataset.editform).toBe(
    'node-attr-edit',
  );
});

it('allows an empty list (no "at least one item" validation)', () => {
  renderList();
  expect(screen.getByTestId('validated-field').dataset.validationKeys).toBe('');
});

// PR #1107 eighteenth-wave Finding 2: the contradiction message is re-keyed
// from `validation` — a field this editor never renders, and therefore never
// registers, so redux-form let the contradictory save through — onto the
// editor's own always-rendered contradiction field. It is a plain field, so
// the message stays a plain string (a FieldArray-backed key would have to be
// carried on `_error` instead).
it('wires editorValidate from the entity/type variables so a contradictory draft is rejected', () => {
  renderList();

  expect(capturedEditorValidate).toBeInstanceOf(Function);
  const errors = capturedEditorValidate?.({
    variable: 'colors',
    validation: { minSelected: 3 },
    options: [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
    ],
  });
  expect(errors?.[COMPOSER_CONTRADICTION_FIELD]).toContain('minSelected');
  expect(errors?.validation).toBeUndefined();

  const coherent = capturedEditorValidate?.({
    variable: 'colors',
    validation: { minSelected: 3 },
    options: [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
      { label: 'Green', value: 'green' },
    ],
  });
  expect(coherent).toEqual({});
});

// PR #1107 Finding 1: an unmemoized `{ entity, type }` subject object,
// rebuilt on every render, defeats getVariablesForSubjectSelector's
// memoization and so invalidates the makeFieldEditorValidate useMemo below
// it on every re-render — even when entity/type haven't changed. The fix
// memoizes the subject on [entity, type].
it('keeps editorValidate referentially stable across a re-render with unchanged entity/type', () => {
  const { rerender } = renderList();
  const firstEditorValidate = capturedEditorValidate;
  expect(firstEditorValidate).toBeInstanceOf(Function);

  rerender(listTree());

  expect(capturedEditorValidate).toBe(firstEditorValidate);
});

// PR #1107 Finding 4: `a`/`b` are both full-resolution DatePickers in the
// codebook, but this stage's OTHER committed composer field renders `a` as a
// year picker — an override that lives on the field itself (see
// network-composer.ts's ComposerFormFieldSchema), not the codebook variable.
// editorValidate must see that stage-level override, not just the codebook
// definition, when checking a fresh draft for `a`'s sameAs partner `b`.
it('folds a sibling composer field component/parameters override into editorValidate', () => {
  const storeWithSibling = configureStore({
    reducer: () => ({
      activeProtocol: { present: null },
      form: {
        'edit-stage': {
          values: {
            nodeForm: {
              fields: [
                {
                  variable: 'a',
                  component: 'DatePicker',
                  parameters: { type: 'year' },
                },
              ],
            },
          },
        },
      },
    }),
  });

  render(
    <Provider store={storeWithSibling}>
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        form="edit-stage"
        editFormName="node-attr-edit"
        handleChangeFields={() => undefined}
      />
    </Provider>,
  );

  expect(capturedEditorValidate).toBeInstanceOf(Function);

  // Matches the sibling's stage-level rendering (year): accepted, even
  // though it mismatches the codebook's own full resolution.
  expect(
    capturedEditorValidate?.({
      variable: 'b',
      validation: {},
      component: 'DatePicker',
      parameters: { type: 'year' },
    }),
  ).toEqual({});

  // Stays at the codebook's own full resolution: now mismatches the
  // sibling's stage-level rendering.
  const mismatched = capturedEditorValidate?.({
    variable: 'b',
    validation: {},
    component: 'DatePicker',
    parameters: {},
  });
  expect(mismatched?.[COMPOSER_CONTRADICTION_FIELD]).toContain(
    'different resolutions',
  );
});

// PR #1107 eleventh-wave Finding 4: reassigning a field from `a` to `b` must
// exclude the field's OWN stale overlay entry (still keyed by `a`, its
// pre-edit variable). The exclusion happens at overlay construction time, by
// the array index DialogArrayField surfaces as validate's `editIndex` prop —
// NOT by the field's `id`, which imported protocols may omit
// (ComposerFormFieldSchema.id is optional; this fixture is deliberately
// id-less). Without the exclusion, `a`'s committed year-picker override would
// stay in the checked set even though, after save, this field no longer
// renders `a` at all — producing a false conflict against a variable the
// save is removing this field's override from.
it('excludes a reassigned id-less field’s own stale overlay entry from editorValidate', () => {
  const storeWithReassignedField = configureStore({
    reducer: () => ({
      activeProtocol: { present: null },
      form: {
        'edit-stage': {
          values: {
            nodeForm: {
              fields: [
                {
                  variable: 'a',
                  component: 'DatePicker',
                  parameters: { type: 'year' },
                },
              ],
            },
          },
        },
      },
    }),
  });

  render(
    <Provider store={storeWithReassignedField}>
      <EditableAttributesList
        fieldName="nodeForm.fields"
        entity="node"
        type="person"
        form="edit-stage"
        editFormName="node-attr-edit"
        handleChangeFields={() => undefined}
      />
    </Provider>,
  );

  expect(capturedEditorValidate).toBeInstanceOf(Function);

  // Editing the field at index 0, reassigning it from `a` to `b` at full
  // resolution: `a`'s stale year-picker override must not leak in and
  // conflict with `b`.
  const draft = {
    variable: 'b',
    validation: {},
    component: 'DatePicker',
    parameters: {},
  };
  expect(capturedEditorValidate?.(draft, { editIndex: 0 })).toEqual({});

  // Mutation guard: without the index exclusion the stale override for `a`
  // stays in the prospective model and reports a false contradiction.
  expect(
    capturedEditorValidate?.(draft)?.[COMPOSER_CONTRADICTION_FIELD],
  ).toContain('different resolutions');
});

// PR #1107 sixteenth-wave Finding 1: ComposerFormSchema rejects a form that
// names one variable twice (thirteenth-wave Finding 1), but the sibling
// overlay is keyed BY variable — a duplicate draft simply replaced its
// sibling's entry, so the dialog saved a stage its own schema refuses. The
// error is keyed at `variable` (a plain field, so a plain string message),
// which anchors it to the variable picker the researcher must change.
it('blocks a draft naming a variable another committed field already collects, id-less or not', () => {
  renderListWithComposerFields([
    { id: 'f0', variable: 'colors', component: 'CheckboxGroup' },
    { variable: 'a', component: 'DatePicker', parameters: { type: 'year' } },
  ]);

  expect(capturedEditorValidate).toBeInstanceOf(Function);
  // No editIndex: a brand-new attribute, not yet in the committed array.
  expect(
    capturedEditorValidate?.({ variable: 'colors', validation: {} })?.variable,
  ).toContain('already collected by another attribute');
  expect(
    capturedEditorValidate?.({ variable: 'a', validation: {} })?.variable,
  ).toContain('already collected by another attribute');
});

it('blocks reassigning an existing field onto a sibling’s variable', () => {
  renderListWithComposerFields([
    { variable: 'a', component: 'DatePicker', parameters: { type: 'year' } },
    { variable: 'b', component: 'DatePicker' },
  ]);

  expect(
    capturedEditorValidate?.(
      { variable: 'b', validation: {}, component: 'DatePicker' },
      { editIndex: 0 },
    )?.variable,
  ).toContain('already collected by another attribute');
});

// Seventeenth-wave follow-up: the editor's variable picker filters on the same
// committed sibling list editorValidate gates on, so it must actually receive
// it. Without this hop the picker still offers a variable another attribute
// collects, and the researcher only learns on save.
it('hands the committed sibling fields to the attribute editor', () => {
  const fields = [
    { variable: 'a', component: 'DatePicker' },
    { variable: 'b', component: 'DatePicker' },
  ];
  renderListWithComposerFields(fields);

  expect(capturedEditorProps?.composerFields).toEqual(fields);
});

it('still allows editing a field that keeps its own variable', () => {
  renderListWithComposerFields([
    { variable: 'a', component: 'DatePicker', parameters: { type: 'year' } },
    { variable: 'b', component: 'DatePicker' },
  ]);

  // The edited row's own claim on `a` must not fire the duplicate gate
  // against itself.
  expect(
    capturedEditorValidate?.(
      {
        variable: 'a',
        validation: {},
        component: 'DatePicker',
        parameters: { type: 'year' },
      },
      { editIndex: 0 },
    ),
  ).toEqual({});
});
