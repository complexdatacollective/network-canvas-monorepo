import { v4 as uuid } from 'uuid';

import type { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  CurrentProtocolSchema,
  hashProtocol,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  StageMetadataSchema,
} from '@codaco/shared-consts';

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
  /**
   * Store the seeded network's encrypted answers as schema 8 wrote them: each
   * value replaced by ciphertext with an IV and a salt of its own beside it,
   * and no encryption header on the network. Needs `seedNetwork`.
   */
  schema8Encryption?: boolean;
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

// The runtime never tries to decrypt a schema 8 value, so these bytes need
// not decrypt to anything: only their shape is the old format's.
const SCHEMA_8_CIPHERTEXT = Array.from(
  { length: 24 },
  (_, index) => (index * 37 + 11) % 256,
);
const SCHEMA_8_IV = Array.from({ length: 12 }, (_, index) => index + 1);
const SCHEMA_8_SALT = Array.from({ length: 16 }, (_, index) => 255 - index);

type Network = SessionPayload['network'];

function withSchema8Encryption(
  network: Network,
  codebook: ProtocolPayload['codebook'],
): Network {
  const { encryption: _header, ...unprotected } = network;
  return {
    ...unprotected,
    nodes: network.nodes.map((node) => {
      const variables = codebook.node?.[node.type]?.variables ?? {};
      const encrypted = Object.keys(node[entityAttributesProperty]).filter(
        (variableId) => variables[variableId]?.encrypted,
      );
      if (encrypted.length === 0) return node;
      return {
        ...node,
        [entityAttributesProperty]: {
          ...node[entityAttributesProperty],
          ...Object.fromEntries(
            encrypted.map((variableId) => [variableId, SCHEMA_8_CIPHERTEXT]),
          ),
        },
        [entitySecureAttributesMeta]: Object.fromEntries(
          encrypted.map((variableId) => [
            variableId,
            { iv: SCHEMA_8_IV, salt: SCHEMA_8_SALT },
          ]),
        ),
      };
    }),
  };
}

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
  if (opts.stageMetadata != null && !parsedStageMetadata.success) {
    // Silently dropping bad seeded metadata would run the interface from an
    // unseeded state and fail later with misleading assertions.
    throw new Error(
      `Synthetic payload "${opts.protocolName}" was given stageMetadata that fails StageMetadataSchema:\n${parsedStageMetadata.error.message}`,
    );
  }
  if (opts.schema8Encryption && !opts.seedNetwork) {
    throw new Error(
      `Synthetic payload "${opts.protocolName}" asks for schema 8 encryption without seedNetwork, so it has no answers to encrypt.`,
    );
  }
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
    // An unseeded run starts from a network nobody has answered anything in,
    // and that includes ego: `getNetwork()` draws its attributes the same way
    // it draws a node's, so leaving them in place would open every EgoForm
    // scenario on a form already filled out. A scenario about what an
    // unanswered form does could then not express itself, and one about
    // pre-population says so by asking for the seeded network.
    network: opts.seedNetwork
      ? opts.schema8Encryption
        ? withSchema8Encryption(raw.network, protocol.codebook)
        : raw.network
      : {
          ...raw.network,
          nodes: [],
          edges: [],
          ego: {
            ...raw.network.ego,
            [entityAttributesProperty]: {},
          },
        },
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
