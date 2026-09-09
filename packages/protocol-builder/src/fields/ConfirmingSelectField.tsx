import type { ComponentProps } from 'react';

import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';

import {
  type EntityTypeChangeConfirmation,
  useConfirmEntityTypeChange,
} from './EntitySelectField.tsx';

export type ConfirmingSelectFieldProps = ComponentProps<
  typeof StyledSelectField
> &
  Readonly<{
    /**
     * What to ask before a choice that costs the stage what it is carrying, or
     * `undefined` to let the choice through without asking.
     *
     * A function, because it is asked at the moment of the change: the answer
     * depends on what the stage is carrying, and a control re-rendering on
     * every keystroke to keep it current is one re-rendering for a question
     * nobody has asked yet. The same contract `EntitySelectControl` takes.
     */
    confirmChange?: () => EntityTypeChangeConfirmation | undefined;
  }>;

/**
 * A select whose choice is held back until the researcher has agreed to what
 * it costs.
 *
 * The chip picker (`EntitySelectControl`) already asks this question, through
 * `useConfirmEntityTypeChange`, and a select that asked it differently — or
 * that asked it AFTER the value had moved — would be a second answer to the
 * same question. So this is the same seam behind the other control the package
 * offers: `confirmChange` decides whether there is anything to ask, and the
 * shared hook asks it.
 *
 * Asked HERE, before the value moves, rather than by whatever watches it
 * afterwards: a watcher would have to put the select back, and would be asking
 * about a change the researcher can already see on screen.
 *
 * Asked whatever the select currently shows. "Nothing has been chosen yet" is
 * not the same as "there is nothing to lose": values entered before the first
 * choice are thrown away by that choice exactly as by a later one, and a guard
 * keyed on the current value would let that one through in silence.
 * `confirmChange` is where the loss is judged, and it already answers with
 * nothing to ask when there is nothing to lose.
 */
export default function ConfirmingSelectField({
  confirmChange,
  onChange,
  ...props
}: ConfirmingSelectFieldProps) {
  const askAboutChange = useConfirmEntityTypeChange();

  return (
    <StyledSelectField
      {...props}
      onChange={(next) => {
        const question = confirmChange?.();
        if (question === undefined) {
          onChange?.(next);
          return;
        }
        void (async () => {
          // No codebook type to recheck the answer against: what this select
          // moves is a stage id, not a node or edge type. Said explicitly
          // because the shared hook makes every caller say it — one that DOES
          // land on a type cannot leave the recheck off by omission.
          if (await askAboutChange(question, null)) onChange?.(next);
        })();
      }}
    />
  );
}
