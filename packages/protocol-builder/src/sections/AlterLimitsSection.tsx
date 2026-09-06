import { useEffect } from 'react';

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
import { sectionMessages } from './sectionMessages.ts';

/** Where every name generator holds its stage-wide nomination window. */
const MIN_FIELD = 'behaviours.minNodes';
const MAX_FIELD = 'behaviours.maxNodes';

const LIMITS_CAPABILITY: SectionCapability = {
  fields: [MIN_FIELD, MAX_FIELD],
  confirmClear: {
    title: sectionMessages.alterLimitsClearTitle,
    description: sectionMessages.alterLimitsClearDescription,
    confirmLabel: sectionMessages.alterLimitsClearConfirm,
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
const NO_END_ANSWERED =
  'Set the fewest people, the most people, or both. Switch these limits off if this stage has no limit.';

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
 */
const minValidation = messageRuleValidation([
  wholeNumberRule,
  (_value, values) => (hasEitherEnd(values) ? undefined : NO_END_ANSWERED),
  (value, values) => {
    const min = asCount(value);
    if (Number.isNaN(min)) return undefined;
    if (min < 0) return 'The smallest a minimum can be is 0.';
    const max = countAt(values, 'maxNodes');
    return Number.isNaN(max) || min <= max
      ? undefined
      : 'The minimum cannot be more than the maximum.';
  },
]);

const maxValidation = messageRuleValidation([
  wholeNumberRule,
  (value, values) => {
    const max = asCount(value);
    if (Number.isNaN(max)) return undefined;
    if (max < 1) return 'A maximum of 0 would let the stage name nobody.';
    const min = countAt(values, 'minNodes');
    return Number.isNaN(min) || max >= min
      ? undefined
      : 'The maximum cannot be less than the minimum.';
  },
]);

/**
 * The words this section says, in English until it is localised — at which
 * point each comment below becomes the `description` a translator reads.
 *
 * Nothing overrides them: a `copy` prop is a string a host hands in, which
 * extraction never sees and a translator therefore never gets
 * (`__tests__/hostCopyOverrides.test.ts`).
 */
const words = {
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: 'Nomination limits',
  description:
    'Limit how many people this stage may name, counted across the whole stage.',
  minLabel: 'Fewest people',
  minHint: 'Leave empty for no minimum.',
  maxLabel: 'Most people',
  maxHint: 'Leave empty for no maximum.',
};

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
      title={words.sectionTitle}
      description={words.description}
      capability={LIMITS_CAPABILITY}
    >
      {hasSeveralPrompts && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>These limits cover the whole stage</AlertTitle>
          <AlertDescription>
            This stage asks several questions, and the limits apply to all of
            them together rather than to each one. Consider splitting the
            questions across stages, or say in the questions themselves how many
            people you are asking for.
          </AlertDescription>
        </Alert>
      )}
      <ProtocolField<typeof IntegerFieldControl>
        name={MIN_FIELD}
        component={IntegerFieldControl}
        label={words.minLabel}
        hint={words.minHint}
        placeholder="0"
        custom={minValidation}
        validateOnChange
        validateOnChangeDelay={REFUSAL_DELAY}
      />
      <ProtocolField<typeof IntegerFieldControl>
        name={MAX_FIELD}
        component={IntegerFieldControl}
        label={words.maxLabel}
        hint={words.maxHint}
        placeholder="No limit"
        custom={maxValidation}
        validateOnChange
        validateOnChangeDelay={REFUSAL_DELAY}
      />
    </BuilderSection>
  );
}
