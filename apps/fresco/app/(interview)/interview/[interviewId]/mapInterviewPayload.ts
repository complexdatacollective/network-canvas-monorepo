import {
  createInitialNetwork,
  isValidAssetType,
  type InterviewPayload,
  type ResolvedAsset,
} from '@codaco/interview/contract';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { getLocaleMetadata } from '@codaco/protocol-validation';
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
 *   holds none of the interview's answers. Nothing in this view may be written
 *   back: its network is empty, so a write would erase the stored one.
 */
export type InterviewView = 'active' | 'editable-finished' | 'completed';

/**
 * The interview a request is shown, chosen here on the server so that nothing
 * the browser sends can ask for more.
 *
 * - An unfinished interview opens as it is, to anyone with its link.
 * - A finished interview opens on its completed state, from a payload with
 *   none of the interview's answers: no network and no stage metadata. Only
 *   the protocol, where the interview ended, and its language go to the
 *   browser. Before finish stages, a participant who opened a finished
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
  return {
    ...mapped,
    payload: {
      ...mapped.payload,
      session: { ...session, network: createInitialNetwork() },
    },
    view: 'completed',
  };
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
  // read while claiming it can; refuse loudly instead.
  const { schemaVersion } = protocol;
  if (schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
    throw new Error(
      `Protocol "${protocol.name}" (id=${protocol.id}) is stored as schema ` +
        `version ${schemaVersion}, but this version of Fresco runs protocol ` +
        `schema version ${COMPATIBLE_PROTOCOL_SCHEMA_VERSION}. It must be ` +
        `migrated before an interview using it can be started.`,
    );
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
      localePreference: session.localePreference,
      locale: session.locale,
      localeOptions: storedProtocol.data.localization.locales.map((locale) =>
        getLocaleMetadata(locale),
      ),
    },
    protocol: {
      ...protocol,
      ...storedProtocol.data,
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
