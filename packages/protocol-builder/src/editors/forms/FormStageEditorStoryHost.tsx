import { useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryCompoundHost } from '../../compound-edit/InMemoryCompoundHost.ts';
import { useStageEditorController } from '../../controller.ts';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  type ProtocolBuilderAccess,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import StageEditor from '../../StageEditor.tsx';
import {
  fixtureAssetManifest,
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { formStageEditors } from '../formStageEditors.ts';

const OWNER = 'storybook-tab';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MANIFEST_REVISION = { sequence: 1n, hash: 'revision-1' };

export type FormStageEditorStoryHostProps = Readonly<{
  /** The stage of the all-interfaces protocol this story opens. */
  stageId: string;
  access: ProtocolBuilderAccess;
}>;

/**
 * A host with no Redux, no router and no store of its own.
 *
 * The session under it is the package's own production machinery, opened over
 * the same all-interfaces protocol the tests use: a real session store, a real
 * compound-edit host that refuses what a real one would refuse, and a real
 * resource gateway. Nothing here is a mock, so a story that saves a stage has
 * proved the protocol schema accepts what the editor produced.
 *
 * Which editor opens is left to the package's own dispatcher, given this
 * family's part of the registry: that is how a host reaches a stage editor, and
 * it means each story below also shows that this family claims the interface
 * its stage is of.
 */
export default function FormStageEditorStoryHost({
  stageId,
  access,
}: FormStageEditorStoryHostProps) {
  const [saved, setSaved] = useState('nothing saved yet');
  const [session] = useState(() =>
    createFixtureSession(stageId, access, setSaved),
  );
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <DialogProvider>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <StageEditor controller={controller} registry={formStageEditors} />
        <Paragraph margin="none">
          Saved stage: <strong>{saved}</strong>
        </Paragraph>
      </main>
    </DialogProvider>
  );
}

/**
 * One line for whatever the host currently holds, so a story — and its play
 * function — can read the saved stage back as a single string.
 */
const describeStage = (document: SectionDoc): string => {
  const label = typeof document.label === 'string' ? document.label : '';
  return label === '' ? 'a stage with no name' : label;
};

function createFixtureSession(
  stageId: string,
  access: ProtocolBuilderAccess,
  onSaved: (description: string) => void,
): ProtocolBuilderSessionStore {
  const stage = loadFixtureStage(stageId);
  const protocolSections = fixtureProtocolSections();
  const stageSectionId = sectionId({ kind: 'stage', stageId: stage.id });
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
    identity: createStageIdentity(stage.type, () => stage.id),
    fields: stage.fields,
    protocolSections,
    manifestRevision: MANIFEST_REVISION,
    access,
    resourceGateway: new InMemoryResourceGateway({
      committed: manifestResources(fixtureAssetManifest()),
    }),
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({
        ...sections,
        [stageSectionId]: stageDocument,
      }),
    onCompoundEdit: (submission) => host.submit(submission),
    onFinish: (request) => {
      onSaved(describeStage(request.stageDocument));
    },
  });
}

/**
 * The fixture's manifest, as resources a gateway already holds.
 *
 * Placeholder bytes: no story here reads what is inside a file, and the
 * content of a researcher's own media belongs to the host.
 */
function manifestResources(
  manifest: Readonly<Record<string, unknown>>,
): InMemoryResourceSeed[] {
  return Object.entries(manifest).flatMap(
    ([id, entry]): InMemoryResourceSeed[] => {
      if (!isRecord(entry)) return [];
      const name = typeof entry.name === 'string' ? entry.name : id;
      const kind = entry.type;
      if (kind === 'apikey') {
        return [{ kind: 'apikey' as const, id, name, value: 'fixture-secret' }];
      }
      if (
        kind !== 'audio' &&
        kind !== 'geojson' &&
        kind !== 'image' &&
        kind !== 'network' &&
        kind !== 'video'
      ) {
        return [];
      }
      return [
        {
          kind,
          id,
          name,
          source:
            typeof entry.source === 'string' ? entry.source : `${id}.json`,
          contentType: 'application/json',
          bytes: new TextEncoder().encode('{}'),
        },
      ];
    },
  );
}
