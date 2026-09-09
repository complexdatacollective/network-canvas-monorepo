import { type ComponentProps, useRef } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
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
 * What a confirmed choice the list no longer offers is called.
 *
 * Named for what happened rather than for what was chosen: this control moves
 * whatever its caller offers — a stage, a template, a preset — so there is no
 * noun it could put in the sentence that would be right for all of them, and
 * assembling one out of a caller's word would be a sentence no translator ever
 * sees whole.
 */
const messages = defineMessages({
  choiceGoneTitle: {
    id: 'protocolBuilder.confirmingSelect.choiceGoneTitle',
    defaultMessage: 'That choice is no longer available',
    description:
      'Title of the message shown when a researcher confirms a change that costs the stage something, and the option they picked stopped being one this control offers while the question was open — a collaborator deleted or moved what it named. The change is refused.',
  },
  choiceGone: {
    id: 'protocolBuilder.confirmingSelect.choiceGone',
    defaultMessage:
      'What you chose is no longer one of the options here, so nothing has changed. Choose again.',
    description:
      'Body of the message refusing a confirmed change whose chosen option is no longer offered. Addressed to the researcher authoring the protocol, and it says what did NOT happen: the change was not applied and nothing the stage was carrying was thrown away.',
  },
});

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
 *
 * And ANSWERED on the list as it stands when the answer is given. The question
 * is awaited, so what resumes is a closure from the render that put it, and
 * what it holds is an option out of that render's list — while a collaborator
 * can delete, re-type or move the thing that option named. Applied anyway, the
 * change costs the researcher everything the question warned about and leaves
 * the stage pointing at something it may not use; the control's own latest
 * render has already stopped offering it. The same recheck
 * `useConfirmEntityTypeChange` runs against the live codebook, and
 * `EntitySelectControl` against its live refusal.
 */
export default function ConfirmingSelectField({
  confirmChange,
  onChange,
  ...props
}: ConfirmingSelectFieldProps) {
  const askAboutChange = useConfirmEntityTypeChange();
  const intl = useAppIntl();
  const { openDialog } = useDialog();

  /**
   * What a confirmed choice is judged against, kept live.
   *
   * A ref rather than the render's own props, for the reason the recheck
   * exists at all: the handler that resumes when the question is answered is a
   * closure from the render that asked it.
   */
  const offered = useRef({
    options: props.options,
    disabled: props.disabled,
    readOnly: props.readOnly,
  });
  offered.current = {
    options: props.options,
    disabled: props.disabled,
    readOnly: props.readOnly,
  };

  const stillOffered = (next: unknown): boolean => {
    const { options, disabled, readOnly } = offered.current;
    if (disabled === true || readOnly === true) return false;
    return options.some(
      (option) => option.disabled !== true && Object.is(option.value, next),
    );
  };

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
          if (!(await askAboutChange(question, null))) return;
          if (stillOffered(next)) {
            onChange?.(next);
            return;
          }
          void openDialog({
            type: 'acknowledge',
            intent: 'warning',
            title: intl.formatMessage(messages.choiceGoneTitle),
            description: intl.formatMessage(messages.choiceGone),
            actions: {
              primary: {
                label: intl.formatMessage(commonMessages.continue),
                value: true,
              },
            },
          });
        })();
      }}
    />
  );
}
