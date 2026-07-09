import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';
import protocolManifestJson from '@codaco/protocols/manifest.json';

import { loadTemplateAssets } from './template-assets';

export type ProtocolKind = 'template' | 'sample' | 'development' | 'e2e';

export type ProtocolSourceRef = {
  kind: ProtocolKind;
  id: string;
};

type ProtocolManifestKind = ProtocolKind | 'documentation';

export type BundledTemplate = {
  id: string;
  name: string;
  description: string;
  protocol: CurrentProtocol;
  sourceRef: ProtocolSourceRef;
  // Templates that ship media (e.g. a bundled GeoJSON) expose a lazy loader
  // that fetches those assets as Blobs when the template is opened; templates
  // without assets omit it.
  loadAssets?: () => Promise<ExtractedAsset[]>;
};

type ProtocolManifestEntry = {
  id: string;
  kind: ProtocolManifestKind;
  name: string;
  description: string;
  protocolPath: string;
  assetDir: string;
  architectTemplate: boolean;
};

type ProtocolManifest = {
  protocols: ProtocolManifestEntry[];
};

const protocolManifest = protocolManifestJson as ProtocolManifest;

const templateProtocolModules = import.meta.glob<CurrentProtocol>(
  '../../../../packages/protocols/templates/*/protocol.json',
  { import: 'default', eager: true },
);

const templateProtocolsById = new Map(
  Object.entries(templateProtocolModules).map(([path, protocol]) => {
    const match = /\/templates\/([^/]+)\/protocol\.json$/.exec(path);
    if (!match) {
      throw new Error(`Unexpected template protocol path: ${path}`);
    }
    return [match[1], protocol] as const;
  }),
);

const hasFileAssets = (protocol: CurrentProtocol): boolean =>
  Object.values(protocol.assetManifest ?? {}).some(
    (entry) => entry.type !== 'apikey' && Boolean(entry.source),
  );

// Research-grounded starting points shown in Architect's "Templates" tab. The
// canonical, validated source for each template lives in
// `packages/protocols/templates/<id>/protocol.json`; the Vite glob above bundles
// those files directly so there are no generated JSON copies to drift.
export const BUNDLED_TEMPLATES: BundledTemplate[] = protocolManifest.protocols
  .filter((entry) => entry.kind === 'template' && entry.architectTemplate)
  .map((entry) => {
    const protocol = templateProtocolsById.get(entry.id);
    if (!protocol) {
      throw new Error(`Missing bundled template protocol: ${entry.id}`);
    }

    return {
      id: entry.id,
      name: entry.name,
      description: protocol.description?.trim() || entry.description,
      protocol,
      sourceRef: { kind: 'template', id: entry.id },
      loadAssets: hasFileAssets(protocol)
        ? () => loadTemplateAssets(entry.id, protocol)
        : undefined,
    };
  });
