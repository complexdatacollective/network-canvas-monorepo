import type { ComponentProps } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';

import { canvasMessages } from './canvasMessages.ts';

type OptionalTickListProps = Omit<
  ComponentProps<typeof CheckboxGroupField>,
  'value' | 'onChange'
> &
  Readonly<{
    value?: (string | number)[];
    onChange?: (value: (string | number)[] | undefined) => void;
  }>;

/**
 * A set of choices where ticking none means the key is not there.
 *
 * The protocol schema has one spelling for "this stage does not do this": the
 * key is absent. An empty list is something else — a configured capability
 * holding nothing — and the canvas schemas refuse several of them outright
 * (`edges` with an empty `display` and no `create` "has no effect"). Reporting
 * `undefined` rather than `[]` is what lets the row's normaliser drop the key
 * instead of saving a shape the schema will reject against a path.
 */
export default function OptionalTickList({
  value,
  onChange,
  ...props
}: OptionalTickListProps) {
  const intl = useAppIntl();

  // A fieldset with no boxes in it is a control that looks broken: the
  // researcher reads a label, a hint and then nothing, with no way to tell
  // whether the stage offers nothing or the editor failed to draw it.
  // Architect disabled the whole section instead; this says why, which the
  // three lists that can be empty — a sociogram prompt's edge types, a
  // narrative preset's edge types and its highlight attributes — all need.
  if (props.options.length === 0) {
    return (
      <p
        id={props.id}
        aria-describedby={props['aria-describedby']}
        className="w-full py-6 text-center text-sm text-current/70 italic"
      >
        {intl.formatMessage(canvasMessages.tickListEmptyState)}
      </p>
    );
  }

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
