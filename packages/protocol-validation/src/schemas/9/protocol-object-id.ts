import { v4, v5 } from 'uuid';
import { z } from 'zod';

const PROTOCOL_OBJECT_ID = 'protocolObjectId' as const;

/**
 * What a marked object is. Carried on the marker so that a consumer can tell
 * the objects of one kind apart from the rest (the session migration rewrites
 * the prompt ids nodes record, and no other kind), and so that the schema
 * declares the inventory of kinds it marks.
 */
export type ProtocolObjectKind =
  | 'stage'
  | 'prompt'
  | 'panel'
  | 'informationItem'
  | 'formField'
  | 'rule'
  | 'sortRule'
  | 'additionalAttribute'
  | 'rosterCardProperty'
  | 'rosterSortableProperty'
  | 'narrativePreset'
  | 'narrativePresetEdge'
  | 'narrativePresetHighlight'
  | 'disease'
  | 'composerEdge';

/**
 * Every kind declared so far. A module-level registry for the reason
 * `stageReference` keeps one: the declaration is the marker call, so a kind
 * cannot be marked and left out of the inventory.
 */
const KINDS = new Set<ProtocolObjectKind>();

/**
 * The identity of an object a researcher edits on its own: a UUID, unique
 * across the whole protocol. It is opaque: nothing may read a creation time,
 * a type or a position out of it.
 */
export const ProtocolObjectIdSchema = z
  .uuid({ error: 'An id must be a UUID.' })
  .brand<'ProtocolObjectId'>();

export type ProtocolObjectId = z.infer<typeof ProtocolObjectIdSchema>;

/**
 * The `id` of a marked object. The marker sits on the id field and names the
 * kind of the object that holds it, so `findMarkedObjects` finds every marked
 * object by walking the schema, including objects whose id is missing.
 *
 * Uniqueness across the protocol is checked once, by the protocol and by
 * each stage (`withUniqueObjectIds`), rather than per array.
 */
export const protocolObjectId = (kind: ProtocolObjectKind) => {
  KINDS.add(kind);
  return ProtocolObjectIdSchema.meta({ [PROTOCOL_OBJECT_ID]: kind });
};

const isProtocolObjectKind = (value: unknown): value is ProtocolObjectKind =>
  typeof value === 'string' && [...KINDS].some((kind) => kind === value);

/** The kind this schema node marks, or undefined when it is not a marker. */
export const getProtocolObjectKind = (
  schema: z.ZodType,
): ProtocolObjectKind | undefined => {
  const kind = schema.meta()?.[PROTOCOL_OBJECT_ID];
  return isProtocolObjectKind(kind) ? kind : undefined;
};

/**
 * The kinds marked by whatever schema modules have been loaded, so it is
 * complete only once the protocol schema has been imported.
 */
export const registeredProtocolObjectKinds = (): ProtocolObjectKind[] => [
  ...KINDS,
];

/** Whether a value is usable as a protocol object id. */
export const isProtocolObjectId = (value: unknown): value is ProtocolObjectId =>
  ProtocolObjectIdSchema.safeParse(value).success;

/** A new, random protocol object id, for an object being created. */
export const createProtocolObjectId = (): ProtocolObjectId =>
  ProtocolObjectIdSchema.parse(v4());

/**
 * A function that names protocol object ids by label within `namespace` (a
 * UUID), for a generator that must give the same objects the same ids every
 * time it runs. Changing the namespace changes every id it gives.
 */
export const deterministicProtocolObjectId =
  (namespace: string) =>
  (label: string): ProtocolObjectId =>
    ProtocolObjectIdSchema.parse(v5(label, namespace));
