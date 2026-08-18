import { get, isEqual, pickBy } from 'es-toolkit/compat';
import { useMemo, useRef } from 'react';

import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Variable } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import Validations from '~/components/Validations/Validations';
import useLatchedExpansion from '~/hooks/useLatchedExpansion';

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
  /**
   * Keep the validation editor inside its Section surface without rendering
   * the legacy Section heading/toggle. Dialogs use the field's own label and
   * hint instead; stage-editor consumers retain the toggleable heading.
   */
  showHeading?: boolean;
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
  showHeading = true,
}: ValidationSectionProps) => {
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  // Sibling draft values, read reactively off the SAME form `ValidationSection`
  // itself is rendered in — the field-editor dialog's `options`/`component`/
  // `parameters`/`_createNewVariable` fields when nested there, or (from
  // `CodebookVariableValidationSection`) the hidden mirror fields it seeds
  // into its own isolated form from the committed variable. Either way this
  // is the `withStoreState` HOC's `formValueSelector(form)` reads collapsed
  // onto the one hook every field in this migration uses.
  const {
    validation: liveValidation,
    options: draftOptions,
    component: draftComponent,
    _createNewVariable: draftVariableName,
  } = useFormValue([
    'validation',
    'options',
    'component',
    '_createNewVariable',
  ] as const);
  // `parameters` is never itself a registered field — only its leaves are
  // (`parameters.type`, `parameters.min`, …, shaped differently per input
  // component) — so `useFormValue(['parameters'])`'s direct `getFieldState`
  // lookup is always `undefined`. `getFormValues()` assembles those leaves
  // back into a `parameters` object the same way a save does, so read the
  // draft through it instead. `getFormValues()` builds a fresh object on
  // every call, so an `isEqual`-guarded cache (the same pattern
  // `useStageFormValue` uses) keeps the result referentially stable across
  // renders that don't actually change any leaf under `parameters`.
  const draftParametersCache = useRef<unknown>(undefined);
  const draftParameters = useFormStore((store) => {
    const next = get(store.getFormValues(), 'parameters') as unknown;
    if (!isEqual(draftParametersCache.current, next)) {
      draftParametersCache.current = next;
    }
    return draftParametersCache.current;
  });
  // `useFormValue` returns the field's raw `FieldValue`; this field's own
  // component always writes a `ValidationMap`.
  const hasValidation =
    liveValidation !== undefined
      ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        hasEntries(liveValidation as ValidationMap)
      : hasEntries(initialValue);
  // Removing the last rule must not collapse the section out from under the
  // user — but an explicit close still releases the latch, so rules restored
  // afterwards (undo, or a reinitialize) reopen it rather than being saved
  // out of sight.
  const { startExpanded, onExplicitClose } = useLatchedExpansion(hasValidation);
  // Eleventh-wave Finding 3: the dialog's form-level validate
  // (makeFieldEditorValidate) keys contradiction messages at `validation`
  // even when the edited variable has no rules of its own (the target-only
  // case — editing options/parameters can break an INCOMING sameAs or
  // comparator). With no rules the section starts collapsed, so the
  // Validations field is unmounted — and `validateForm` only fails a submit
  // over errors on REGISTERED fields, so the collapsed section wouldn't just
  // hide the message, it would let the contradictory save through entirely.
  // Forcing the section open while the error stands both registers the field
  // (so the save is actually blocked) and renders the message when that save
  // fails.
  const fieldErrors = useFormStore(
    (store) => store.errors.fieldErrors.validation,
  );
  const hasValidationSyncError =
    Array.isArray(fieldErrors) && fieldErrors.length > 0;
  // fresco-ui's own `FieldErrors` slot on the `validation` Field only shows
  // once that field is both dirty AND blurred — correct for a field the user
  // is actively editing, but this error can attach to `validation` before it
  // has ever registered (the section was collapsed), and a freshly-mounted
  // field is neither dirty nor blurred. Rendering the message here directly,
  // keyed only on the error existing, is what surfaces it at all.
  const validationErrorsId = getFieldId('validation-sync-error');
  const handleToggleChange = (nextState: boolean) => {
    if (!nextState) {
      onExplicitClose();
      setFieldValue('validation', undefined);
    }
    return true;
  };
  const existingVariablesForType = useMemo(
    () =>
      pickBy(
        existingVariables,
        (variable) => get(variable, 'type') === variableType,
      ),
    [existingVariables, variableType],
  );
  return (
    <Section
      layout="vertical"
      id={id}
      title={showHeading ? label : undefined}
      summary={showHeading ? <Paragraph>{summary}</Paragraph> : undefined}
      disabled={disabled}
      toggleable={showHeading}
      startExpanded={showHeading ? startExpanded : true}
      forceExpanded={hasValidationSyncError}
      handleToggleChange={handleToggleChange}
    >
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
      <FieldErrors
        id={validationErrorsId}
        errors={fieldErrors ?? undefined}
        show={hasValidationSyncError}
      />
    </Section>
  );
};
export default ValidationSection;
