import { useRef } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';

import { narrativePedigreeMessages } from '../editors/narrative-pedigree/sections/narrativePedigreeMessages.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';

/**
 * One pedigree on offer, in the shape the native select reads.
 *
 * Declared here rather than imported: fresco-ui publishes the select but not
 * its option type, and a stored choice this control can no longer offer is
 * still listed — disabled — so the caller has to be able to say so.
 */
export type SourcePedigreeOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

/**
 * What the researcher is asked before a change that costs them something.
 *
 * Descriptors rather than the sentences they make, formatted where they are
 * rendered: a string held across the await would outlive its formatter, and a
 * language changed under an open question would leave it in the language it
 * was asked in.
 */
export type SourceChangeQuestion = Readonly<{
  title: MessageDescriptor;
  description: MessageDescriptor;
  confirmLabel: MessageDescriptor;
}>;

export type SourcePedigreePickerFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    /** The pedigrees on offer, plus any stored choice that is not one. */
    options: readonly SourcePedigreeOption[];
    /**
     * What to ask before a choice that costs this stage its diseases, or
     * `undefined` to let the choice through without asking.
     *
     * A function, because it is asked at the moment of the change: the answer
     * depends on what the stage is carrying, and a control re-rendering on
     * every keystroke to keep that current is one re-rendering for a question
     * nobody has asked yet. The same contract `EntityTypePickerField` takes.
     */
    confirmChange?: () => SourceChangeQuestion | undefined;
  }
>;

/**
 * Which family this stage draws, held back until the researcher has agreed to
 * what changing it costs.
 *
 * Every disease mapping names an attribute of the source pedigree's node type,
 * so a different source invalidates all of them at once and the section
 * discards them. An option in a listbox is one click and the discard cannot be
 * taken back by choosing the old pedigree again, so the question is asked
 * HERE, before the value moves, rather than by whatever watches it afterwards:
 * a watcher would have to put the select back, and would be asking about a
 * change the researcher can already see on screen.
 *
 * Asked whatever the select currently shows. "Nothing has been chosen yet" is
 * not the same as "there is nothing to lose": a disease mapped before the
 * source was picked is thrown away by that first choice exactly as by a later
 * one, and a guard keyed on the current value would let that one through in
 * silence. `confirmChange` is where the loss is judged, and it already answers
 * with nothing to ask when there is nothing to lose.
 *
 * And ANSWERED on the list as it stands when the answer is given. The question
 * is awaited, so what resumes is a closure from the render that put it, holding
 * an option out of that render's list — while a collaborator can delete,
 * re-type or move the stage that option named. Applied anyway, the change
 * would cost the researcher every disease the question warned about and leave
 * the stage reading a pedigree it may not read. The same recheck
 * `useConfirmEntityTypeChange` runs against the live codebook.
 */
export default function SourcePedigreePickerField({
  id,
  name,
  value,
  options,
  placeholder,
  confirmChange,
  onChange,
  onBlur,
  onFocus,
  className,
  disabled = false,
  readOnly: readOnlyProp = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: SourcePedigreePickerFieldProps & Readonly<{ placeholder?: string }>) {
  const intl = useAppIntl();
  const { confirm, openDialog } = useDialog();
  const { readOnly: sessionReadOnly } = useStageEditorForm();
  const readOnly = readOnlyProp || sessionReadOnly;

  /**
   * What a confirmed choice is judged against, kept live.
   *
   * A ref rather than the render's own props, for the reason the recheck
   * exists at all: the handler that resumes when the question is answered is a
   * closure from the render that asked it. Whether the control accepts input
   * at all is read the same way — a section can withdraw its list, and the
   * stage can be taken away, while the question stands.
   */
  const offered = useRef({ options, disabled, readOnly });
  offered.current = { options, disabled, readOnly };

  const stillOffered = (next: string): boolean => {
    const live = offered.current;
    if (live.disabled || live.readOnly) return false;
    return live.options.some(
      (option) => option.disabled !== true && option.value === next,
    );
  };

  const select = (next: string) => {
    const question = confirmChange?.();
    if (question === undefined) {
      onChange?.(next);
      return;
    }
    void (async () => {
      const confirmed = await confirm({
        title: intl.formatMessage(question.title),
        description: intl.formatMessage(question.description),
        confirmLabel: intl.formatMessage(question.confirmLabel),
        cancelLabel: intl.formatMessage(commonMessages.cancel),
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed !== true) return;
      if (stillOffered(next)) {
        onChange?.(next);
        return;
      }
      // Said rather than swallowed, and it says what did NOT happen: the
      // researcher agreed to lose their diseases, and they still have them.
      void openDialog({
        type: 'acknowledge',
        intent: 'warning',
        title: intl.formatMessage(narrativePedigreeMessages.sourceGoneTitle),
        description: intl.formatMessage(narrativePedigreeMessages.sourceGone),
        actions: {
          primary: {
            label: intl.formatMessage(commonMessages.continue),
            value: true,
          },
        },
      });
    })();
  };

  return (
    <div
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      className={className}
    >
      <NativeSelectField
        id={id}
        name={name}
        options={[...options]}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(next) => select(String(next))}
        disabled={disabled}
        readOnly={readOnly}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
      />
    </div>
  );
}
