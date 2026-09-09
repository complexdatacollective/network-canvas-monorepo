import { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import CodebookEntityEditor from '../codebook/components/CodebookEntityEditor.tsx';
import type { CodebookEntityDraft } from '../codebook/editing.ts';
import { useCreateCodebookEntity } from '../codebook/writes.ts';
import {
  type EntityTypeChangeConfirmation,
  useConfirmEntityTypeChange,
} from '../fields/EntitySelectField.tsx';
import SubjectSelectField, {
  type EntitySubject,
} from '../fields/SubjectSelectField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useAskStageHasAnyValue } from '../form/stageFormHooks.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import BuilderSection from './BuilderSection.tsx';
import NetworkFilterSection from './NetworkFilterSection.tsx';
import {
  useResetStageOnSubjectChange,
  useSubjectChangeDiscards,
} from './useResetStageOnSubjectChange.ts';

/** What this stage works on. Ego stages have no type to pick, so no section. */
export type SubjectEntity = EntitySubject['entity'];

const messages = defineMessages({
  nodeTitle: {
    id: 'protocolBuilder.subjectSection.nodeTitle',
    defaultMessage: 'Node type',
    description:
      'Heading of the section where a researcher says which kind of network member this step of the interview is about. A node is one member of the network a participant describes.',
  },
  nodeDescription: {
    id: 'protocolBuilder.subjectSection.nodeDescription',
    defaultMessage: 'Choose the type of node this stage works with.',
    description:
      'Description of the node-type section. A stage is one step of an interview.',
  },
  nodeFieldLabel: {
    id: 'protocolBuilder.subjectSection.nodeFieldLabel',
    defaultMessage: 'Node type',
    description:
      'Label of the control choosing which kind of network member this step of the interview is about. The same words as the section heading, and translated once for each: the heading names the part of the stage, and this names the control.',
  },
  nodeFieldHint: {
    id: 'protocolBuilder.subjectSection.nodeFieldHint',
    defaultMessage:
      'Every node this stage creates or shows will be of the type you choose here.',
    description: 'Guidance under the node-type control.',
  },
  nodeCreateLabel: {
    id: 'protocolBuilder.subjectSection.nodeCreateLabel',
    defaultMessage: 'Create a new node type',
    description:
      'Button that opens an editor for inventing a kind of network member without leaving the stage being configured. Also the title of the dialog it opens.',
  },
  nodeChangeTitle: {
    id: 'protocolBuilder.subjectSection.nodeChangeTitle',
    defaultMessage: 'Change the node type?',
    description:
      'Title of the confirmation raised when a researcher picks a different kind of network member for a stage that is already configured for the one it has.',
  },
  nodeChangeDescription: {
    id: 'protocolBuilder.subjectSection.nodeChangeDescription',
    defaultMessage:
      'Everything else on this stage describes the node type it works with now, and choosing a different type removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks a different kind of network member for a stage that is already configured. A stage is one step of an interview.',
  },
  nodeChangeConfirm: {
    id: 'protocolBuilder.subjectSection.nodeChangeConfirm',
    defaultMessage: 'Change the node type',
    description:
      'Button that goes ahead with changing the kind of network member a stage works with, throwing away the configuration that described the previous one.',
  },
  nodeFirstChoiceTitle: {
    id: 'protocolBuilder.subjectSection.nodeFirstChoiceTitle',
    defaultMessage: 'Choose the node type?',
    description:
      'Title of the confirmation raised when a researcher picks the first kind of network member for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  nodeFirstChoiceDescription: {
    id: 'protocolBuilder.subjectSection.nodeFirstChoiceDescription',
    defaultMessage:
      'Everything else on this stage was configured without a node type, and choosing one removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks the first kind of network member for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  nodeFirstChoiceConfirm: {
    id: 'protocolBuilder.subjectSection.nodeFirstChoiceConfirm',
    defaultMessage: 'Choose the node type',
    description:
      'Button that goes ahead with choosing the first kind of network member a stage works with, throwing away the configuration entered before it.',
  },
  edgeTitle: {
    id: 'protocolBuilder.subjectSection.edgeTitle',
    defaultMessage: 'Edge type',
    description:
      'Heading of the section where a researcher says which kind of relationship this step of the interview is about. An edge is a connection between two members of the network.',
  },
  edgeDescription: {
    id: 'protocolBuilder.subjectSection.edgeDescription',
    defaultMessage: 'Choose the type of edge this stage works with.',
    description:
      'Description of the edge-type section. A stage is one step of an interview.',
  },
  edgeFieldLabel: {
    id: 'protocolBuilder.subjectSection.edgeFieldLabel',
    defaultMessage: 'Edge type',
    description:
      'Label of the control choosing which kind of relationship this step of the interview is about. The same words as the section heading, and translated once for each.',
  },
  edgeFieldHint: {
    id: 'protocolBuilder.subjectSection.edgeFieldHint',
    defaultMessage:
      'Every edge this stage creates or shows will be of the type you choose here.',
    description: 'Guidance under the edge-type control.',
  },
  edgeCreateLabel: {
    id: 'protocolBuilder.subjectSection.edgeCreateLabel',
    defaultMessage: 'Create a new edge type',
    description:
      'Button that opens an editor for inventing a kind of relationship without leaving the stage being configured. Also the title of the dialog it opens.',
  },
  edgeChangeTitle: {
    id: 'protocolBuilder.subjectSection.edgeChangeTitle',
    defaultMessage: 'Change the edge type?',
    description:
      'Title of the confirmation raised when a researcher picks a different kind of relationship for a stage that is already configured for the one it has.',
  },
  edgeChangeDescription: {
    id: 'protocolBuilder.subjectSection.edgeChangeDescription',
    defaultMessage:
      'Everything else on this stage describes the edge type it works with now, and choosing a different type removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks a different kind of relationship for a stage that is already configured. A stage is one step of an interview.',
  },
  edgeChangeConfirm: {
    id: 'protocolBuilder.subjectSection.edgeChangeConfirm',
    defaultMessage: 'Change the edge type',
    description:
      'Button that goes ahead with changing the kind of relationship a stage works with, throwing away the configuration that described the previous one.',
  },
  edgeFirstChoiceTitle: {
    id: 'protocolBuilder.subjectSection.edgeFirstChoiceTitle',
    defaultMessage: 'Choose the edge type?',
    description:
      'Title of the confirmation raised when a researcher picks the first kind of relationship for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  edgeFirstChoiceDescription: {
    id: 'protocolBuilder.subjectSection.edgeFirstChoiceDescription',
    defaultMessage:
      'Everything else on this stage was configured without an edge type, and choosing one removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks the first kind of relationship for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  edgeFirstChoiceConfirm: {
    id: 'protocolBuilder.subjectSection.edgeFirstChoiceConfirm',
    defaultMessage: 'Choose the edge type',
    description:
      'Button that goes ahead with choosing the first kind of relationship a stage works with, throwing away the configuration entered before it.',
  },
});

/**
 * The words each subject uses, whole per subject rather than a noun swapped
 * into a shared frame: "a node" and "an edge" do not differ only in the noun
 * in every language, and this is the one place a researcher is told what the
 * stage is about.
 *
 * Formatted with no values, like every named descriptor a shared section
 * takes: one carrying a placeholder renders the pattern on screen, and nothing
 * in the types can refuse it. See `PromptsSection`'s own note and
 * `sections/__tests__/namedDescriptorProps.test.tsx`, which lands with the
 * form-fields section — the first surface to take a whole set of them. This
 * section's own words come from the table below rather than from a prop, so
 * what would break the rule here is an edit to this package's catalog, which
 * the locale sweep sees.
 */
type SubjectWords = Readonly<{
  title: MessageDescriptor;
  description: MessageDescriptor;
  fieldLabel: MessageDescriptor;
  fieldHint: MessageDescriptor;
  createLabel: MessageDescriptor;
  /** What the researcher is asked before a change that costs them the stage. */
  changeTitle: MessageDescriptor;
  changeDescription: MessageDescriptor;
  changeConfirm: MessageDescriptor;
  /**
   * And what they are asked when the stage has no type yet.
   *
   * The same cost, described truthfully: there is no type the rest of the
   * stage describes, so the sentence about replacing one would be about a
   * change that is not happening.
   */
  firstChoiceTitle: MessageDescriptor;
  firstChoiceDescription: MessageDescriptor;
  firstChoiceConfirm: MessageDescriptor;
}>;

const WORDS: Readonly<Record<SubjectEntity, SubjectWords>> = Object.freeze({
  node: Object.freeze({
    title: messages.nodeTitle,
    description: messages.nodeDescription,
    fieldLabel: messages.nodeFieldLabel,
    fieldHint: messages.nodeFieldHint,
    createLabel: messages.nodeCreateLabel,
    changeTitle: messages.nodeChangeTitle,
    changeDescription: messages.nodeChangeDescription,
    changeConfirm: messages.nodeChangeConfirm,
    firstChoiceTitle: messages.nodeFirstChoiceTitle,
    firstChoiceDescription: messages.nodeFirstChoiceDescription,
    firstChoiceConfirm: messages.nodeFirstChoiceConfirm,
  }),
  edge: Object.freeze({
    title: messages.edgeTitle,
    description: messages.edgeDescription,
    fieldLabel: messages.edgeFieldLabel,
    fieldHint: messages.edgeFieldHint,
    createLabel: messages.edgeCreateLabel,
    changeTitle: messages.edgeChangeTitle,
    changeDescription: messages.edgeChangeDescription,
    changeConfirm: messages.edgeChangeConfirm,
    firstChoiceTitle: messages.edgeFirstChoiceTitle,
    firstChoiceDescription: messages.edgeFirstChoiceDescription,
    firstChoiceConfirm: messages.edgeFirstChoiceConfirm,
  }),
});

/**
 * A brand-new type the researcher only has to name.
 *
 * Every property the schema requires is pre-filled, because the point of
 * creating a type from inside a stage is to get back to configuring the stage:
 * the colour, shape and icon are all editable afterwards from the codebook.
 */
export const NEW_ENTITY_DRAFT: Readonly<
  Record<SubjectEntity, CodebookEntityDraft>
> = Object.freeze({
  node: Object.freeze({
    name: '',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    icon: 'Circle',
  }),
  edge: Object.freeze({ name: '', color: 'edge-color-seq-1' }),
});

export type SubjectSectionProps = Readonly<{
  entity: SubjectEntity;
  /**
   * Also offer the stage's own network filter.
   *
   * A separate section rather than a control inside this one: a filter is a
   * question about the whole network that the researcher switches on and off,
   * with rules of its own to lose when they switch it off, and the outline has
   * to be able to say so about it independently of whether a type is chosen.
   */
  filter?: boolean;
}>;

/**
 * The question the picker asks before it lets a pick through, or nothing at
 * all when there is nothing to lose.
 *
 * Asked here rather than by the reset, because the reset watches the value and
 * runs once it has already moved: a question asked there would be about a
 * change the researcher can already see, and answering "no" would mean putting
 * the picker back.
 *
 * Whether the stage HAS a type yet decides only which words are used, never
 * whether the question is raised. The reset throws away everything the stage is
 * carrying whichever way the subject moved, so a first choice made over a
 * filter written before any type was picked costs exactly what a change costs;
 * a guard keyed on the value rather than on the loss let that one through in
 * silence. What differs is what is TRUE about the loss, so each case says its
 * own sentence rather than one of them claiming a type is being replaced.
 *
 * A function rather than a value, for the reason `useSubjectChangeDiscards`
 * gives: it reads what the stage is carrying at the moment of the change.
 */
function useSubjectChangeQuestion(
  words: SubjectWords,
  intl: IntlShape,
): () => EntityTypeChangeConfirmation | undefined {
  const discardsConfiguration = useSubjectChangeDiscards();
  const hasAnyValue = useAskStageHasAnyValue();
  return useCallback(() => {
    if (!discardsConfiguration()) return undefined;
    // Asked through the same "holds an answer" the loss itself is judged by,
    // so the two cannot disagree about what the stage is carrying.
    const asked = hasAnyValue(['subject'])
      ? {
          title: words.changeTitle,
          description: words.changeDescription,
          confirmLabel: words.changeConfirm,
        }
      : {
          title: words.firstChoiceTitle,
          description: words.firstChoiceDescription,
          confirmLabel: words.firstChoiceConfirm,
        };
    return {
      title: intl.formatMessage(asked.title),
      description: intl.formatMessage(asked.description),
      confirmLabel: intl.formatMessage(asked.confirmLabel),
    };
  }, [discardsConfiguration, hasAnyValue, intl, words]);
}

/**
 * Which part of the network this stage is about.
 *
 * The stage's `subject` and nothing else. The types come from the editor's own
 * protocol context, so a type a collaborator adds or deletes while the editor
 * is open appears or disappears here without this section doing anything, and
 * a researcher who needs a type the protocol does not have yet can create one
 * without leaving the stage.
 *
 * Changing the subject throws away everything that described the previous
 * type, because a prompt naming its variables means nothing against a
 * different one. See `useResetStageOnSubjectChange`.
 */
export default function SubjectSection({
  entity,
  filter = false,
}: SubjectSectionProps) {
  const intl = useAppIntl();
  const words = WORDS[entity];
  useResetStageOnSubjectChange();

  const confirmChange = useSubjectChangeQuestion(words, intl);

  return (
    <>
      <BuilderSection
        title={intl.formatMessage(words.title)}
        description={intl.formatMessage(words.description)}
      >
        <ProtocolField<typeof SubjectSelectField>
          name="subject"
          component={SubjectSelectField}
          entityType={entity}
          confirmChange={confirmChange}
          label={intl.formatMessage(words.fieldLabel)}
          hint={intl.formatMessage(words.fieldHint)}
          required
        />
        <CreateSubjectType
          entity={entity}
          words={words}
          intl={intl}
          confirmChange={confirmChange}
        />
      </BuilderSection>
      {filter && <NetworkFilterSection subject={entity} />}
    </>
  );
}

/**
 * Creates a codebook type and selects it on this stage.
 *
 * The type is created through the host's own atomic create, which is what
 * puts a new section into the protocol and mints its id. Selecting it
 * afterwards is an ordinary form
 * change rather than part of that edit, and deliberately so: a host keeps the
 * stored protocol valid, and a stage that has just been pointed at a brand-new
 * type has no prompts, no form and no panels for it — an invalid stage, which
 * a host is right to refuse. Saved as one edit this could never succeed for
 * any interface whose schema requires the configuration the change throws
 * away, which is all of them. So the type lands in the codebook, the stage
 * points at it locally, and the researcher configures it before saving.
 *
 * Which is why the SELECTION is asked about, and separately from the create.
 * It moves the stage's subject exactly as the picker does, and costs the stage
 * exactly what the picker costs it, so it asks the picker's own question — a
 * researcher who created a type to use somewhere else, or who realises what it
 * would cost while reading the question, keeps the stage they had and the type
 * they made.
 */
function CreateSubjectType({
  entity,
  words,
  intl,
  confirmChange,
}: Readonly<{
  entity: SubjectEntity;
  words: SubjectWords;
  intl: IntlShape;
  /** The picker's own question, asked before this selects the new type. */
  confirmChange: () => EntityTypeChangeConfirmation | undefined;
}>) {
  const { readOnly, storeApi } = useStageEditorForm();
  const codebook = useProtocolContext().codebook;
  const createEntity = useCreateCodebookEntity();
  const [session, setSession] = useState<{
    key: string;
    typeId: string;
  } | null>(null);
  /**
   * Whether a create is in flight, which is a fact this host has for itself:
   * the editor owns the draft and this owns request execution, so the request
   * passes through here on its way out and its answer on the way back.
   */
  const [submitting, setSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Every type name the protocol already carries, of BOTH kinds.
   *
   * Node and edge types share one namespace — the rule Architect's own type
   * editor has always applied — because a name is how a researcher tells one
   * from another everywhere it matters: the codebook lists them by name, an
   * export names them, and a rule or a form naming one reads as naming the
   * other. Judged against the kind being created alone, a node could be given
   * an edge's name, and the editor's deliberate folding of case and Unicode
   * form would let a pair through that nobody reading the codebook could tell
   * apart.
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

  const confirmEntityTypeChange = useConfirmEntityTypeChange();

  const selectCreatedType = useCallback(
    (typeId: string) => {
      // Written into the form rather than dispatched, so it is the researcher's
      // own unsaved change — which is what lets the subject-change reset run
      // over it and clear the configuration that belonged to the old type.
      const select = () =>
        storeApi
          .getState()
          .setFieldValue(
            'subject',
            entity === 'node'
              ? { entity: 'node', type: typeId }
              : { entity: 'edge', type: typeId },
          );

      // Read BEFORE anything moves, like the picker reads it: it is a question
      // about what the stage is carrying now.
      const question = confirmChange();
      if (question === undefined) {
        select();
        setSession(null);
        return;
      }

      void (async () => {
        // Asked while the create dialog is still open, and it closes on either
        // answer: the type has been created and there is nothing left to do in
        // there, and the dialog outliving the question is what keeps focus on
        // a live control — the confirm returns focus to the Save it was raised
        // from, and the dialog then returns it to its own trigger.
        // The created type travels with the question: a "yes" is judged on the
        // codebook as it stands when it is given, and a collaborator deleting
        // this type while the researcher reads the question is exactly what
        // that judgement is for.
        const confirmed = await confirmEntityTypeChange(question, {
          entityType: entity,
          typeId,
        });
        if (confirmed) select();
        setSession(null);
      })();
    },
    [confirmChange, confirmEntityTypeChange, entity, storeApi],
  );

  return (
    <>
      {/*
        The trigger goes when editing does, because a create nobody may start
        is not on offer. An editor already OPEN stays, because the draft inside
        it is the researcher's own work and nowhere else: they opened it
        because the type they need does not exist yet, and unmounting it with
        the trigger would throw the name they were typing away without a word.
        `CodebookEntityEditor` takes `readOnly` for exactly this — interaction
        stops, the draft does not — and it is the rule the row dialogs follow
        when the stage becomes read-only.
      */}
      {!readOnly && (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSession({ key: uuid(), typeId: uuid() })}
        >
          {intl.formatMessage(words.createLabel)}
        </Button>
      )}
      {session !== null && (
        <Dialog
          open
          title={intl.formatMessage(words.createLabel)}
          size="readable"
          // A request in flight refuses every way out, because the dialog is
          // about to show what the host made of it. Escape, a press outside
          // and the close button all arrive at `closeDialog`, so refusing
          // there covers all three — and `dismissible` takes the close button
          // away rather than leaving a control on screen that does nothing.
          // Dismissed mid-flight, the handler awaiting the request stays alive
          // and a success arriving afterwards still selects the new type on
          // the stage: the researcher would watch everything describing the
          // old type disappear, for a type they never saw arrive.
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
            subject={
              entity === 'node'
                ? { entity: 'node', type: session.typeId }
                : { entity: 'edge', type: session.typeId }
            }
            initialDraft={NEW_ENTITY_DRAFT[entity]}
            readOnly={readOnly}
            existingEntityNames={existingEntityNames}
            onSubmit={async (document) => {
              setSubmitting(true);
              try {
                return await createEntity(entity, document);
              } finally {
                setSubmitting(false);
              }
            }}
            onApplied={(outcome) => {
              // The id the HOST minted, read off the write: it is the host's to
              // issue, and the stage has to name the type it actually created.
              const ref = parseSectionId(outcome.sectionId);
              if (ref.kind === 'codebookNode' || ref.kind === 'codebookEdge') {
                selectCreatedType(ref.typeId);
              }
            }}
            onCancel={() => setSession(null)}
          />
        </Dialog>
      )}
    </>
  );
}
