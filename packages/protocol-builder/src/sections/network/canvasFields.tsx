import type { ComponentProps } from 'react';

import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

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

const LAYOUT_MODE_OPTIONS: RichSelectOption[] = [
  {
    value: MANUAL,
    label: 'Manual mode',
    description:
      'Places all nodes in a "bucket" at the bottom of the screen, from which the participant drags each one to where they want it.',
  },
  {
    value: AUTOMATIC,
    label: 'Automatic mode',
    description:
      'Positions nodes when the stage first opens by simulating physical forces such as attraction and repulsion. The participant can pause and resume the simulation, and reposition nodes by hand while it is paused.',
  },
];

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
  return (
    <RichSelectGroupField
      {...props}
      options={LAYOUT_MODE_OPTIONS}
      value={value === true ? AUTOMATIC : MANUAL}
      onChange={(next) => onChange?.(next === AUTOMATIC)}
    />
  );
}

const AUTOMATIC_LAYOUT_KEY = 'automaticLayout';

type BehavioursValue = Record<string, unknown>;

type AutomaticLayoutDefaultFieldProps = Omit<
  ComponentProps<typeof ToggleField>,
  'value' | 'onChange'
> &
  Readonly<{
    value?: BehavioursValue;
    onChange?: (value: BehavioursValue | undefined) => void;
  }>;

/**
 * Whether a network composer OPENS with automatic layout running.
 *
 * Bound to the whole `behaviours` object rather than to
 * `behaviours.automaticLayout`, which is the point of it. The form store
 * assembles a container out of the leaves registered inside it, so a leaf
 * field holding nothing still materialises `behaviours: {}` — and a stage that
 * arrived without the key would be saved carrying an empty one it never had.
 * Absence is how the schema spells "this stage does not do this", and a
 * researcher who touched nothing must not have a default written for them.
 *
 * Switching the toggle off REMOVES the key rather than writing `false`, for
 * the same reason: the two mean the same thing to the interview, and only one
 * of them is what an unconfigured stage looks like. Anything else the object
 * holds is carried through untouched, so a behaviour this control knows
 * nothing about survives being toggled past.
 */
export function AutomaticLayoutDefaultField({
  value,
  onChange,
  ...props
}: AutomaticLayoutDefaultFieldProps) {
  return (
    <ToggleField
      {...props}
      value={value?.[AUTOMATIC_LAYOUT_KEY] === true}
      onChange={(next) => {
        const behaviours: BehavioursValue = { ...value };
        if (next) behaviours[AUTOMATIC_LAYOUT_KEY] = true;
        else delete behaviours[AUTOMATIC_LAYOUT_KEY];
        onChange?.(
          Object.keys(behaviours).length === 0 ? undefined : behaviours,
        );
      }}
    />
  );
}
