import type { ComponentProps } from 'react';

import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';

export type DefaultChoiceFieldProps = Omit<
  ComponentProps<typeof RichSelectGroupField>,
  'value' | 'onChange' | 'defaultValue' | 'multiple'
> &
  Readonly<{
    /** What the stage holds, or nothing at all while the default is meant. */
    value?: string;
    /** `undefined` when the researcher chooses the default. */
    onChange?: (value: string | undefined) => void;
    /** The option that nothing stored means. It must be one of `options`. */
    defaultOption: string;
  }>;

/**
 * A choice between named options, one of which is what the protocol means by
 * saying nothing.
 *
 * For a setting whose default is spelled by the key not being there: a stage
 * with no `framing` uses everyday kinship words, and a nomination prompt with
 * no `onlyForSexAssignedAtBirth` is open to anyone. The default card is drawn
 * as chosen while nothing is stored — the absence IS the answer, and a control
 * showing no card chosen would ask the researcher to decide something the
 * protocol has already decided — and choosing it again removes the key rather
 * than writing the default, so a stage never records a decision nobody made.
 */
export default function DefaultChoiceField({
  value,
  onChange,
  defaultOption,
  ...props
}: DefaultChoiceFieldProps) {
  return (
    <RichSelectGroupField
      {...props}
      value={value ?? defaultOption}
      onChange={(next) => {
        if (typeof next !== 'string') return;
        onChange?.(next === defaultOption ? undefined : next);
      }}
    />
  );
}
