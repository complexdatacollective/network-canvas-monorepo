import type { z } from 'zod';

// The protocol's structure, imported from its own module rather than through
// the schema module or `../schemas/index.ts`: the schema module calls this one
// to validate references, so it cannot be imported back without a cycle.
import { ProtocolStructureSchema } from '../schemas/9/protocol-structure.ts';
import { registeredStageReferenceSites } from '../schemas/9/stage-reference.ts';
import {
  type AssetReferenceHit,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  type LayoutReferenceHit,
  isAssetHit,
  isAttributeHit,
  isLayoutHit,
  isStageHit,
  isTypeHit,
  type StageReferenceHit,
  walkSchemaReferences,
} from './schemaReferenceWalk.ts';

export const collectEntityAttributeReferencesFromSchema = (
  schema: z.ZodType,
  value: unknown,
): EntityAttributeReferenceHit[] =>
  walkSchemaReferences(schema, value, { readAssetBlocks: false })
    .filter(isAttributeHit)
    .map(({ kind: _kind, ...hit }) => hit);

export const collectEntityAttributeReferences = (
  protocol: unknown,
): EntityAttributeReferenceHit[] =>
  collectEntityAttributeReferencesFromSchema(ProtocolStructureSchema, protocol);

/**
 * Every codebook node/edge TYPE referenced by a protocol, discovered from the
 * schema's `entityTypeReference` tags — the entity-type counterpart of
 * `collectEntityAttributeReferences`. Covers stage subjects (including the
 * NetworkComposer's per-edge-type entries), edge creation/display prompt
 * settings, the FamilyPedigree subject and relationship type, and filter rules.
 *
 * Stated once, over any fragment of the schema and any value shaped like it,
 * so a caller holding one STAGE rather than a whole protocol — a stage editor,
 * which never has one — can ask the same question of what it has. Consumers
 * that need to know which types a stage names must derive it this way rather
 * than reading the two or three paths they happen to know: a stage type that
 * names an edge somewhere else (`createEdge` on the census interfaces, beside
 * the Sociogram's `edges.create`) is then covered the moment its schema is
 * tagged, instead of being silently invisible.
 */
export const collectEntityTypeReferencesFromSchema = (
  schema: z.ZodType,
  value: unknown,
): EntityTypeReferenceHit[] =>
  walkSchemaReferences(schema, value, { readAssetBlocks: false })
    .filter(isTypeHit)
    .map(({ kind: _kind, ...hit }) => hit);

/**
 * The same question asked of a whole protocol.
 *
 * A type's own definition naming that type is left out: a rule in a node
 * type's label names the type the label belongs to, which is not a use of it
 * by anything else. Counted, it would keep a type no stage uses from being
 * deleted, and list the type as used by itself.
 */
export const collectEntityTypeReferences = (
  protocol: unknown,
): EntityTypeReferenceHit[] =>
  collectEntityTypeReferencesFromSchema(
    ProtocolStructureSchema,
    protocol,
  ).filter(
    ({ entity, typeId, path }) =>
      !(path[0] === 'codebook' && path[1] === entity && path[2] === typeId),
  );

/**
 * Every stage setting naming a layout of `codebook.layouts`, discovered from
 * the schema's `layoutReference` tags: the Sociogram's and Network Composer's
 * `layout` and each Narrative preset's. A consumer asking which stages use a
 * layout derives it from here (see `layoutUsage.ts`).
 */
export const collectLayoutReferences = (
  protocol: unknown,
): LayoutReferenceHit[] =>
  walkSchemaReferences(ProtocolStructureSchema, protocol, {
    readAssetBlocks: false,
  })
    .filter(isLayoutHit)
    .map(({ kind: _kind, ...hit }) => hit);

/**
 * Every `assetManifest` entry referenced by a protocol, discovered from the
 * schema's `assetReference` tags — the asset counterpart of
 * `collectEntityAttributeReferences`. Covers name generator and panel data
 * sources, sociogram/narrative background images, the Geospatial map's token
 * and data-source assets, the files an Information page shows as blocks, and the
 * images a node type's custom shapes draw with.
 *
 * Consumers that need to know whether an asset is in use must derive it from
 * here rather than keeping their own list of paths: a stage type that gains an
 * asset field is then covered the moment its schema is tagged, instead of
 * silently reporting a used asset as unused (and offering to delete it).
 */
export const collectAssetReferences = (
  protocol: unknown,
): AssetReferenceHit[] =>
  walkSchemaReferences(ProtocolStructureSchema, protocol)
    .filter(isAssetHit)
    .map(({ kind: _kind, ...hit }) => hit);

/**
 * Every other STAGE a protocol's stages name, discovered from the schema's
 * `stageReference` tags — the stage counterpart of the collectors above.
 * Covers skip-logic destinations and the FamilyPedigree a NarrativePedigree
 * describes the people of.
 *
 * A consumer deciding whether a stage may be REMOVED must derive its
 * dependants from here rather than from the two paths it happens to know: a
 * stage type that gains a pointer at another stage is then covered the moment
 * its schema is tagged, instead of the removal silently leaving a protocol
 * that names a stage it no longer has.
 */
export const collectStageReferences = (
  protocol: unknown,
): StageReferenceHit[] =>
  walkSchemaReferences(ProtocolStructureSchema, protocol, {
    readAssetBlocks: false,
  })
    .filter(isStageHit)
    .map(({ kind: _kind, ...hit }) => hit);

/**
 * Every stage-reference site the CURRENT schema declares, whether or not any
 * protocol uses it.
 *
 * The collector above answers for one protocol, so a site no fixture exercises
 * is invisible to it; this answers for the schema, which is what a consumer
 * enumerating the kinds it has to handle needs. Read through this module
 * rather than from the registry directly, so that the current schema — and
 * with it every stage type's tags — is loaded before the question is asked.
 */
export const declaredStageReferenceSites = (): string[] => {
  // Referenced so the schema module cannot be tree-shaken away from a consumer
  // that only asks this question; every tag registers as that module loads.
  void ProtocolStructureSchema;
  return registeredStageReferenceSites();
};
