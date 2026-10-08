import { Pencil } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { useDialogSession } from '@codaco/fresco-ui/dialogs/useDialogSession';
import type { VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariableEditor from '../codebook/components/VariableEditor.tsx';
import { documentWithRebasedVariable } from '../codebook/editing.ts';
import type {
  OptionRowChoiceValue,
  VariableEditorHostOptions,
} from '../codebook/optionRowChoice.ts';
import { useCodebookSectionDocument } from '../codebook/useCodebookVariableEdits.ts';
import { useCodebookSectionWrite } from '../codebook/writes.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';

/**
 * Edits the options of an attribute from the stage that manages them.
 *
 * Some attributes' options belong to one kind of stage, because that stage
 * decides what each option means (the Family Pedigree's gender identity: which
 * kinship words each takes). Everywhere else in Architect those options are shown
 * read-only, so this is the one place they can be added, removed, relabelled or
 * given a different value. It opens the codebook's own attribute editor, the
 * same one that shows them read-only elsewhere, and writes through the same
 * codebook write: the editor is not given the stage-managed lock because the
 * researcher is editing from a stage that owns it.
 *
 * Written to the codebook straight away, under that section's lock, like every
 * other codebook edit made from inside a stage; whatever the stage keeps beside
 * the options stays in its unsaved draft until the stage is saved. A stage that
 * keeps something about each option chooses it on the option's own row
 * (`editorOptions.optionRowChoice`) and is handed the result in `onSaved`, to
 * write into its draft.
 *
 * Lives outside `editors/` because it is an update-mode mount of the attribute
 * editor and no way to create an attribute, which is the seam
 * `creationIsOfferedThroughThePicker.test.tsx` keeps interface editors off.
 */
export default function StageManagedOptionsEditor({
  subject,
  variableId,
  allowedVariableTypes,
  hint,
  buttonLabel,
  dialogTitle,
  editorOptions,
  onSaved,
  children,
}: Readonly<{
  subject: CodebookSubject;
  variableId: string;
  allowedVariableTypes: readonly VariableType[];
  /** Says why the options are edited here and nowhere else. */
  hint: string;
  buttonLabel: string;
  dialogTitle: string;
  /** Passed on to the attribute editor. */
  editorOptions?: VariableEditorHostOptions;
  /**
   * Told when the dialog saved, with the choice made on each saved option's
   * row when `editorOptions` asked for one.
   */
  onSaved?: (optionRowChoices?: readonly OptionRowChoiceValue[]) => void;
  /** What the stage shows of the options, above the button that edits them. */
  children?: ReactNode;
}>) {
  const { readOnly } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const writeSection = useCodebookSectionWrite();
  const document = useCodebookSectionDocument(subject);
  const { session, openSession, closeSession, onSessionExited } =
    useDialogSession<{ key: string; openedDocument: SectionDoc }>();
  const [submitting, setSubmitting] = useState(false);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

  const variable = variablesForSubject(protocolContext, subject)[variableId];
  const attribute = variable === undefined ? undefined : { ...variable };

  const requestClose = () => {
    if (submitting) return;
    closeSession();
  };

  // Laid over the section the lock hands back, not the one the editor read,
  // so an attribute a collaborator added while this was open is not deleted.
  const submit = async (
    submitted: SectionDoc,
    ownedProperties?: readonly string[],
  ) => {
    setSubmitting(true);
    try {
      return await writeSection(subject, (authoritativeDocument) =>
        documentWithRebasedVariable({
          subject,
          authoritativeDocument,
          variableId,
          submittedDocument: submitted,
          ...(ownedProperties === undefined ? {} : { ownedProperties }),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-8 flex flex-col items-start gap-2">
      {children}
      <p className="text-muted text-sm">{hint}</p>
      {!readOnly && document !== undefined && attribute !== undefined && (
        <Button
          type="button"
          // Dynamic, so it keeps its contrast on whichever surface the
          // section nests it in.
          color="dynamic"
          icon={<Pencil aria-hidden="true" />}
          onClick={() => openSession({ key: uuid(), openedDocument: document })}
        >
          {buttonLabel}
        </Button>
      )}
      {session !== null && attribute !== undefined && (
        <Dialog
          open={session.open}
          onExitComplete={onSessionExited}
          title={dialogTitle}
          // Wider for a stage that adds a choice to every option row, which
          // then needs the room for a third field beside the label and value.
          size={
            editorOptions?.optionRowChoice === undefined ? 'readable' : 'editor'
          }
          dismissible={!submitting}
          closeDialog={requestClose}
          footer={<div ref={setFooterSlot} className="contents" />}
        >
          <VariableEditor
            mode="update"
            openId={session.key}
            subject={subject}
            authoritativeDocument={document ?? session.openedDocument}
            variableId={variableId}
            initialDraft={attribute}
            allowedVariableTypes={allowedVariableTypes}
            readOnly={readOnly}
            chrome="dialog"
            footerSlot={footerSlot}
            onCancel={requestClose}
            onSubmitDocument={submit}
            onComplete={(_variableId, _variableName, optionRowChoices) => {
              onSaved?.(optionRowChoices);
              closeSession();
            }}
            {...editorOptions}
          />
        </Dialog>
      )}
    </div>
  );
}
