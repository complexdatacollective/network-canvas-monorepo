import { get, pickBy } from 'es-toolkit/compat';
import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { Variable } from '@codaco/protocol-validation';
import Validations from '~/components/Validations/Validations';

import { getFieldId } from '../../utils/issues';
const defaultMessages = defineMessages({
  label: {
    id: 'architect.defaults.components.sections.ValidationSection.label',
    defaultMessage: 'Validation',
    description:
      'Default researcher-facing copy when the caller does not supply its own label.',
  },
  summary: {
    id: 'architect.defaults.components.sections.ValidationSection.summary',
    defaultMessage: 'Enable validation of this attribute.',
    description:
      'Default researcher-facing copy when the caller does not supply its own summary.',
  },
});

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
  /** Allows external-state consumers to mirror an accepted close. */
  onOpenChange?: (open: boolean) => boolean | Promise<boolean>;
};
const ValidationSection = ({
  disabled = false,
  entity,
  id = getFieldId('validation'),
  label: providedLabel,
  summary: providedSummary,
  variableType = '',
  existingVariables,
  allVariables,
  currentVariableId,
  initialValue,
  commitsImmediately = false,
  onOpenChange,
}: ValidationSectionProps) => {
  const intl = useAppIntl();
  const label = providedLabel ?? intl.formatMessage(defaultMessages.label);
  const summary =
    providedSummary ?? intl.formatMessage(defaultMessages.summary);

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
  const hasValidationError = useFormStore(
    (store) => (store.errors.fieldErrors.validation?.length ?? 0) > 0,
  );
  const errorFocusRequest = useFormStore((store) => store.errorFocusRequest);

  // A contradiction can be caused by changing an attribute that is only the
  // target of another attribute's rule. Its optional Validation Section is
  // legitimately closed, but the save-time validator still reports the error
  // against the validation field that owns the message. Remount the Section
  // in the SAME render that exposes each standing error, before useForm's
  // layout effect tries to focus that field. The request counter also reopens
  // it for each subsequent refused save if the researcher closed it meanwhile.
  const sectionKey = hasValidationError
    ? `validation-error-${errorFocusRequest}`
    : 'validation';
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

  return (
    <>
      <div id={id} className="sr-only" />
      <Section
        key={sectionKey}
        title={label}
        description={summary}
        disabled={disabled}
        toggleable
        defaultOpen={hasValidation || hasValidationError}
        onOpenChange={onOpenChange}
      >
        {validationEditor}
      </Section>
    </>
  );
};
export default ValidationSection;
