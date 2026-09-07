import type { StageType } from '@codaco/protocol-validation';
import { applyCommands, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { InMemoryCompoundHost } from '../compound-edit/InMemoryCompoundHost.ts';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../resources/InMemoryResourceGateway.ts';
import {
  createStageIdentity,
  type FinishRequest,
  type ManifestRevision,
  type PendingCommandBatch,
  type ProtocolBuilderPresence,
  ProtocolBuilderSessionStore,
  type StageCreation,
} from '../session.ts';
import {
  fixtureAssetContent,
  fixtureAssetManifest,
  fixtureProtocolSections,
} from './protocolFixture.ts';

/** The one tab holding the lease in everything opened here. */
export const FIXTURE_SESSION_OWNER = 'harness-tab';

const FIXTURE_MANIFEST_REVISION: ManifestRevision = Object.freeze({
  sequence: 1n,
  hash: 'revision-1',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stage a session is opened on, split as the session owns it. */
export type SeededStage = Readonly<{
  id: string;
  type: StageType;
  fields: SectionDoc;
  /** Set only for a stage that does not exist yet. See `StageCreation`. */
  creation?: StageCreation;
}>;

export type FixtureSessionOptions = Readonly<{
  seeded: SeededStage;
  /**
   * Extra manifest entries this stage may reference, keyed by asset id.
   *
   * They join the fixture's own assets in BOTH places a resource has to exist
   * to be referenced — the protocol's manifest section and the gateway — so a
   * stage seeded with a reference to one is a stage a host would accept,
   * rather than one whose save is refused for a dangling reference.
   */
  assets?: Readonly<Record<string, SectionDoc>>;
  /** Open the stage as a spectator, with editing held elsewhere. */
  readOnly?: boolean;
  /**
   * Who else is in this protocol, and what they are doing.
   *
   * The host's to supply: presence arrives over the host's own channel, and
   * the session only passes it on. Left out, the researcher is alone — which
   * is what every test here wants, and which is why a story that is ABOUT
   * working alongside somebody has to say so.
   */
  presence?: readonly ProtocolBuilderPresence[];
  /**
   * Sections another editor is holding while this session runs, so any change
   * that needs one is blocked rather than applied.
   *
   * A blocked compound edit is the one refusal a researcher can act on by
   * asking a named colleague, which is why the name is given here rather than
   * generated: what an editor shows them has to be checkable.
   */
  heldSections?: readonly Readonly<{
    sectionId: ProtocolSectionId;
    displayName: string;
  }>[];
  /**
   * Names staged resources. Left out, they are numbered globally, which is
   * fine for a test and wrong for a story: a page that renders the id it was
   * given would differ from itself in every visual comparison.
   */
  createResourceId?: () => string;
  /**
   * Each batch as a host that applies edits LIVE is handed it.
   *
   * A host need not wait for the save, and most of what an editor does reaches
   * one the moment it is done — so "what has already left this session" is a
   * question about the editor that only this port can answer. The batches a
   * session is holding back (a reference to a resource staged here, and
   * everything after it) never arrive, which is the whole point of asking.
   *
   * Supplying this makes the fixture's host a live-applying one: every batch
   * handed over is applied to `host` before this is called. A host cannot be
   * given a batch and decline to apply it — nothing the session could ask it
   * afterwards would say which of the two it had done, so the session reads a
   * delivered batch as the host's (`deliveredPrefixLength`). A port that only
   * recorded the batch left the host answering a later compound edit with a
   * stage missing the researcher's own unsaved work, which the session then
   * read as a collaborator's edit and retired: the row vanished from the
   * draft.
   */
  onCommands?: (batch: PendingCommandBatch) => void;
  onFinish: (request: FinishRequest) => void;
}>;

export type FixtureSession = Readonly<{
  session: ProtocolBuilderSessionStore;
  host: InMemoryCompoundHost;
  gateway: InMemoryResourceGateway;
}>;

/**
 * Opens a real editing session on one stage of the shared all-interfaces
 * protocol, the way a host opens one.
 *
 * The one place a session over the fixture is built, because a test and a
 * story that built it differently would disagree about what an editor is
 * mounted over — and the disagreement would show up as a story whose play
 * passes while the same journey fails in a test, or the other way round.
 *
 * Everything below is the package's own production machinery: a
 * `ProtocolBuilderSessionStore` holding a real protocol, a compound-edit host
 * that refuses what a real one would refuse, and a resource gateway. Nothing
 * is stubbed, so a save proves the protocol schema accepts what the editor
 * produced.
 */
export function openFixtureStageSession(
  options: FixtureSessionOptions,
): FixtureSession {
  const { seeded } = options;
  const stageSectionId = sectionId({ kind: 'stage', stageId: seeded.id });
  const baseSections = fixtureProtocolSections();
  const stageOrderSectionId = sectionId({ kind: 'stageOrder' });
  // A stage the fixture does not contain still has to be part of the protocol
  // it is validated inside, or every save fails on the stage order — unless it
  // is being CREATED, which is exactly the case where the protocol does not
  // hold it yet.
  const protocolSections: Record<string, SectionDoc> = { ...baseSections };
  if (seeded.creation === undefined) {
    protocolSections[stageSectionId] = {
      id: seeded.id,
      type: seeded.type,
      ...seeded.fields,
    };
    protocolSections[stageOrderSectionId] = {
      stages: stageOrderWith(baseSections, seeded.id),
    };
  }
  const assetManifest: Record<string, unknown> = {
    ...fixtureAssetManifest(),
    ...options.assets,
  };
  protocolSections[sectionId({ kind: 'assets' })] = assetManifest;

  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision: FIXTURE_MANIFEST_REVISION,
    leases: [
      {
        sectionId: stageSectionId,
        leaseOwner: FIXTURE_SESSION_OWNER,
        leaseEpoch: 1n,
        holder: {
          sessionId: FIXTURE_SESSION_OWNER,
          userId: 'researcher',
          displayName: 'Researcher',
          sectionId: stageSectionId,
          mode: 'editing',
        },
      },
      ...(options.heldSections ?? []).map((held, index) => ({
        sectionId: held.sectionId,
        leaseOwner: `holder-${index}`,
        leaseEpoch: 1n,
        holder: {
          sessionId: `holder-tab-${index}`,
          userId: `holder-user-${index}`,
          displayName: held.displayName,
          sectionId: held.sectionId,
          mode: 'editing' as const,
        },
      })),
    ],
  });
  /**
   * The host applying a batch the moment it is handed one.
   *
   * See `onCommands` above: delivery is what the session reads a host's later
   * answers against, so a host that is given batches has to be holding them.
   *
   * Written straight into the section rather than submitted as a compound
   * edit, because a batch is not a save. It is one keystroke's worth of the
   * researcher's work in progress — a row added before anything has been typed
   * into it, a capability cleared before the field replacing it is filled in —
   * and the protocol is only whole again at the finish that submits it. A host
   * that validated every batch would refuse the states an editor is drawn in.
   *
   * Not ACKNOWLEDGED, which is a separate message and stays the caller's to
   * send: a batch the host holds is still pending here until one arrives,
   * which is exactly what `liveCommands` exists to be able to say.
   *
   * A stage being CREATED has no section on the host to update — the protocol
   * does not hold it until the finish that creates it — so nothing is applied
   * and nothing is claimed: the session reads such an answer by creation
   * (`stageAbsentByCreation`) rather than by prefix.
   */
  const applyLive = (batch: PendingCommandBatch): void => {
    const held = host.getSnapshot().protocolSections[stageSectionId];
    if (held === undefined) return;
    host.receiveAuthoritativeSections({
      [stageSectionId]: applyCommands(held, [...batch.commands]),
    });
  };

  const gateway = new InMemoryResourceGateway({
    committed: manifestResources(assetManifest),
    ...(options.createResourceId === undefined
      ? {}
      : { createResourceId: options.createResourceId }),
  });

  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity(seeded.type, () => seeded.id),
    fields: seeded.fields,
    ...(seeded.creation === undefined ? {} : { creation: seeded.creation }),
    protocolSections,
    manifestRevision: FIXTURE_MANIFEST_REVISION,
    access:
      options.readOnly === true
        ? { mode: 'readOnly', reason: 'spectator' }
        : {
            mode: 'editable',
            leaseOwner: FIXTURE_SESSION_OWNER,
            leaseEpoch: 1n,
          },
    ...(options.presence === undefined ? {} : { presence: options.presence }),
    resourceGateway: gateway,
    // A stage being created is validated where it is about to live: the host
    // puts it into the stage order at its insertion position before it judges
    // the protocol, so the draft is judged as the interview it is joining —
    // and a skip destination naming a stage it would come AFTER is refused
    // here rather than after the researcher has saved.
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({
        ...sections,
        [stageSectionId]: stageDocument,
        ...(seeded.creation === undefined
          ? {}
          : {
              [stageOrderSectionId]: {
                stages: stageOrderInserting(
                  sections,
                  seeded.id,
                  seeded.creation.position,
                ),
              },
            }),
      }),
    onCompoundEdit: (submission) => host.submit(submission),
    ...(options.onCommands === undefined
      ? {}
      : {
          onCommands: (batch: PendingCommandBatch) => {
            applyLive(batch);
            options.onCommands?.(batch);
          },
        }),
    onFinish: options.onFinish,
  });

  return { session, host, gateway };
}

/** The interview's stage order, with the edited stage in it exactly once. */
function stageOrderWith(
  sections: Readonly<Record<string, SectionDoc>>,
  stageId: string,
): string[] {
  const stages = stageOrderOf(sections);
  return stages.includes(stageId) ? stages : [...stages, stageId];
}

/** The interview's stage order with a stage being created inserted into it. */
function stageOrderInserting(
  sections: Readonly<Record<string, SectionDoc>>,
  stageId: string,
  position: number,
): string[] {
  const stages = stageOrderOf(sections).filter((entry) => entry !== stageId);
  const index = Math.min(Math.max(position, 0), stages.length);
  return [...stages.slice(0, index), stageId, ...stages.slice(index)];
}

function stageOrderOf(
  sections: Readonly<Record<string, SectionDoc>>,
): string[] {
  const order = sections[sectionId({ kind: 'stageOrder' })]?.stages;
  return Array.isArray(order)
    ? order.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * A manifest's assets, as resources a gateway already holds.
 *
 * An asset the fixture ships a file for is seeded with that file, because an
 * editor asks the gateway what is INSIDE a data file — a roster's columns are
 * the material its card, sort and search sections offer. Everything else gets
 * a placeholder body: those editors read only a resource's kind, name and
 * size, and the bytes belong to the host.
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
