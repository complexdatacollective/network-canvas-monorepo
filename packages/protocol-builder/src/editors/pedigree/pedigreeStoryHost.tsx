import { type ReactNode, useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryCompoundHost } from '../../compound-edit/InMemoryCompoundHost.ts';
import type { StageEditorController } from '../../controller.ts';
import { useStageEditorController } from '../../controller.ts';
import type { StageEditorActionContext } from '../../form/StageEditorShell.tsx';
import {
  createStageIdentity,
  type FinishRequest,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import {
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';

/** The one tab editing in these stories. */
const OWNER = 'storybook';

const START_REVISION = { sequence: 1n, hash: 'revision-1' };

export type PedigreeStoryHostProps = Readonly<{
  /** The stage of the shared all-interfaces protocol to open. */
  stageId: string;
  /** Open the stage as a spectator, with editing held elsewhere. */
  readOnly?: boolean;
  /**
   * The editor under test, given the controller and the host's own chrome.
   *
   * A render prop rather than a component prop because each named editor
   * declares the one interface it edits, and a host that took them all as one
   * type would have to widen `stageType` back to the whole union.
   */
  renderEditor: (
    props: Readonly<{
      controller: StageEditorController;
      actions: (context: StageEditorActionContext) => ReactNode;
    }>,
  ) => ReactNode;
}>;

/**
 * A host with no Redux, no router and no store of its own.
 *
 * It opens a real editing session over the shared all-interfaces protocol,
 * puts a compound-edit host behind it that refuses exactly what a real one
 * would, renders the editor, and reports what a save committed. That last part
 * is the only thing the stories add to a host: an editor that saved and one
 * that quietly did nothing look identical on screen otherwise.
 */
export function PedigreeStoryHost({
  stageId,
  readOnly = false,
  renderEditor,
}: PedigreeStoryHostProps) {
  const [saved, setSaved] = useState<FinishRequest | null>(null);
  const [session] = useState(() => openSession(stageId, readOnly, setSaved));
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <DialogProvider>
      <main className="mx-auto max-w-6xl p-6">
        <Paragraph role="status">
          {saved === null
            ? 'Nothing saved yet.'
            : `Saved “${stageLabel(saved)}”.`}
        </Paragraph>
        {saved !== null && (
          // The committed document verbatim, because an editor that saved and
          // one that quietly changed nothing look identical on screen
          // otherwise — and a play function has to be able to tell them apart.
          // Labelled by a region rather than a heading, so a document whose
          // real headings are the editor's own sections keeps its outline.
          <section aria-label="What the host was asked to commit">
            <pre className="overflow-x-auto text-xs">
              {JSON.stringify(saved.stageDocument, null, 2)}
            </pre>
          </section>
        )}
        {renderEditor({
          controller,
          actions: ({ formId, readOnly: isReadOnly }) => (
            <div className="flex justify-end">
              <SubmitButton form={formId} disabled={isReadOnly}>
                Save stage
              </SubmitButton>
            </div>
          ),
        })}
      </main>
    </DialogProvider>
  );
}

const stageLabel = (request: FinishRequest): string => {
  const label = request.stageDocument.label;
  return typeof label === 'string' && label !== '' ? label : 'Untitled stage';
};

/**
 * The session the story edits inside, built the way a host builds one.
 *
 * Everything below the editor is the package's own machinery over the real
 * fixture protocol, so a story that saves has proved the protocol schema
 * accepts what the editor produced — including, for a narrative pedigree, that
 * the Family Pedigree stage it reads is in the interview before it.
 */
function openSession(
  stageId: string,
  readOnly: boolean,
  onFinish: (request: FinishRequest) => void,
): ProtocolBuilderSessionStore {
  const seeded = loadFixtureStage(stageId);
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const protocolSections: Record<string, SectionDoc> =
    fixtureProtocolSections();
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision: START_REVISION,
    leases: [
      {
        sectionId: stageSectionId,
        leaseOwner: OWNER,
        leaseEpoch: 1n,
        holder: {
          sessionId: OWNER,
          userId: 'researcher',
          displayName: 'Researcher',
          sectionId: stageSectionId,
          mode: 'editing',
        },
      },
    ],
  });

  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity(seeded.type, () => seeded.id),
    fields: seeded.fields,
    protocolSections,
    manifestRevision: START_REVISION,
    access: readOnly
      ? { mode: 'readOnly', reason: 'spectator' }
      : { mode: 'editable', leaseOwner: OWNER, leaseEpoch: 1n },
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({
        ...sections,
        [stageSectionId]: stageDocument,
      }),
    onCompoundEdit: (submission) => host.submit(submission),
    onFinish,
  });
}
