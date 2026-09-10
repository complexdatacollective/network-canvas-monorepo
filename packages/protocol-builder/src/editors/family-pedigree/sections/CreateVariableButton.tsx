import { useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { VariableOption, VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariableEditor from '../../../codebook/components/VariableEditor.tsx';
import {
  documentWithRebasedVariable,
  sectionIdForCodebookSubject,
} from '../../../codebook/editing.ts';
import { useCodebookSectionWrite } from '../../../codebook/writes.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import {
  useProtocolContext,
  useProtocolSections,
} from '../../../state/protocolContext.ts';

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
  onCreated(variableId: string): void;
}>;

/**
 * Creates a codebook attribute and hands its id back to the slot that asked
 * for it.
 *
 * The attribute is created under the codebook section's own lock, which is
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
  onCreated,
}: CreateVariableButtonProps) {
  const { readOnly } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const protocolSections = useProtocolSections();
  const writeCodebookSection = useCodebookSectionWrite();
  const [session, setSession] = useState<{
    key: string;
    variableId: string;
    /**
     * The type the attribute is being created ON, taken when the editor opened
     * rather than read live.
     *
     * The draft inside belongs to that type: a stage repointed at another one
     * while the editor is open — by this researcher, by a
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
  /**
   * Whether the open editor may be written, readable when an ANSWER lands
   * rather than as it stood when the request left.
   *
   * The editor's submit handler awaits the host and then calls the
   * `onComplete` it captured before the await, so the completion below is a
   * closure from an earlier render. Read from that closure, `editorReadOnly`
   * says what was true when the researcher pressed Create — and a slot
   * repointed at another type in the meantime, by this researcher
   * or by a collaborator, would be bound to an attribute of the type the
   * editor opened against: a cross-type reference nothing on screen explains
   * and the stage save then refuses. The ref is the same seam
   * `SlotVariableField`'s gate and `useResetOnEntityTypeChange` read their own
   * live values through.
   */
  const writable = useRef(false);

  const authoritativeDocument =
    subject === null
      ? undefined
      : protocolSections[sectionIdForCodebookSubject(subject)];

  /**
   * What opening an editor from here would open it ON, or `undefined` while
   * there is nothing to open one against.
   *
   * Nothing to add an attribute to yet, or a stage somebody else is editing,
   * makes this undefined and takes the control away: rendering a disabled one
   * instead would offer an action whose only explanation is a choice made in a
   * different field. It carries the two values the open editor captures rather
   * than being a bare boolean, so the capture cannot read them again — and
   * cannot read a different answer — a moment later.
   */
  const launchable =
    readOnly || subject === null || authoritativeDocument === undefined
      ? undefined
      : { subject, openedDocument: authoritativeDocument };

  /*
    An editor ALREADY OPEN is a different question, and the answer is that it
    stays. The draft inside it — the name the researcher is typing, the values
    they are entering — exists nowhere else, and unmounting it to say the stage
    is read-only would throw that away to report something the editor says for
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
      : protocolSections[sectionIdForCodebookSubject(session.subject)];

  /**
   * Whether what is open may be WRITTEN, which is three questions.
   *
   * A read-only stage says this researcher may write nothing. A section that
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
  writable.current = !editorReadOnly;

  /**
   * The codebook write the editor asks for, with the dialog held shut while it
   * is in flight.
   *
   * The write outlives the dialog: dismissed mid-flight, the editor is
   * unmounted but the handler awaiting the host is still alive, so a refusal
   * is shown to nobody and a success still runs `onComplete` — binding a slot
   * to an attribute the researcher watched no editor finish. The same act as
   * `AttributeCodebookControls`' three nested editors, which withhold every
   * way out for exactly this.
   *
   * Only the attribute being created crosses into the write, for the reason
   * `documentWithRebasedVariable` gives: the section the lock hands back may
   * already hold a collaborator's own change, and this editor's copy of it
   * does not.
   */
  const submitEdit =
    (target: CodebookSubject, variableId: string) =>
    async (document: SectionDoc) => {
      setSubmitting(true);
      try {
        return await writeCodebookSection(target, (authoritative) =>
          documentWithRebasedVariable({
            subject: target,
            authoritativeDocument: authoritative,
            variableId,
            submittedDocument: document,
          }),
        );
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
            protocolContext={protocolContext}
            onSubmitDocument={submitEdit(session.subject, session.variableId)}
            onComplete={(variableId) => {
              // Bound only while the slot still names attributes of the type
              // the attribute was created on. An answer that arrives after the
              // type has moved would otherwise put a reference to the old
              // type's attribute into a slot the type change has just cleared.
              //
              // Asked of the LIVE answer rather than of this closure's own
              // `editorReadOnly`: the editor calls the callback it captured
              // before it awaited the host, so a closure read would answer for
              // the render that started the request. See `writable`.
              if (writable.current) onCreated(variableId);
              setSession(null);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
