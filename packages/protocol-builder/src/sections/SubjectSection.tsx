import { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';

import CodebookEntityEditor from '../codebook/components/CodebookEntityEditor.tsx';
import type { CodebookEntityDraft } from '../codebook/editing.ts';
import SubjectSelectField, {
  type EntitySubject,
} from '../fields/SubjectSelectField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import BuilderSection from './BuilderSection.tsx';
import NetworkFilterSection from './NetworkFilterSection.tsx';
import { useResetStageOnSubjectChange } from './useResetStageOnSubjectChange.ts';

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
  nodeCreateDescription: {
    id: 'protocolBuilder.subjectSection.nodeCreateDescription',
    defaultMessage: 'Create a node type and use it on this stage',
    description:
      'Description shown inside the dialog for inventing a kind of network member, and what the change is called in the record a host keeps of protocol edits.',
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
  edgeCreateDescription: {
    id: 'protocolBuilder.subjectSection.edgeCreateDescription',
    defaultMessage: 'Create an edge type and use it on this stage',
    description:
      'Description shown inside the dialog for inventing a kind of relationship, and what the change is called in the record a host keeps of protocol edits.',
  },
});

/**
 * The words each subject uses, whole per subject rather than a noun swapped
 * into a shared frame: "a node" and "an edge" do not differ only in the noun
 * in every language, and this is the one place a researcher is told what the
 * stage is about.
 */
type SubjectWords = Readonly<{
  title: MessageDescriptor;
  description: MessageDescriptor;
  fieldLabel: MessageDescriptor;
  fieldHint: MessageDescriptor;
  createLabel: MessageDescriptor;
  createDescription: MessageDescriptor;
}>;

const WORDS: Readonly<Record<SubjectEntity, SubjectWords>> = Object.freeze({
  node: Object.freeze({
    title: messages.nodeTitle,
    description: messages.nodeDescription,
    fieldLabel: messages.nodeFieldLabel,
    fieldHint: messages.nodeFieldHint,
    createLabel: messages.nodeCreateLabel,
    createDescription: messages.nodeCreateDescription,
  }),
  edge: Object.freeze({
    title: messages.edgeTitle,
    description: messages.edgeDescription,
    fieldLabel: messages.edgeFieldLabel,
    fieldHint: messages.edgeFieldHint,
    createLabel: messages.edgeCreateLabel,
    createDescription: messages.edgeCreateDescription,
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
          label={intl.formatMessage(words.fieldLabel)}
          hint={intl.formatMessage(words.fieldHint)}
          required
        />
        <CreateSubjectType entity={entity} words={words} intl={intl} />
      </BuilderSection>
      {filter && <NetworkFilterSection subject={entity} />}
    </>
  );
}

/**
 * Creates a codebook type and selects it on this stage.
 *
 * The type is created through the session's compound-edit path, which is what
 * puts a new section into the protocol atomically and reports the specific
 * lock holder when it cannot. Selecting it afterwards is an ordinary form
 * change rather than part of that edit, and deliberately so: a host keeps the
 * stored protocol valid, and a stage that has just been pointed at a brand-new
 * type has no prompts, no form and no panels for it — an invalid stage, which
 * a host is right to refuse. Saved as one edit this could never succeed for
 * any interface whose schema requires the configuration the change throws
 * away, which is all of them. So the type lands in the codebook, the stage
 * points at it locally, and the researcher configures it before saving.
 */
function CreateSubjectType({
  entity,
  words,
  intl,
}: Readonly<{
  entity: SubjectEntity;
  words: SubjectWords;
  intl: IntlShape;
}>) {
  const { controller, readOnly, storeApi } = useStageEditorForm();
  const codebook = controller.snapshot.protocolContext.codebook;
  const [session, setSession] = useState<{
    key: string;
    typeId: string;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const existingEntityNames = useMemo(() => {
    // Read per entity rather than by a computed key: the codebook's two maps
    // hold different definition types, and one indexed by a union is a union
    // of maps nothing can be read out of without narrowing it again.
    const definitions =
      entity === 'node' ? (codebook.node ?? {}) : (codebook.edge ?? {});
    return Object.values(definitions).map((definition) => definition.name);
  }, [codebook, entity]);

  const selectCreatedType = useCallback(
    (typeId: string) => {
      // Written into the form rather than dispatched, so it is the researcher's
      // own unsaved change — which is what lets the subject-change reset run
      // over it and clear the configuration that belonged to the old type.
      storeApi
        .getState()
        .setFieldValue(
          'subject',
          entity === 'node'
            ? { entity: 'node', type: typeId }
            : { entity: 'edge', type: typeId },
        );
      setSession(null);
    },
    [entity, storeApi],
  );

  if (readOnly) return null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setSession({ key: uuid(), typeId: uuid() })}
      >
        {intl.formatMessage(words.createLabel)}
      </Button>
      {session !== null && (
        <Dialog
          open
          title={intl.formatMessage(words.createLabel)}
          size="readable"
          closeDialog={() => setSession(null)}
          finalFocus={() => triggerRef.current}
        >
          <CodebookEntityEditor
            mode="create"
            sessionKey={session.key}
            createRequestId={() => uuid()}
            description={intl.formatMessage(words.createDescription)}
            subject={
              entity === 'node'
                ? { entity: 'node', type: session.typeId }
                : { entity: 'edge', type: session.typeId }
            }
            initialDraft={NEW_ENTITY_DRAFT[entity]}
            existingEntityNames={existingEntityNames}
            onSubmit={(request) => controller.requestCompoundEdit(request)}
            onApplied={() => selectCreatedType(session.typeId)}
            onCancel={() => setSession(null)}
          />
        </Dialog>
      )}
    </>
  );
}
