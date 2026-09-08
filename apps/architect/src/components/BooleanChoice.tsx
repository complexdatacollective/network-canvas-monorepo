import {
  type IntlShape,
  createAppIntl,
  defineMessages,
} from '@codaco/app-i18n/messages';

const defaultIntl = createAppIntl({ locale: 'en' });
import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import type { OptionValue } from '~/components/Form/arrayFields/Option';

import ArchitectField from './Form/ArchitectField';
const utilityMessages = defineMessages({
  bothOptionLabelsAreRequired: {
    id: 'architect.utility.booleanChoice.bothOptionLabelsAreRequired',
    defaultMessage: 'Both option labels are required',
    description:
      'Researcher-facing explanatory text in components / BooleanChoice.',
  },
});
const messages = defineMessages({
  optionOne: {
    id: 'architect.booleanChoice.optionOne',
    defaultMessage: 'Option One',
    description: 'Visible text in components / BooleanChoice.',
  },
  thisOptionWillSetTheValue: {
    id: 'architect.booleanChoice.thisOptionWillSetTheValue',
    defaultMessage:
      'This option will set the value <strong>{value1}</strong> when selected.',
    description: 'Visible text in components / BooleanChoice.',
  },
  label: {
    id: 'architect.booleanChoice.label',
    defaultMessage: 'Label',
    description: 'The label text in components / BooleanChoice.',
  },
  styleOptionOneAsNegative: {
    id: 'architect.booleanChoice.styleOptionOneAsNegative',
    defaultMessage: 'Style Option One as negative',
    description: 'The label text in components / BooleanChoice.',
  },
  optionTwo: {
    id: 'architect.booleanChoice.optionTwo',
    defaultMessage: 'Option Two',
    description: 'Visible text in components / BooleanChoice.',
  },
  styleOptionTwoAsNegative: {
    id: 'architect.booleanChoice.styleOptionTwoAsNegative',
    defaultMessage: 'Style Option Two as negative',
    description: 'The label text in components / BooleanChoice.',
  },
  answerOptions: {
    id: 'architect.booleanChoice.answerOptions',
    defaultMessage: 'Answer options',
    description: 'The label text in components / BooleanChoice.',
  },
  theBooleanChoiceInputComponentAllowsYou: {
    id: 'architect.booleanChoice.theBooleanChoiceInputComponentAllowsYou',
    defaultMessage:
      'The BooleanChoice input component allows you to specify rich text labels for the two choices that your participant sees. Create a label for the first option, representing the value true, and the second option, representing the value false, below.',
    description: 'Visible text in components / BooleanChoice.',
  },
  eachValueCanAlsoBeStyled: {
    id: 'architect.booleanChoice.eachValueCanAlsoBeStyled',
    defaultMessage:
      'Each value can also be styled to indicate that it is negative. When enabled, this will make the option red when selected.',
    description: 'Visible text in components / BooleanChoice.',
  },
});

type BooleanOption = {
  label: string;
  value: boolean;
  negative?: boolean;
};

// Protocol-authored option defaults are stored data and stay in source English.
// The two options a new BooleanChoice starts from. The schema requires a
// `value` on every option (`booleanOptionsSchema` in
// `@codaco/protocol-validation`) but offers no editor for it, so these supply
// it. "Yes"/"No" match the historic mount-time default this replaces
// (`withBackgroundChangeHandler`'s sibling in this file, deleted with its HOC).
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
 * BooleanChoice owns rather than trusting the borrowed type: `label` and
 * `value` are kept when present, and `negative` is recovered from the raw
 * object since `OptionValue` has no field for it.
 *
 * The committed `value` is retained rather than reimposed by position because
 * the schema constrains neither the order of the two options nor which
 * boolean each carries: substituting the positional fallback would reverse
 * which boolean a label records on any protocol that stores them false-first,
 * silently rewriting what already-collected answers mean.
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
    value: typeof record?.value === 'boolean' ? record.value : fallback.value,
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

const bothOptionLabelsRequired = (
  value: unknown,
  intl: IntlShape = defaultIntl,
): string | undefined => {
  const options = Array.isArray(value) ? value : [];
  return options.length >= 2 && hasLabel(options[0]) && hasLabel(options[1])
    ? undefined
    : intl.formatMessage(utilityMessages.bothOptionLabelsAreRequired);
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
  const intl = useAppIntl();
  const [optionOne, optionTwo] = value;

  const updateOption = (index: 0 | 1, patch: Partial<BooleanOption>) => {
    const next: [BooleanOption, BooleanOption] = [...value];
    next[index] = { ...next[index], ...patch };
    onChange?.(next);
  };

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="bg-surface-3 text-surface-3-contrast rounded p-7 [&_h3]:mt-0">
        <Heading level="h3">{intl.formatMessage(messages.optionOne)}</Heading>
        {/*
          Each card states the boolean its option actually records rather than
          a fixed true/false, because the committed values are retained (see
          `toBooleanOption`) and a protocol may store them false-first.
        */}
        <Paragraph>
          {intl.formatMessage(messages.thisOptionWillSetTheValue, {
            value1: String(optionOne.value),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </Paragraph>
        <UnconnectedField
          name="options[0].label"
          component={RichText}
          label={intl.formatMessage(messages.label)}
          value={optionOne.label}
          onChange={(label) => updateOption(0, { label: label ?? '' })}
          disallowedTypes={['history', 'quote']}
        />
        <UnconnectedField
          name="options[0].negative"
          component={ToggleField}
          label={intl.formatMessage(messages.styleOptionOneAsNegative)}
          inline
          value={!!optionOne.negative}
          onChange={(negative) => updateOption(0, { negative: !!negative })}
        />
      </div>
      <div className="bg-surface-3 text-surface-3-contrast rounded p-7 [&_h3]:mt-0">
        <Heading level="h3">{intl.formatMessage(messages.optionTwo)}</Heading>
        <Paragraph>
          {intl.formatMessage(messages.thisOptionWillSetTheValue, {
            value1: String(optionTwo.value),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </Paragraph>
        <UnconnectedField
          name="options[1].label"
          component={RichText}
          label={intl.formatMessage(messages.label)}
          value={optionTwo.label}
          onChange={(label) => updateOption(1, { label: label ?? '' })}
          disallowedTypes={['history', 'quote']}
        />
        <UnconnectedField
          name="options[1].negative"
          component={ToggleField}
          label={intl.formatMessage(messages.styleOptionTwoAsNegative)}
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
  const intl = useAppIntl();
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
    <ArchitectField
      name="options"
      component={BooleanChoiceOptionsField}
      label={intl.formatMessage(messages.answerOptions)}
      hint={
        <>
          <Paragraph>
            {intl.formatMessage(
              messages.theBooleanChoiceInputComponentAllowsYou,
            )}
          </Paragraph>
          <Paragraph>
            {intl.formatMessage(messages.eachValueCanAlsoBeStyled)}
          </Paragraph>
        </>
      }
      initialValue={normalizedInitialValue}
      validation={{
        bothOptionLabelsRequired: (value: unknown) =>
          bothOptionLabelsRequired(value, intl),
      }}
    />
  );
};
export default BooleanChoice;
