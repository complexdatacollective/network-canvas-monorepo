import { useEffect, useMemo, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';

import { variableValuesMessages } from '../codebook/codebookMessages.ts';
import {
  heldBooleanAnswersReason,
  optionsShapeFor,
  readHeldBooleanAnswers,
} from '../codebook/variableOptions.ts';
import {
  buildInterfaceOwnedOptionMap,
  lockedVariableOptions,
  variableRoleKey,
} from '../codebook/variableRoles.ts';
import BooleanAnswersField from '../fields/BooleanAnswersField.tsx';
import type { OptionValue } from '../form/arrayFields/Option.tsx';
import Options, { optionsValidation } from '../form/arrayFields/Options.tsx';
import RevealWhenChosen from '../form/RevealWhenChosen.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  variablesForSubject,
  type CodebookSubject,
} from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import LockedOptions from './LockedOptions.tsx';

/**
 * Where a row keeps the answers it is authoring until its own save writes them
 * to the codebook.
 *
 * Underscored like `_component` beside it: working state of the dialog rather
 * than part of the row, so a section mounting this has to drop it before the
 * row reaches the protocol — `normalizeFormField` does, and the prompt
 * sections' `beforeSave` does.
 */
export const ATTRIBUTE_OPTIONS_FIELD = '_options';

/**
 * The draft key for one of several attributes a single row binds.
 *
 * A categorical bin prompt binds two — the bins and the typed follow-up — in
 * one dialog, so the list each is authoring needs a key of its own or the two
 * controls would register as one field.
 */
export const attributeOptionsFieldFor = (slotName: string): string =>
  `${ATTRIBUTE_OPTIONS_FIELD}_${slotName}`;

/**
 * The attribute's stored list, for seeding whichever control edits it.
 *
 * Both controls hold the protocol's own `options` array; neither cares what
 * the entries look like beyond being records, and a list the protocol holds
 * has already been through the schema. So the only question asked here is
 * whether there is a list at all.
 */
const isOptionList = (value: unknown): value is OptionValue[] =>
  Array.isArray(value);

/**
 * Puts the newly bound attribute's own answers into the draft, whenever the
 * row is pointed at a different attribute.
 *
 * The control is keyed on the attribute, so a change of binding re-mounts it —
 * but every binding registers the SAME field name, and fresco-ui parks a value
 * when a field unregisters and prefers that parked value to a fresh
 * `initialValue`. So the re-mounted control came back holding the previous
 * attribute's list, and the row's save wrote those answers onto the attribute
 * the researcher had just chosen. Across shapes it was worse: a choice list
 * passes straight through the shape reading, so three choice options went onto
 * a yes-or-no attribute.
 *
 * Written through the store rather than left to the field, for the reason
 * `useControlThatFollowsTheAttribute` writes the input control the same way:
 * the field is not mounted for every binding — an attribute that holds no list
 * renders nothing here at all — and a value parked for a control that is gone
 * has to be replaced where it is parked.
 *
 * The first render records the binding and writes nothing: the field has just
 * registered from the same seed, and a write there would mark a row dirty that
 * nobody has touched.
 */
export function useDraftThatFollowsTheAttribute(
  draftField: string,
  binding: string,
  seeded: unknown,
  known: boolean,
): void {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const shown = useRef(binding);

  useEffect(() => {
    if (shown.current === binding) return;
    // The row names an attribute this client has not been told about yet — a
    // create that has landed on the host and whose revision is still on its
    // way. Seeding from a codebook that does not hold it would clear the list
    // the researcher has just written; the binding is left unrecorded so the
    // seed happens when the attribute arrives.
    if (!known) return;
    shown.current = binding;
    // `undefined` for an attribute that holds no list, which clears the park
    // as well as the control: absence is what "this attribute offers no
    // answers" is spelled as everywhere else here.
    setFieldValue(draftField, seeded as never);
  }, [binding, known, draftField, seeded, setFieldValue]);
}

export type AttributeValueFieldsProps = Readonly<{
  subject: CodebookSubject | undefined;
  /** The attribute the row binds now, as the picker holds it. */
  variableId: string | undefined;
  /**
   * The control the ROW has chosen, where the row is what writes it. A boolean
   * moved to a toggle holds no answers at all, so which list the attribute has
   * is decided by whichever control the codebook will end up recording.
   *
   * Omitted by a caller whose control lives on the stage: the codebook's own
   * control is then the only one its schema is keyed on.
   */
  rowComponent?: unknown;
  /** Where the row keeps the draft list. Defaults to `_options`. */
  optionsField?: string;
  /**
   * The kind of answer this row is INVENTING, while it is inventing one.
   *
   * There is no codebook record to seed from yet, so the answers start empty
   * and the row's own create writes them.
   */
  invented?: string;
  revealWhenChosenIn?: string;
}>;

/**
 * The answers the attribute a row binds offers, edited where the question is
 * asked.
 *
 * Architect edited these inline at every surface that binds a categorical, an
 * ordinal or a boolean attribute — the form-field row's "Choice values" and
 * "Boolean values" sections, the bin prompts' "Attribute options", the
 * tie-strength prompt's response options — and wrote them in the row's own
 * save. They belong to the codebook attribute, which is why the write is a
 * codebook write under that section's own lock; but where the researcher
 * types them is beside the question, because the values ARE what the question
 * offers and a dialog over a dialog is a second place to look for them.
 *
 * A list an interface owns is shown rather than offered: the interface that
 * both writes the attribute and branches on its exact values owns that list,
 * and so is a read-only attribute's.
 *
 * Nothing at all for an attribute that holds no list — a text answer, a
 * number, a date — which is most of them.
 */
export default function AttributeValueFields({
  subject,
  variableId,
  rowComponent,
  optionsField = ATTRIBUTE_OPTIONS_FIELD,
  invented,
  revealWhenChosenIn,
}: AttributeValueFieldsProps) {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const protocolContext = useProtocolContext();

  const variables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );
  const picked =
    variableId === undefined || variableId === ''
      ? undefined
      : variables[variableId];

  // What this row is asking about, and the codebook's own answer for it. An
  // attribute being INVENTED is its own binding: there is no record to seed
  // from, so its answers start empty — and moving from one to the other is a
  // change of question like any other.
  const heldSeed =
    picked === undefined ? undefined : Reflect.get(picked, 'options');
  const inventedShape =
    invented === undefined
      ? undefined
      : optionsShapeFor(invented, rowComponent);
  useDraftThatFollowsTheAttribute(
    optionsField,
    inventedShape === undefined
      ? `attribute:${variableId ?? ''}`
      : `invented:${inventedShape}`,
    invented === undefined && isOptionList(heldSeed) ? heldSeed : undefined,
    invented !== undefined ||
      variableId === undefined ||
      variableId === '' ||
      picked !== undefined,
  );

  const locked = useMemo(
    () =>
      subject === undefined || variableId === undefined || variableId === ''
        ? undefined
        : lockedVariableOptions(
            variables,
            variableId,
            buildInterfaceOwnedOptionMap(protocolContext)[
              variableRoleKey(subject, variableId)
            ],
          ),
    [protocolContext, subject, variableId, variables],
  );

  // An attribute being invented: its answers, on the same terms as an
  // attribute that exists.
  if (inventedShape !== undefined) {
    if (inventedShape === 'choice') {
      return (
        <RevealWhenChosen chosenIn={revealWhenChosenIn} revealKey="choice">
          <Section
            title={intl.formatMessage(variableValuesMessages.optionsLegend)}
            description={intl.formatMessage(variableValuesMessages.optionsHint)}
          >
            <Field<typeof Options>
              name={optionsField}
              component={Options}
              label={intl.formatMessage(variableValuesMessages.optionsLegend)}
              labelHidden
              addButtonLabel={intl.formatMessage(
                variableValuesMessages.addOption,
              )}
              readOnly={readOnly}
              {...optionsValidation}
            />
          </Section>
        </RevealWhenChosen>
      );
    }
    return inventedShape === 'boolean' ? (
      <RevealWhenChosen chosenIn={revealWhenChosenIn} revealKey="boolean">
        <Section
          title={intl.formatMessage(variableValuesMessages.answersLegend)}
          description={intl.formatMessage(variableValuesMessages.answersHint)}
        >
          <Field<typeof BooleanAnswersField>
            name={optionsField}
            component={BooleanAnswersField}
            label={intl.formatMessage(variableValuesMessages.answersLegend)}
            labelHidden
            readOnly={readOnly}
          />
        </Section>
      </RevealWhenChosen>
    ) : null;
  }

  if (picked === undefined || variableId === undefined) return null;

  // The row's control where the row is what records it, the codebook's
  // otherwise.
  const decidingComponent =
    rowComponent === undefined
      ? Reflect.get(picked, 'component')
      : rowComponent;
  const shape = optionsShapeFor(picked.type, decidingComponent);
  const heldOptions = Reflect.get(picked, 'options');
  if (shape === null) return null;

  // Under the same heading either way: what the section is about is the
  // answers this attribute offers, and whether they are the researcher's to
  // change is a fact about this attribute rather than a different subject.
  if (locked !== undefined) {
    return (
      <RevealWhenChosen chosenIn={revealWhenChosenIn} revealKey="locked">
        <Section
          title={intl.formatMessage(variableValuesMessages.optionsLegend)}
          description={intl.formatMessage(variableValuesMessages.optionsHint)}
        >
          <LockedOptions options={locked} />
        </Section>
      </RevealWhenChosen>
    );
  }

  // Keyed on the attribute, so the list on screen is seeded from the one the
  // row binds NOW rather than from the one it bound when the dialog opened.
  if (shape === 'choice') {
    return (
      <RevealWhenChosen chosenIn={revealWhenChosenIn} revealKey="choice">
        <Section
          title={intl.formatMessage(variableValuesMessages.optionsLegend)}
          description={intl.formatMessage(variableValuesMessages.optionsHint)}
        >
          <Field<typeof Options>
            key={variableId}
            name={optionsField}
            component={Options}
            // The section above carries the visible heading, so the control's own
            // name is said only to a screen reader — which still needs one, and
            // read aloud it would otherwise repeat the heading immediately above.
            label={intl.formatMessage(variableValuesMessages.optionsLegend)}
            labelHidden
            addButtonLabel={intl.formatMessage(
              variableValuesMessages.addOption,
            )}
            initialValue={isOptionList(heldOptions) ? heldOptions : undefined}
            readOnly={readOnly}
            {...optionsValidation}
          />
        </Section>
      </RevealWhenChosen>
    );
  }

  // A pair this control cannot show — one answer, or four, or two recording
  // the same boolean — is shown rather than edited, as the codebook's own
  // editor shows it: drawn as the pair, one would gain a second answer the
  // researcher never wrote and four would lose two.
  if (heldBooleanAnswersReason(heldOptions) !== null) {
    return (
      <RevealWhenChosen chosenIn={revealWhenChosenIn} revealKey="heldBoolean">
        <Section
          title={intl.formatMessage(variableValuesMessages.answersLegend)}
          description={intl.formatMessage(variableValuesMessages.answersHint)}
        >
          <LockedOptions
            options={readHeldBooleanAnswers(heldOptions).map((answer) => ({
              label: answer.label,
              value: String(answer.value),
            }))}
          />
        </Section>
      </RevealWhenChosen>
    );
  }

  return (
    <RevealWhenChosen chosenIn={revealWhenChosenIn} revealKey="boolean">
      <Section
        title={intl.formatMessage(variableValuesMessages.answersLegend)}
        description={intl.formatMessage(variableValuesMessages.answersHint)}
      >
        <Field<typeof BooleanAnswersField>
          key={variableId}
          name={optionsField}
          component={BooleanAnswersField}
          label={intl.formatMessage(variableValuesMessages.answersLegend)}
          labelHidden
          initialValue={isOptionList(heldOptions) ? heldOptions : undefined}
          readOnly={readOnly}
        />
      </Section>
    </RevealWhenChosen>
  );
}
