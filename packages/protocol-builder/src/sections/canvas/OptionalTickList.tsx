import type { ComponentProps } from 'react';

import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';

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
