import { useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import type { DialogSession } from '@codaco/fresco-ui/dialogs/useDialogSession';

import type { CodebookSubject } from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { documentWithRebasedVariable } from '../editing.ts';
import { useCodebookSectionDocument } from '../useCodebookVariableEdits.ts';
import { useCodebookSectionWrite } from '../writes.ts';
import { createVariableTitle } from './VariableEditor.tsx';
import VariableEditorDialog from './VariableEditorDialog.tsx';

/**
 * One opening of the editor for a new attribute. The key is minted per
 * opening, so reopening starts a fresh draft; `variableId` is the id the
 * attribute is created under.
 */
export type CreateCodebookVariableSession = Readonly<{
  key: string;
  subject: CodebookSubject;
  variableId: string;
}>;

export type CreateCodebookVariableDialogProps = Readonly<{
  session: DialogSession<CreateCodebookVariableSession>;
  /** Closes the dialog: turns the session's `open` off. */
  onClose(): void;
  /** Called once the dialog has finished animating out. */
  onExitComplete(): void;
  finalFocus?: DialogProps['finalFocus'];
  readOnly?: boolean;
}>;

/**
 * Adds an attribute to a node type, an edge type or the participant, from a
 * surface that is not a stage: the codebook's own page.
 *
 * A stage creates its attributes through `useCreateVariableEditor`, which
 * also binds what was created to the slot that asked for it. Here there is no
 * slot, so the attribute is written and the dialog closes.
 */
export default function CreateCodebookVariableDialog(
  props: CreateCodebookVariableDialogProps,
) {
  return <CreateVariableDialog key={props.session.key} {...props} />;
}

function CreateVariableDialog({
  session,
  onClose,
  onExitComplete,
  finalFocus,
  readOnly = false,
}: CreateCodebookVariableDialogProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const writeSection = useCodebookSectionWrite();
  const { subject, variableId } = session;
  const liveDocument = useCodebookSectionDocument(subject);
  // Kept for the case where the type is deleted under an open editor: the
  // draft stays on screen and the save says why it was refused.
  const [openedDocument] = useState(liveDocument);
  const document = liveDocument ?? openedDocument;

  if (document === undefined) return null;

  return (
    <VariableEditorDialog
      mode="create"
      open={session.open}
      onExitComplete={onExitComplete}
      title={intl.formatMessage(createVariableTitle)}
      onClose={onClose}
      {...(finalFocus === undefined ? {} : { finalFocus })}
      openId={session.key}
      subject={subject}
      authoritativeDocument={document}
      variableId={variableId}
      initialDraft={{ name: '' }}
      protocolContext={protocolContext}
      readOnly={readOnly}
      // Only the attribute being created crosses into the write: the section
      // the lock hands back may already hold a collaborator's own change.
      onSubmitDocument={(submitted) =>
        writeSection(subject, (authoritativeDocument) =>
          documentWithRebasedVariable({
            subject,
            authoritativeDocument,
            variableId,
            submittedDocument: submitted,
          }),
        )
      }
      onComplete={onClose}
    />
  );
}
