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

/** Where every name generator holds its stage-wide nomination window. */
const MIN_FIELD = 'behaviours.minNodes';
const MAX_FIELD = 'behaviours.maxNodes';

const LIMITS_CAPABILITY: SectionCapability = {
  fields: [MIN_FIELD, MAX_FIELD],
  confirmClear: {
    title: 'This will clear your nomination limits',
    description:
      'This will clear the minimum and maximum number of people this stage may name. Do you want to continue?',
    confirmLabel: 'Clear limits',
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

export type AlterLimitsCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  minLabel: string;
  minHint: string;
  maxLabel: string;
  maxHint: string;
}>;

const DEFAULT_COPY: AlterLimitsCopy = {
  sectionTitle: 'Nomination limits',
  description:
    'Limit how many people this stage may name, counted across the whole stage.',
  minLabel: 'Fewest people',
  minHint: 'Leave empty for no minimum.',
  maxLabel: 'Most people',
  maxHint: 'Leave empty for no maximum.',
};

export type AlterLimitsSectionProps = Readonly<{
  copy?: Partial<AlterLimitsCopy>;
}>;

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
export default function AlterLimitsSection({
  copy,
}: AlterLimitsSectionProps = {}) {
  const words = { ...DEFAULT_COPY, ...copy };
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
      />
      <ProtocolField<typeof IntegerFieldControl>
        name={MAX_FIELD}
        component={IntegerFieldControl}
        label={words.maxLabel}
        hint={words.maxHint}
        placeholder="No limit"
        custom={maxValidation}
      />
    </BuilderSection>
  );
}
