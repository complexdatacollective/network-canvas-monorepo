import { useEffect, useMemo, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import AttributeCodebookControls from '../AttributeCodebookControls.tsx';
import type { RowEditorProps, RowPreviewProps } from '../rowRenderers.tsx';
import {
  useStageSubject,
  useSubjectVariables,
  useVariableOptions,
} from './codebookOptions.ts';
import { useComposerDraftWriters } from './composerDraftWriters.ts';
import ComposerFieldParameters from './ComposerFieldParameters.tsx';
import {
  defaultInputControl,
  FORM_FIELD_VARIABLE_TYPES,
  inputControlOptions,
} from './composerFormComponents.ts';
import { useComposerFormSubject } from './composerFormSubject.ts';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import { asText } from './rowValues.ts';

const VARIABLE_FIELD = 'variable';
const COMPONENT_FIELD = 'component';
const LABEL_FIELD = 'label';
const HINT_FIELD = 'hint';
const VALIDATION_HINTS_FIELD = 'showValidationHints';

/**
 * The control the codebook itself gives this attribute, if it gives it one.
 *
 * Read defensively because only some variable types carry a `component` at
 * all, and a codebook is authored data: an attribute without one simply has no
 * preference for this field to start from.
 */
const codebookControl = (variable: unknown): unknown =>
  typeof variable === 'object' && variable !== null
    ? Reflect.get(variable, 'component')
    : undefined;

/**
 * One field of a form a network composer shows.
 *
 * Two decisions, in the order they have to be made: which attribute the answer
 * is recorded in, and which control the participant answers it with. The
 * second depends on the first — the protocol schema refuses a control that
 * cannot render the attribute's type, and refuses a field for an attribute no
 * control can render at all — so changing the attribute takes the control with
 * it rather than leaving a pairing that is rejected long after the researcher
 * has moved on.
 *
 * The control lives on the STAGE rather than on the codebook attribute, which
 * is the whole point of it: one attribute can be asked for with a slider here
 * and a number box somewhere else. What the attribute means, and how its
 * answers are validated, still belong to the codebook — and are reached from
 * here through the shared `AttributeCodebookControls`, because a researcher
 * who has just bound a field to a list of answers is already looking at the
 * place to author the list.
 *
 * The one affordance that surface offers and this row does NOT take is the
 * settings the chosen control accepts. Everywhere else those belong to the
 * codebook attribute, keyed to the `component` the codebook records for it;
 * here `component` and `parameters` are the composer FIELD's
 * (`ComposerFormFieldSchema`), so a date attribute may be a plain picker on
 * one form and a relative one on another. Written to the codebook they would
 * be authored against a control the codebook does not have, and the variable
 * schemas — split on `component` — refuse that pairing outright. So they are
 * asked for here instead, by `ComposerFieldParameters`, and saved with the
 * row.
 */
export function ComposerFormFieldEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useComposerFormSubject();
  const variables = useSubjectVariables(subject);
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable } = useFormValue([VARIABLE_FIELD] as const);
  const selected = asText(variable) ?? asText(item.variable);

  const savedOptions = useVariableOptions({
    subject,
    types: FORM_FIELD_VARIABLE_TYPES,
    // A form field collects its answer through the codebook's own rules, so it
    // may not take an attribute something else writes around them.
    writerClass: 'validated',
    ...(selected === undefined ? {} : { currentValue: selected }),
  });

  /**
   * And nothing THIS stage writes around those rules either.
   *
   * The role map behind `useVariableOptions` excludes the edited stage, so a
   * composer's own live grouping or position pick is invisible to it: the same
   * categorical attribute could be bound to the grouping tool and to a field of
   * this very form, and the stage saved with participant grouping writing
   * values that bypass the attribute's validation. Asked of the draft, because
   * that is where a pick made a moment ago is, and only for the form that
   * collects the STAGE's own subject — a connection form writes its edge type's
   * attributes, which nothing else on a composer touches.
   */
  const stageSubject = useStageSubject();
  const draftWriters = useComposerDraftWriters();
  const judgedAgainstTheStage =
    subject !== undefined &&
    stageSubject !== undefined &&
    subject.entity === stageSubject.entity &&
    (subject.entity === 'ego' ||
      ('type' in subject &&
        'type' in stageSubject &&
        subject.type === stageSubject.type));
  const options = useMemo(
    () =>
      judgedAgainstTheStage
        ? savedOptions.filter(
            (option) =>
              // The row's own pick is always offered back, whatever the filters
              // say: a picker that dropped its own value would blank the
              // control and write the blank over the reference the researcher
              // has to resolve.
              option.value === selected ||
              !draftWriters.unvalidated.has(option.value),
          )
        : savedOptions,
    [draftWriters, judgedAgainstTheStage, savedOptions, selected],
  );

  const variableType =
    selected === undefined ? undefined : variables[selected]?.type;
  const controls = useMemo(
    () => inputControlOptions(variableType, intl),
    [intl, variableType],
  );

  /**
   * The control follows the attribute.
   *
   * An observer effect rather than an `onChange` handler, because a caller's
   * `onChange` on a Fresco field REPLACES the store's own write rather than
   * running beside it. It deliberately does nothing on the first render: the
   * row arrives with a pairing that is already saved, and re-deciding it here
   * would rewrite a field nobody touched.
   */
  const seenVariable = useRef(selected);
  useEffect(() => {
    const previous = seenVariable.current;
    seenVariable.current = selected;
    if (previous === selected) return;
    const attribute = selected === undefined ? undefined : variables[selected];
    setFieldValue(
      COMPONENT_FIELD,
      defaultInputControl(attribute?.type, codebookControl(attribute)),
    );
  }, [selected, setFieldValue, variables]);

  return (
    <>
      <Field
        name={VARIABLE_FIELD}
        component={VariablePickerControl}
        label={intl.formatMessage(networkCanvasMessages.formFieldVariableLabel)}
        hint={intl.formatMessage(networkCanvasMessages.formFieldVariableHint)}
        initialValue={asText(item.variable)}
        options={options}
        emptyMessage={intl.formatMessage(
          networkCanvasMessages.formFieldVariableEmpty,
        )}
        required={intl.formatMessage(
          networkCanvasMessages.formFieldVariableRequired,
        )}
      />
      <Field
        name={COMPONENT_FIELD}
        component={NativeSelectField}
        label={intl.formatMessage(networkCanvasMessages.formFieldControlLabel)}
        hint={intl.formatMessage(networkCanvasMessages.formFieldControlHint)}
        placeholder={intl.formatMessage(
          networkCanvasMessages.formFieldControlPlaceholder,
        )}
        initialValue={asText(item.component)}
        options={controls}
        disabled={controls.length === 0}
        required={intl.formatMessage(
          networkCanvasMessages.formFieldControlRequired,
        )}
      />
      {/* No `inventingType`: this row's picker offers only attributes that
          already exist, so there is never one being created here to author the
          values of. `offerParameters` is off because this field keeps its own
          control and its own settings on the stage — see above. */}
      <AttributeCodebookControls
        subject={subject}
        committedVariable={item.variable}
        componentField={COMPONENT_FIELD}
        offerParameters={false}
      />
      <ComposerFieldParameters item={item} />
      <Field
        name={LABEL_FIELD}
        component={InputField}
        label={intl.formatMessage(networkCanvasMessages.formFieldQuestionLabel)}
        hint={intl.formatMessage(networkCanvasMessages.formFieldQuestionHint)}
        placeholder={intl.formatMessage(
          networkCanvasMessages.formFieldQuestionPlaceholder,
        )}
        initialValue={asText(item.label)}
      />
      <Field
        name={HINT_FIELD}
        component={InputField}
        label={intl.formatMessage(networkCanvasMessages.formFieldHelpLabel)}
        hint={intl.formatMessage(networkCanvasMessages.formFieldHelpHint)}
        placeholder={intl.formatMessage(
          networkCanvasMessages.formFieldHelpPlaceholder,
        )}
        initialValue={asText(item.hint)}
      />
      {/* The rules an answer is judged by are the codebook attribute's,
          whatever control this field asks for it with — so the same switch the
          shared form-fields section offers belongs here, on a property
          `ComposerFormFieldSchema` carries and the interview runtime honours
          (`selectors/forms.ts` hands it to every rendered field). Left
          unregistered, a researcher could neither switch it on for a new field
          nor change it on an imported one. */}
      <Field<typeof ToggleField>
        name={VALIDATION_HINTS_FIELD}
        component={ToggleField}
        label={intl.formatMessage(
          networkCanvasMessages.formFieldValidationHintsLabel,
        )}
        hint={intl.formatMessage(
          networkCanvasMessages.formFieldValidationHintsHint,
        )}
        inline
        initialValue={item.showValidationHints === true}
      />
    </>
  );
}

/** How one form field reads in the list when its dialog is closed. */
export function ComposerFormFieldPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const subject = useComposerFormSubject();
  const variables = useSubjectVariables(subject);
  const variableId = asText(item.variable);
  const attribute =
    variableId === undefined ? undefined : variables[variableId];
  const control = inputControlOptions(attribute?.type, intl).find(
    (option) => option.value === item.component,
  );

  return (
    <div className="flex flex-col gap-2.5">
      <span>
        {asText(item.label) ??
          attribute?.name ??
          intl.formatMessage(networkCanvasMessages.formFieldEmptyPreview)}
      </span>
      {(attribute !== undefined || control !== undefined) && (
        <div className="flex flex-wrap gap-2.5">
          {/* Whole sentences rather than assembled fragments: what reads
              naturally around an attribute's name is not the same in every
              language. */}
          {attribute !== undefined && (
            <Badge>
              {intl.formatMessage(
                networkCanvasMessages.formFieldRecordsAttribute,
                { attributeName: attribute.name },
              )}
            </Badge>
          )}
          {/* The control's own name, not a sentence built round it. */}
          {control !== undefined && <Badge>{control.label}</Badge>}
        </div>
      )}
    </div>
  );
}
