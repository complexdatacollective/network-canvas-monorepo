import { useMemo } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  BooleanSyntheticSchema,
  CategoricalSyntheticSchema,
  DatetimeSyntheticSchema,
  inferTextGenerator,
  NumberSyntheticSchema,
  OrdinalSyntheticSchema,
  ScalarSyntheticSchema,
  SYNTHETIC_TEXT_GENERATORS,
  TextSyntheticSchema,
  type SyntheticSelectionCount,
  type VariableType,
} from '@codaco/protocol-validation';
import { DistributionVisual } from '~/components/Synthetic/DistributionVisual';
import { formatProbability } from '~/components/Synthetic/summaries';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import { SyntheticSection } from '~/components/Synthetic/SyntheticSection';
import type { NumericWindow } from '~/components/Synthetic/useNumericDraft';

import {
  admissibleSelectionCounts,
  summariseResolvedSynthetic,
  TEXT_GENERATOR_LABELS,
} from './draft';
import { DistributionEditor } from './fields/DistributionEditor';
import { InlineOptionWeights } from './fields/InlineOptionWeights';
import { SelectionCountTable } from './fields/SelectionCountTable';
import {
  missingProbabilityDisabledReason,
  selectionCountDisabledReason,
} from './impliedRules';
import {
  describeFieldWindow,
  describeNestedWindow,
} from './schemaIntrospection';
import { useVariableSynthetic } from './VariableSyntheticProvider';

/**
 * The one sub-editor every surface uses to author a codebook variable's
 * synthetic parameters (spec, "Codebook TypeEditor section").
 *
 * Which controls appear is decided by the variable's TYPE, and each control's
 * window is read out of that type's own schema — so a bound narrowed in
 * `@codaco/protocol-validation` narrows the control without anything here
 * changing. Controls an interface-implied rule has made meaningless render
 * disabled beside the whole sentence that says which rule, and which stage,
 * made them so.
 */

/** The term this feature uses everywhere it appears (spec governing rule 6). */
export const SYNTHETIC_SECTION_TITLE = 'Synthetic data';

/**
 * The schema behind each variable type's synthetic block. Layout and location
 * carry none: generation produces deterministic positions for both, and their
 * variable schemas accept no `synthetic` key at all.
 */
const SYNTHETIC_SCHEMA_BY_TYPE = {
  boolean: BooleanSyntheticSchema,
  categorical: CategoricalSyntheticSchema,
  datetime: DatetimeSyntheticSchema,
  layout: undefined,
  location: undefined,
  number: NumberSyntheticSchema,
  ordinal: OrdinalSyntheticSchema,
  scalar: ScalarSyntheticSchema,
  text: TextSyntheticSchema,
} satisfies Record<VariableType, unknown>;

const FALLBACK_WINDOW: NumericWindow = {
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

/**
 * Missingness and the chance of true are the same probability the schema
 * declares on every block that carries them, so both windows are read from one
 * of those blocks rather than restated per type.
 */
const PROBABILITY_WINDOW: NumericWindow =
  describeFieldWindow(BooleanSyntheticSchema, ['missingProbability']) ??
  FALLBACK_WINDOW;

const RELATIVE_BEFORE_WINDOW: NumericWindow =
  describeNestedWindow(DatetimeSyntheticSchema, 'uniform', [
    'relative',
    'before',
  ]) ?? FALLBACK_WINDOW;

const RELATIVE_AFTER_WINDOW: NumericWindow =
  describeNestedWindow(DatetimeSyntheticSchema, 'uniform', [
    'relative',
    'after',
  ]) ?? FALLBACK_WINDOW;

const TEXT_GENERATOR_DEFAULT_VALUE = '';

const readNumber = (
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
};

const readRelative = (
  synthetic: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  const relative = synthetic?.relative;
  return typeof relative === 'object' && relative !== null
    ? (relative as Record<string, unknown>)
    : undefined;
};

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function MissingProbabilityField() {
  const { namePrefix, synthetic, resolved, rules, implied, propose } =
    useVariableSynthetic();
  const reason = missingProbabilityDisabledReason(
    rules.required === true,
    implied.alwaysAnsweredBy,
  );
  const resolvedMissing = resolved?.missingProbability ?? 0;

  return (
    <SyntheticNumberField
      name={`${namePrefix}.missingProbability`}
      label="Chance of no answer"
      hint={
        reason ??
        `Leave this empty to use the default (${formatProbability(resolvedMissing)}).`
      }
      value={readNumber(synthetic, 'missingProbability')}
      window={PROBABILITY_WINDOW}
      clearable
      disabled={reason !== undefined}
      onCommit={(value) => propose({ ...synthetic, missingProbability: value })}
    />
  );
}

function BooleanControls() {
  const { namePrefix, synthetic, resolved, propose } = useVariableSynthetic();
  const resolvedTrue =
    resolved?.type === 'boolean' ? resolved.probabilityTrue : undefined;

  return (
    <SyntheticNumberField
      name={`${namePrefix}.probabilityTrue`}
      label="Chance of answering yes"
      hint={
        resolvedTrue === undefined
          ? undefined
          : `Leave this empty to use the default (${formatProbability(resolvedTrue)}).`
      }
      value={readNumber(synthetic, 'probabilityTrue')}
      window={PROBABILITY_WINDOW}
      clearable
      onCommit={(value) => propose({ ...synthetic, probabilityTrue: value })}
    />
  );
}

function TextControls() {
  const { namePrefix, variable, synthetic, propose } = useVariableSynthetic();
  const inferred = inferTextGenerator(variable.name ?? '');
  const declared =
    typeof synthetic?.generator === 'string'
      ? synthetic.generator
      : TEXT_GENERATOR_DEFAULT_VALUE;

  const options = useMemo(
    () => [
      {
        value: TEXT_GENERATOR_DEFAULT_VALUE,
        label: `Use the default (${TEXT_GENERATOR_LABELS[inferred]})`,
      },
      ...SYNTHETIC_TEXT_GENERATORS.map((generator) => ({
        value: generator,
        label: TEXT_GENERATOR_LABELS[generator],
      })),
    ],
    [inferred],
  );

  return (
    <UnconnectedField
      name={`${namePrefix}.generator`}
      label="What the generated text looks like"
      component={NativeSelectField}
      options={options}
      value={declared}
      onChange={(next: string | number | undefined) => {
        const generator = String(next ?? TEXT_GENERATOR_DEFAULT_VALUE);
        propose({
          ...synthetic,
          generator:
            generator === TEXT_GENERATOR_DEFAULT_VALUE ? undefined : generator,
        });
      }}
    />
  );
}

function OptionWeightControls() {
  const { variable, optionWeightsHost } = useVariableSynthetic();
  const options = useMemo(
    () =>
      (variable.options ?? []).map((option) => ({
        value: option.value,
        ...(option.label === undefined ? {} : { label: option.label }),
      })),
    [variable.options],
  );

  if (optionWeightsHost === 'inline') {
    return <InlineOptionWeights options={options} />;
  }

  return (
    <p className="text-text/70 mb-7 text-sm">
      Each option now carries a weight in the options list for this attribute.
      Weights are relative: an option left empty is drawn as often as the
      others.
    </p>
  );
}

function SelectionCountControls() {
  const { namePrefix, variable, rules, implied, resolved, synthetic, propose } =
    useVariableSynthetic();

  const allowedCounts = useMemo(
    () => admissibleSelectionCounts(variable, rules),
    [variable, rules],
  );
  const soleCount = allowedCounts.length === 1 ? allowedCounts[0] : undefined;
  const reason = selectionCountDisabledReason(
    soleCount,
    implied.selectionPinnedBy,
  );

  if (resolved?.type !== 'categorical') return null;

  // A single-choice list has nothing to distribute, and neither has a variable
  // with no options yet.
  if (reason !== undefined || allowedCounts.length === 0) {
    return (
      <div className="mb-7">
        <p className="mb-1 font-semibold">How many options are chosen</p>
        <p className="text-text/70 text-sm">
          {reason ??
            'This attribute has no options yet, so there is nothing to choose between.'}
        </p>
      </div>
    );
  }

  const declared =
    typeof synthetic?.selectionCount === 'object' &&
    synthetic.selectionCount !== null
      ? (synthetic.selectionCount as SyntheticSelectionCount)
      : undefined;

  return (
    <SelectionCountTable
      namePrefix={`${namePrefix}.selectionCount`}
      label="How many options are chosen"
      allowedCounts={allowedCounts}
      table={declared}
      resolved={resolved.selectionCount}
      onChange={(next) => propose({ ...synthetic, selectionCount: next })}
    />
  );
}

function DatetimeControls() {
  const { namePrefix, synthetic, isAdmissible, propose } =
    useVariableSynthetic();
  const relative = readRelative(synthetic);
  const family =
    typeof synthetic?.distribution === 'string'
      ? synthetic.distribution
      : 'uniform';

  // Asked of the schema rather than derived from the input control: a variable
  // whose own field already collects within a session-relative window has no
  // place for a second one, and the schema is what says so.
  const relativeIsAdmissible = isAdmissible({
    ...synthetic,
    distribution: family,
    relative: { before: 1, after: 0 },
  });

  if (!relativeIsAdmissible) {
    return (
      <div className="mb-7">
        <p className="mb-1 font-semibold">How far back dates reach</p>
        <p className="text-text/70 text-sm">
          Not available — this attribute’s own input control already fixes the
          range its dates fall in.
        </p>
      </div>
    );
  }

  const commit = (key: 'before' | 'after', value: number | undefined) => {
    const nextRelative = { ...relative, [key]: value };
    const before = readNumber(nextRelative, 'before');
    const after = readNumber(nextRelative, 'after');
    if (before === undefined && after === undefined) {
      propose({ ...synthetic, distribution: family, relative: undefined });
      return;
    }
    propose({
      ...synthetic,
      distribution: family,
      // Both offsets are stated together: the schema's window is an offset in
      // each direction, and an unstated one is no offset at all.
      relative: { before: before ?? 0, after: after ?? 0 },
    });
  };

  return (
    <>
      <SyntheticNumberField
        name={`${namePrefix}.relative.before`}
        label="Days before the interview date"
        hint="How far back generated dates may reach from the day the interview runs."
        value={readNumber(relative, 'before')}
        window={RELATIVE_BEFORE_WINDOW}
        clearable
        onCommit={(value) => commit('before', value)}
      />
      <SyntheticNumberField
        name={`${namePrefix}.relative.after`}
        label="Days after the interview date"
        hint="How far forward generated dates may reach from the day the interview runs."
        value={readNumber(relative, 'after')}
        window={RELATIVE_AFTER_WINDOW}
        clearable
        onCommit={(value) => commit('after', value)}
      />
    </>
  );
}

function DistributionControls({ schema }: { schema: unknown }) {
  const {
    namePrefix,
    synthetic,
    valueWindow,
    resolved,
    isAdmissible,
    propose,
  } = useVariableSynthetic();

  return (
    <>
      <DistributionEditor
        schema={schema}
        namePrefix={namePrefix}
        label="How values are spread"
        synthetic={synthetic}
        valueWindow={valueWindow}
        isAdmissible={isAdmissible}
        onChange={propose}
      />
      {(resolved?.type === 'number' || resolved?.type === 'scalar') && (
        <DistributionVisual distribution={resolved} window={valueWindow} />
      )}
    </>
  );
}

function SyntheticControls() {
  const { variable } = useVariableSynthetic();
  const schema = SYNTHETIC_SCHEMA_BY_TYPE[variable.type];

  switch (variable.type) {
    case 'number':
    case 'scalar':
      return (
        <>
          <DistributionControls schema={schema} />
          <MissingProbabilityField />
        </>
      );
    case 'boolean':
      return (
        <>
          <BooleanControls />
          <MissingProbabilityField />
        </>
      );
    case 'text':
      return (
        <>
          <TextControls />
          <MissingProbabilityField />
        </>
      );
    case 'ordinal':
      return (
        <>
          <OptionWeightControls />
          <MissingProbabilityField />
        </>
      );
    case 'categorical':
      return (
        <>
          <OptionWeightControls />
          <SelectionCountControls />
          <MissingProbabilityField />
        </>
      );
    case 'datetime':
      return (
        <>
          <DatetimeControls />
          <MissingProbabilityField />
        </>
      );
    case 'layout':
    case 'location':
      return null;
  }
}

export type VariableSyntheticSectionProps = {
  /** Overrides the section title where a surface needs to name the variable. */
  title?: string;
};

export function VariableSyntheticSection({
  title = SYNTHETIC_SECTION_TITLE,
}: VariableSyntheticSectionProps = {}) {
  const { variable, resolved, valueWindow, authored, open, setOpen, propose } =
    useVariableSynthetic();

  // Layout and location variables have no synthetic block to author, so they
  // get no section rather than an empty one.
  if (SYNTHETIC_SCHEMA_BY_TYPE[variable.type] === undefined) return null;

  return (
    <SyntheticSection
      title={title}
      summary={summariseResolvedSynthetic(resolved, valueWindow)}
      authored={authored}
      onReset={() => propose(undefined)}
      open={open}
      onOpenChange={setOpen}
    >
      <SyntheticControls />
    </SyntheticSection>
  );
}
