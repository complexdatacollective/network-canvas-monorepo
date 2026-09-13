import { useCallback, useRef, useState, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { VariableOption, VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import {
  documentWithRebasedVariable,
  sectionIdForCodebookSubject,
} from '../../codebook/editing.ts';
import { useCodebookSectionWrite } from '../../codebook/writes.ts';
import type { CreateOptionOutcome } from '../../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import {
  useProtocolContext,
  useProtocolSections,
} from '../../state/protocolContext.ts';

export type CreateVariableEditorOptions = Readonly<{
  /** The type the attribute is created on. `null` while none is chosen. */
  subject: CodebookSubject | null;
  /**
   * The attribute types this slot may create on, most often one.
   *
   * One is seeded and is the only type offered, because the slot cannot bind
   * anything else — a pedigree's participant marker is a boolean whatever the
   * researcher would rather it were. Several means the slot takes whichever of
   * them the attribute turns out to be, so the kind of answer is left for the
   * researcher to choose in the editor rather than decided for them here.
   */
  variableTypes: readonly VariableType[];
  /**
   * The canonical value set the interface owns, seeded and locked.
   *
   * The interview and the genetics engine branch on these exact values, so a
   * researcher may not edit them — and the schema refuses an attribute bound
   * to one of these slots whose options differ.
   */
  lockedOptions?: readonly VariableOption[];
  /** Title of the editor's dialog, already formatted. */
  title: string;
  onCreated(variableId: string): void;
}>;

export type CreateVariableEditor = Readonly<{
  /**
   * Whether an editor can be opened at all: there is a type to add to, and the
   * stage is not read-only.
   *
   * A control that opens one renders nothing while this is false rather than
   * rendering a disabled one, whose only explanation would be a choice made in
   * a different field.
   */
  launchable: boolean;
  /**
   * Opens the editor seeded with this name, and answers with what became of
   * it — `refused` when the researcher closed it without saving, so the name
   * is still theirs to correct.
   *
   * Written in the picker's own `onCreateOption` contract so a picker's create
   * row can BE this: a slot whose attribute needs a list of values or a scale
   * cannot be made from a name alone, and the editor is where the rest of it
   * is written.
   */
  createOption(variableName: string): Promise<CreateOptionOutcome>;
  /** The dialog itself, rendered by whoever owns the control that opens it. */
  editor: ReactNode;
}>;

type EditorSession = Readonly<{
  key: string;
  variableId: string;
  name: string;
  /**
   * The type the attribute is being created ON, taken when the editor opened
   * rather than read live.
   *
   * The draft inside belongs to that type: a stage repointed at another one
   * while the editor is open — by this researcher, by a collaborator — would
   * otherwise leave the editor authoring an attribute of a type nobody asked
   * it to. `editorReadOnly` below is what says so, and the draft is kept
   * rather than thrown away.
   */
  subject: CodebookSubject;
  /**
   * That type's section as it stood when the editor opened, for the renders
   * after it has gone. The live one is preferred while there is one.
   */
  openedDocument: SectionDoc;
  /** What the create the editor was opened for is waiting on. */
  settle: (outcome: CreateOptionOutcome) => void;
}>;

/**
 * Creates a codebook attribute through the codebook's own editor, and hands
 * its id back to the slot that asked for it.
 *
 * The attribute is created under the codebook section's own lock, which is
 * what puts it into the protocol atomically and reports the specific lock
 * holder when it cannot. Binding it to the slot afterwards is an ordinary form
 * change rather than part of that edit, and deliberately so: an attribute in
 * the codebook is valid on its own, while a stage pointing at it may not be
 * finished yet — saved as one edit, a host keeping its stored protocol valid
 * would be right to refuse the pair.
 *
 * A hook and a rendered dialog rather than a button, because the act of
 * inventing an attribute is reached from more than one control: a picker's
 * create row escalates to it whenever the attribute needs more than a name —
 * a list of values, a scale, a set of options the interface owns — and the
 * sibling button this used to be is the same act asked from further away.
 */
export function useCreateVariableEditor({
  subject,
  variableTypes,
  lockedOptions,
  title,
  onCreated,
}: CreateVariableEditorOptions): CreateVariableEditor {
  const { readOnly } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const protocolSections = useProtocolSections();
  const writeCodebookSection = useCodebookSectionWrite();
  const [session, setSession] = useState<EditorSession | null>(null);
  /**
   * Whether the editor's save is with the host right now.
   *
   * Held HERE rather than inside the editor because it is the DIALOG that has
   * to answer for it: what a dismissal mid-flight unmounts is the editor, and
   * a state living there would go with it. See `submitEdit`.
   */
  const [submitting, setSubmitting] = useState(false);
  /**
   * Whether the open editor may be written, readable when an ANSWER lands
   * rather than as it stood when the request left.
   *
   * The editor's submit handler awaits the host and then calls the
   * `onComplete` it captured before the await, so the completion below is a
   * closure from an earlier render. Read from that closure, `editorReadOnly`
   * says what was true when the researcher pressed Create — and a slot
   * repointed at another type in the meantime, by this researcher or by a
   * collaborator, would be bound to an attribute of the type the editor opened
   * against: a cross-type reference nothing on screen explains and the stage
   * save then refuses.
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
   * It carries the two values the open editor captures rather than being a
   * bare boolean, so the capture cannot read them again — and cannot read a
   * different answer — a moment later.
   */
  const launchable =
    readOnly || subject === null || authoritativeDocument === undefined
      ? undefined
      : { subject, openedDocument: authoritativeDocument };
  const launchableRef = useRef(launchable);
  launchableRef.current = launchable;

  const createOption = useCallback(
    (variableName: string) =>
      new Promise<CreateOptionOutcome>((resolve) => {
        const target = launchableRef.current;
        // Nothing to add an attribute to, or nothing this researcher may
        // write: no editor opens and nothing was created, so the name they
        // typed is still theirs. The control that asked says why — it is the
        // one that knows what is missing.
        if (target === undefined) {
          resolve({ status: 'refused' });
          return;
        }
        setSession({
          key: uuid(),
          variableId: uuid(),
          name: variableName,
          settle: resolve,
          ...target,
        });
      }),
    [],
  );

  /*
    An editor ALREADY OPEN is a different question, and the answer is that it
    stays. The draft inside it — the name the researcher is typing, the values
    they are entering — exists nowhere else, and unmounting it to say the stage
    is read-only would throw that away to report something the editor says for
    itself with its own save refused. The same rule the row dialog around
    `AttributeCodebookControls` follows when the same thing happens.
  */
  if (launchable === undefined && session === null) {
    return { launchable: false, createOption, editor: null };
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
   * to an attribute the researcher watched no editor finish.
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
   *
   * A dismissal wrote nothing, which is exactly what the create that opened
   * this was waiting to hear: the name is still the researcher's to correct.
   */
  const requestClose = () => {
    if (submitting || session === null) return;
    session.settle({ status: 'refused' });
    setSession(null);
  };

  /**
   * The kind of answer the draft ARRIVES on, which only a slot that allows one
   * kind has.
   *
   * Where several are allowed, seeding one would answer the question the editor
   * is open to ask — and the researcher would have to notice a choice they were
   * never offered before correcting it.
   */
  const onlyType = variableTypes.length === 1 ? variableTypes[0] : undefined;

  const editor =
    session === null ? null : (
      <Dialog
        open
        title={title}
        size="readable"
        dismissible={!submitting}
        closeDialog={requestClose}
      >
        <VariableEditor
          mode="create"
          openId={session.key}
          subject={session.subject}
          authoritativeDocument={openedSection ?? session.openedDocument}
          readOnly={editorReadOnly}
          variableId={session.variableId}
          initialDraft={
            onlyType === undefined
              ? { name: session.name }
              : { name: session.name, type: onlyType }
          }
          allowedVariableTypes={variableTypes}
          lockedOptions={lockedOptions ?? null}
          protocolContext={protocolContext}
          onSubmitDocument={submitEdit(session.subject, session.variableId)}
          onComplete={(variableId) => {
            // Bound only while the slot still names attributes of the type the
            // attribute was created on. An answer that arrives after the type
            // has moved would otherwise put a reference to the old type's
            // attribute into a slot the type change has just cleared.
            //
            // Asked of the LIVE answer rather than of this closure's own
            // `editorReadOnly`: the editor calls the callback it captured
            // before it awaited the host, so a closure read would answer for
            // the render that started the request. See `writable`.
            if (writable.current) {
              onCreated(variableId);
              session.settle({ status: 'created' });
            } else {
              // The codebook holds it, and the slot it was for has moved on.
              session.settle({ status: 'unassigned' });
            }
            setSession(null);
          }}
        />
      </Dialog>
    );

  return { launchable: launchable !== undefined, createOption, editor };
}
