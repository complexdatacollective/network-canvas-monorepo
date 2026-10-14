import {
  createInitialNetwork,
  isValidAssetType,
  type InterviewPayload,
  type ResolvedAsset,
} from '@codaco/interview/contract';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  getLocaleMetadata,
  parseDynamicValuePath,
} from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';
import { parseStoredInterviewSession } from '~/lib/db/storedInterviewSession';
import { parseStoredProtocol } from '~/lib/db/storedProtocol';
import type { GetInterviewByIdQuery } from '~/queries/interviews';

type MappedInterview =
  | {
      success: true;
      payload: InterviewPayload;
      assetUrls: Record<string, string>;
      initialStep: number;
      initialSyncRevision: number;
    }
  | {
      // Nothing may start the interview. Without the participant data the
      // client would build a network that its first sync writes over the
      // stored one; without the protocol it would run a design other than the
      // researcher's.
      success: false;
      unreadable: 'session' | 'protocol';
      error: unknown;
    };

type ReadableInterview = Extract<MappedInterview, { success: true }>;

type ViewedInterview =
  | (ReadableInterview & { view: InterviewView })
  | Extract<MappedInterview, { success: false }>;

/**
 * How a request opens an interview, decided on the server.
 *
 * - `active`: an unfinished interview, at its stages.
 * - `editable-finished`: a finished interview, at its stages and open to
 *   changes, for a researcher while completed interviews are not frozen.
 * - `completed`: a finished interview's completed state, from a payload that
 *   holds none of the interview's answers and none of the protocol's
 *   resources. Nothing in this view may be written back: its network is
 *   empty, so a write would erase the stored one.
 */
export type InterviewView = 'active' | 'editable-finished' | 'completed';

/**
 * The interview a request is shown, chosen here on the server so that nothing
 * the browser sends can ask for more.
 *
 * - An unfinished interview opens as it is, to anyone with its link.
 * - A finished interview opens on its completed state, from a payload with
 *   none of the interview's answers but the ego attributes its finish stage's
 *   text shows (`finishTextEgoAttributes`): no other network and no stage
 *   metadata. Nor
 *   does it carry the protocol's resources, whose entries can hold API keys
 *   and whose URLs open the files: the completed state shows only the finish
 *   stage's text. Only the protocol's design, where the interview ended, and
 *   its language go to the browser. Before finish stages, a participant who opened a finished
 *   interview was sent to a page with no interview on it at all.
 * - A researcher opening a finished interview while completed interviews are
 *   not frozen gets it in full, to change, as before finish stages.
 */
export function mapInterviewForViewer(
  source: NonNullable<GetInterviewByIdQuery>,
  {
    researcher,
    freezeCompletedInterviews,
  }: { researcher: boolean; freezeCompletedInterviews: boolean },
): ViewedInterview {
  const mapped = mapInterviewPayload(source);
  // Unreadable stored data opens nothing, finished or not.
  if (!mapped.success) return mapped;
  if (source.finishTime === null) {
    return { ...mapped, view: 'active' };
  }
  if (researcher && !freezeCompletedInterviews) {
    return { ...mapped, view: 'editable-finished' };
  }
  const { stageMetadata: _stageMetadata, ...session } = mapped.payload.session;
  const network = createInitialNetwork();
  network.ego.attributes = finishTextEgoAttributes(mapped.payload);
  return {
    ...mapped,
    payload: {
      protocol: { ...mapped.payload.protocol, assets: [] },
      session: { ...session, network },
    },
    assetUrls: {},
    view: 'completed',
  };
}

/**
 * The ego attributes the finished interview's finish stage shows in its text,
 * and no others. The completed state shows that text again whenever the
 * interview is opened, and without them a value the participant read when they
 * finished would read as missing. These are answers the protocol chose to show
 * on that screen; every other answer stays on the server. A finish stage
 * recorded before finish stages were tracked is not known, so every finish
 * stage's values are kept.
 */
function finishTextEgoAttributes(
  payload: InterviewPayload,
): NcNetwork['ego']['attributes'] {
  const { finishStageId, network } = payload.session;
  const kept: NcNetwork['ego']['attributes'] = {};
  for (const stage of payload.protocol.stages) {
    if (stage.type !== 'FinishSession') continue;
    if (finishStageId !== null && stage.id !== finishStageId) continue;
    for (const binding of Object.values(stage.dynamicValues ?? {})) {
      const parsed = parseDynamicValuePath(binding.path);
      if (parsed?.kind !== 'attribute' || parsed.role !== 'ego') continue;
      // Attribute ids come from the protocol and may name a member every
      // object inherits, so only an own value counts.
      const value = Object.hasOwn(network.ego.attributes, parsed.variableId)
        ? network.ego.attributes[parsed.variableId]
        : undefined;
      if (value !== undefined) kept[parsed.variableId] = value;
    }
  }
  return kept;
}

export function mapInterviewPayload(
  source: NonNullable<GetInterviewByIdQuery>,
): MappedInterview {
  const { protocol, ...session } = source;

  // The stored version is written from the validated document at import
  // (actions/protocols.ts) and rewritten by the deploy-time migration
  // (scripts/migrate-protocols.ts), so every row that reaches an interview
  // should already match the runtime. Stamping a literal instead would
  // mislabel any row that does not, handing the interview a document it cannot
  // read while claiming it can; refuse instead. The deploy migration leaves a
  // protocol it cannot migrate in place, so such a row is unreadable to this
  // runtime and is reported the way a damaged one is, not thrown.
  const { schemaVersion } = protocol;
  if (schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
    return {
      success: false,
      unreadable: 'protocol',
      error: new Error(
        `Protocol "${protocol.name}" (id=${protocol.id}) is stored as schema ` +
          `version ${schemaVersion}, but this version of Fresco runs protocol ` +
          `schema version ${COMPATIBLE_PROTOCOL_SCHEMA_VERSION}. It must be ` +
          `migrated before an interview using it can be started.`,
      ),
    };
  }

  const storedProtocol = parseStoredProtocol(protocol);
  if (!storedProtocol.success) {
    return {
      success: false,
      unreadable: 'protocol',
      error: storedProtocol.error,
    };
  }

  const stored = parseStoredInterviewSession(session);
  if (!stored.success) {
    return { success: false, unreadable: 'session', error: stored.error };
  }

  const assets: ResolvedAsset[] = protocol.assets.map((a) => {
    if (!isValidAssetType(a.type)) {
      throw new Error(`Unrecognised asset type from database: "${a.type}"`);
    }
    return {
      assetId: a.assetId,
      name: a.name,
      type: a.type,
      value: a.value ?? undefined,
    };
  });

  const assetUrls: Record<string, string> = {};
  for (const a of protocol.assets) {
    if (a.url) assetUrls[a.assetId] = a.url;
  }

  const payload: InterviewPayload = {
    session: {
      id: session.id,
      startTime: session.startTime.toISOString(),
      finishTime: session.finishTime?.toISOString() ?? null,
      // Where a finished interview ended, so it opens on that finish stage's
      // completed state. Null for an unfinished interview, and for one
      // finished before finish stages were recorded.
      finishStageId: session.finishStageId,
      exportTime: session.exportTime?.toISOString() ?? null,
      lastUpdated: session.lastUpdated.toISOString(),
      network: stored.data.network,
      stageMetadata: stored.data.stageMetadata ?? undefined,
      localeOptions: storedProtocol.data.localization.locales.map((locale) =>
        getLocaleMetadata(locale),
      ),
    },
    // Named field by field rather than spread from the row: the row also holds
    // the original upload's storage key and URL, which the asset route serves
    // without authentication, so spreading it would hand every holder of an
    // interview link the original .netcanvas archive.
    protocol: {
      ...storedProtocol.data,
      id: protocol.id,
      name: protocol.name,
      schemaVersion,
      hash: protocol.hash,
      description: protocol.description ?? undefined,
      importedAt: protocol.importedAt.toISOString(),
      assets,
    },
  };

  return {
    success: true,
    payload,
    assetUrls,
    initialStep: session.currentStep,
    // The sync handler numbers its writes upwards from here. It is not part of
    // `InterviewPayload` because it belongs to this host's transport rather
    // than to the interview the engine runs.
    initialSyncRevision: session.syncRevision,
  };
}
