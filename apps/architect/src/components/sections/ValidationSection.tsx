import { get, pickBy } from 'es-toolkit/compat';
import { useMemo } from 'react';

import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { Variable } from '@codaco/protocol-validation';
import Validations from '~/components/Validations/Validations';

import { getFieldId } from '../../utils/issues';

type ValidationValue = boolean | number | string | null;
type ValidationMap = Record<string, ValidationValue>;

// See the matching constant in `Validations.tsx`: `initialValue` is a
// register-effect dependency, so an absent value must fall back to a
// referentially stable empty object rather than a fresh `{}` recreated every
// render (which would silently re-register the field, and drop any error the
// store had just attached to its name, on the very next unrelated render).
const EMPTY_VALIDATION: ValidationMap = {};

const hasEntries = (value: ValidationMap | null | undefined): boolean =>
  !!value && Object.keys(value).length > 0;

type ValidationSectionProps = {
  disabled?: boolean;
  entity: string;
  id?: string;
  label?: string;
  summary?: string;
  variableType?: string;
  existingVariables: Record<string, Pick<Variable, 'name' | 'type'>>;
  allVariables: Record<string, Variable>;
  currentVariableId: string;
  /**
   * The committed validation record — seeds the `validation` field's
   * `initialValue`, and (before that field has ever registered, e.g. while
   * this toggleable section starts collapsed) whether the section should
   * start open. fresco-ui forms carry no whole-form initial values — a value
   * is only readable once some Field has registered for it — so the caller
   * threads this through explicitly: its own dialog's `item`, or (from
   * `CodebookVariableValidationSection`) the selected variable's own
   * validation.
   */
  initialValue?: ValidationMap | null;
  /**
   * Passed through to `Validations` — see its `commitsImmediately`. Set only
   * by `CodebookVariableValidationSection`, whose isolated form has no submit
   * to refuse a half-configured rule with.
   */
  commitsImmediately?: boolean;
  /** Whether the Section can be collapsed. Dialog editors keep it open. */
  toggleable?: boolean;
  /** Allows external-state consumers to mirror an accepted close. */
  onOpenChange?: (open: boolean) => boolean | Promise<boolean>;
};
const ValidationSection = ({
  disabled = false,
  entity,
  id = getFieldId('validation'),
  label = 'Validation',
  summary = 'Enable validation of this attribute.',
  variableType = '',
  existingVariables,
  allVariables,
  currentVariableId,
  initialValue,
  commitsImmediately = false,
  toggleable = true,
  onOpenChange,
}: ValidationSectionProps) => {
  // Sibling draft values, read reactively off the SAME form `ValidationSection`
  // itself is rendered in — the field-editor dialog's `options`/`component`/
  // `parameters`/`_createNewVariable` fields when nested there, or (from
  // `CodebookVariableValidationSection`) the hidden mirror fields it seeds
  // into its own isolated form from the committed variable. Either way this
  // is the `withStoreState` HOC's `formValueSelector(form)` reads collapsed
  // onto the one hook every field in this migration uses.
  //
  // `parameters` reaches this hook two different ways: in the field-editor
  // dialog nothing registers that name at all — only its leaves do
  // (`parameters.type`, `parameters.min`, …, shaped differently per input
  // control) — while `CodebookVariableValidationSection` registers it whole as
  // a hidden mirror field. The store reads a container name as the assembled
  // container and a registered one as itself, and owns keeping the assembled
  // object referentially stable, so neither needs anything special here.
  const {
    validation: liveValidation,
    options: draftOptions,
    component: draftComponent,
    parameters: draftParameters,
    _createNewVariable: draftVariableName,
  } = useFormValue([
    'validation',
    'options',
    'component',
    'parameters',
    '_createNewVariable',
  ] as const);
  // `useFormValue` returns the field's raw `FieldValue`; this field's own
  // component always writes a `ValidationMap`.
  const hasValidation =
    liveValidation !== undefined
      ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        hasEntries(liveValidation as ValidationMap)
      : hasEntries(initialValue);
  const existingVariablesForType = useMemo(
    () =>
      pickBy(
        existingVariables,
        (variable) => get(variable, 'type') === variableType,
      ),
    [existingVariables, variableType],
  );
  const validationEditor = (
    <Validations
      name="validation"
      initialValue={initialValue ?? EMPTY_VALIDATION}
      variableType={variableType}
      entity={entity}
      existingVariables={existingVariablesForType}
      allVariables={allVariables}
      currentVariableId={currentVariableId}
      draftOptions={draftOptions}
      draftComponent={draftComponent}
      draftParameters={draftParameters}
      draftVariableName={draftVariableName}
      commitsImmediately={commitsImmediately}
    />
  );

  const toggleProps = toggleable
    ? { toggleable: true as const, defaultOpen: hasValidation, onOpenChange }
    : {};

  return (
    <>
      <div id={id} className="sr-only" />
      <Section
        title={label}
        description={summary}
        disabled={disabled}
        {...toggleProps}
      >
        {validationEditor}
      </Section>
    </>
  );
};
export default ValidationSection;
