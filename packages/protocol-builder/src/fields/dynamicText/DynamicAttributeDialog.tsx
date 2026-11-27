import { useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { createDynamicAttributeId } from '@codaco/protocol-validation';

import {
  DynamicAttributeControls,
  type DraftProblems,
  draftProblems,
  hasDraftProblems,
} from './DynamicAttributeControls.tsx';
import {
  type DynamicAttributeDraft,
  draftWithEveryVersionIn,
  newDraft,
} from './dynamicAttributeDraft.ts';
import { writeDynamicAttribute } from './dynamicAttributeWrites.ts';
import { useDynamicTextEnvironment } from './editorEnvironment.ts';
import { firstAvailableLogicOption } from './logicOptions.ts';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.dynamicAttribute.createTitle',
    defaultMessage: 'Create a dynamic attribute',
    description:
      'Title of the dialog where a researcher creates a dynamic attribute: a word or phrase in a sentence that reads differently in different cases, such as “his”, “her” or “their”.',
  },
  description: {
    id: 'protocolBuilder.dynamicAttribute.createDescription',
    defaultMessage:
      'A dynamic attribute is a word or phrase that changes during the interview. Choose how the version to show is decided, then write each version.',
    description:
      'Explanation at the top of the dialog where a researcher creates a dynamic attribute.',
  },
  submit: {
    id: 'protocolBuilder.dynamicAttribute.createSubmit',
    defaultMessage: 'Create dynamic attribute',
    description:
      'Button that creates the dynamic attribute described in the dialog and puts it in the text at the caret.',
  },
});

type DynamicAttributeDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  /** Called with the new dynamic attribute's id, once it is written. */
  onCreate: (id: string) => void;
}>;

/**
 * Creates a dynamic attribute beside the text: its logic, the rules or the
 * attribute that decide which version is shown, and a wording for each
 * version in the language being edited. The new attribute is not written
 * until the researcher creates it.
 */
export function DynamicAttributeDialog({
  open,
  onClose,
  onCreate,
}: DynamicAttributeDialogProps) {
  return open ? (
    <OpenDynamicAttributeDialog onClose={onClose} onCreate={onCreate} />
  ) : null;
}

function OpenDynamicAttributeDialog({
  onClose,
  onCreate,
}: Omit<DynamicAttributeDialogProps, 'open'>) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  const [draft, setDraft] = useState<DynamicAttributeDraft>(() =>
    newDraft(
      firstAvailableLogicOption(intl, {
        writesConditions: environment.conditions.writes,
        choices: environment.choices,
      }) ?? 'if',
      environment.choices,
    ),
  );
  const [shownProblems, setShownProblems] = useState<DraftProblems | null>(
    null,
  );
  const problemsOf = (next: DynamicAttributeDraft) =>
    draftProblems(next, environment.conditions.scope, environment.locale, intl);

  const submit = () => {
    const problems = problemsOf(draft);
    if (hasDraftProblems(problems)) {
      setShownProblems(problems);
      return;
    }
    const id = createDynamicAttributeId();
    // A version left empty shows nothing in the language being edited.
    const written = draftWithEveryVersionIn(draft, environment.locale);
    if (!writeDynamicAttribute(environment, id, written)) return;
    onCreate(id);
  };

  return (
    <Dialog
      open
      closeDialog={onClose}
      // `onClose` and `onCreate` hand the keyboard back to the text, as the
      // dialog goes: returned to the button that opened the list instead, it
      // would take the keys typed next.
      finalFocus={false}
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      size="editor"
      footer={
        <>
          <Button color="default" onClick={onClose}>
            {intl.formatMessage(commonMessages.cancel)}
          </Button>
          <Button color="primary" onClick={submit}>
            {intl.formatMessage(messages.submit)}
          </Button>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <DynamicAttributeControls
          name="new-dynamic-attribute"
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            if (shownProblems !== null) setShownProblems(problemsOf(next));
          }}
          {...(shownProblems !== null && { problems: shownProblems })}
        />
      </form>
    </Dialog>
  );
}
