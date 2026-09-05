import { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

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
import NetworkFilterSection, {
  type NetworkFilterCopy,
} from './NetworkFilterSection.tsx';
import { useResetStageOnSubjectChange } from './useResetStageOnSubjectChange.ts';

/** What this stage works on. Ego stages have no type to pick, so no section. */
export type SubjectEntity = EntitySubject['entity'];

export type SubjectSectionCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
  /** Visible text and accessible name of the create control. */
  createLabel: string;
  createDescription: string;
}>;

const DEFAULT_COPY: Readonly<Record<SubjectEntity, SubjectSectionCopy>> =
  Object.freeze({
    node: Object.freeze({
      sectionTitle: 'Node type',
      description: 'Choose the type of node this stage works with.',
      fieldLabel: 'Node type',
      fieldHint:
        'Every node this stage creates or shows will be of the type you choose here.',
      createLabel: 'Create a new node type',
      createDescription: 'Create a node type and use it on this stage',
    }),
    edge: Object.freeze({
      sectionTitle: 'Edge type',
      description: 'Choose the type of edge this stage works with.',
      fieldLabel: 'Edge type',
      fieldHint:
        'Every edge this stage creates or shows will be of the type you choose here.',
      createLabel: 'Create a new edge type',
      createDescription: 'Create an edge type and use it on this stage',
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
  copy?: Partial<SubjectSectionCopy>;
  filterCopy?: Partial<NetworkFilterCopy>;
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
  copy,
  filterCopy,
}: SubjectSectionProps) {
  const words = { ...DEFAULT_COPY[entity], ...copy };
  useResetStageOnSubjectChange();

  return (
    <>
      <BuilderSection
        title={words.sectionTitle}
        description={words.description}
      >
        <ProtocolField<typeof SubjectSelectField>
          name="subject"
          component={SubjectSelectField}
          entityType={entity}
          label={words.fieldLabel}
          hint={words.fieldHint}
          required
        />
        <CreateSubjectType entity={entity} words={words} />
      </BuilderSection>
      {filter && (
        <NetworkFilterSection
          subject={entity}
          {...(filterCopy === undefined ? {} : { copy: filterCopy })}
        />
      )}
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
}: Readonly<{ entity: SubjectEntity; words: SubjectSectionCopy }>) {
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
        {words.createLabel}
      </Button>
      {session !== null && (
        <Dialog
          open
          title={words.createLabel}
          size="readable"
          closeDialog={() => setSession(null)}
          finalFocus={() => triggerRef.current}
        >
          <CodebookEntityEditor
            mode="create"
            sessionKey={session.key}
            createRequestId={() => uuid()}
            description={words.createDescription}
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
