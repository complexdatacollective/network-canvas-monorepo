import { type ComponentType, useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryCompoundHost } from '../../compound-edit/InMemoryCompoundHost.ts';
import {
  type StageEditorController,
  useStageEditorController,
} from '../../controller.ts';
import type { StageEditorShellProps } from '../../form/StageEditorShell.tsx';
import {
  createStageIdentity,
  type ManifestRevision,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import {
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';

/** The one thing every editor in this family is, as a host renders it. */
export type CensusEditorComponent = ComponentType<
  Readonly<{
    controller: StageEditorController;
    actions?: StageEditorShellProps['actions'];
  }>
>;

const OWNER = 'storybook-host';

const MANIFEST_REVISION: ManifestRevision = {
  sequence: 1n,
  hash: 'storybook-revision-1',
};

export type CensusEditorStoryHostProps = Readonly<{
  /** A stage of the shared all-interfaces protocol to open. */
  stageId: string;
  editor: CensusEditorComponent;
  /** Open the stage as a spectator, with every control inert. */
  readOnly?: boolean;
}>;

/**
 * A host with no Redux, no router and no server: one session over the shared
 * all-interfaces protocol, a compound-edit host that refuses what a real one
 * refuses, and the host's own save button in the editor's action slot.
 *
 * The same protocol the package's tests are written against, so a story and a
 * test disagree about a stage's shape only when one of them is wrong.
 */
export function CensusEditorStoryHost({
  stageId,
  editor: Editor,
  readOnly = false,
}: CensusEditorStoryHostProps) {
  const [saved, setSaved] = useState<string | null>(null);
  const [session] = useState(() =>
    openStorybookSession(stageId, readOnly, (stageDocument) => {
      const label = stageDocument.label;
      setSaved(typeof label === 'string' ? label : '');
    }),
  );
  const controller = useStageEditorController(session);

  return (
    <DialogProvider>
      <main className="mx-auto max-w-6xl p-6">
        <Editor
          controller={controller}
          actions={({ formId, readOnly: inert }) => (
            <div className="flex items-center justify-end gap-4">
              <Paragraph role="status" margin="none">
                {saved === null ? '' : `Saved “${saved}”.`}
              </Paragraph>
              <SubmitButton form={formId} disabled={inert}>
                Save stage
              </SubmitButton>
            </div>
          )}
        />
      </main>
    </DialogProvider>
  );
}

/**
 * The session the story edits in, built the way a host builds one.
 *
 * The edited stage is put back into the protocol it is validated inside, so a
 * save in the story is refused for exactly the reasons a save in a host would
 * be.
 */
function openStorybookSession(
  stageId: string,
  readOnly: boolean,
  onSaved: (stageDocument: SectionDoc) => void,
): ProtocolBuilderSessionStore {
  const seeded = loadFixtureStage(stageId);
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const protocolSections = fixtureProtocolSections();
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision: MANIFEST_REVISION,
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
    manifestRevision: MANIFEST_REVISION,
    access: readOnly
      ? { mode: 'readOnly', reason: 'spectator' }
      : { mode: 'editable', leaseOwner: OWNER, leaseEpoch: 1n },
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({
        ...sections,
        [stageSectionId]: stageDocument,
      }),
    onCompoundEdit: (submission) => host.submit(submission),
    onFinish: (request) => onSaved(request.stageDocument),
  });
}
