import { useMemo } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { OptionValue } from '~/components/Form/arrayFields/Option';
import RichText from '~/components/Form/Fields/RichText/Field';

import ArchitectField from './Form/ArchitectField';

type BooleanOption = {
  label: string;
  value: boolean;
  negative?: boolean;
};

// The `value` of each option is fixed by its position (true/false) and never
// user-edited, but the schema requires it (`booleanOptionsSchema` in
// `@codaco/protocol-validation`). "Yes"/"No" match the historic mount-time
// default this replaces (`withBackgroundChangeHandler`'s sibling in this
// file, deleted with its HOC).
const DEFAULT_OPTIONS: [BooleanOption, BooleanOption] = [
  { label: 'Yes', value: true },
  { label: 'No', value: false, negative: true },
];

/**
 * The committed `options` array arrives typed as the shared `OptionValue`
 * (`{label, value: string | number}`) — the Categorical/Ordinal shape every
 * options editor uses — because callers source it through the same
 * `item.options` prop those editors read. A Boolean's `options` are actually
 * `{label, value: boolean, negative?}`, so this re-derives the two entries
 * BooleanChoice owns rather than trusting the borrowed type: `value` is
 * always fixed by position (never read from committed data), `label` is kept
 * when present, and `negative` is recovered from the raw object since
 * `OptionValue` has no field for it.
 */
const toBooleanOption = (
  option: OptionValue | undefined,
  fallback: BooleanOption,
): BooleanOption => {
  // `option`'s declared type (`OptionValue`, the Categorical/Ordinal shape)
  // does not carry `negative` at all — see the doc comment above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const record = option as Partial<BooleanOption> | undefined;
  return {
    label: typeof record?.label === 'string' ? record.label : fallback.label,
    value: fallback.value,
    ...(typeof record?.negative === 'boolean'
      ? { negative: record.negative }
      : {}),
  };
};

const normalizeInitialOptions = (
  value: OptionValue[] | undefined,
): [BooleanOption, BooleanOption] =>
  Array.isArray(value) && value.length >= 2
    ? [
        toBooleanOption(value[0], DEFAULT_OPTIONS[0]),
        toBooleanOption(value[1], DEFAULT_OPTIONS[1]),
      ]
    : DEFAULT_OPTIONS;

const hasLabel = (option: unknown): boolean => {
  if (typeof option !== 'object' || option === null) return false;
  // Validating an `unknown` candidate against a shape narrower than its
  // declared type is exactly what a type guard does.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const label = (option as { label?: unknown }).label;
  return typeof label === 'string' && label.trim().length > 0;
};

const bothOptionLabelsRequired = (value: unknown): string | undefined => {
  const options = Array.isArray(value) ? value : [];
  return options.length >= 2 && hasLabel(options[0]) && hasLabel(options[1])
    ? undefined
    : 'Both option labels are required';
};

/**
 * The whole pair is one opaque field value (matching how every other array in
 * this migration is treated): a Field named `options[0].value`/`[1].value`
 * would never be user-editable, but the schema still requires it on every
 * row, and fresco-ui forms have no whole-form initial values to smuggle a
 * fixed sibling key past unless it goes through a Field of its own. Keeping
 * `label`/`negative` as sub-controls of ONE `options` field (rather than
 * separately-registered `options[0].label` etc. fields, as before) is what
 * lets `updateOption` preserve `value` on every edit.
 */
function BooleanChoiceOptionsField({
  value = DEFAULT_OPTIONS,
  onChange,
}: {
  value?: [BooleanOption, BooleanOption];
  onChange?: (value: [BooleanOption, BooleanOption]) => void;
}) {
  const [optionOne, optionTwo] = value;

  const updateOption = (index: 0 | 1, patch: Partial<BooleanOption>) => {
    const next: [BooleanOption, BooleanOption] = [...value];
    next[index] = { ...next[index], ...patch };
    onChange?.(next);
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="bg-surface-3 text-surface-3-contrast rounded p-7 [&_h3]:mt-0">
        <Heading level="h3">Option One</Heading>
        <Paragraph>
          This option will set the value <strong>true</strong> when selected.
        </Paragraph>
        <UnconnectedField
          name="options[0].label"
          component={RichText}
          label="Label"
          value={optionOne.label}
          onChange={(label) => updateOption(0, { label: label ?? '' })}
          disallowedTypes={['history', 'quote']}
        />
        <UnconnectedField
          name="options[0].negative"
          component={ToggleField}
          label="Style Option One as negative"
          inline
          value={!!optionOne.negative}
          onChange={(negative) => updateOption(0, { negative: !!negative })}
        />
      </div>
      <div className="bg-surface-3 text-surface-3-contrast rounded p-7 [&_h3]:mt-0">
        <Heading level="h3">Option Two</Heading>
        <Paragraph>
          This option will set the value <strong>false</strong> when selected.
        </Paragraph>
        <UnconnectedField
          name="options[1].label"
          component={RichText}
          label="Label"
          value={optionTwo.label}
          onChange={(label) => updateOption(1, { label: label ?? '' })}
          disallowedTypes={['history', 'quote']}
        />
        <UnconnectedField
          name="options[1].negative"
          component={ToggleField}
          label="Style Option Two as negative"
          inline
          value={!!optionTwo.negative}
          onChange={(negative) => updateOption(1, { negative: !!negative })}
        />
      </div>
    </div>
  );
}

type BooleanChoiceProps = {
  /**
   * The committed `options` array, for the field's `initialValue`. Rendered
   * inside whichever dialog is editing the field (the field editor or the
   * composer attribute editor), so — like `PromptText` — it cannot resolve
   * its own initial value from stage context and the caller threads it
   * through from its own `item` (`asOptions(item.options)`, the same helper
   * every other options editor uses — see `normalizeInitialOptions` above for
   * why its type is wider than what a Boolean's options actually hold).
   */
  initialValue?: OptionValue[];
};

/**
 * Lets a researcher author the rich-text Yes/No labels a `BooleanChoice`
 * component shows a participant, and optionally mark one as the "negative"
 * (destructively-styled) choice.
 */
const BooleanChoice = ({ initialValue }: BooleanChoiceProps) => {
  // `initialValue` is a register-effect dependency (`useField`'s registration
  // effect), so the normalized value must hold a stable reference across
  // renders whenever the input is unchanged — recomputing a fresh array
  // inline would re-register the field on every render.
  const normalizedInitialValue = useMemo(
    () => normalizeInitialOptions(initialValue),
    // `initialValue` is compared by reference deliberately: callers already
    // hold their own array reference stable (`asOptions`'s shared empty-array
    // constant, or the row's own committed value).
    [initialValue],
  );

  return (
    <div>
      <Paragraph>
        The BooleanChoice input component allows you to specify rich text labels
        for the two choices that your participant sees. Create a label for the
        first option, representing the value true, and the second option,
        representing the value false, below.
      </Paragraph>
      <Paragraph>
        Each value can also be styled to indicate that it is negative. When
        enabled, this will make the option red when selected.
      </Paragraph>
      <ArchitectField
        name="options"
        component={BooleanChoiceOptionsField}
        label="Answer options"
        labelHidden
        initialValue={normalizedInitialValue}
        validation={{ bothOptionLabelsRequired }}
      />
    </div>
  );
};
export default BooleanChoice;
