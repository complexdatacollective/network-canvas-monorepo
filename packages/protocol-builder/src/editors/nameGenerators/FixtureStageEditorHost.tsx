import { type ReactNode, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { InMemoryCompoundHost } from '../../compound-edit/InMemoryCompoundHost.ts';
import {
  type StageEditorController,
  useStageEditorController,
} from '../../controller.ts';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import {
  fixtureAssetContent,
  fixtureAssetManifest,
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';

/** The session that holds the stage's lease, as a host would name a tab. */
const OWNER = 'storybook-tab';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type FixtureStageEditorHostProps = Readonly<{
  /** Which stage of the shared all-interfaces protocol to open. */
  stageId: string;
  /** Open the stage as a spectator, with the lease held elsewhere. */
  readOnly?: boolean;
  children: (controller: StageEditorController) => ReactNode;
}>;

/**
 * A host with no Redux, no router and no storage of its own.
 *
 * It opens a session over the protocol the package's tests already use, hands
 * the editor a controller, and reports when the stage was saved. Everything
 * below it is the package's own production machinery — a real session store, a
 * compound-edit host that refuses what a real one would refuse, and a resource
 * gateway holding the fixture's own files — so a story that adds a node type
 * or reads a roster's columns is doing the thing, not miming it.
 *
 * Deliberately not the test harness: that module imports Testing Library at
 * module scope, which has no business in a Storybook build.
 */
export default function FixtureStageEditorHost({
  stageId,
  readOnly = false,
  children,
}: FixtureStageEditorHostProps) {
  const [saves, setSaves] = useState(0);
  const [session] = useState(() =>
    createFixtureSession({
      stageId,
      readOnly,
      onFinish: () => setSaves((count) => count + 1),
    }),
  );
  const controller = useStageEditorController(session);

  return (
    <DialogProvider>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        {saves > 0 && (
          <Alert variant="success">
            <AlertTitle>Stage saved</AlertTitle>
            <AlertDescription>
              The host was handed this stage to store, and the edit session
              finished.
            </AlertDescription>
          </Alert>
        )}
        {children(controller)}
      </main>
    </DialogProvider>
  );
}

function createFixtureSession({
  stageId,
  readOnly,
  onFinish,
}: Readonly<{
  stageId: string;
  readOnly: boolean;
  onFinish: () => void;
}>): ProtocolBuilderSessionStore {
  const seeded = loadFixtureStage(stageId);
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const protocolSections = fixtureProtocolSections();
  const manifestRevision = { sequence: 1n, hash: 'storybook-1' };
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision,
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
  const gateway = new InMemoryResourceGateway({
    committed: fixtureResourceSeeds(),
  });

  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity(seeded.type, () => seeded.id),
    fields: seeded.fields,
    protocolSections,
    manifestRevision,
    access: readOnly
      ? { mode: 'readOnly', reason: 'spectator' }
      : { mode: 'editable', leaseOwner: OWNER, leaseEpoch: 1n },
    resourceGateway: gateway,
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({
        ...sections,
        [stageSectionId]: stageDocument,
      }),
    onCompoundEdit: (submission) => host.submit(submission),
    onFinish,
  });
}

/**
 * The fixture's assets, as resources the gateway already holds.
 *
 * An asset the fixture ships a file for is seeded with that file, because a
 * roster stage asks the gateway what is INSIDE its data file — the columns its
 * cards, sorting and search are chosen from. Everything else gets a
 * placeholder body: those pickers read only a resource's kind, name and size.
 */
function fixtureResourceSeeds(): InMemoryResourceSeed[] {
  return Object.entries(fixtureAssetManifest()).flatMap(
    ([id, entry]): InMemoryResourceSeed[] => {
      if (!isRecord(entry)) return [];
      const name = typeof entry.name === 'string' ? entry.name : id;
      const kind = entry.type;
      if (kind === 'apikey') {
        return [{ kind, id, name, value: 'storybook-secret' }];
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
      const source =
        typeof entry.source === 'string' ? entry.source : `${id}.json`;
      return [
        {
          kind,
          id,
          name,
          source,
          contentType: 'application/json',
          bytes: fixtureAssetContent(source) ?? new TextEncoder().encode('{}'),
        },
      ];
    },
  );
}
