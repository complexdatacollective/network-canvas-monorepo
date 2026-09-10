import { useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import CodebookEntityEditor from '../../../codebook/components/CodebookEntityEditor.tsx';
import { useCreateCodebookEntity } from '../../../codebook/writes.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { NEW_ENTITY_DRAFT } from '../../../sections/subject-picker/SubjectSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { composerMessages as messages } from './composerMessages.ts';

/**
 * Creates a connection type and makes it drawable on this stage.
 *
 * A composer's list is the only place a researcher meets connection types
 * while building one, so a protocol that has none — or none of the kind this
 * study needs — would otherwise send them to the codebook and back with the
 * stage half-configured. Architect's own composer has always offered this.
 *
 * The type is created through the host's atomic create, which is what puts a
 * new section into the protocol and mints its id. Adding the entry afterwards
 * is an ordinary unsaved form change rather than part of that edit, and
 * deliberately so: a type is valid in the codebook on its own, while the stage
 * that has just started drawing it may not be finished — saved as one edit, a
 * host keeping its stored protocol valid would be right to refuse the pair.
 */
export default function CreateConnectionTypeButton({
  onCreated,
}: Readonly<{
  /** Hands back the id the HOST minted for the new type. */
  onCreated: (typeId: string) => void;
}>) {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const codebook = useProtocolContext().codebook;
  const createEntity = useCreateCodebookEntity();
  const [session, setSession] = useState<{
    key: string;
    typeId: string;
  } | null>(null);
  /**
   * Whether the create is with the host right now, which is a fact this host
   * has for itself: the editor owns the draft and this owns request execution,
   * so the request passes through here on its way out and its answer on the
   * way back.
   */
  const [submitting, setSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Every type name the protocol already carries, of BOTH kinds.
   *
   * Node and edge types share one namespace — the rule the codebook's own type
   * editor applies everywhere else — so a connection judged against the edge
   * names alone could be given a node type's name, and the refusal would
   * arrive from the schema after the researcher had finished the dialog, with
   * no name-field error to act on.
   *
   * Read map by map rather than by a computed key: the codebook's two maps
   * hold different definition types, and one indexed by a union is a union of
   * maps nothing can be read out of without narrowing it again.
   */
  const existingEntityNames = useMemo(
    () =>
      [
        ...Object.values(codebook.node ?? {}),
        ...Object.values(codebook.edge ?? {}),
      ].map((definition) => definition.name),
    [codebook],
  );

  /*
    The trigger goes when editing does, because a create nobody may start is
    not on offer. An editor already OPEN stays: the name the researcher is
    typing exists nowhere else, and unmounting it with the trigger would throw
    that away without a word — to report something `CodebookEntityEditor` says
    for itself once its save is refused. It takes `readOnly` for exactly this,
    and it is the rule `SubjectSection`'s own create dialog and the row dialogs
    already follow.
  */
  if (readOnly && session === null) return null;

  return (
    <>
      {!readOnly && (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSession({ key: uuid(), typeId: uuid() })}
        >
          {intl.formatMessage(messages.createConnectionTypeLabel)}
        </Button>
      )}
      {session !== null && (
        <Dialog
          open
          title={intl.formatMessage(messages.createConnectionTypeLabel)}
          size="readable"
          // A request in flight refuses every way out, because the dialog is
          // about to show what the host made of it. Escape, a press outside
          // and the close button all arrive at `closeDialog`, so refusing
          // there covers all three — and `dismissible` takes the close button
          // away rather than leaving a control on screen that does nothing.
          // Dismissed mid-flight, the handler awaiting the request stays alive
          // and a success arriving afterwards still makes the new type
          // drawable: a connection the researcher would watch appear for a
          // create they had closed.
          dismissible={!submitting}
          closeDialog={() => {
            if (submitting) return;
            setSession(null);
          }}
          finalFocus={() => triggerRef.current}
        >
          <CodebookEntityEditor
            mode="create"
            sessionKey={session.key}
            subject={{ entity: 'edge', type: session.typeId }}
            initialDraft={NEW_ENTITY_DRAFT.edge}
            readOnly={readOnly}
            existingEntityNames={existingEntityNames}
            onSubmit={async (document) => {
              setSubmitting(true);
              try {
                return await createEntity('edge', document);
              } finally {
                setSubmitting(false);
              }
            }}
            onApplied={(outcome) => {
              // The id the HOST minted, read off the write: it is the host's
              // to issue, and the stage has to name the type it created.
              const ref = parseSectionId(outcome.sectionId);
              if (ref.kind === 'codebookEdge') onCreated(ref.typeId);
              setSession(null);
            }}
            onCancel={() => setSession(null)}
          />
        </Dialog>
      )}
    </>
  );
}
