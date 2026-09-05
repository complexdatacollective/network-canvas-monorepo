import { isEqual, omit } from 'es-toolkit/compat';
import { useEffect, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { Variable } from '@codaco/protocol-validation';
import { ruleMapIssue } from '~/components/Validations/validateRuleMap';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import {
  EMPTY_VARIABLES,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';

import ValidationSection from './ValidationSection';
const defaultMessages = defineMessages({
  sectionLabel: {
    id: 'architect.defaults.components.sections.CodebookVariableValidationSection.sectionLabel',
    defaultMessage: 'Validation',
    description:
      'Default researcher-facing copy when the caller does not supply its own sectionLabel.',
  },
  sectionSummary: {
    id: 'architect.defaults.components.sections.CodebookVariableValidationSection.sectionSummary',
    defaultMessage: 'Enable to add validation rules to the attribute.',
    description:
      'Default researcher-facing copy when the caller does not supply its own sectionSummary.',
  },
});
const messages = defineMessages({
  options: {
    id: 'architect.sections.codebookVariableValidationSection.options',
    defaultMessage: 'Options',
    description:
      'The label text in components / sections / CodebookVariableValidationSection.',
  },
  component: {
    id: 'architect.sections.codebookVariableValidationSection.component',
    defaultMessage: 'Component',
    description:
      'The label text in components / sections / CodebookVariableValidationSection.',
  },
  parameters: {
    id: 'architect.sections.codebookVariableValidationSection.parameters',
    defaultMessage: 'Parameters',
    description:
      'The label text in components / sections / CodebookVariableValidationSection.',
  },
});

type Entity = 'node' | 'edge' | 'ego';
type ValidationValue = boolean | number | string | null;
type ValidationMap = Record<string, ValidationValue>;

const isEntity = (value: string): value is Entity =>
  value === 'node' || value === 'edge' || value === 'ego';

const getValidation = (variable: Variable): ValidationMap => {
  if (!('validation' in variable) || !variable.validation) {
    return {};
  }

  // Every variable type's `validation` is a rule-name-keyed record of
  // primitive values; the schema types it per-type, but this reader is
  // deliberately generic across all of them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return variable.validation as ValidationMap;
};

/** Registers its field's value without rendering a visible control. */
const NoRenderField = (_props: {
  value?: FieldValue;
  onChange?: (value: FieldValue) => void;
}) => null;

/**
 * `ValidationSection` reads `options`/`component`/`parameters` reactively off
 * whichever form it is nested in, since the field-editor dialog carries them
 * as live sibling fields. This isolated validation-only form has no such
 * fields, so this mirrors the selected variable's own committed values into
 * hidden registrations: the form store reports registered fields only, so a
 * value no Field ever mounts for is otherwise unreadable.
 */
const VariableSiblingFieldMirror = ({ variable }: { variable: Variable }) => {
  const intl = useAppIntl();
  return (
    <div className="hidden" aria-hidden>
      <Field
        name="options"
        label={intl.formatMessage(messages.options)}
        labelHidden
        component={NoRenderField}
        initialValue={
          ('options' in variable ? variable.options : undefined) as
            | FieldValue
            | undefined
        }
      />
      <Field
        name="component"
        label={intl.formatMessage(messages.component)}
        labelHidden
        component={NoRenderField}
        initialValue={'component' in variable ? variable.component : undefined}
      />
      <Field
        name="parameters"
        label={intl.formatMessage(messages.parameters)}
        labelHidden
        component={NoRenderField}
        initialValue={
          ('parameters' in variable ? variable.parameters : undefined) as
            | FieldValue
            | undefined
        }
      />
    </div>
  );
};

/**
 * Writes a committed change in the nested validation-only form back to the
 * selected codebook variable. Mounted unconditionally alongside
 * `ValidationSection` (not just while its toggle is open): the `validation`
 * field only exists once the user has actually expanded the section, so this
 * stays silent until then.
 */
const ValidationCommitObserver = ({
  currentValidation,
  isCommittable,
  onCommit,
}: {
  currentValidation: ValidationMap;
  /**
   * Whether the rule map is finished and satisfiable. This surface has no
   * submit to refuse — it writes straight to the codebook on every change —
   * so an unanswered or contradictory map is simply not written, and the rule
   * row's own inline error explains what still needs attention.
   */
  isCommittable: (validation: ValidationMap) => boolean;
  onCommit: (validation: ValidationMap) => void;
}) => {
  const { validation } = useFormValue(['validation'] as const);
  // Rule changes made while the field is mounted are mirrored into the
  // codebook here. Closing the Section is handled explicitly by the
  // `onOpenChange` below because unmounting removes the field before this
  // observer can see its discarded value.
  const hasValidationField = useFormStore(
    (store) => store.getFieldState('validation') !== undefined,
  );

  useEffect(() => {
    if (!hasValidationField) return;
    // `useFormValue` returns the field's raw `FieldValue`; `Validations`'s
    // own `validation` Field always writes a `ValidationMap`, and a cleared
    // field means every rule was removed.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const next = (validation ?? {}) as ValidationMap;
    if (!isEqual(next, currentValidation) && isCommittable(next)) {
      onCommit(next);
    }
    // `currentValidation`/`onCommit` intentionally excluded: this observer
    // only reacts to the FORM value changing, not to the codebook write it
    // just caused feeding a new (but equal-content) `currentValidation` back
    // in on the next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidationField, validation]);

  return null;
};

type CodebookVariableValidationSectionProps = {
  fieldName: string;
  entity: string;
  type?: string | null;
  variableId?: string | null;
  sectionLabel?: string;
  sectionSummary?: string;
};

/**
 * Reuses the form-field editor's ValidationSection for a variable picker that
 * lives directly on a stage. A nested `FormStoreProvider`, keyed on the
 * selected variable, keeps the validation draft out of the stage form;
 * committed rule changes are written back to the selected codebook variable
 * instead via `ValidationCommitObserver`.
 */
const CodebookVariableValidationSection = ({
  sectionLabel: providedSectionLabel,
  sectionSummary: providedSectionSummary,
  fieldName,
  entity,
  type,
  variableId,
}: CodebookVariableValidationSectionProps) => {
  const intl = useAppIntl();
  const sectionLabel =
    providedSectionLabel ?? intl.formatMessage(defaultMessages.sectionLabel);
  const sectionSummary =
    providedSectionSummary ??
    intl.formatMessage(defaultMessages.sectionSummary);

  const dispatch = useAppDispatch();
  const subject = useMemo(
    () =>
      isEntity(entity)
        ? {
            entity,
            ...(type ? { type } : {}),
          }
        : null,
    [entity, type],
  );
  const variables = useAppSelector((state) =>
    subject ? getVariablesForSubjectSelector(state, subject) : EMPTY_VARIABLES,
  );
  const variable =
    typeof variableId === 'string' ? variables[variableId] : undefined;
  const currentValidation = useMemo(
    () => (variable ? getValidation(variable) : {}),
    [variable],
  );

  const isCommittable = (validation: ValidationMap) =>
    ruleMapIssue(validation, {
      allVariables: variables,
      currentVariableId: variableId ?? '',
      variableType: variable?.type ?? '',
      options: variable && 'options' in variable ? variable.options : undefined,
      component:
        variable && 'component' in variable ? variable.component : undefined,
      parameters:
        variable && 'parameters' in variable ? variable.parameters : undefined,
    }) === undefined;

  const handleCommit = (validation: ValidationMap) => {
    if (!variableId) return;

    void dispatch(
      updateVariableAsync({
        variable: variableId,
        configuration: { validation } as Partial<Variable>,
        replaceProperties: ['validation'],
      }),
    );
  };

  if (!subject || !variableId || !variable) {
    return null;
  }

  const validationFormKey = `${fieldName}-${variableId}-validation`;

  return (
    <FormStoreProvider key={validationFormKey}>
      <VariableSiblingFieldMirror variable={variable} />
      <ValidationCommitObserver
        currentValidation={currentValidation}
        isCommittable={isCommittable}
        onCommit={handleCommit}
      />
      <ValidationSection
        entity={subject.entity}
        variableType={variable.type}
        existingVariables={omit(variables, variableId)}
        allVariables={variables}
        currentVariableId={variableId}
        id={`codebook-validation-${variableId}`}
        label={sectionLabel}
        summary={sectionSummary}
        initialValue={currentValidation}
        commitsImmediately
        onOpenChange={(open) => {
          if (!open) {
            handleCommit({});
          }
          return true;
        }}
      />
    </FormStoreProvider>
  );
};

export default CodebookVariableValidationSection;
