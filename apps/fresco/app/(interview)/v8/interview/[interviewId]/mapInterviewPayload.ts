import {
  isValidAssetType,
  type InterviewPayload,
  type ResolvedAsset,
} from 'fresco-schema-8/interview/contract';

import { parseLegacyStoredInterviewSession } from '~/lib/schema-8/storedInterviewSession';
import { parseLegacyStoredProtocol } from '~/lib/schema-8/storedProtocol';
import {
  isLegacySchemaVersion,
  LEGACY_SCHEMA_VERSION,
} from '~/lib/schema-8/version';
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

/**
 * Build what the schema 8 interview needs from an interview row whose protocol
 * is stored at schema 8. This is the payload Fresco 4 built, read with the
 * validation schema 8 was released with.
 */
export function mapLegacyInterviewPayload(
  source: NonNullable<GetInterviewByIdQuery>,
): MappedInterview {
  const { protocol, ...session } = source;

  // The page only sends schema 8 interviews here; refuse loudly rather than
  // hand the schema 8 interview a document it cannot read.
  const { schemaVersion } = protocol;
  if (!isLegacySchemaVersion(schemaVersion)) {
    return {
      success: false,
      unreadable: 'protocol',
      error: new Error(
        `Protocol is stored as schema version ${schemaVersion}, not ${LEGACY_SCHEMA_VERSION}`,
      ),
    };
  }

  const storedProtocol = parseLegacyStoredProtocol(protocol);
  if (!storedProtocol.success) {
    return {
      success: false,
      unreadable: 'protocol',
      error: storedProtocol.error,
    };
  }

  const stored = parseLegacyStoredInterviewSession(session);
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
      exportTime: session.exportTime?.toISOString() ?? null,
      lastUpdated: session.lastUpdated.toISOString(),
      network: stored.data.network,
      stageMetadata: stored.data.stageMetadata ?? undefined,
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
