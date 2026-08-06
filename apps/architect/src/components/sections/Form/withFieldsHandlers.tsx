import { find, get, has } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { useClearValue } from '~/components/Form/clearFieldValue';
import {
  formattedInputOptions,
  getComponentsForType,
  getTypeForComponent,
  INPUT_OPTIONS,
  VARIABLE_TYPES_WITH_COMPONENTS,
} from '~/config/variables';
import type { RootState } from '~/ducks/store';
import {
  getVariableOptionsForSubjectSelector,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { excludeUnvalidatedUses } from '~/selectors/roleFilters';

import { isVariableUsedBySibling } from './composerHelpers';

/**
 * The name a researcher typed into the variable picker's "create" affordance,
 * held until the save actually writes the codebook variable.
 *
 * It has no control of its own, but it must still be a REGISTERED field:
 * `getFormValues()` reports registered fields only, and the dialog's save
 * handler is what turns this into a `createVariable` rather than an
 * `updateVariable`. A `setFieldValue` on an unregistered name is parked
 * dormant and would never reach the submit.
 */
export const CREATE_NEW_VARIABLE_FIELD = '_createNewVariable';

const READ_FIELDS = [
  'variable',
  'component',
  CREATE_NEW_VARIABLE_FIELD,
] as const;

/**
 * Registers a value the editor carries but renders no control for.
 *
 * `getFormValues()` reports registered fields only, so anything the save
 * handler or the contradiction check reads has to be a real field. Used for
 * `_createNewVariable` in both editors, and for the composer editor's
 * `validation`, which it carries from the codebook without offering an editor
 * for it.
 */
export const HiddenFieldValue = ({
  name,
  initialValue,
}: {
  name: string;
  initialValue?: FieldValue;
}) => {
  useField({ name, initialValue });
  return null;
};

type Entity = 'node' | 'edge' | 'ego';

type UseFieldHandlerProps = {
  entity: string;
  type: string;
  /**
   * The committed fields of the NetworkComposer form this editor edits a row
   * of, and that row's array index. Supplied only by the composer editor:
   * `ComposerFormSchema` rejects a form naming one variable twice, so a
   * variable a sibling field already claims must not be offered. The regular
   * Form editor omits both and is filtered exactly as before — its schema
   * permits the repeat.
   */
  siblingFields?: unknown;
  editIndex?: number;
  currentStageIndex?: number;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The variable/input-control pair at the heart of both field editors.
 *
 * The two cross-field resets are observer effects rather than handlers hung
 * off the fields themselves: a caller `onChange` on a fresco-ui `Field`
 * replaces the store's own write and detaches the field, so a side effect on
 * change has to watch the value instead. Each effect records the first value
 * it sees once the field is registered and acts only on later changes, so
 * simply opening the dialog never resets anything.
 */
export const useFieldHandlers = ({
  entity,
  type,
  siblingFields,
  editIndex,
  currentStageIndex,
}: UseFieldHandlerProps) => {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const clearValue = useClearValue();
  // The observers below must tell "the field has not registered yet" apart
  // from "the researcher cleared it", so registration is watched explicitly.
  const variableRegistered = useFormStore((state) =>
    state.fields.has('variable'),
  );
  const componentRegistered = useFormStore((state) =>
    state.fields.has('component'),
  );
  const values = useFormValue(READ_FIELDS);

  const variable = asString(values.variable);
  const component = asString(values.component);
  const createNewVariable = asString(values[CREATE_NEW_VARIABLE_FIELD]);
  const isNewVariable = !!createNewVariable;

  // Create subject object once to ensure stable reference
  const subject = useMemo(() => ({ entity, type }), [entity, type]) as {
    entity: Entity;
    type?: string;
  };

  const existingVariables = useSelector((state: RootState) =>
    getVariablesForSubjectSelector(state, subject),
  );

  const baseVariableOptions = useSelector((state: RootState) =>
    getVariableOptionsForSubjectSelector(state, subject),
  );

  // This picker is a VALIDATED writer (Form, NetworkComposer fields,
  // FamilyPedigree fields): a variable also written by a bin/highlight/census
  // elsewhere would bypass that form's validation, so drop any option with an
  // unvalidated hit. The currently-selected value is always kept.
  const roleFilteredOptions = useSelector(
    (state: RootState) =>
      excludeUnvalidatedUses(
        state,
        subject,
        baseVariableOptions,
        variable,
        currentStageIndex,
      ),
    // excludeUnvalidatedUses allocates a fresh array each call; compare
    // elements (which baseVariableOptions already keeps stable) instead of
    // the wrapper reference so unrelated store updates don't force a re-render.
    shallowEqual,
  );

  // Memoize the filtered and concatenated variable options
  const variableOptions = useMemo(() => {
    const filtered = roleFilteredOptions
      // If not a variable with corresponding component, we can't use it here.
      .filter((option) =>
        VARIABLE_TYPES_WITH_COMPONENTS.includes(option.type as string),
      )
      // Drop what a sibling composer field already collects, using the same
      // predicate the save-time gate applies so the picker and the gate cannot
      // drift apart. The value this field currently holds is always kept:
      // excluding `editIndex` covers a committed row, but a picker whose value
      // is missing from its options renders blank and silently drops the
      // selection, so never let that happen.
      .filter(
        (option) =>
          option.value === variable ||
          !isVariableUsedBySibling(siblingFields, option.value, editIndex),
      );

    // with New variable
    return isNewVariable && createNewVariable
      ? filtered.concat([
          { label: createNewVariable, value: createNewVariable },
        ])
      : filtered;
  }, [
    roleFilteredOptions,
    isNewVariable,
    createNewVariable,
    siblingFields,
    editIndex,
    variable,
  ]);

  // 1. If type defined use that (existing variable)
  // 2. Otherwise derive it from component (new variable)
  const codebookType = asString(
    get(existingVariables, [variable ?? '', 'type']),
  );
  const variableType = codebookType ?? getTypeForComponent(component);

  // 1. If type defined, show components that match (existing variable)
  // 2. Otherwise list all INPUT_OPTIONS (new variable)
  const componentOptions =
    variableType && !isNewVariable
      ? getComponentsForType(variableType)
      : formattedInputOptions;

  const metaForType = find(INPUT_OPTIONS, { value: component });

  // The variable observer writes `component`; the component observer must not
  // then treat that write as a researcher changing the input control.
  const programmaticComponent = useRef<{ value: string | undefined } | null>(
    null,
  );
  const observedVariable = useRef<{ value: string | undefined } | null>(null);
  const observedComponent = useRef<{ value: string | undefined } | null>(null);

  // Selecting an EXISTING codebook variable adopts its rendering and rules.
  // A name typed into the create affordance matches nothing in the codebook
  // and deliberately leaves the rest of the editor alone: the researcher is
  // about to choose the input control that defines the new variable.
  useEffect(() => {
    if (!variableRegistered) return;
    if (!observedVariable.current) {
      observedVariable.current = { value: variable };
      return;
    }
    if (observedVariable.current.value === variable) return;
    observedVariable.current = { value: variable };

    if (!variable || !has(existingVariables, variable)) return;

    const nextComponent = asString(
      get(existingVariables, [variable, 'component']),
    );
    programmaticComponent.current = { value: nextComponent };

    setFieldValue(CREATE_NEW_VARIABLE_FIELD, undefined);
    setFieldValue('component', nextComponent);
    setFieldValue(
      'options',
      get(existingVariables, [variable, 'options'], undefined),
    );
    setFieldValue(
      'validation',
      get(existingVariables, [variable, 'validation'], undefined),
    );
    // The previous variable's parameter leaves must go before the new
    // variable's are seeded, or a leaf the new control shares (`parameters.
    // type`, say) would keep the old value.
    clearValue('parameters');
    const nextParameters = get(
      existingVariables,
      [variable, 'parameters'],
      undefined,
    ) as Record<string, unknown> | undefined;
    for (const [key, value] of Object.entries(nextParameters ?? {})) {
      setFieldValue(`parameters.${key}`, value as FieldValue);
    }
  }, [
    clearValue,
    existingVariables,
    setFieldValue,
    variable,
    variableRegistered,
  ]);

  // Changing the input control invalidates whatever depends on it. An existing
  // variable's type is locked, so only a NEW variable's type can move — which
  // is what decides whether the validation rules and options survive.
  useEffect(() => {
    if (!componentRegistered) return;
    if (!observedComponent.current) {
      observedComponent.current = { value: component };
      return;
    }
    const previous = observedComponent.current.value;
    if (previous === component) return;
    observedComponent.current = { value: component };

    if (programmaticComponent.current?.value === component) {
      programmaticComponent.current = null;
      return;
    }

    const previousType = codebookType ?? getTypeForComponent(previous);
    const nextType = codebookType ?? getTypeForComponent(component);

    if (previousType !== nextType) {
      // Options and rules were authored against the old type. Both are held
      // as ONE field each (Validations/Options are single array-valued
      // fields), so a direct write is the whole reset.
      setFieldValue('validation', undefined);
      setFieldValue('options', undefined);
    } else if (nextType === 'boolean') {
      // Within boolean, BooleanChoice has options and Toggle does not.
      setFieldValue('options', undefined);
    }

    // Parameters always belong to the specific control, and are held as a
    // TREE of leaves rather than one field — see useClearValue.
    clearValue('parameters');
  }, [clearValue, codebookType, component, componentRegistered, setFieldValue]);

  const handleNewVariable = useCallback(
    (value: string) => {
      setFieldValue(CREATE_NEW_VARIABLE_FIELD, value);
      setFieldValue('variable', value);
      return value;
    },
    [setFieldValue],
  );

  return {
    variable,
    variableType,
    variableOptions,
    componentOptions,
    component,
    metaForType,
    existingVariables,
    isNewVariable,
    handleNewVariable,
  };
};
