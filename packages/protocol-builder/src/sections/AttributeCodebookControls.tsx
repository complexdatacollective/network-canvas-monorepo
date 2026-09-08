import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { v4 as uuid } from 'uuid';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariableEditor from '../codebook/components/VariableEditor.tsx';
import { useCodebookSectionDocument } from '../codebook/useCodebookVariableEdits.ts';
import CodebookVariableValidationEditor from '../codebook/validation/CodebookVariableValidationEditor.tsx';
import { optionsShapeFor } from '../codebook/variableOptions.ts';
import { parameterShapeFor } from '../codebook/variableParameters.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { isCollectableType } from './collectableTypes.ts';

/** Where every row that binds an attribute keeps the attribute it binds. */
const VARIABLE_FIELD = 'variable';

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
  describeCreate: {
    id: 'protocolBuilder.attributeCodebookControls.describeCreate',
    defaultMessage: 'Create an attribute for a form field',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers. The attribute has no name yet — the researcher is about to type one — so this is the one edit here that cannot name it.',
  },
  describeValues: {
    id: 'protocolBuilder.attributeCodebookControls.describeValues',
    defaultMessage: 'Change the values of "{name}"',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers. name is the attribute’s researcher-facing name.',
  },
  describeAnswerLabels: {
    id: 'protocolBuilder.attributeCodebookControls.describeAnswerLabels',
    defaultMessage: 'Change the answer labels of "{name}"',
    description:
      'The same record for a yes/no attribute, whose two stored values are fixed and whose words are what a researcher writes. name is the attribute’s researcher-facing name.',
  },
  describeParameters: {
    id: 'protocolBuilder.attributeCodebookControls.describeParameters',
    defaultMessage: 'Change what "{name}" accepts',
    description:
      'The same record for an attribute whose answer is not chosen from a list — a date between two bounds, a position on a scale. name is the attribute’s researcher-facing name.',
  },
  describeRules: {
    id: 'protocolBuilder.attributeCodebookControls.describeRules',
    defaultMessage: 'Change the rules for "{name}"',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers. name is the attribute’s researcher-facing name.',
  },
  createNeedsValues: {
    id: 'protocolBuilder.attributeCodebookControls.createNeedsValues',
    defaultMessage:
      'An attribute participants choose an answer from needs at least two values, so it is created together with them.',
    description:
      'Shown above the buttons when the researcher is inventing an attribute whose answers come from a list, explaining why they are sent to the codebook editor rather than being asked for a name here.',
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const variablesIn = (
  document: Readonly<SectionDoc> | null,
): Record<string, unknown> =>
  document === null ? {} : asRecord(document.variables);

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
 * different protocol section from the stage: changing it is a compound edit
 * that lands whole or not at all, and a save that carried both would be a
 * stage the schema cannot accept until the attribute exists. So each opens the
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
  componentField,
  inventingType,
  offerParameters = true,
}: AttributeCodebookControlsProps) {
  const intl = useAppIntl();
  const { controller, protocolContext, readOnly } = useStageEditorForm();
  const codebookDocument = useCodebookSectionDocument(subject);
  // The dialog's OWN store: the picker's choice is the row's, and the created
  // attribute has to land on it rather than on the stage behind it.
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const chosen =
    asString(useRowValue(VARIABLE_FIELD) ?? committedVariable) ?? '';
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
    describe: MessageDescriptor;
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
   * The last section there WAS to edit, for an editor that outlives it.
   *
   * A collaborator deleting the node or edge type takes this whole document
   * away under a researcher who is mid-edit, and so does a stage repointed at
   * a type the codebook does not hold. What was already open then holds a
   * draft made in this session, of exactly the kind the row dialog around it
   * keeps through the same arrival — so it is kept too, showing what it had,
   * against the section it was opened for. Its save is refused for the reason
   * it is actually refused: there is nowhere left to write it.
   *
   * Held in an effect rather than written during the render, so the render
   * where the section goes still reads the one before it.
   */
  const lastSection = useRef<Readonly<{
    subject: CodebookSubject;
    document: SectionDoc;
  }> | null>(null);
  useEffect(() => {
    if (subject !== undefined && codebookDocument !== null) {
      lastSection.current = { subject, document: codebookDocument };
    }
  }, [codebookDocument, subject]);
  const sectionIsLive = subject !== undefined && codebookDocument !== null;
  const section =
    subject === undefined || codebookDocument === null
      ? lastSection.current
      : { subject, document: codebookDocument };

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
  const canEditRules = picked !== undefined;
  const canCreate =
    inventingType !== undefined && isCollectableType(inventingType);
  const definesLabel = canEditValues
    ? messages.editValues
    : canEditAnswers
      ? messages.editAnswerLabels
      : messages.editParameters;
  const definesDescribe = canEditValues
    ? messages.describeValues
    : canEditAnswers
      ? messages.describeAnswerLabels
      : messages.describeParameters;

  // Nothing to edit AGAINST, and nothing ever was: there is no codebook for
  // these editors to read, and no editor open that was reading one.
  if (section === null) {
    return null;
  }
  /**
   * Whether another editor may be STARTED from here.
   *
   * A lease taken back by a collaborator makes this false, and a section that
   * has gone makes it false as well — the second is the stronger fact, because
   * there is not even a document to open an editor against. Neither makes
   * anything else false: an editor already open holds a draft the researcher
   * made in this session, of exactly the kind the row dialog around it
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
  if (!offerLaunch && editing === null) {
    return null;
  }
  // What the open editor reads, which is the section it was opened against
  // rather than whatever the row is pointing at now.
  const editorVariables = variablesIn(section.document);
  // A section that has gone is a section nothing can be written into, which is
  // the same thing a lost lease says about this researcher.
  const editorReadOnly = readOnly || !sectionIsLive;

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
      `[data-field-path="${VARIABLE_FIELD}"]`,
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
   * These two are offered by facts about the LIVE codebook and the live lease,
   * and every one of those can turn false under a researcher who is mid-edit:
   * a collaborator changing what kind of answer the attribute holds takes the
   * values button away, deleting it takes both away, and a lease taken back
   * takes every launch control away while the editor deliberately stays open.
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
  const open = (
    surface: 'create' | 'defines' | 'rules',
    label: MessageDescriptor,
    describe: MessageDescriptor,
  ) => {
    setEditing({
      openId: uuid(),
      surface,
      label,
      describe,
      name: asString(asRecord(picked).name) ?? chosen,
      variableId: surface === 'create' ? uuid() : chosen,
      component: pickedComponent,
    });
  };

  /**
   * The dialog's title, and what the host is told this edit is.
   *
   * Two different sentences, which is the point: the title is the words on the
   * button the researcher pressed, and a host's undo history that repeated
   * those would read "Change this attribute's values" for every attribute a
   * researcher has ever changed the values of. The record names the one they
   * changed.
   */
  const editorTitle = editing === null ? '' : intl.formatMessage(editing.label);
  const editorDescription =
    editing === null
      ? ''
      : intl.formatMessage(editing.describe, { name: editing.name });

  return (
    <>
      {offerLaunch && canCreate && (
        <p className="mb-3 text-sm text-current/70">
          {intl.formatMessage(messages.createNeedsValues)}
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
            onClick={() =>
              open('create', messages.createWithValues, messages.describeCreate)
            }
          >
            {intl.formatMessage(messages.createWithValues)}
          </Button>
        )}
        {offerLaunch &&
          (canEditValues || canEditAnswers || canEditParameters) && (
            <Button
              ref={definesTrigger}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => open('defines', definesLabel, definesDescribe)}
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
            onClick={() =>
              open('rules', messages.editRules, messages.describeRules)
            }
          >
            {intl.formatMessage(messages.editRules)}
          </Button>
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
      {editing?.surface === 'create' && canCreate && (
        <Dialog
          open
          title={editorTitle}
          size="readable"
          closeDialog={close}
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
            openId={editing.openId}
            subject={section.subject}
            protocolContext={protocolContext}
            authoritativeDocument={section.document}
            variableId={editing.variableId}
            initialDraft={{ name: '', type: inventingType, options: [] }}
            // The kind of answer was chosen in the row behind this, and the
            // whole reason the editor is open is the values that kind needs.
            allowedVariableTypes={[inventingType]}
            readOnly={editorReadOnly}
            title={editorTitle}
            description={editorDescription}
            createRequestId={() => uuid()}
            onSubmitRequest={(request) =>
              controller.requestCompoundEdit(request)
            }
            onComplete={(variableId) => {
              // The picker now names something that exists, which is what
              // takes this row out of inventing anything.
              setFieldValue(VARIABLE_FIELD, variableId);
              close();
            }}
          />
        </Dialog>
      )}
      {editing?.surface === 'defines' && (
        <Dialog
          open
          title={editorTitle}
          size="readable"
          closeDialog={close}
          finalFocus={() => focusAfterEditor(definesTrigger.current)}
        >
          <VariableEditor
            mode="update"
            openId={editing.openId}
            subject={section.subject}
            authoritativeDocument={section.document}
            variableId={editing.variableId}
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
              ...asRecord(editorVariables[editing.variableId]),
              ...(!offerParameters || editing.component === ''
                ? {}
                : { component: editing.component }),
            }}
            // The type is what the chosen input control was chosen FOR, so
            // changing it here would leave the field promising a control the
            // interview cannot render for it.
            allowedVariableTypes={
              isCollectableType(pickedType) ? [pickedType] : undefined
            }
            readOnly={editorReadOnly}
            title={editorTitle}
            description={editorDescription}
            createRequestId={() => uuid()}
            onSubmitRequest={(request) =>
              controller.requestCompoundEdit(request)
            }
            onComplete={close}
          />
        </Dialog>
      )}
      {editing?.surface === 'rules' && (
        <Dialog
          open
          title={editorTitle}
          size="readable"
          closeDialog={close}
          finalFocus={() => focusAfterEditor(rulesTrigger.current)}
        >
          <CodebookVariableValidationEditor
            openId={editing.openId}
            subject={section.subject}
            variableId={editing.variableId}
            authoritativeEntityDocument={section.document}
            allSubjectVariables={editorVariables}
            requestMetadata={{
              createId: () => uuid(),
              description: editorDescription,
            }}
            readOnly={editorReadOnly}
            onSubmitRequest={(request) =>
              controller.requestCompoundEdit(request)
            }
            onComplete={close}
          />
        </Dialog>
      )}
    </>
  );
}
