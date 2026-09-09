import { useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { VariableOption, VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import { sectionIdForCodebookSubject } from '../../codebook/editing.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';

export type CreateVariableButtonProps = Readonly<{
  /** The type the attribute is created on. `null` while none is chosen. */
  subject: CodebookSubject | null;
  /**
   * The attribute type this slot needs. It is the only type offered, because
   * the slot cannot bind anything else — a pedigree's participant marker is a
   * boolean whatever the researcher would rather it were.
   */
  variableType: VariableType;
  /**
   * The canonical value set the interface owns, seeded and locked.
   *
   * The interview and the genetics engine branch on these exact values, so a
   * researcher may not edit them — and the schema refuses an attribute bound
   * to one of these slots whose options differ.
   */
  lockedOptions?: readonly VariableOption[];
  /**
   * Visible text and accessible name of the control, already formatted.
   *
   * Every caller names its own attribute — "a new participant identifier
   * attribute", "a new disease attribute" — from a descriptor declared in its
   * own family's messages file, and formats it there. A string arrives here
   * rather than a descriptor because this control renders it immediately and
   * hands nothing on: there is no later reader for a descriptor to be resolved
   * for, and the extraction guard sees the caller's declaration either way.
   */
  label: string;
  /** Says what the created attribute is for, inside the dialog. */
  description: string;
  onCreated(variableId: string): void;
}>;

/**
 * Creates a codebook attribute and hands its id back to the slot that asked
 * for it.
 *
 * The attribute is created through the session's compound-edit path, which is
 * what puts it into the protocol atomically and reports the specific lock
 * holder when it cannot. Binding it to the slot afterwards is an ordinary form
 * change rather than part of that edit, and deliberately so: an attribute in
 * the codebook is valid on its own, while a stage pointing at it may not be
 * finished yet — saved as one edit, a host keeping its stored protocol valid
 * would be right to refuse the pair.
 */
export default function CreateVariableButton({
  subject,
  variableType,
  lockedOptions,
  label,
  description,
  onCreated,
}: CreateVariableButtonProps) {
  const { controller, readOnly } = useStageEditorForm();
  const [session, setSession] = useState<{
    key: string;
    variableId: string;
    /**
     * The type the attribute is being created ON, taken when the editor opened
     * rather than read live.
     *
     * The draft inside belongs to that type: a stage repointed at another one
     * while the editor is open — by this researcher, by an undo, by a
     * collaborator — would otherwise leave the editor authoring an attribute
     * of a type nobody asked it to. `editorReadOnly` below is what says so,
     * and the draft is kept rather than thrown away.
     */
    subject: CodebookSubject;
    /**
     * That type's section as it stood when the editor opened, for the renders
     * after it has gone. The live one is preferred while there is one.
     */
    openedDocument: SectionDoc;
  } | null>(null);
  /**
   * Whether the editor's save is with the host right now.
   *
   * Held HERE rather than inside the editor because it is the DIALOG that has
   * to answer for it: what a dismissal mid-flight unmounts is the editor, and
   * a state living there would go with it. See `submitEdit`.
   */
  const [submitting, setSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const authoritativeDocument =
    subject === null
      ? undefined
      : controller.snapshot.protocolSections[
          sectionIdForCodebookSubject(subject)
        ];

  /**
   * What opening an editor from here would open it ON, or `undefined` while
   * there is nothing to open one against.
   *
   * Nothing to add an attribute to yet, or a lease a collaborator has taken
   * back, makes this undefined and takes the control away: rendering a
   * disabled one instead would offer an action whose only explanation is a
   * choice made in a different field. It carries the two values the session
   * captures rather than being a bare boolean, so the capture cannot read them
   * again — and cannot read a different answer — a moment later.
   */
  const launchable =
    readOnly || subject === null || authoritativeDocument === undefined
      ? undefined
      : { subject, openedDocument: authoritativeDocument };

  /*
    An editor ALREADY OPEN is a different question, and the answer is that it
    stays. The draft inside it — the name the researcher is typing, the values
    they are entering — exists nowhere else, and unmounting it to say the lease
    has gone would throw that away to report something the editor says for
    itself with its own save refused. The same rule the row dialog around
    `AttributeCodebookControls` follows when the same thing happens.
  */
  if (launchable === undefined && session === null) {
    return null;
  }

  // The section the OPEN editor is reading, resolved live so a collaborator's
  // changes to it still reach the editor, and falling back to the copy taken
  // when it opened when that section has gone.
  const openedSection =
    session === null
      ? undefined
      : controller.snapshot.protocolSections[
          sectionIdForCodebookSubject(session.subject)
        ];

  /**
   * Whether what is open may be WRITTEN, which is three questions.
   *
   * A lease taken back says this researcher may write nothing. A section that
   * has gone is a section nothing can be written into. And a slot pointed at
   * another type is a slot this attribute is no longer for: an attribute
   * created on the type the editor opened against would be bound to a slot
   * that has stopped naming that type's attributes.
   */
  const editorReadOnly =
    readOnly ||
    openedSection === undefined ||
    subject === null ||
    session === null ||
    sectionIdForCodebookSubject(subject) !==
      sectionIdForCodebookSubject(session.subject);

  /**
   * The compound edit the editor submits, with the dialog held shut while it
   * is in flight.
   *
   * The request outlives the dialog: dismissed mid-flight, the editor is
   * unmounted but the handler awaiting the host is still alive, so a refusal
   * is shown to nobody and a success still runs `onComplete` — binding a slot
   * to an attribute the researcher watched no editor finish. The same act as
   * `AttributeCodebookControls`' three nested editors, which withhold every
   * way out for exactly this.
   */
  const submitEdit = async (
    request: Parameters<typeof controller.requestCompoundEdit>[0],
  ) => {
    setSubmitting(true);
    try {
      return await controller.requestCompoundEdit(request);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Every way out of the editor, which is one handler.
   *
   * Escape, a press outside and the close button all arrive at `closeDialog`,
   * so refusing here covers all three — and `dismissible` takes the close
   * button away rather than leaving a control on screen that does nothing.
   */
  const requestClose = () => {
    if (submitting) return;
    setSession(null);
  };

  return (
    <>
      {launchable !== undefined && (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setSession({ key: uuid(), variableId: uuid(), ...launchable })
          }
        >
          {label}
        </Button>
      )}
      {session !== null && (
        <Dialog
          open
          title={label}
          size="readable"
          dismissible={!submitting}
          closeDialog={requestClose}
          finalFocus={() => triggerRef.current}
        >
          <VariableEditor
            mode="create"
            openId={session.key}
            subject={session.subject}
            authoritativeDocument={openedSection ?? session.openedDocument}
            readOnly={editorReadOnly}
            variableId={session.variableId}
            initialDraft={{ name: '', type: variableType }}
            allowedVariableTypes={[variableType]}
            lockedOptions={lockedOptions ?? null}
            description={description}
            protocolContext={controller.snapshot.protocolContext}
            createRequestId={() => uuid()}
            onSubmitRequest={submitEdit}
            onComplete={(variableId) => {
              // Bound only while the slot still names attributes of the type
              // the attribute was created on. An answer that arrives after the
              // type has moved would otherwise put a reference to the old
              // type's attribute into a slot the type change has just cleared.
              if (!editorReadOnly) onCreated(variableId);
              setSession(null);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
