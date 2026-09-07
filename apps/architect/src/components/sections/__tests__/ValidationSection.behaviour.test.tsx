import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { isEqual } from 'es-toolkit/compat';
import { useCallback, useEffect, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { VariableSchema, type Variable } from '@codaco/protocol-validation';
import AppForm from '~/components/Form/AppForm';

import { makeFieldEditorValidate } from '../../Validations/contradictions';
import ValidationSection from '../ValidationSection';

beforeAll(() => {
  // fresco-ui's default `onSubmitInvalid` scrolls the first invalid field
  // into view; jsdom implements no scrolling (see ArchitectField.test.tsx).
  Element.prototype.scrollTo ??= () => undefined;
});

type ValidationMap = Record<string, boolean | number | string | null>;

// `b` (the edited variable) has no rules of its own; `a` carries an incoming
// sameAs to it. Both are full-resolution DatePickers in the codebook.
const allVariables: Record<string, Variable> = {
  a: VariableSchema.parse({
    name: 'a',
    type: 'datetime',
    component: 'DatePicker',
    validation: { sameAs: 'b' },
  }),
  b: VariableSchema.parse({
    name: 'b',
    type: 'datetime',
    component: 'DatePicker',
    validation: {},
  }),
};

/** Registers its field without rendering any control of its own. */
const InertField = (_props: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) => null;

/** Registers `parameters` and exposes the one interaction the test drives. */
const ParametersSwitcher = ({
  onChange,
}: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) => (
  <button
    type="button"
    onClick={() => onChange?.({ type: 'year' } as unknown as FieldValue)}
  >
    Switch to year resolution
  </button>
);

/**
 * Stands in for the dialog's own Parameters editor, plus the sibling
 * `variable`/`component` fields the real field-editor dialog registers: the
 * form-level `validate` reads all of these off `getFormValues()`.
 */
const DialogSiblingFields = () => (
  <>
    <Field
      name="variable"
      label="Variable"
      labelHidden
      component={InertField}
      initialValue="b"
    />
    <Field
      name="component"
      label="Component"
      labelHidden
      component={InertField}
      initialValue="DatePicker"
    />
    <Field
      name="parameters"
      label="Parameters"
      labelHidden
      component={ParametersSwitcher}
      initialValue={{} as unknown as FieldValue}
    />
  </>
);

/**
 * `ValidationSection` reads `options`/`component`/`parameters` reactively off
 * the surrounding form itself — `DialogSiblingFields` registers them, so
 * rendering `ValidationSection` directly (no extra plumbing needed) exercises
 * that read exactly as `FieldFields.tsx` will.
 */

const editorValidate = makeFieldEditorValidate(allVariables);
const validate = (values: Record<string, unknown>) => {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(editorValidate(values))) {
    if (typeof value === 'string') errors[key] = value;
  }
  return errors;
};

describe('ValidationSection with a target-only contradiction', () => {
  it('opens the optional section when a target-only error blocks save', async () => {
    const onSubmit = vi.fn();

    render(
      <AppForm onSubmit={onSubmit} validate={validate}>
        <DialogSiblingFields />
        <ValidationSection
          entity="node"
          variableType="datetime"
          existingVariables={{}}
          allVariables={allVariables}
          currentVariableId="b"
          initialValue={{}}
        />
        <button type="submit">Save</button>
      </AppForm>,
    );

    expect(
      screen.getByRole('switch', { name: 'Validation' }),
    ).not.toBeChecked();
    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
    ).not.toBeInTheDocument();

    // The draft edit switches the picker to year resolution, breaking the
    // incoming full-resolution sameAs from `a`. fresco-ui's form-level
    // validate only runs at submit time, so no error is shown yet.
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to year resolution' }),
    );
    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/cannot be satisfied within their allowed ranges/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const message = await screen.findByText(
      /cannot be satisfied within their allowed ranges/,
    );
    expect(message).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Validation' })).toBeChecked();
    expect(screen.getByTestId('validation-field-error')).toContainElement(
      message,
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByRole('group', { name: 'Requirements' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Required answer' }),
    ).toHaveFocus();
  });
});

describe('ValidationSection with a store-level validation error', () => {
  const SetErrorsButton = () => {
    const setErrors = useFormStore((store) => store.setErrors);
    return (
      <button
        type="button"
        onClick={() =>
          setErrors({
            formErrors: [],
            fieldErrors: { validation: ['Contradictory rules'] },
          })
        }
      >
        Force a validation error
      </button>
    );
  };

  it('opens so its owning field can display the error', async () => {
    render(
      <AppForm onSubmit={() => ({ success: true })}>
        <SetErrorsButton />
        <ValidationSection
          entity="node"
          variableType="datetime"
          existingVariables={{}}
          allVariables={allVariables}
          currentVariableId="b"
          initialValue={{}}
        />
      </AppForm>,
    );

    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Force a validation error' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: 'Requirements' }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('switch', { name: 'Validation' })).toBeChecked();
    expect(screen.getByTestId('validation-field-error')).toHaveTextContent(
      'Contradictory rules',
    );
  });

  it('renders its Section directly beside surrounding fields', () => {
    render(
      <AppForm onSubmit={() => ({ success: true })}>
        <ValidationSection
          entity="node"
          variableType="datetime"
          existingVariables={{}}
          allVariables={allVariables}
          currentVariableId="b"
          initialValue={{}}
        />
        <button type="button">Following field</button>
      </AppForm>,
    );

    const anchor = document.getElementById('field_validation');
    const section = screen.getByRole('region', { name: 'Validation' });

    expect(anchor).toBeEmptyDOMElement();
    expect(anchor).not.toContainElement(section);
    expect(section.parentElement?.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'Following field' }),
    );
  });
});

/**
 * Mirrors `CodebookVariableValidationSection`'s commit observer: the section's
 * `initialValue` is the COMMITTED rule map, and a commit made inside the
 * section (including the toggle-off that clears the field) writes it back. Two
 * signals, exactly as the real one: the field's value, and whether the field
 * is registered at all — a cleared field and a never-mounted one both read
 * `undefined`.
 */
const CommitMirror = ({
  committed,
  onCommit,
}: {
  committed: ValidationMap;
  onCommit: (validation: ValidationMap) => void;
}) => {
  const { validation } = useFormValue(['validation'] as const);
  const hasValidationField = useFormStore(
    (store) => store.getFieldState('validation') !== undefined,
  );

  useEffect(() => {
    if (!hasValidationField) return;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const next = (validation ?? {}) as ValidationMap;
    if (!isEqual(next, committed)) {
      onCommit(next);
    }
  }, [hasValidationField, validation, committed, onCommit]);

  return null;
};

const LatchHarness = () => {
  const [committed, setCommitted] = useState<ValidationMap>({ minValue: 3 });
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const write = useCallback(
    (next: ValidationMap) => {
      setCommitted(next);
      setFieldValue('validation', next);
    },
    [setFieldValue],
  );

  return (
    <>
      <CommitMirror committed={committed} onCommit={setCommitted} />
      <ValidationSection
        entity="node"
        variableType="number"
        existingVariables={{}}
        allVariables={{}}
        currentVariableId="c"
        initialValue={committed}
      />
      <button type="button" onClick={() => write({})}>
        Clear the last rule
      </button>
      {/* Stands in for the stage editor's Undo (or a reinitialize): the rule
          map the section's own toggle cleared is written back from outside. */}
      <button type="button" onClick={() => write({ minValue: 3 })}>
        Restore the rules
      </button>
    </>
  );
};

const renderLatchHarness = () =>
  render(
    <AppForm onSubmit={() => ({ success: true })}>
      <LatchHarness />
    </AppForm>,
  );

describe('ValidationSection expansion latch', () => {
  it('stays open when the last rule is cleared', () => {
    renderLatchHarness();

    expect(
      screen.getByRole('group', { name: 'Requirements' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear the last rule' }),
    );

    expect(
      screen.getByRole('group', { name: 'Requirements' }),
    ).toBeInTheDocument();
  });

  it('stays closed when external rules are restored after it is switched off', async () => {
    renderLatchHarness();

    // Section settles its own toggle asynchronously because onOpenChange may
    // return a promise, so the collapse lands a tick after the click.
    fireEvent.click(screen.getByRole('switch', { name: 'Validation' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Requirements' }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore the rules' }));

    expect(
      screen.queryByRole('group', { name: 'Requirements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Validation' }),
    ).not.toBeChecked();
  });
});
