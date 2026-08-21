import { v4 as uuid } from 'uuid';

import type { ProtocolBuilder } from '@codaco/protocol-utilities';
import {
  CurrentProtocolSchema,
  hashProtocol,
} from '@codaco/protocol-validation';
import { StageMetadataSchema } from '@codaco/shared-consts';

import type {
  ProtocolPayload,
  ResolvedAsset,
  SessionPayload,
} from '../../src/contract/types.js';

type FileAssetSpec = {
  assetId: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'network' | 'geojson';
  source: string;
  localPath: string;
};

type ApiKeyAssetSpec = {
  assetId: string;
  name: string;
  type: 'apikey';
  value: string;
};

export type SyntheticAssetSpec = FileAssetSpec | ApiKeyAssetSpec;

export type BuildSyntheticPayloadOptions = {
  protocolName: string;
  assets?: SyntheticAssetSpec[];
  currentStep?: number;
  /**
   * Open on the interview a simulated participant would have produced, rather
   * than on the untouched one. Off by default, because a scenario about what
   * an unanswered stage does cannot express itself against pre-filled state.
   */
  seedNetwork?: boolean;
  stageMetadata?: unknown;
};

export type SyntheticPayloadResult = {
  protocol: ProtocolPayload;
  session: SessionPayload;
  // SessionState carries no step — the host derives the step from the URL
  // (?step=) and passes it to Shell as a prop, so the runner navigates with
  // interview.goto(currentStep) instead of seeding it into the session.
  currentStep: number;
  assetFiles: { assetId: string; source: string; localPath: string }[];
};

/**
 * Convert a ProtocolBuilder into the real ProtocolPayload/SessionPayload
 * contract the e2e host's window.__test hooks expect. The assembled protocol
 * is parsed with CurrentProtocolSchema (including its cross-reference
 * superRefines) so an invalid builder config fails loudly at build time with
 * a Zod error instead of a mystery render inside the interview.
 */
export function buildSyntheticPayload(
  synth: ProtocolBuilder,
  opts: BuildSyntheticPayloadOptions,
): SyntheticPayloadResult {
  const parsedStageMetadata = StageMetadataSchema.safeParse(opts.stageMetadata);
  if (opts.stageMetadata != null && !parsedStageMetadata.success) {
    // Silently dropping bad seeded metadata would run the interface from an
    // unseeded state and fail later with misleading assertions.
    throw new Error(
      `Synthetic payload "${opts.protocolName}" was given stageMetadata that fails StageMetadataSchema:\n${parsedStageMetadata.error.message}`,
    );
  }
  // An unseeded run is the interview before anything has happened, so ask the
  // delegate for exactly that: stopped at the first stage, nothing simulated
  // (plan D20). Network, edges and ego answers are then empty by construction
  // rather than by this adapter blanking fields it would have to keep in step
  // with whatever the generator learns to fill. A scenario that wants the
  // pre-populated interview asks for `seedNetwork`.
  const raw = synth.getInterviewPayload({
    currentStep: opts.currentStep ?? 0,
    ...(opts.seedNetwork ? {} : { stopAt: { stageIndex: 0 } }),
  });

  const assetManifest = Object.fromEntries(
    (opts.assets ?? []).map((a) => [
      a.assetId,
      a.type === 'apikey'
        ? { name: a.name, type: a.type, value: a.value }
        : { name: a.name, type: a.type, source: a.source },
    ]),
  );

  const candidate = {
    name: opts.protocolName,
    schemaVersion: raw.protocol.schemaVersion,
    codebook: raw.protocol.codebook,
    stages: raw.protocol.stages,
    ...(Object.keys(assetManifest).length > 0 ? { assetManifest } : {}),
    ...(raw.protocol.experiments
      ? { experiments: raw.protocol.experiments }
      : {}),
  };
  const parsed = CurrentProtocolSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `Synthetic protocol "${opts.protocolName}" failed CurrentProtocolSchema:\n${parsed.error.message}`,
    );
  }
  const { assetManifest: _manifest, ...protocolBody } = parsed.data;

  const resolvedAssets: ResolvedAsset[] = (opts.assets ?? []).map((a) =>
    a.type === 'apikey'
      ? { assetId: a.assetId, name: a.name, type: a.type, value: a.value }
      : { assetId: a.assetId, name: a.name, type: a.type, source: a.source },
  );

  const protocol: ProtocolPayload = {
    ...protocolBody,
    id: uuid(),
    // Deliberately not decision 15's boundary: a host hashes the raw
    // pre-parse document it was given, but a fixture has no such document —
    // this protocol is assembled here. The digest is a test-local identity
    // for a protocol that exists only in this process and is never compared
    // against a host-stored hash, so hashing the parsed form is what there
    // is to hash.
    hash: hashProtocol(parsed.data),
    importedAt: new Date().toISOString(),
    assets: resolvedAssets,
  };

  const session: SessionPayload = {
    id: uuid(),
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: raw.network,
    ...(parsedStageMetadata.success && opts.stageMetadata != null
      ? { stageMetadata: parsedStageMetadata.data }
      : {}),
  };

  return {
    protocol,
    session,
    currentStep: opts.currentStep ?? 0,
    assetFiles: (opts.assets ?? []).flatMap((a) =>
      a.type === 'apikey'
        ? []
        : [{ assetId: a.assetId, source: a.source, localPath: a.localPath }],
    ),
  };
}
