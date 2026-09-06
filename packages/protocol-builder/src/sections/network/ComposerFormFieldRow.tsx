import { useEffect, useMemo, useRef } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import AttributeCodebookControls from '../AttributeCodebookControls.tsx';
import type { RowEditorProps, RowPreviewProps } from '../rowRenderers.tsx';
import { useSubjectVariables, useVariableOptions } from './codebookOptions.ts';
import ComposerFieldParameters from './ComposerFieldParameters.tsx';
import {
  defaultInputControl,
  FORM_FIELD_VARIABLE_TYPES,
  inputControlOptions,
} from './composerFormComponents.ts';
import { useComposerFormSubject } from './composerFormSubject.ts';
import { asText } from './rowValues.ts';

const VARIABLE_FIELD = 'variable';
const COMPONENT_FIELD = 'component';
const LABEL_FIELD = 'label';
const HINT_FIELD = 'hint';

const NO_ATTRIBUTES_MESSAGE =
  'This type has no attributes a form can collect yet. Create one in the codebook to continue.';

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
  const subject = useComposerFormSubject();
  const variables = useSubjectVariables(subject);
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable } = useFormValue([VARIABLE_FIELD] as const);
  const selected = asText(variable) ?? asText(item.variable);

  const options = useVariableOptions({
    subject,
    types: FORM_FIELD_VARIABLE_TYPES,
    // A form field collects its answer through the codebook's own rules, so it
    // may not take an attribute something else writes around them.
    writerClass: 'validated',
    ...(selected === undefined ? {} : { currentValue: selected }),
  });

  const variableType =
    selected === undefined ? undefined : variables[selected]?.type;
  const controls = useMemo(
    () => inputControlOptions(variableType),
    [variableType],
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
        label="Attribute"
        hint="The attribute each answer is recorded in. Only attributes a form can collect are listed: a position or a location is written by the canvas, not answered."
        initialValue={asText(item.variable)}
        options={options}
        emptyMessage={NO_ATTRIBUTES_MESSAGE}
        required="Choose the attribute this field records."
      />
      <Field
        name={COMPONENT_FIELD}
        component={NativeSelectField}
        label="Input control"
        hint="How the participant answers. Only controls that can render this attribute are listed."
        placeholder="Select an input control..."
        initialValue={asText(item.component)}
        options={controls}
        disabled={controls.length === 0}
        required="Choose how the participant answers this field."
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
        label="Question"
        hint="What the participant is asked. Leave it empty to use the attribute's own name."
        placeholder="Enter your question..."
        initialValue={asText(item.label)}
      />
      <Field
        name={HINT_FIELD}
        component={InputField}
        label="Help text"
        hint="Shown under the question, for anything the participant might need explained. Optional."
        placeholder="Enter help text..."
        initialValue={asText(item.hint)}
      />
    </>
  );
}

/** How one form field reads in the list when its dialog is closed. */
export function ComposerFormFieldPreview({ item }: RowPreviewProps) {
  const subject = useComposerFormSubject();
  const variables = useSubjectVariables(subject);
  const variableId = asText(item.variable);
  const attribute =
    variableId === undefined ? undefined : variables[variableId];
  const control = inputControlOptions(attribute?.type).find(
    (option) => option.value === item.component,
  );

  return (
    <div className="flex flex-col gap-2.5">
      <span>{asText(item.label) ?? attribute?.name ?? 'Empty field'}</span>
      {(attribute !== undefined || control !== undefined) && (
        <div className="flex flex-wrap gap-2.5">
          {/* Whole sentences rather than assembled fragments: what reads
              naturally around an attribute's name is not the same in every
              language. */}
          {attribute !== undefined && (
            <Badge>{`Records the attribute "${attribute.name}"`}</Badge>
          )}
          {/* The control's own name, not a sentence built round it. */}
          {control !== undefined && <Badge>{control.label}</Badge>}
        </div>
      )}
    </div>
  );
}
