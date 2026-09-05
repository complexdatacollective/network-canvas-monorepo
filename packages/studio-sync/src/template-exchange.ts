import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';

import {
  assetSchema,
  collectAssetReferences,
  CURRENT_SCHEMA_VERSION,
  CurrentProtocolSchema,
  stageSchema,
} from '@codaco/protocol-validation';

import { type SectionDoc } from './apply.ts';
import { assembleProtocolSections } from './protocol-document.ts';
import { assertSectionValid } from './section-validation.ts';
import { parseSectionId } from './taxonomy.ts';
import {
  canonicalJsonBytes,
  encodeTemplateArchive,
  readCanonicalJson,
  readTemplateArchive,
  TEMPLATE_ARTIFACT_LIMITS,
  TemplateArtifactError,
} from './template-archive.ts';
import {
  TemplateKindSchema,
  TemplateLicenseSchema,
  TemplateMetadataSchema,
  type TemplateMetadata,
} from './template-metadata.ts';

export {
  TEMPLATE_ARTIFACT_LIMITS,
  TemplateArtifactError,
} from './template-archive.ts';

export const TEMPLATE_ARTIFACT_MEDIA_TYPE =
  'application/vnd.networkcanvas.template+zip';
export const TemplateContentHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const filename = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      value !== '.' &&
      value !== '..' &&
      // oxlint-disable-next-line no-control-regex -- Reject unsafe filename controls.
      !/[\\/\u0000-\u001f]/.test(value) &&
      value.trim().length > 0,
  );

export const TemplateAssetReferenceSchema = z.strictObject({
  source: filename,
  hash: TemplateContentHashSchema,
  byte_size: z.number().int().min(1).max(TEMPLATE_ARTIFACT_LIMITS.assetBytes),
  media_class: z.enum(['image', 'audio', 'video', 'dataset']),
  media_type: z.string().min(1).max(127),
});

export const TemplateArtifactManifestSchema = z.strictObject({
  format: z.literal('network-canvas-template'),
  format_version: z.literal(1),
  protocol_schema_version: z.number().int().positive(),
  template: z.strictObject({
    name: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => value.trim().length > 0),
    kind: TemplateKindSchema,
    version: z.number().int().positive().max(2_147_483_647),
    summary: z.string().min(1).max(2000).optional(),
  }),
  sections: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(255),
        hash: TemplateContentHashSchema,
      }),
    )
    .min(1)
    .max(TEMPLATE_ARTIFACT_LIMITS.sections),
  assets: z
    .array(TemplateAssetReferenceSchema)
    .max(TEMPLATE_ARTIFACT_LIMITS.assets),
  metadata_hash: TemplateContentHashSchema,
  license_hash: TemplateContentHashSchema,
  merkle_root: TemplateContentHashSchema,
});

export type TemplateArtifactManifest = z.infer<
  typeof TemplateArtifactManifestSchema
>;
export type TemplateArtifactAsset = z.infer<
  typeof TemplateAssetReferenceSchema
> & { bytes: Uint8Array };
export type VerifiedTemplateArtifact = {
  manifest: TemplateArtifactManifest;
  metadata: TemplateMetadata;
  license: z.infer<typeof TemplateLicenseSchema>;
  sections: Readonly<Record<string, SectionDoc>>;
  assets: readonly TemplateArtifactAsset[];
};

export function templateBytesHash(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/** A one-level Merkle tree: the root covers ordered, typed content references. */
export function templateMerkleRoot(
  manifest: Omit<TemplateArtifactManifest, 'merkle_root'>,
): string {
  return templateBytesHash(canonicalJsonBytes(manifest));
}

function invalid(): never {
  throw new TemplateArtifactError('TEMPLATE_ARTIFACT_INVALID');
}

function requireFile(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  return files.get(path) ?? invalid();
}

function requireHash(bytes: Uint8Array, expected: string): void {
  if (templateBytesHash(bytes) !== expected)
    throw new TemplateArtifactError('TEMPLATE_CONTENT_MISMATCH');
}

const binaryMedia = new Map<string, TemplateArtifactAsset['media_class']>([
  ['image/png', 'image'],
  ['image/apng', 'image'],
  ['image/jpeg', 'image'],
  ['image/gif', 'image'],
  ['image/webp', 'image'],
  ['image/avif', 'image'],
  ['audio/mpeg', 'audio'],
  ['audio/wav', 'audio'],
  ['audio/ogg', 'audio'],
  ['audio/aac', 'audio'],
  ['audio/flac', 'audio'],
  ['audio/mp4', 'audio'],
  ['video/mp4', 'video'],
  ['video/webm', 'video'],
  ['video/ogg', 'video'],
]);

async function screenAsset(asset: TemplateArtifactAsset): Promise<void> {
  if (asset.bytes.byteLength !== asset.byte_size) invalid();
  requireHash(asset.bytes, asset.hash);
  let admitted = false;
  if (
    asset.media_class === 'dataset' &&
    ['text/csv', 'application/json', 'application/geo+json'].includes(
      asset.media_type,
    )
  ) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        asset.bytes,
      );
      // oxlint-disable-next-line no-control-regex -- Dataset controls cannot hide active/binary payloads.
      if (!text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
        invalid();
      if (asset.media_type === 'text/csv') {
        // CSV is inert dataset text, never an inline browser document.
        admitted = !/^\s*<(?:!doctype|html|svg|script)\b/i.test(text);
      } else {
        const value: unknown = JSON.parse(text);
        admitted = value !== null && typeof value === 'object';
        if (asset.media_type === 'application/geo+json') {
          admitted =
            isRecord(value) &&
            [
              'FeatureCollection',
              'Feature',
              'Point',
              'MultiPoint',
              'LineString',
              'MultiLineString',
              'Polygon',
              'MultiPolygon',
              'GeometryCollection',
            ].includes(String(value.type));
        }
      }
    } catch {
      admitted = false;
    }
  } else if (binaryMedia.get(asset.media_type) === asset.media_class) {
    try {
      admitted =
        (await fileTypeFromBuffer(asset.bytes))?.mime === asset.media_type;
    } catch {
      admitted = false;
    }
  }
  if (!admitted) throw new TemplateArtifactError('TEMPLATE_ASSET_DISALLOWED');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Presence only: destination reference mapping remains the insertion contract. */
function requireKindContent(
  kind: TemplateArtifactManifest['template']['kind'],
  sections: ReadonlyMap<string, SectionDoc>,
): void {
  if (kind === 'protocol') return;
  const present = Array.from(sections).some(([id, doc]) => {
    const reference = parseSectionId(id);
    if (kind === 'stage') return reference.kind === 'stage';
    if (kind === 'entity_definition' || kind === 'variable_set') {
      const definition =
        reference.kind === 'codebookNode' ||
        reference.kind === 'codebookEdge' ||
        reference.kind === 'codebookEgo';
      return (
        definition &&
        (kind === 'entity_definition' ||
          (isRecord(doc.variables) && Object.keys(doc.variables).length > 0))
      );
    }
    if (reference.kind !== 'stage') return false;
    const stage = stageSchema.parse(doc);
    if (!('prompts' in stage) || stage.prompts.length === 0) return false;
    if (
      stage.type === 'NameGenerator' ||
      stage.type === 'NameGeneratorQuickAdd' ||
      stage.type === 'NameGeneratorRoster'
    )
      return true;
    // Census prompts require createEdge; Sociogram can instead only display
    // edges or collect layouts. A display-only prompt is not a generator.
    return stage.prompts.some(
      (prompt) =>
        ('createEdge' in prompt && prompt.createEdge.length > 0) ||
        ('edges' in prompt && Boolean(prompt.edges?.create)),
    );
  });
  if (!present) throw new TemplateArtifactError('TEMPLATE_SECTIONS_INVALID');
}

async function verifyFiles(
  files: ReadonlyMap<string, Uint8Array>,
): Promise<VerifiedTemplateArtifact> {
  const rawManifest = readCanonicalJson(requireFile(files, 'manifest.json'));
  if (!isRecord(rawManifest)) invalid();
  if (
    rawManifest.format !== 'network-canvas-template' ||
    rawManifest.format_version !== 1
  ) {
    throw new TemplateArtifactError('TEMPLATE_FORMAT_UNSUPPORTED');
  }
  if (
    Number.isInteger(rawManifest.protocol_schema_version) &&
    rawManifest.protocol_schema_version !== CURRENT_SCHEMA_VERSION
  ) {
    throw new TemplateArtifactError(
      'TEMPLATE_SCHEMA_UNSUPPORTED',
      Number(rawManifest.protocol_schema_version),
    );
  }
  const parsed = TemplateArtifactManifestSchema.safeParse(rawManifest);
  if (!parsed.success) invalid();
  const manifest = parsed.data;
  const { merkle_root, ...rootInput } = manifest;
  if (templateMerkleRoot(rootInput) !== merkle_root)
    throw new TemplateArtifactError('TEMPLATE_CONTENT_MISMATCH');
  const expected = new Set(['manifest.json', 'metadata.json', 'license.json']);
  const metadataBytes = requireFile(files, 'metadata.json');
  requireHash(metadataBytes, manifest.metadata_hash);
  const metadataResult = TemplateMetadataSchema.safeParse(
    readCanonicalJson(metadataBytes),
  );
  if (!metadataResult.success) invalid();
  const licenseBytes = requireFile(files, 'license.json');
  requireHash(licenseBytes, manifest.license_hash);
  const licenseResult = z
    .strictObject({ spdx: TemplateLicenseSchema })
    .safeParse(readCanonicalJson(licenseBytes));
  if (!licenseResult.success) invalid();
  const sections = new Map<string, SectionDoc>();
  let previousId = '';
  try {
    for (const reference of manifest.sections) {
      // Canonical section-ID ordering is independent of JSONB key ordering;
      // stage execution order lives in the stageOrder section itself.
      if (reference.id <= previousId) invalid();
      previousId = reference.id;
      const path = `sections/${reference.hash}.json`;
      expected.add(path);
      const bytes = requireFile(files, path);
      requireHash(bytes, reference.hash);
      const doc = readCanonicalJson(bytes);
      if (!isRecord(doc)) invalid();
      assertSectionValid(
        reference.id,
        doc,
        manifest.sections.map(({ id }) => id),
      );
      sections.set(reference.id, doc);
    }
    requireKindContent(manifest.template.kind, sections);
    if (manifest.template.kind === 'protocol') {
      const result = await CurrentProtocolSchema.safeParseAsync(
        assembleProtocolSections(Object.fromEntries(sections)),
      );
      if (!result.success)
        throw new TemplateArtifactError('TEMPLATE_SECTIONS_INVALID');
    }
  } catch (error) {
    if (error instanceof TemplateArtifactError) throw error;
    throw new TemplateArtifactError('TEMPLATE_SECTIONS_INVALID');
  }
  const assets: TemplateArtifactAsset[] = [];
  const sources = new Map<string, TemplateArtifactAsset>();
  let previousSource = '';
  for (const reference of manifest.assets) {
    if (reference.source <= previousSource) invalid();
    previousSource = reference.source;
    const path = `assets/${reference.hash}`;
    expected.add(path);
    const asset = { ...reference, bytes: requireFile(files, path) };
    await screenAsset(asset);
    assets.push(asset);
    sources.set(reference.source, asset);
  }
  const usedSources = new Set<string>();
  const assetIds = new Set<string>();
  for (const [id, doc] of sections) {
    if (parseSectionId(id).kind !== 'assets') continue;
    for (const [assetId, definition] of Object.entries(doc)) {
      const parsedAsset = assetSchema.safeParse(definition);
      if (!parsedAsset.success)
        throw new TemplateArtifactError('TEMPLATE_SECTIONS_INVALID');
      if (parsedAsset.data.type === 'apikey')
        throw new TemplateArtifactError('TEMPLATE_ASSET_DISALLOWED');
      const asset = sources.get(parsedAsset.data.source);
      const mediaClass = ['network', 'geojson'].includes(parsedAsset.data.type)
        ? 'dataset'
        : parsedAsset.data.type;
      if (!asset || asset.media_class !== mediaClass)
        throw new TemplateArtifactError('TEMPLATE_ASSET_DISALLOWED');
      assetIds.add(assetId);
      usedSources.add(parsedAsset.data.source);
    }
  }
  const partial = Object.fromEntries(sections);
  partial.settings ??= {
    name: manifest.template.name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
  partial.stageOrder ??= {
    stages: manifest.sections.flatMap(({ id }) => {
      const reference = parseSectionId(id);
      return reference.kind === 'stage' ? [reference.stageId] : [];
    }),
  };
  if (
    collectAssetReferences(assembleProtocolSections(partial)).some(
      ({ assetId }) => !assetIds.has(assetId),
    )
  ) {
    throw new TemplateArtifactError('TEMPLATE_ASSET_DISALLOWED');
  }
  if (usedSources.size !== sources.size || expected.size !== files.size)
    invalid();
  return {
    manifest,
    metadata: metadataResult.data,
    license: licenseResult.data.spdx,
    sections: Object.fromEntries(sections),
    assets,
  };
}

/** No blob is trusted until the complete container has passed this boundary. */
export async function readTemplateArtifact(
  bytes: Uint8Array,
): Promise<VerifiedTemplateArtifact> {
  return verifyFiles(readTemplateArchive(bytes));
}

export type TemplateArtifactInput = {
  template: TemplateArtifactManifest['template'];
  metadata: TemplateMetadata;
  license: z.infer<typeof TemplateLicenseSchema>;
  sections: Readonly<Record<string, SectionDoc>>;
  assets: readonly {
    source: string;
    media_type: string;
    media_class: TemplateArtifactAsset['media_class'];
    bytes: Uint8Array;
  }[];
};

/** Snapshot and validate publisher inputs before returning transport bytes. */
export async function createTemplateArtifact(
  input: TemplateArtifactInput,
): Promise<{ bytes: Uint8Array; artifact: VerifiedTemplateArtifact }> {
  if (
    Object.keys(input.sections).length > TEMPLATE_ARTIFACT_LIMITS.sections ||
    input.assets.length > TEMPLATE_ARTIFACT_LIMITS.assets
  ) {
    throw new TemplateArtifactError('TEMPLATE_TOO_LARGE');
  }
  const files = new Map<string, Uint8Array>([
    ['metadata.json', canonicalJsonBytes(input.metadata)],
    ['license.json', canonicalJsonBytes({ spdx: input.license })],
  ]);
  const sectionRefs = Object.entries(input.sections)
    .map(([id, doc]) => {
      const bytes = canonicalJsonBytes(doc);
      const hash = templateBytesHash(bytes);
      files.set(`sections/${hash}.json`, bytes);
      return { id, hash };
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const assetRefs = input.assets
    .map((asset) => {
      if (asset.bytes.byteLength > TEMPLATE_ARTIFACT_LIMITS.assetBytes)
        throw new TemplateArtifactError('TEMPLATE_TOO_LARGE');
      const bytes = Uint8Array.from(asset.bytes);
      const hash = templateBytesHash(bytes);
      files.set(`assets/${hash}`, bytes);
      return {
        source: asset.source,
        media_type: asset.media_type,
        media_class: asset.media_class,
        byte_size: bytes.byteLength,
        hash,
      };
    })
    .toSorted((a, b) =>
      a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
    );
  const rootInput = {
    format: 'network-canvas-template',
    format_version: 1,
    protocol_schema_version: CURRENT_SCHEMA_VERSION,
    template: structuredClone(input.template),
    sections: sectionRefs,
    assets: assetRefs,
    metadata_hash: templateBytesHash(requireFile(files, 'metadata.json')),
    license_hash: templateBytesHash(requireFile(files, 'license.json')),
  } as const;
  files.set(
    'manifest.json',
    canonicalJsonBytes({
      ...rootInput,
      merkle_root: templateMerkleRoot(rootInput),
    }),
  );
  const bytes = encodeTemplateArchive(files);
  const artifact = await readTemplateArtifact(bytes);
  return { bytes, artifact };
}
