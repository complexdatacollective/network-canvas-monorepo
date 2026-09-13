import { type ComponentType, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import DatePickerField from '@codaco/fresco-ui/form/fields/DatePicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

import {
  DAY_OFFSET_KEYS,
  dateResolutionOf,
  dateResolutionOptions,
  dayOffsetIssue,
  type ParameterIssues,
  type ParameterShape,
  readParameters,
} from '../variableParameters.ts';
import CoarseDateBound from './CoarseDateBound.tsx';

const messages = defineMessages({
  minLabelLabel: {
    id: 'protocolBuilder.variableParameters.minLabelLabel',
    defaultMessage: 'Minimum label',
    description:
      'Label of the field naming the low end of a sliding scale the participant answers on.',
  },
  minLabelHint: {
    id: 'protocolBuilder.variableParameters.minLabelHint',
    defaultMessage:
      'Shown at the low end of the scale, so the participant knows what the two ends mean.',
    description:
      'Guidance under the field naming the low end of a sliding scale.',
  },
  minLabelPlaceholder: {
    id: 'protocolBuilder.variableParameters.minLabelPlaceholder',
    defaultMessage: 'Not at all close',
    description:
      'Example wording shown in the empty field naming the low end of a sliding scale. An example a researcher might write about closeness between people, not a value that is stored.',
  },
  maxLabelLabel: {
    id: 'protocolBuilder.variableParameters.maxLabelLabel',
    defaultMessage: 'Maximum label',
    description:
      'Label of the field naming the high end of a sliding scale the participant answers on.',
  },
  maxLabelHint: {
    id: 'protocolBuilder.variableParameters.maxLabelHint',
    defaultMessage: 'Shown at the high end of the scale.',
    description:
      'Guidance under the field naming the high end of a sliding scale.',
  },
  maxLabelPlaceholder: {
    id: 'protocolBuilder.variableParameters.maxLabelPlaceholder',
    defaultMessage: 'Extremely close',
    description:
      'Example wording shown in the empty field naming the high end of a sliding scale. An example a researcher might write about closeness between people, not a value that is stored.',
  },
  anchorLabel: {
    id: 'protocolBuilder.variableParameters.anchorLabel',
    defaultMessage: 'Anchor date',
    description:
      'Label of the field holding the date a relative date picker measures its window from.',
  },
  anchorHint: {
    id: 'protocolBuilder.variableParameters.anchorHint',
    defaultMessage:
      'The date the window is measured from. Leave it empty to measure from the date of the interview.',
    description:
      'Guidance under the anchor-date field, saying what leaving it empty means.',
  },
  beforeLabel: {
    id: 'protocolBuilder.variableParameters.beforeLabel',
    defaultMessage: 'Days before',
    description:
      'Label of the field holding how many days before the anchor date a participant may choose.',
  },
  beforeHint: {
    id: 'protocolBuilder.variableParameters.beforeHint',
    defaultMessage:
      'How far back from the anchor the participant can choose. Left empty, {days, number} days.',
    description:
      'Guidance under the days-before field. days is the number of days the interview assumes when the researcher writes none.',
  },
  afterLabel: {
    id: 'protocolBuilder.variableParameters.afterLabel',
    defaultMessage: 'Days after',
    description:
      'Label of the field holding how many days after the anchor date a participant may choose.',
  },
  afterHint: {
    id: 'protocolBuilder.variableParameters.afterHint',
    defaultMessage:
      'How far forward from the anchor the participant can choose. Left empty, {days, number} days.',
    description:
      'Guidance under the days-after field. days is the number of days the interview assumes when the researcher writes none.',
  },
  resolutionLabel: {
    id: 'protocolBuilder.variableParameters.resolutionLabel',
    defaultMessage: 'Date resolution',
    description:
      'Label of the control choosing how precise a date this field collects.',
  },
  resolutionHint: {
    id: 'protocolBuilder.variableParameters.resolutionHint',
    defaultMessage:
      'How precise a date this field collects. Changing it clears the earliest and latest dates, because those are stored at the resolution chosen here.',
    description:
      'Guidance under the date-resolution control, warning that changing it throws the two bounds away.',
  },
  boundsCleared: {
    id: 'protocolBuilder.variableParameters.boundsCleared',
    defaultMessage:
      'The earliest and latest dates were cleared, because they were set at the previous resolution. Set them again if you still need them.',
    description:
      'Announcement made after the researcher changes how precise a date this field collects, which throws away the earliest and latest dates because they were stored at the old precision.',
  },
  minLabel: {
    id: 'protocolBuilder.variableParameters.minLabel',
    defaultMessage: 'Earliest date',
    description:
      'Label of the field holding the earliest date a participant may choose.',
  },
  minHint: {
    id: 'protocolBuilder.variableParameters.minHint',
    defaultMessage:
      'The earliest date the participant can choose. Left empty, the picker starts in 1920.',
    description:
      'Guidance under the earliest-date field, saying what leaving it empty means. 1920 is the year the date picker falls back to and is not a translated word.',
  },
  maxLabel: {
    id: 'protocolBuilder.variableParameters.maxLabel',
    defaultMessage: 'Latest date',
    description:
      'Label of the field holding the latest date a participant may choose.',
  },
  maxHint: {
    id: 'protocolBuilder.variableParameters.maxHint',
    defaultMessage:
      'The latest date the participant can choose. Left empty, the picker ends on the date of the interview.',
    description:
      'Guidance under the latest-date field, saying what leaving it empty means.',
  },
});

const DatePickerControl = DatePickerField as ComponentType<
  Record<string, unknown>
>;
// Cast like the three around it, and for the same reason: `UnconnectedField`'s
// component constraint erases the concrete prop shape. The two branches of
// `boundControl` below also have to agree on one component type.
const CoarseDateBoundControl = CoarseDateBound as ComponentType<
  Record<string, unknown>
>;
const InputControl = InputField as ComponentType<Record<string, unknown>>;
const SelectControl = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

export type VariableParameterFieldsProps = Readonly<{
  shape: ParameterShape;
  /** The block as the draft holds it, which may be anything until it saves. */
  parameters: unknown;
  /** Replaces one setting. `undefined` clears it. */
  onChange(key: string, value: unknown): void;
  issues: ParameterIssues;
  readOnly: boolean;
}>;

/**
 * The settings the chosen input control takes.
 *
 * Which settings those are is the control's business, not the attribute's —
 * see `parameterShapeFor` — so this renders one of three sets and nothing in
 * between. Each control writes a single key, and the editor around it decides
 * what reaches the protocol, so a set swapped out mid-edit leaves nothing of
 * the old one behind.
 *
 * The counterpart of Architect's `Parameters` and the three editors under it,
 * with one deliberate difference: there is no "use the interview date" switch
 * in front of the anchor. An absent anchor already MEANS the date of the
 * interview, so the switch was a second way of saying what an empty field says,
 * and a hidden piece of state that had to be kept in step with the field it
 * hid. The hint says it instead.
 */
export default function VariableParameterFields({
  shape,
  parameters,
  onChange,
  issues,
  readOnly,
}: VariableParameterFieldsProps) {
  const intl = useAppIntl();
  const held = readParameters(parameters);
  // Changing the resolution takes the two bounds away, which is right and must
  // not be silent: the hint says it will happen, and this says that it has.
  const [clearedBounds, setClearedBounds] = useState(false);
  // A day count is judged where it is written as well as at the save.
  //
  // The field carries what the researcher wrote — see `asDayOffset`, which
  // drops nothing it cannot store, so that a `1.5` is refused rather than read
  // as a decision to have no window. Saying so here is the other half of that:
  // the number input's own step and minimum refuse the same two values before
  // a submission reaches this package at all, in the browser's words about
  // "the two nearest valid values" rather than in this editor's about days —
  // so the sentence a researcher can act on has to be beside the field that
  // holds the value, not waiting on a save that may never arrive.
  //
  // `dayOffsetIssue` is the same rule `validateParameters` asks at the save,
  // asked of the same value, so the two cannot disagree.
  const errorsFor = (key: string): string[] => {
    const reported = [...(issues[key] ?? [])];
    if (!isDayOffset(key)) return reported;
    const issue = dayOffsetIssue(held[key]);
    if (issue === null || reported.includes(issue)) return reported;
    return [...reported, issue];
  };
  const fieldProps = (key: string) => {
    const errors = errorsFor(key);
    return {
      readOnly,
      errors,
      showErrors: errors.length > 0,
    };
  };

  if (shape === 'scalar') {
    return (
      <>
        <UnconnectedField
          name="parameter-min-label"
          label={intl.formatMessage(messages.minLabelLabel)}
          hint={intl.formatMessage(messages.minLabelHint)}
          component={InputControl}
          placeholder={intl.formatMessage(messages.minLabelPlaceholder)}
          value={asText(held.minLabel)}
          onChange={(value: unknown) => onChange('minLabel', value)}
          required
          {...fieldProps('minLabel')}
        />
        <UnconnectedField
          name="parameter-max-label"
          label={intl.formatMessage(messages.maxLabelLabel)}
          hint={intl.formatMessage(messages.maxLabelHint)}
          component={InputControl}
          placeholder={intl.formatMessage(messages.maxLabelPlaceholder)}
          value={asText(held.maxLabel)}
          onChange={(value: unknown) => onChange('maxLabel', value)}
          required
          {...fieldProps('maxLabel')}
        />
      </>
    );
  }

  if (shape === 'relativeDatePicker') {
    return (
      <>
        <UnconnectedField
          name="parameter-anchor"
          label={intl.formatMessage(messages.anchorLabel)}
          hint={intl.formatMessage(messages.anchorHint)}
          component={DatePickerControl}
          type="full"
          value={asText(held.anchor)}
          onChange={(value: unknown) =>
            onChange('anchor', emptyToUndefined(value))
          }
          {...fieldProps('anchor')}
        />
        <UnconnectedField
          name="parameter-before"
          label={intl.formatMessage(messages.beforeLabel)}
          hint={intl.formatMessage(messages.beforeHint, {
            days: RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
          })}
          component={InputControl}
          type="number"
          min={0}
          placeholder={String(RELATIVE_DATE_PICKER_DEFAULT_BEFORE)}
          value={asDayCount(held.before)}
          onChange={(value: unknown) => onChange('before', asDayOffset(value))}
          {...fieldProps('before')}
        />
        <UnconnectedField
          name="parameter-after"
          label={intl.formatMessage(messages.afterLabel)}
          hint={intl.formatMessage(messages.afterHint, {
            days: RELATIVE_DATE_PICKER_DEFAULT_AFTER,
          })}
          component={InputControl}
          type="number"
          min={0}
          placeholder={String(RELATIVE_DATE_PICKER_DEFAULT_AFTER)}
          value={asDayCount(held.after)}
          onChange={(value: unknown) => onChange('after', asDayOffset(value))}
          {...fieldProps('after')}
        />
      </>
    );
  }

  const resolution = dateResolutionOf(held);
  // Which control writes the two bounds, and what it needs to know.
  //
  // A full-resolution bound is a whole calendar date, and the native date
  // input writes one — unbounded, deliberately: it is the only control that
  // reaches the years 0001-0999, and handing it a window would take those
  // away. The coarse resolutions get `CoarseDateBound`, which is where the
  // reasoning for not offering a researcher a list of years lives.
  const boundControl =
    resolution === 'full'
      ? { component: DatePickerControl, type: resolution }
      : { component: CoarseDateBoundControl, resolution };

  return (
    <>
      <UnconnectedField
        name="parameter-resolution"
        label={intl.formatMessage(messages.resolutionLabel)}
        hint={intl.formatMessage(messages.resolutionHint)}
        component={SelectControl}
        options={dateResolutionOptions(intl)}
        value={resolution}
        onChange={(value: unknown) => {
          setClearedBounds(
            value !== resolution &&
              (asText(held.min) !== '' || asText(held.max) !== ''),
          );
          onChange('type', value);
        }}
        required
        {...fieldProps('type')}
      />
      {/* Always mounted, so a screen reader is watching this region before the
          notice appears: a live region added to the page at the same moment as
          its own content is not reliably announced.

          The `Alert` inside it is presentational for exactly that reason. Its
          `info` variant is a `role="status"` of its own — a second polite
          region, inserted into this one at the moment its content appears,
          which is the double (or, on some assistive technology, dropped)
          announcement this wrapper exists to avoid. The words are announced
          once, by the region that was already being watched, and the alert
          keeps the treatment a sighted reader recognises. */}
      <div role="status" aria-live="polite">
        {clearedBounds && (
          <Alert variant="info" role="presentation" className="my-7">
            <AlertDescription>
              {intl.formatMessage(messages.boundsCleared)}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <UnconnectedField
        name="parameter-min"
        label={intl.formatMessage(messages.minLabel)}
        hint={intl.formatMessage(messages.minHint)}
        {...boundControl}
        value={asText(held.min)}
        onChange={(value: unknown) => {
          setClearedBounds(false);
          onChange('min', emptyToUndefined(value));
        }}
        {...fieldProps('min')}
      />
      <UnconnectedField
        name="parameter-max"
        label={intl.formatMessage(messages.maxLabel)}
        hint={intl.formatMessage(messages.maxHint)}
        {...boundControl}
        value={asText(held.max)}
        onChange={(value: unknown) => {
          setClearedBounds(false);
          onChange('max', emptyToUndefined(value));
        }}
        {...fieldProps('max')}
      />
    </>
  );
}

/** Whether this setting is one of the two that count days. */
const isDayOffset = (key: string): key is (typeof DAY_OFFSET_KEYS)[number] =>
  DAY_OFFSET_KEYS.some((offset) => offset === key);

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** A number input reports its value as text, and holds nothing as `''`. */
const asDayCount = (value: unknown): string =>
  typeof value === 'number' ? String(value) : asText(value);

const emptyToUndefined = (value: unknown): unknown =>
  value === '' ? undefined : value;

/**
 * A day offset as the draft carries it, from what a number input reports.
 *
 * A whole number is stored as one, so the field never commits `"7"` where the
 * schema expects `7`. An emptied input clears the setting, because an absent
 * day count is a real answer: the window the interview uses when the protocol
 * declares none.
 *
 * Anything else is carried through AS TYPED, and that is the difference
 * between a refusal and a clearing. `1.5` is neither a window nor a decision
 * to have none, but dropped here it became the second: `validateParameters`
 * was handed an absent, perfectly valid setting, said nothing, and the save
 * went through — taking whatever bound the attribute already had with it, so
 * the interview fell back to its own default window and the researcher was
 * never told. Held as text it is what `daysNotWhole` is asked about, and the
 * save is refused with the bound still there to correct.
 */
const asDayOffset = (value: unknown): number | string | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
};
