import { useEffect } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import {
  IntegerFieldControl,
  wholeNumberRule,
} from '../fields/IntegerField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';

/** Where every name generator holds its stage-wide nomination window. */
const MIN_FIELD = 'behaviours.minNodes';
const MAX_FIELD = 'behaviours.maxNodes';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.alterLimits.title',
    defaultMessage: 'Nomination limits',
    description:
      'Heading of the section capping how many people one step of an interview may name.',
  },
  description: {
    id: 'protocolBuilder.alterLimits.description',
    defaultMessage:
      'Limit how many people this stage may name, counted across the whole stage.',
    description:
      'Description of the nomination-limits section. A stage is one step of an interview, and it may ask several questions; the cap covers all of them together.',
  },
  minLabel: {
    id: 'protocolBuilder.alterLimits.minLabel',
    defaultMessage: 'Fewest people',
    description:
      'Label of the box holding the smallest number of people this step of the interview may name.',
  },
  minHint: {
    id: 'protocolBuilder.alterLimits.minHint',
    defaultMessage: 'Leave empty for no minimum.',
    description:
      'Guidance under the box holding the smallest number of people this step of the interview may name.',
  },
  maxLabel: {
    id: 'protocolBuilder.alterLimits.maxLabel',
    defaultMessage: 'Most people',
    description:
      'Label of the box holding the largest number of people this step of the interview may name.',
  },
  maxHint: {
    id: 'protocolBuilder.alterLimits.maxHint',
    defaultMessage: 'Leave empty for no maximum.',
    description:
      'Guidance under the box holding the largest number of people this step of the interview may name.',
  },
  maxPlaceholder: {
    id: 'protocolBuilder.alterLimits.maxPlaceholder',
    defaultMessage: 'No limit',
    description:
      'Placeholder shown in the empty maximum box, saying what an unanswered maximum means: the stage may name as many people as the participant wants to.',
  },
  wholeStageTitle: {
    id: 'protocolBuilder.alterLimits.wholeStageTitle',
    defaultMessage: 'These limits cover the whole stage',
    description:
      'Warning heading shown when the stage asks several questions, because the cap is counted across all of them rather than per question. A stage is one step of an interview.',
  },
  wholeStageDescription: {
    id: 'protocolBuilder.alterLimits.wholeStageDescription',
    defaultMessage:
      'This stage asks several questions, and the limits apply to all of them together rather than to each one. Consider splitting the questions across stages, or say in the questions themselves how many people you are asking for.',
    description:
      'Warning body shown when the stage asks several questions, naming the two ways a researcher can ask for a number per question instead. A stage is one step of an interview.',
  },
  noEndAnswered: {
    id: 'protocolBuilder.alterLimits.noEndAnswered',
    defaultMessage:
      'Set the fewest people, the most people, or both. Switch these limits off if this stage has no limit.',
    description:
      'Refusal shown against the minimum box when the researcher switched the nomination limits on and left both ends empty. Names the switch, because an unlimited stage is said by switching the section off rather than by leaving the boxes blank.',
  },
  minBelowZero: {
    id: 'protocolBuilder.alterLimits.minBelowZero',
    defaultMessage: 'The smallest a minimum can be is 0.',
    description:
      'Refusal shown against the minimum box when the researcher entered a negative number of people.',
  },
  minAboveMax: {
    id: 'protocolBuilder.alterLimits.minAboveMax',
    defaultMessage: 'The minimum cannot be more than the maximum.',
    description:
      'Refusal shown against the minimum box when it holds more people than the maximum beside it, which no stage could satisfy.',
  },
  maxIsZero: {
    id: 'protocolBuilder.alterLimits.maxIsZero',
    defaultMessage: 'A maximum of 0 would let the stage name nobody.',
    description:
      'Refusal shown against the maximum box when the researcher capped the stage at zero people, which leaves the stage nothing to do. A stage is one step of an interview.',
  },
  maxBelowMin: {
    id: 'protocolBuilder.alterLimits.maxBelowMin',
    defaultMessage: 'The maximum cannot be less than the minimum.',
    description:
      'Refusal shown against the maximum box when it holds fewer people than the minimum beside it, which no stage could satisfy.',
  },
  clearTitle: {
    id: 'protocolBuilder.alterLimits.clearTitle',
    defaultMessage: 'This will clear your nomination limits',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that caps how many people one stage of an interview may name.',
  },
  clearDescription: {
    id: 'protocolBuilder.alterLimits.clearDescription',
    defaultMessage:
      'This will clear the minimum and maximum number of people this stage may name. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching off the nomination limits discards both ends of the range. A stage is one step of an interview.',
  },
  clearConfirm: {
    id: 'protocolBuilder.alterLimits.clearConfirm',
    defaultMessage: 'Clear limits',
    description:
      'Action that confirms switching the nomination limits off and discarding them.',
  },
});

const LIMITS_CAPABILITY: SectionCapability = {
  fields: [MIN_FIELD, MAX_FIELD],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

const countAt = (values: Record<string, FieldValue>, key: string): number => {
  const behaviours = values.behaviours;
  if (typeof behaviours !== 'object' || behaviours === null) return Number.NaN;
  const value = Reflect.get(behaviours, key);
  return typeof value === 'number' ? value : Number.NaN;
};

const asCount = (value: unknown): number =>
  typeof value === 'number' ? value : Number.NaN;

/**
 * How long after the last keystroke the window's rules speak.
 *
 * These two controls say what they think as the researcher types rather than
 * waiting for a blur, because the commonest refusal here is about the text in
 * the box — `2.5` is not a count of people — and hearing that on the keystroke
 * that caused it is the only way it reads as being about that keystroke. Long
 * enough not to interrupt a number being typed, short enough to be part of
 * typing it. Nothing else says so: `Field` owns both the invalid state and the
 * message, and delivers them together into a region `aria-describedby` names.
 */
const REFUSAL_DELAY = 250;

/** Whether either end of the window is holding anything at all. */
const hasEitherEnd = (values: Record<string, FieldValue>): boolean => {
  const behaviours = values.behaviours;
  if (typeof behaviours !== 'object' || behaviours === null) return false;
  return ['minNodes', 'maxNodes'].some(
    (key) => Reflect.get(behaviours, key) !== undefined,
  );
};

/**
 * Switching a capability on is not answering it.
 *
 * Saving with both ends empty wrote a `behaviours` container holding two
 * absent keys onto a stage that had none — `{}` once it is serialised, which
 * is the empty container `BuilderSection`'s switch-off path exists to keep out
 * of the protocol. Absence is how the schema spells "no limit", and a
 * researcher who wants that has a switch that says it.
 *
 * Stated on the minimum alone, because it is the pair's rule rather than
 * either control's: shown against both it would say the same sentence twice,
 * and shown against neither there would be nothing for `focusFirstError` to
 * take the researcher to. The minimum is the first control in the section, so
 * that is where the refusal lands.
 */
const NO_END_ANSWERED = createMessageError(messages.noEndAnswered);

/**
 * The window has to be satisfiable, and the schema says so too — but it says
 * it as "maxNodes must be greater than or equal to minNodes" against a path,
 * after the researcher has moved on. Stated here it lands on the control that
 * holds the problem, and refuses the save before the schema is reached.
 *
 * Both rules read the OTHER value out of the form values they are handed
 * rather than out of a closure: a field's validation is memoised for the
 * field's lifetime, so a closed-over sibling would be pinned to whatever it
 * held on the first render.
 *
 * `wholeNumberRule` comes first in both, because a control holding text it
 * could not read as a count holds no count for anything below to compare — and
 * because it is the only thing standing between that text and a save.
 *
 * Every refusal here is encoded rather than formatted: a `MessageRule` hands
 * the form a plain string, and `FieldErrors` decodes it in the reader's own
 * language where it is shown. A module-level formatter reached for instead
 * would make these the only refusals in the section that stayed English.
 */
const minValidation = messageRuleValidation([
  wholeNumberRule,
  (_value, values) => (hasEitherEnd(values) ? undefined : NO_END_ANSWERED),
  (value, values) => {
    const min = asCount(value);
    if (Number.isNaN(min)) return undefined;
    if (min < 0) return createMessageError(messages.minBelowZero);
    const max = countAt(values, 'maxNodes');
    return Number.isNaN(max) || min <= max
      ? undefined
      : createMessageError(messages.minAboveMax);
  },
]);

const maxValidation = messageRuleValidation([
  wholeNumberRule,
  (value, values) => {
    const max = asCount(value);
    if (Number.isNaN(max)) return undefined;
    if (max < 1) return createMessageError(messages.maxIsZero);
    const min = countAt(values, 'minNodes');
    return Number.isNaN(min) || max >= min
      ? undefined
      : createMessageError(messages.maxBelowMin);
  },
]);

/**
 * How many people a name generator may name.
 *
 * Optional, like every capability: an unlimited stage is the norm, and
 * switching the limits off destroys them, which is why the switch asks first.
 *
 * The pair is one window rather than two independent numbers, so each control
 * judges itself against the other and the section refuses a window nothing
 * could satisfy.
 */
export default function AlterLimitsSection() {
  const intl = useAppIntl();
  const { storeApi } = useStageEditorForm();
  const min = useStageValue(MIN_FIELD);
  const max = useStageValue(MAX_FIELD);
  const prompts = useStageValue('prompts');
  const hasSeveralPrompts = Array.isArray(prompts) && prompts.length > 1;

  // Each control's rule reads the other's value, so a change to either one can
  // resolve — or create — the other's error. Field validation runs when a
  // field is touched and on submit, and neither covers a change made in the
  // sibling control, so an error would stand after the edit that fixed it.
  // Only re-run where an error is already showing: validating an untouched
  // empty control would write "required" nobody has earned.
  useEffect(() => {
    const state = storeApi.getState();
    for (const name of [MIN_FIELD, MAX_FIELD]) {
      if (state.getFieldErrors(name) === null) continue;
      void state.validateField(name);
    }
  }, [max, min, storeApi]);

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      capability={LIMITS_CAPABILITY}
    >
      {hasSeveralPrompts && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.wholeStageTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.wholeStageDescription)}
          </AlertDescription>
        </Alert>
      )}
      <ProtocolField<typeof IntegerFieldControl>
        name={MIN_FIELD}
        component={IntegerFieldControl}
        label={intl.formatMessage(messages.minLabel)}
        hint={intl.formatMessage(messages.minHint)}
        // A digit rather than a message: it is the number this box would hold,
        // and it reads the same in every language this package ships.
        placeholder="0"
        custom={minValidation}
        validateOnChange
        validateOnChangeDelay={REFUSAL_DELAY}
      />
      <ProtocolField<typeof IntegerFieldControl>
        name={MAX_FIELD}
        component={IntegerFieldControl}
        label={intl.formatMessage(messages.maxLabel)}
        hint={intl.formatMessage(messages.maxHint)}
        placeholder={intl.formatMessage(messages.maxPlaceholder)}
        custom={maxValidation}
        validateOnChange
        validateOnChangeDelay={REFUSAL_DELAY}
      />
    </BuilderSection>
  );
}
