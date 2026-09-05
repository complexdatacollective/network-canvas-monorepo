import { type ReactNode, useState } from 'react';

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
import type { StageEditorActionContext } from '../../form/StageEditorShell.tsx';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  type FinishRequest,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import {
  fixtureAssetContent,
  fixtureAssetManifest,
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';

/** The one tab editing in these stories. */
const OWNER = 'storybook';

const START_REVISION = { sequence: 1n, hash: 'revision-1' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type StageEditorStoryHostProps = Readonly<{
  /** The stage of the shared all-interfaces protocol to open. */
  stageId: string;
  /** Open the stage as a spectator, with editing held elsewhere. */
  readOnly?: boolean;
  /**
   * Extra manifest entries this stage may reference, keyed by asset id.
   *
   * They join the fixture's own assets in BOTH places a resource has to exist
   * to be referenced — the protocol's manifest and the gateway — so a stage
   * pointing at one is a stage a host would accept rather than one whose save
   * is refused for a dangling reference.
   */
  assets?: Readonly<Record<string, SectionDoc>>;
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
 * puts a compound-edit host and a resource gateway behind it that refuse
 * exactly what real ones would, renders the editor, and reports what a save
 * committed. That last part is the only thing the stories add to a host: an
 * editor that saved and one that quietly did nothing look identical on screen
 * otherwise, and a play function has to be able to tell them apart.
 *
 * One host for every stage editor's stories, rather than one per family. The
 * gateway is always there because the difference is not per family but per
 * stage — three of the canvas interfaces can draw a picture behind their
 * nodes, one needs a map key and a GeoJSON layer, and every one of those is
 * chosen through the package's resource picker — and a host without a gateway
 * shows those controls reporting that it cannot store anything. An editor that
 * asks it for nothing is unaffected by its being there.
 */
export function StageEditorStoryHost({
  stageId,
  readOnly = false,
  assets,
  renderEditor,
}: StageEditorStoryHostProps) {
  const [saved, setSaved] = useState<FinishRequest | null>(null);
  const [session] = useState(() =>
    openSession(stageId, readOnly, assets, setSaved),
  );
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
  extraAssets: Readonly<Record<string, SectionDoc>> | undefined,
  onFinish: (request: FinishRequest) => void,
): ProtocolBuilderSessionStore {
  const seeded = loadFixtureStage(stageId);
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const assetsSectionId = sectionId({ kind: 'assets' });
  const manifest: Record<string, unknown> = {
    ...fixtureAssetManifest(),
    ...extraAssets,
  };
  const protocolSections: Record<string, SectionDoc> = {
    ...fixtureProtocolSections(),
    [assetsSectionId]: manifest,
  };

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

  let nextStagedResource = 0;
  const gateway = new InMemoryResourceGateway({
    committed: manifestResources(manifest),
    // Named in sequence rather than randomly: a story that imports a file
    // renders the id it was given, and a fresh uuid on every run would make
    // this page differ from itself in every visual comparison.
    createResourceId: () => `story-resource-${(nextStagedResource += 1)}`,
  });

  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity(seeded.type, () => seeded.id),
    fields: seeded.fields,
    protocolSections,
    manifestRevision: START_REVISION,
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
 * A manifest's assets, as resources a gateway already holds.
 *
 * An asset the fixture ships a file for is seeded with that file, because an
 * editor asks the gateway what is INSIDE a data file. Everything else gets a
 * placeholder body: those editors read only a resource's kind, name and size,
 * and the bytes belong to the host.
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
        return [{ kind: 'apikey' as const, id, name, value: 'story-secret' }];
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
