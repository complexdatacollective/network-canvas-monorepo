import { type ComponentProps, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';

import { networkCanvasMessages } from './networkCanvasMessages.ts';

/**
 * The small bridges between what the protocol schema stores and what a control
 * speaks.
 *
 * The Fresco form store has no `format`/`parse` seam, so a stage value that is
 * a number, a boolean or an absent list has to be translated at the field
 * itself. Each of these is that translation and nothing else: no labelling, no
 * layout, no knowledge of which stage it is on.
 */

type IntegerFieldProps = Omit<
  ComponentProps<typeof InputField>,
  'value' | 'onChange' | 'type'
> &
  Readonly<{
    value?: number;
    onChange?: (value: number | undefined) => void;
  }>;

/**
 * A whole number.
 *
 * `InputField` always hands back the raw typed string, and `"4"` is not a
 * value the stage schema accepts where it wants a count. A field cleared to
 * nothing reports `undefined` rather than `NaN` or `0`, because an empty box
 * is an unanswered question, not an answer of none.
 */
export function IntegerField({ value, onChange, ...props }: IntegerFieldProps) {
  return (
    <InputField
      {...props}
      type="number"
      value={value === undefined ? '' : String(value)}
      onChange={(raw) => {
        const parsed =
          typeof raw === 'string' && raw.trim() !== ''
            ? Number.parseInt(raw, 10)
            : Number.NaN;
        onChange?.(Number.isNaN(parsed) ? undefined : parsed);
      }}
    />
  );
}

type OptionalCheckboxGroupFieldProps = Omit<
  ComponentProps<typeof CheckboxGroupField>,
  'value' | 'onChange'
> &
  Readonly<{
    value?: (string | number)[];
    onChange?: (value: (string | number)[] | undefined) => void;
  }>;

/**
 * A set of choices where choosing none means the key is not there.
 *
 * The protocol schema has one spelling for "this stage does not do this": the
 * key is absent. An empty list is something else — a configured capability
 * with nothing in it — and the canvas schemas refuse several of them outright
 * (`edges` with an empty `display` and no `create` "has no effect"). Reporting
 * `undefined` rather than `[]` is what lets the row normaliser drop the key
 * instead of saving a shape the schema will reject against a path.
 */
export function OptionalCheckboxGroupField({
  value,
  onChange,
  ...props
}: OptionalCheckboxGroupFieldProps) {
  return (
    <CheckboxGroupField
      {...props}
      value={value ?? []}
      onChange={(next) =>
        onChange?.(next === undefined || next.length === 0 ? undefined : next)
      }
    />
  );
}

const MANUAL = 'manual';
const AUTOMATIC = 'automatic';

type LayoutModeFieldProps = Omit<
  ComponentProps<typeof RichSelectGroupField>,
  'value' | 'onChange' | 'options'
> &
  Readonly<{
    value?: boolean;
    onChange?: (value: boolean) => void;
  }>;

/**
 * How the stage arranges nodes when it opens.
 *
 * Stored as a boolean, chosen as one of two named modes: "automatic layout is
 * off" is not something a researcher recognises as a decision, while "manual
 * mode" is, and each card can then say what the participant will actually see.
 */
export function LayoutModeField({
  value,
  onChange,
  ...props
}: LayoutModeFieldProps) {
  const intl = useAppIntl();
  // Held for as long as the reader's language does not change: a control's
  // options are a memo dependency wherever one of these fields is composed,
  // and a fresh array every render is a fresh registration.
  const options = useMemo<RichSelectOption[]>(
    () => [
      {
        value: MANUAL,
        label: intl.formatMessage(networkCanvasMessages.layoutModeManualLabel),
        description: intl.formatMessage(
          networkCanvasMessages.layoutModeManualDescription,
        ),
      },
      {
        value: AUTOMATIC,
        label: intl.formatMessage(
          networkCanvasMessages.layoutModeAutomaticLabel,
        ),
        description: intl.formatMessage(
          networkCanvasMessages.layoutModeAutomaticDescription,
        ),
      },
    ],
    [intl],
  );

  return (
    <RichSelectGroupField
      {...props}
      options={options}
      value={value === true ? AUTOMATIC : MANUAL}
      onChange={(next) => onChange?.(next === AUTOMATIC)}
    />
  );
}
