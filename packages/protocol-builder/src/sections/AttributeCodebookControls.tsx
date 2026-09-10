import {
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { v4 as uuid } from 'uuid';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariableEditor from '../codebook/components/VariableEditor.tsx';
import {
  documentWithRebasedVariable,
  sectionIdForCodebookSubject,
} from '../codebook/editing.ts';
import {
  useCodebookSectionDocument,
  useWhereTheAnswerLands,
} from '../codebook/useCodebookVariableEdits.ts';
import CodebookVariableValidationEditor from '../codebook/validation/CodebookVariableValidationEditor.tsx';
import { optionsShapeFor } from '../codebook/variableOptions.ts';
import { parameterShapeFor } from '../codebook/variableParameters.ts';
import { useCodebookSectionWrite } from '../codebook/writes.ts';
import { createdUnassigned } from '../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { isCollectableType, isOptionType } from './collectableTypes.ts';

/** Where a row that binds an attribute usually keeps the attribute it binds. */
const DEFAULT_VARIABLE_FIELD = 'variable';

/**
 * What inside a field container can be handed focus, most preferred first.
 *
 * Queried one tier at a time rather than as one comma list, because
 * `querySelector` answers in DOCUMENT order rather than selector order — the
 * same reason `focusFirstError` splits them.
 */
const FOCUS_TARGETS = [
  '[data-field-focus-target]',
  'input:not([type="hidden"]), textarea, select',
  '[tabindex]:not([tabindex="-1"])',
  'button:not(:disabled)',
];

const messages = defineMessages({
  createWithValues: {
    id: 'protocolBuilder.attributeCodebookControls.createWithValues',
    defaultMessage: 'Create this attribute and its values',
    description:
      'Button that opens the codebook editor for inventing an attribute whose answers are chosen from a list, together with that list. Also the title of the dialog it opens. An attribute is one thing an interview records about a network member.',
  },
  editValues: {
    id: 'protocolBuilder.attributeCodebookControls.editValues',
    defaultMessage: 'Change this attribute’s values',
    description:
      'Button that opens the codebook editor for the list of answers a participant chooses between. Also the title of the dialog it opens.',
  },
  editAnswerLabels: {
    id: 'protocolBuilder.attributeCodebookControls.editAnswerLabels',
    defaultMessage: 'Change this attribute’s answer labels',
    description:
      'The same button for a yes/no attribute, whose two stored values are fixed and whose WORDS are what a researcher writes — so this says labels rather than values. Also the title of the dialog it opens.',
  },
  editParameters: {
    id: 'protocolBuilder.attributeCodebookControls.editParameters',
    defaultMessage: 'Set what this field accepts',
    description:
      'The same button for an attribute whose answer is not chosen from a list — a date between two bounds, a position on a scale. Also the title of the dialog it opens.',
  },
  editRules: {
    id: 'protocolBuilder.attributeCodebookControls.editRules',
    defaultMessage: 'Set rules for this answer',
    description:
      'Button that opens the codebook editor for the rules a participant’s answer has to satisfy. Also the title of the dialog it opens.',
  },
  createNeedsValues: {
    id: 'protocolBuilder.attributeCodebookControls.createNeedsValues',
    defaultMessage:
      'An attribute participants choose an answer from needs at least two values, so it is created together with them.',
    description:
      'Shown above the buttons when the researcher is inventing an attribute whose answers come from a list, explaining why they are sent to the codebook editor rather than being asked for a name here.',
  },
  createWithSettings: {
    id: 'protocolBuilder.attributeCodebookControls.createWithSettings',
    defaultMessage: 'Create this attribute and what it accepts',
    description:
      'The same button for inventing an attribute whose answer is not chosen from a list but still needs something a name cannot carry — a scale, whose two end labels say what each end means. Also the title of the dialog it opens.',
  },
  createNeedsSettings: {
    id: 'protocolBuilder.attributeCodebookControls.createNeedsSettings',
    defaultMessage:
      'An attribute answered on a scale needs a label at each end, so it is created together with them.',
    description:
      'The same explanation for a scale: shown above the buttons when the researcher is inventing one, saying why they are sent to the codebook editor rather than being asked for a name here.',
  },
  attributeDeletedTitle: {
    id: 'protocolBuilder.attributeCodebookControls.attributeDeletedTitle',
    defaultMessage: 'Attribute deleted',
    description:
      'Heading of the warning shown over an open attribute editor when someone else deleted the attribute it was opened on.',
  },
  attributeDeletedDescription: {
    id: 'protocolBuilder.attributeCodebookControls.attributeDeletedDescription',
    defaultMessage:
      'This attribute is no longer in the codebook, so these changes cannot be saved.',
    description:
      'Shown over an open attribute editor when someone else deleted the attribute it was opened on. The draft stays on screen; what it says is that there is nothing left to write it to.',
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const variablesIn = (
  document: Readonly<SectionDoc> | undefined,
): Record<string, unknown> =>
  document === undefined ? {} : asRecord(document.variables);

/**
 * A value of the row dialog's OWN form, live.
 *
 * `useStageValue` deliberately reads past the dialog to the stage behind it,
 * which is right for everything a row needs to know about its surroundings and
 * wrong for the row itself: the picker's current choice only exists in the
 * dialog's store until the row is saved, so a row editor reading the stage
 * would never see the researcher choose anything.
 */
export function useRowValue(name: string): unknown {
  const storeApi = useContext(FormStoreContext);

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      storeApi === undefined
        ? () => undefined
        : storeApi.subscribe(onStoreChange),
    [storeApi],
  );
  const getSnapshot = useCallback((): unknown => {
    if (storeApi === undefined) return undefined;
    const state = storeApi.getState();
    return state.hasValue(name) ? state.getValue(name) : undefined;
  }, [name, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type AttributeCodebookControlsProps = Readonly<{
  /** Whose codebook the bound attribute lives in. */
  subject: CodebookSubject | undefined;
  /**
   * The attribute the row arrived holding, read only until the picker has
   * registered — after that the row's own live choice is what these edit.
   */
  committedVariable?: unknown;
  /**
   * Where in the row the attribute itself lives.
   *
   * A prop because a row may bind more than one: a categorical bin's prompt
   * names the attribute whose values are the bins AND the one the follow-up
   * answer is stored in, and each of them has its own values, rules and
   * existence to reach from the control that picked it.
   */
  variableField?: string;
  /**
   * Where in the row the chosen input control lives.
   *
   * A prop because the two families spell it differently and mean different
   * things by it. The shared form-fields row holds it under a stripped
   * `_component` key and writes it to the CODEBOOK on save, so the settings
   * authored here sit beside the control they were authored for. A network
   * composer's row holds a `component` of its own that stays on the stage,
   * which is what `offerParameters` is about.
   */
  componentField: string;
  /**
   * The type of an attribute being invented WITH its values, if that is what
   * this row is doing.
   */
  inventingType?: string;
  /**
   * Whether the settings the chosen control takes are the CODEBOOK's to hold.
   *
   * True wherever the attribute's own `component` is what the interview
   * renders, because the schema keys a variable's `parameters` on that
   * `component` and this editor writes the pair together. FALSE for a network
   * composer, whose field carries its own `component` and `parameters` on the
   * STAGE (`ComposerFormFieldSchema`): the same attribute may be a date picker
   * on one form and a relative one on another, so settings written to the
   * codebook here would be authored against a control the codebook does not
   * have — and the variable schemas, which are split on `component`, refuse
   * exactly that pairing.
   */
  offerParameters?: boolean;
  /**
   * Whether the answer this row collects is checked against the attribute's
   * rules at all.
   *
   * FALSE where the interview writes the attribute without asking the
   * participant anything a form could check — a bin filled by dragging, whose
   * schema reference says so with `usage: 'unvalidatedAttribute'`. Rules
   * authored there would never run, and the button offering them says "for
   * this answer" about a value nobody types.
   */
  offerRules?: boolean;
}>;

/**
 * What the attribute holds, reached from the field that collects it.
 *
 * A form field is a question bound to a codebook attribute, and three things
 * the researcher is bound to want next belong to that attribute rather than to
 * the field: the values a participant chooses between, the rules their answer
 * has to satisfy, and — for an attribute that IS a list of values — its own
 * existence. Architect authors all of them inline in this same dialog and
 * writes them through the field's save (`Form/fieldCommit.ts`).
 *
 * They cannot be inline here, because a codebook attribute lives in a
 * different protocol section from the stage: changing it takes that section's
 * own lock and commits on its own, before the row that names it. So each opens
 * the
 * codebook's own editor, which is where a refusal is already turned into words
 * for the researcher. What happens to the row dialog behind an editor saved
 * this way is `nestedEditorSubmit`'s subject: nothing, which is the point.
 *
 * Shared by every row that binds one attribute, whatever else that row holds:
 * the form-fields family's field, and a network composer's differently-shaped
 * one. What differs between them is where the row keeps its input control and
 * whether that control's settings are the codebook's — both props — because
 * everything else here is a question about the attribute rather than about the
 * row asking it.
 */
export default function AttributeCodebookControls({
  subject,
  committedVariable,
  variableField = DEFAULT_VARIABLE_FIELD,
  componentField,
  inventingType,
  offerParameters = true,
  offerRules = true,
}: AttributeCodebookControlsProps) {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const writeCodebookSection = useCodebookSectionWrite();
  const protocolContext = useProtocolContext();
  const codebookDocument = useCodebookSectionDocument(subject);
  // The dialog's OWN store: the picker's choice is the row's, and the created
  // attribute has to land on it rather than on the stage behind it.
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const chosen =
    asString(useRowValue(variableField) ?? committedVariable) ?? '';
  const liveComponent = useRowValue(componentField);
  const [editing, setEditing] = useState<Readonly<{
    /** Fresh for every open, so the editor starts from the draft it is given. */
    openId: string;
    surface: 'create' | 'defines' | 'rules';
    /**
     * The words on the button that opened this, and what the host's record of
     * the edit is called.
     *
     * DESCRIPTORS rather than the sentences they make, formatted where they are
     * rendered: a formatted string held here would outlive its formatter, and
     * a language switched under an open editor would leave its title in the
     * language it was opened in.
     */
    label: MessageDescriptor;
    /**
     * The attribute's name as it was when the editor opened, for the host's
     * record. Captured rather than read live, so a rename made INSIDE the
     * editor does not retitle the edit that is making it.
     */
    name: string;
    /**
     * The record id a created attribute is minted with, decided when the
     * editor opens rather than per render — and never shown: a researcher
     * renames an attribute, and references made of its old name would break
     * on the rename.
     */
    variableId: string;
    /**
     * Whose codebook that id is in, and where this editor's save goes.
     *
     * Captured for the same reason the id is, because the two are one fact: a
     * record key belongs to exactly one type — the schema refuses a codebook
     * that reuses one across types, because the interview flattens every
     * type's attributes into a single map. Read live instead, a stage a
     * collaborator repoints mid-edit would send this editor looking its
     * attribute up in a document the attribute was never in.
     */
    subject: CodebookSubject;
    /**
     * What the row's attribute picker held when the editor opened, which is
     * the field a created attribute would be written into.
     *
     * Captured with the subject because the pair is one fact — where the
     * answer was asked from — and read back through `useWhereTheAnswerLands`
     * when it arrives.
     */
    fillsIn: string;
    /**
     * That subject's document as it stood when the editor opened, for the
     * renders after it has gone. See `editingDocument`, which prefers the
     * live one.
     */
    openedDocument: SectionDoc;
    /**
     * The input control the editor authors settings FOR, taken from the row at
     * the moment it opens rather than from the codebook.
     *
     * The row is where the control is chosen, and it is not committed until
     * the row is saved — so a researcher who has just switched a date field
     * from one picker to the other would otherwise be handed the settings of
     * the control they have left behind, and the settings they author would be
     * written beside a control that cannot take them.
     */
    component: string;
  }> | null>(null);
  /**
   * Whether a nested editor's save is with the host right now.
   *
   * Held here rather than inside the editors because it is the DIALOG that has
   * to answer for it: what a dismissal mid-flight unmounts is the editor, and
   * a state living there would go with it. See `submitEdit`.
   */
  const [submitting, setSubmitting] = useState(false);
  /**
   * The name of an attribute this row asked for, got, and could not take, held
   * for as long as the notice about it is on screen.
   *
   * The name rather than the id, because the id is a record key the researcher
   * has never seen, and the name is what they typed into the editor and what
   * they will look for in the codebook. `undefined` is the ordinary case: every
   * create either lands on this row or has not happened.
   */
  const [createdElsewhere, setCreatedElsewhere] = useState<string | undefined>(
    undefined,
  );
  // The row's own picker is what a create here fills in, so it is the second
  // half of where the answer lands: see `useWhereTheAnswerLands`.
  const whereTheAnswerLands = useWhereTheAnswerLands(subject, () => chosen);
  /**
   * The row dialog these controls sit in, remembered rather than walked up to.
   *
   * `finalFocus` is resolved after the editor has closed, and closing it can
   * be exactly what takes these controls off the screen: an attribute deleted
   * under an open rules editor leaves nothing here to launch, so the container
   * a lookup would walk up FROM is already gone by the time focus is being
   * returned. The dialog outlives them, so it is what is held.
   */
  const rowDialog = useRef<HTMLElement | null>(null);
  const holdRowDialog = (node: HTMLDivElement | null) => {
    const dialog = node?.closest<HTMLElement>('[role="dialog"]') ?? null;
    if (dialog !== null) rowDialog.current = dialog;
  };
  const createTrigger = useRef<HTMLButtonElement>(null);
  const definesTrigger = useRef<HTMLButtonElement>(null);
  const rulesTrigger = useRef<HTMLButtonElement>(null);

  /**
   * The section an editor already open reads: the one it was OPENED against.
   *
   * Never the one the row is pointing at now. The attribute being edited is
   * named by a record key that belongs to `editing.subject` alone, so a stage
   * a collaborator repoints mid-edit — from one type the codebook holds to
   * another — would otherwise leave this editor looking that key up in a
   * document it was never in, and telling the researcher their draft has gone
   * stale when nothing about it has.
   *
   * Resolved live FOR THAT SUBJECT rather than frozen with it, so a
   * collaborator's changes to the section itself still reach the editor and it
   * still reconciles its draft against them. The copy taken when it opened is
   * what is left when the section goes: deleting the node or edge type takes
   * the whole document away under a researcher who is mid-edit, and what was
   * already open holds a draft made in this session, of exactly the kind the
   * row dialog around it keeps through the same arrival. So it is kept too,
   * showing what it had, against the section it was opened for — and its save
   * is refused for the reason it is actually refused: there is nowhere left to
   * write it.
   *
   * The launch controls below read the LIVE section instead, because starting
   * an edit is exactly the question about what this row collects now.
   */
  const editingDocument = useCodebookSectionDocument(editing?.subject);
  const openEditor =
    editing === null
      ? null
      : { ...editing, document: editingDocument ?? editing.openedDocument };
  const sectionIsLive = subject !== undefined && codebookDocument !== undefined;

  const variables = variablesIn(codebookDocument);
  // An id no attribute carries is an attribute there is nothing to edit on —
  // which covers the sentinel a row picks while it is still inventing one.
  const picked = chosen === '' ? undefined : variables[chosen];
  const pickedType = asString(asRecord(picked).type) ?? '';
  const codebookComponent = asString(asRecord(picked).component) ?? '';
  // The row's own choice while it is being made, falling back to the codebook
  // for the render before the control has registered.
  const pickedComponent = asString(liveComponent) ?? codebookComponent;
  /**
   * The control whose choice decides what the CODEBOOK holds.
   *
   * The row's, wherever the row's control is the one being written to the
   * codebook: it was chosen a moment ago, and the editor writes it alongside
   * whatever depends on it. But a caller that keeps its control on the stage
   * (`offerParameters` false) never writes it, so the codebook's own control
   * is the only one its schema is keyed on — and judging by the row's would
   * offer a boolean's answer labels for an attribute the codebook records as a
   * toggle, whose schema has no `options` key to put them in.
   */
  const decidingComponent = offerParameters
    ? pickedComponent
    : codebookComponent;
  // Which list of answers the attribute holds — a list the researcher adds to,
  // or the two a boolean choice names. Asked of a control for the reason the
  // settings are: a boolean moved to a toggle holds no list at all.
  const optionsShape =
    picked === undefined
      ? null
      : optionsShapeFor(pickedType, decidingComponent);
  const canEditValues = optionsShape === 'choice';
  const canEditAnswers = optionsShape === 'boolean';
  const canEditParameters =
    offerParameters &&
    picked !== undefined &&
    parameterShapeFor(pickedType, pickedComponent) !== null;
  const canEditRules = offerRules && picked !== undefined;
  const canCreate =
    inventingType !== undefined && isCollectableType(inventingType);
  /**
   * Whether the invention is of a LIST of answers, which is what the create
   * controls are named after.
   *
   * Two ways to reach this editor rather than one: a list of answers, whose
   * values the researcher authors, and a scale, whose two end labels they
   * write. `needsCodebookEditorToCreate` decides WHICH types come here, and
   * this decides what they are told when they arrive — a scale sent here under
   * "and its values" would be asked for a list it does not have.
   */
  const creatingValues = isOptionType(inventingType ?? '');
  const createLabel = creatingValues
    ? messages.createWithValues
    : messages.createWithSettings;
  const createNeeds = creatingValues
    ? messages.createNeedsValues
    : messages.createNeedsSettings;
  const definesLabel = canEditValues
    ? messages.editValues
    : canEditAnswers
      ? messages.editAnswerLabels
      : messages.editParameters;

  /**
   * Whether another editor may be STARTED from here.
   *
   * A read-only stage makes this false, and a section that has gone makes it
   * false as well — the second is the stronger fact, because there is not even
   * a document to open an editor against. Neither makes anything else false: an
   * editor already open holds a draft the researcher made, of exactly the kind
   * the row dialog around it
   * deliberately keeps when the same thing happens. Unmounting it would throw
   * that draft away to say something the editor can say for itself, with its
   * own save refused — which is what `readOnly` does to both of them.
   */
  const offerLaunch =
    sectionIsLive &&
    !readOnly &&
    (canCreate ||
      canEditValues ||
      canEditAnswers ||
      canEditParameters ||
      canEditRules);
  // The notice below counts too: it is the only record of an attribute the
  // researcher created and this row did not take, and a component that
  // vanished at the moment it had something to say would take the sentence
  // with it.
  if (!offerLaunch && openEditor === null && createdElsewhere === undefined) {
    return null;
  }
  // The attributes an open editor is reading about, which are the ones in the
  // section it was opened against rather than whatever the row points at now.
  const editorVariables = variablesIn(openEditor?.document);
  /**
   * Whether the attribute an open editor was opened ON has been deleted from
   * under it.
   *
   * Asked of the LIVE section, and only of an editor that was opened on an
   * attribute: a create's `variableId` is a fresh id nothing holds yet, so the
   * same question there is always "yes" about an attribute that is about to
   * exist. A section that has gone answers `editorReadOnly` on its own terms
   * and is not this — there is no live document left to ask.
   */
  const editedAttributeDeleted =
    openEditor !== null &&
    openEditor.surface !== 'create' &&
    editingDocument !== undefined &&
    !Object.hasOwn(editorVariables, openEditor.variableId);

  /**
   * Whether what is open may be WRITTEN, which is four questions.
   *
   * A read-only stage says this researcher may write nothing. A section that
   * has gone is a section nothing can be written into, which says the same
   * thing from the other side. A stage that has been repointed at another type
   * says it a third way: the row this editor was opened from is a row about
   * something else now, and rules written for a person are not rules about
   * their family — so the draft is kept and shown, and refused.
   *
   * And the attribute itself can go while the section stays. This one is here
   * rather than left to the editor because `VariableEditor` cannot see it: an
   * absent attribute has no type, which it reads as a type someone CHANGED —
   * so the draft stayed writable and a press of Save came back "the attribute
   * type changed elsewhere. Close and reopen this editor", about an attribute
   * there is nothing left to reopen. The draft is kept and shown here too,
   * with `attributeDeleted` above it saying what actually happened.
   */
  const editorReadOnly =
    readOnly ||
    editingDocument === undefined ||
    openEditor === null ||
    editedAttributeDeleted ||
    subject === undefined ||
    sectionIdForCodebookSubject(subject) !==
      sectionIdForCodebookSubject(openEditor.subject);

  /**
   * The row's own attribute picker, as somewhere focus can always land.
   *
   * Scoped to the row dialog, so a picker on another surface cannot answer for
   * it. Resolved by hand rather than through `focusFirstError`'s
   * `resolveFieldErrorTarget`, which is the same lookup but refuses a
   * candidate inside an `[inert]` subtree — correct for an invalid submit, and
   * wrong here: this runs while the editor being closed is still open, so the
   * whole dialog behind it is inert and every candidate is rejected.
   */
  const rowPicker = (): HTMLElement | null => {
    const dialog = rowDialog.current;
    // A row dialog that has itself closed takes its picker with it, and a
    // detached node is exactly what this exists to avoid handing over.
    if (dialog === null || !dialog.isConnected) return null;
    const container = dialog.querySelector<HTMLElement>(
      `[data-field-path="${variableField}"]`,
    );
    for (const selector of FOCUS_TARGETS) {
      const found = container?.querySelector<HTMLElement>(selector);
      if (found) return found;
    }
    return null;
  };

  /**
   * Where focus goes when the VALUES or RULES editor closes.
   *
   * Its own trigger wherever that trigger is still there, and the row's picker
   * wherever it is not — because a `finalFocus` naming a detached node leaves
   * focus on `<body>`, where the next Tab starts at the top of the document
   * and a screen-reader user is returned to the page rather than to the row
   * they were in.
   *
   * These two are offered by facts about the LIVE codebook, and every one of
   * those can turn false under a researcher who is mid-edit: a collaborator
   * changing what kind of answer the attribute holds takes the values button
   * away, and deleting it takes both away, while the editor deliberately stays
   * open.
   * All of that has already happened by the time the editor is closed, which
   * is what makes "is it still there?" the right question to ask here — and
   * the wrong one for the create, whose trigger is still on screen at exactly
   * this moment and gone a render later.
   */
  const focusAfterEditor = (
    trigger: HTMLButtonElement | null,
  ): HTMLElement | null =>
    trigger?.isConnected === true ? trigger : rowPicker();

  const close = () => {
    setEditing(null);
  };

  /**
   * The codebook write an open editor asks for, with the dialog held shut
   * while it is in flight.
   *
   * The write outlives the dialog: dismissed mid-flight, the editor is
   * unmounted but the handler awaiting the host is still alive, so a refusal
   * is shown to nobody and a success still runs `onComplete` — which, for the
   * create, binds the row to an attribute the researcher watched no editor
   * finish. `SubjectSection`'s own create dialog withholds every way out for
   * exactly this, and these three are the same act.
   *
   * Bound to the subject the editor OPENED on, so a write cannot land on the
   * type a repointed stage has moved to since.
   *
   * And bound to the attribute it is editing, and to the properties of it the
   * editor set, because that is all of the editor's document the write takes:
   * `useCodebookSectionWrite` hands the section back as the host holds it at
   * the moment the lock is taken, and only what the editor owns is laid over
   * it. Handing back the whole assembled document instead would carry the
   * codebook as this editor last rendered it, deleting whatever a collaborator
   * wrote in between; handing back the whole attribute would do the same to
   * the rest of the record, which the two other surfaces here write.
   */
  const submitEdit =
    (target: CodebookSubject, variableId: string) =>
    async (document: SectionDoc, ownedProperties?: readonly string[]) => {
      setSubmitting(true);
      try {
        return await writeCodebookSection(target, (authoritativeDocument) =>
          documentWithRebasedVariable({
            subject: target,
            authoritativeDocument,
            variableId,
            submittedDocument: document,
            ownedProperties,
          }),
        );
      } finally {
        setSubmitting(false);
      }
    };

  /**
   * Every way out of a nested editor, which is one handler.
   *
   * Escape, a press outside and the close button all arrive at `closeDialog`,
   * so refusing here covers all three — and `dismissible` takes the close
   * button away rather than leaving a control on screen that does nothing.
   */
  const requestClose = () => {
    if (submitting) return;
    close();
  };
  const open = (
    surface: 'create' | 'defines' | 'rules',
    label: MessageDescriptor,
  ) => {
    // Every control that calls this is offered only while the section is live,
    // and the check is written out rather than assumed because what it takes
    // is what the editor goes on reading until it closes.
    if (subject === undefined || codebookDocument === undefined) return;
    // The notice is about the create that has just happened; opening another
    // editor is the start of a different one. Same rule, and the same reason,
    // as the picker's own notice clearing when the researcher types a new name.
    setCreatedElsewhere(undefined);
    setEditing({
      openId: uuid(),
      surface,
      label,
      name: asString(asRecord(picked).name) ?? chosen,
      variableId: surface === 'create' ? uuid() : chosen,
      subject,
      fillsIn: chosen,
      openedDocument: codebookDocument,
      component: pickedComponent,
    });
  };

  /** The dialog's title: the words on the button the researcher pressed. */
  const editorTitle = editing === null ? '' : intl.formatMessage(editing.label);

  return (
    <>
      {offerLaunch && canCreate && (
        <p className="mb-3 text-sm text-current/70">
          {intl.formatMessage(createNeeds)}
        </p>
      )}
      {/* The container is rendered whether or not it holds anything, because
          it is what tells `rowPicker` which dialog this row is. */}
      <div
        ref={holdRowDialog}
        className={offerLaunch ? 'mb-8 flex flex-wrap gap-3' : undefined}
      >
        {offerLaunch && canCreate && (
          <Button
            ref={createTrigger}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => open('create', createLabel)}
          >
            {intl.formatMessage(createLabel)}
          </Button>
        )}
        {offerLaunch &&
          (canEditValues || canEditAnswers || canEditParameters) && (
            <Button
              ref={definesTrigger}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => open('defines', definesLabel)}
            >
              {intl.formatMessage(definesLabel)}
            </Button>
          )}
        {offerLaunch && canEditRules && (
          <Button
            ref={rulesTrigger}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => open('rules', messages.editRules)}
          >
            {intl.formatMessage(messages.editRules)}
          </Button>
        )}
      </div>
      {/* Always mounted, so a screen reader is watching this region before the
          notice appears: a live region added to the page at the same moment as
          its own content is not reliably announced. The `Alert` inside it is
          presentational for the same reason its twin in
          `VariablePickerField` is — its `info` variant is a `role="status"`
          of its own, and a second polite region inserted into this one is the
          double announcement this wrapper exists to avoid. */}
      <div
        role="status"
        aria-live="polite"
        className={createdElsewhere === undefined ? undefined : 'mb-8'}
      >
        {createdElsewhere !== undefined && (
          <Alert variant="info" role="presentation">
            <AlertDescription>
              {intl.formatMessage(createdUnassigned, {
                variableName: createdElsewhere,
              })}
            </AlertDescription>
          </Alert>
        )}
      </div>
      {/* Each surface is written out rather than switched inside one dialog:
          which attribute an editor is editing is decided when it OPENS, and a
          shared dialog would hand it whatever the row named by the time it
          rendered.

          Only `create` re-checks the guard that offered it, and the asymmetry
          is deliberate. `canCreate` is a fact about the ROW — it is false the
          moment the picker names something, which is what the create's own
          `onComplete` does — so leaving that dialog mounted would leave an
          editor open over an invention that has already happened. The other
          two guards are facts about the CODEBOOK, which is live: a
          collaborator deleting the attribute makes them false under a
          researcher who is mid-edit, and closing the editor from under them
          would throw away what they had typed to tell them something the
          editor beneath already says for itself
          (`variableValidation.staleAuthoritativeDescription`,
          `codebookVariable.typeChangedElsewhere`). */}
      {openEditor?.surface === 'create' && canCreate && (
        <Dialog
          open
          title={editorTitle}
          size="readable"
          dismissible={!submitting}
          closeDialog={requestClose}
          // The picker outright, rather than the trigger-if-it-is-still-there
          // rule the other two use. Creating the attribute is what takes this
          // row out of inventing one, so the button that opened this editor is
          // gone a render after it closes — and it is still in the document
          // while focus is being returned, so asking whether it is there gets
          // the wrong answer and leaves focus on a node about to be detached.
          // The picker is the control the create just set, and the one thing
          // on this surface guaranteed to outlive the button.
          finalFocus={() => rowPicker() ?? createTrigger.current}
        >
          <VariableEditor
            mode="create"
            openId={openEditor.openId}
            subject={openEditor.subject}
            protocolContext={protocolContext}
            authoritativeDocument={openEditor.document}
            variableId={openEditor.variableId}
            // The empty list only where a list is what is being authored. The
            // editor passes a choice list through as the draft holds it, and
            // every variable schema is a STRICT object that admits only its
            // own keys — so an `options: []` seeded onto a scale would be
            // written into the create request and refused there, for a key the
            // researcher never saw a control for.
            initialDraft={{
              name: '',
              type: inventingType,
              ...(creatingValues ? { options: [] } : {}),
            }}
            // The kind of answer was chosen in the row behind this, and the
            // whole reason the editor is open is what that kind needs beyond a
            // name.
            allowedVariableTypes={[inventingType]}
            readOnly={editorReadOnly}
            title={editorTitle}
            onSubmitDocument={submitEdit(
              openEditor.subject,
              openEditor.variableId,
            )}
            onComplete={(variableId, variableName) => {
              // Which codebook the attribute was written into, and which field
              // it was going to fill in, were both decided when this editor
              // opened — and either can move while the request is with the
              // host. Asked HERE rather than of `editorReadOnly`, which is a
              // fact about the render the researcher pressed Create in: this
              // runs afterwards, out of a closure made before the protocol
              // moved. The one reading of that question is
              // `useWhereTheAnswerLands`.
              //
              // A record key belongs to exactly one type, so a row that has
              // moved can neither resolve this id nor save it — it would leave
              // the field pointing into a codebook it does not read. The write
              // itself landed and stands; only the assignment does not happen,
              // and the researcher is told where the attribute went.
              if (
                whereTheAnswerLands({
                  subject: openEditor.subject,
                  fillsIn: openEditor.fillsIn,
                }) === 'here'
              ) {
                // The picker now names something that exists, which is what
                // takes this row out of inventing anything.
                setFieldValue(variableField, variableId);
              } else {
                setCreatedElsewhere(variableName);
              }
              close();
            }}
          />
        </Dialog>
      )}
      {openEditor?.surface === 'defines' && (
        <Dialog
          open
          title={editorTitle}
          size="readable"
          dismissible={!submitting}
          closeDialog={requestClose}
          finalFocus={() => focusAfterEditor(definesTrigger.current)}
        >
          {/* Said here rather than left to the editor, and only on THIS
              surface. `VariableEditor` reads an absent attribute as a retyped
              one and has no wording for a deleted one; the rules editor has
              its own (`variableValidation.attributeUnavailableTitle`), and a
              second sentence over the top of it would say the same thing
              twice. */}
          {editedAttributeDeleted && (
            <Alert variant="destructive" appearance="soft" density="compact">
              <AlertTitle>
                {intl.formatMessage(messages.attributeDeletedTitle)}
              </AlertTitle>
              <AlertDescription>
                {intl.formatMessage(messages.attributeDeletedDescription)}
              </AlertDescription>
            </Alert>
          )}
          <VariableEditor
            mode="update"
            openId={openEditor.openId}
            subject={openEditor.subject}
            authoritativeDocument={openEditor.document}
            variableId={openEditor.variableId}
            // The control comes from the row rather than from the codebook,
            // because the row is where it was just chosen. The editor writes
            // it alongside the settings that depend on it, so the pair can
            // never disagree; the row's own save then finds it already there.
            //
            // Only where those settings ARE the codebook's, though: a caller
            // that keeps its control on the stage passes `offerParameters`
            // false, and reaches this surface for an attribute's VALUES alone,
            // which no control decides.
            initialDraft={{
              ...asRecord(editorVariables[openEditor.variableId]),
              ...(!offerParameters || openEditor.component === ''
                ? {}
                : { component: openEditor.component }),
            }}
            // The type is what the chosen input control was chosen FOR, so
            // changing it here would leave the field promising a control the
            // interview cannot render for it.
            //
            // Read from the ROW, which is where the control was chosen, and so
            // from the live subject's codebook. The two can only disagree once
            // the stage has been repointed at another type, and this editor is
            // read-only from that moment on — so what it offers is always the
            // type the attribute it is editing actually has.
            allowedVariableTypes={
              isCollectableType(pickedType) ? [pickedType] : undefined
            }
            readOnly={editorReadOnly}
            title={editorTitle}
            onSubmitDocument={submitEdit(
              openEditor.subject,
              openEditor.variableId,
            )}
            onComplete={close}
          />
        </Dialog>
      )}
      {openEditor?.surface === 'rules' && (
        <Dialog
          open
          title={editorTitle}
          size="readable"
          dismissible={!submitting}
          closeDialog={requestClose}
          finalFocus={() => focusAfterEditor(rulesTrigger.current)}
        >
          <CodebookVariableValidationEditor
            openId={openEditor.openId}
            subject={openEditor.subject}
            variableId={openEditor.variableId}
            authoritativeEntityDocument={openEditor.document}
            allSubjectVariables={editorVariables}
            readOnly={editorReadOnly}
            onSubmitDocument={submitEdit(
              openEditor.subject,
              openEditor.variableId,
            )}
            onComplete={close}
          />
        </Dialog>
      )}
    </>
  );
}
