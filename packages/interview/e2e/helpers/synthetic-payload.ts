import { v4 as uuid } from 'uuid';

import type { SyntheticInterview } from '@codaco/protocol-utilities';
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
 * Convert a SyntheticInterview into the real ProtocolPayload/SessionPayload
 * contract the e2e host's window.__test hooks expect. The assembled protocol
 * is parsed with CurrentProtocolSchema (including its cross-reference
 * superRefines) so an invalid builder config fails loudly at build time with
 * a Zod error instead of a mystery render inside the interview.
 */
export function buildSyntheticPayload(
  synth: SyntheticInterview,
  opts: BuildSyntheticPayloadOptions,
): SyntheticPayloadResult {
  const parsedStageMetadata = StageMetadataSchema.safeParse(opts.stageMetadata);
  const raw = synth.getInterviewPayload({
    currentStep: opts.currentStep ?? 0,
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
    network: opts.seedNetwork
      ? raw.network
      : { ...raw.network, nodes: [], edges: [] },
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
