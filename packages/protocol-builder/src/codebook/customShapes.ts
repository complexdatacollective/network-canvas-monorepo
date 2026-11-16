import { v4 as uuid } from 'uuid';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  type CustomNodeShape,
  getCustomShapeId,
  isCustomShapeReference,
  type NodeShapeReference,
  NodeShapes,
} from '@codaco/protocol-validation';

export type CustomShapes = Readonly<Record<string, CustomNodeShape>>;

const messages = defineMessages({
  nameRequired: {
    id: 'protocolBuilder.customShapes.nameRequired',
    defaultMessage: 'Enter a name for this shape.',
    description:
      'Refusal shown under the name field of one custom node shape when the researcher has left it empty. A custom shape is an SVG image the researcher added to draw nodes of this type.',
  },
  nameTaken: {
    id: 'protocolBuilder.customShapes.nameTaken',
    defaultMessage:
      'Another shape of this node type is already named "{name}".',
    description:
      'Refusal shown under the name field of one custom node shape when another custom shape of the same node type has the same name, ignoring case. name is what the researcher typed.',
  },
  namesIncomplete: {
    id: 'protocolBuilder.customShapes.namesIncomplete',
    defaultMessage:
      'Give every custom shape a name that no other shape of this node type uses.',
    description:
      'Refusal shown for the list of custom node shapes when the researcher tries to save while one of them has no name or shares a name with another.',
  },
  missingDefaultShape: {
    id: 'protocolBuilder.customShapes.missingDefaultShape',
    defaultMessage:
      'The chosen shape is no longer available. Choose another default shape.',
    description:
      'Refusal shown under the default shape picker of the node type editor when the shape it names is a custom shape the node type no longer has.',
  },
  missingMappedShape: {
    id: 'protocolBuilder.customShapes.missingMappedShape',
    defaultMessage:
      'The shape mapping uses a shape that is no longer available. Choose another shape for each value that uses it.',
    description:
      'Refusal shown under the shape mapping of the node type editor when one of its rows names a custom shape the node type no longer has.',
  },
});

const CUSTOM_REFERENCE_PATTERN = /^custom:[A-Za-z0-9_-]+$/;

/** Whether this is a shape a node type may name: built in, or one of its own. */
export const isNodeShapeReference = (
  value: unknown,
): value is NodeShapeReference =>
  NodeShapes.some((shape) => shape === value) ||
  (typeof value === 'string' && CUSTOM_REFERENCE_PATTERN.test(value));

export const customShapeReference = (id: string): NodeShapeReference =>
  `custom:${id}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The custom shapes a stored node type carries, read leniently: an entry that
 * is not a name and an asset id is not one this editor can show or keep.
 */
export const readCustomShapes = (value: unknown): CustomShapes | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(
    ([id, shape]): [string, CustomNodeShape][] =>
      isRecord(shape) &&
      typeof shape.name === 'string' &&
      typeof shape.asset === 'string'
        ? [[id, { name: shape.name, asset: shape.asset }]]
        : [],
  );
  return Object.fromEntries(entries);
};

/** The resources a type's custom shapes draw from, for `useNodeShapeSvgs`. */
export const shapeAssetIds = (
  shapes: CustomShapes | undefined,
): readonly string[] => Object.values(shapes ?? {}).map(({ asset }) => asset);

export type CustomShapeUsage = 'default' | 'mapping' | 'defaultAndMapping';

const shapesOf = (entries: unknown): NodeShapeReference[] =>
  Array.isArray(entries)
    ? entries.flatMap((entry) =>
        isRecord(entry) && isNodeShapeReference(entry.shape)
          ? [entry.shape]
          : [],
      )
    : [];

/** Every shape a mapping names, read from whatever the editor holds. */
const mappingReferences = (mapping: unknown): NodeShapeReference[] =>
  isRecord(mapping)
    ? [...shapesOf(mapping.map), ...shapesOf(mapping.thresholds)]
    : [];

/** Where each custom shape is used: as the default, in the mapping, or both. */
export const customShapeUsage = (
  defaultShape: unknown,
  mapping: unknown,
): Readonly<Record<string, CustomShapeUsage>> => {
  const usage: Record<string, CustomShapeUsage> = {};
  if (
    isNodeShapeReference(defaultShape) &&
    isCustomShapeReference(defaultShape)
  ) {
    usage[getCustomShapeId(defaultShape)] = 'default';
  }
  for (const reference of mappingReferences(mapping)) {
    if (!isCustomShapeReference(reference)) continue;
    const id = getCustomShapeId(reference);
    usage[id] =
      usage[id] === 'default' || usage[id] === 'defaultAndMapping'
        ? 'defaultAndMapping'
        : 'mapping';
  }
  return usage;
};

const nameKey = (name: string) => name.trim().toLowerCase();

/** What is wrong with each shape's name, encoded, keyed by shape id. */
export const customShapeNameIssues = (
  shapes: CustomShapes | undefined,
): Readonly<Record<string, string>> => {
  const counts = new Map<string, number>();
  for (const shape of Object.values(shapes ?? {})) {
    const key = nameKey(shape.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const issues: Record<string, string> = {};
  for (const [id, shape] of Object.entries(shapes ?? {})) {
    if (shape.name.trim() === '') {
      issues[id] = createMessageError(messages.nameRequired);
    } else if ((counts.get(nameKey(shape.name)) ?? 0) > 1) {
      issues[id] = createMessageError(messages.nameTaken, {
        name: shape.name.trim(),
      });
    }
  }
  return issues;
};

/** One refusal for the whole list, for a form that reports per field. */
export const customShapesIssue = (
  shapes: CustomShapes | undefined,
): string | undefined =>
  Object.keys(customShapeNameIssues(shapes)).length > 0
    ? createMessageError(messages.namesIncomplete)
    : undefined;

const isMissingCustomShape = (
  reference: NodeShapeReference,
  shapes: CustomShapes | undefined,
) =>
  isCustomShapeReference(reference) &&
  !Object.hasOwn(shapes ?? {}, getCustomShapeId(reference));

/** A refusal when the default shape names a custom shape the type lacks. */
export const defaultShapeIssue = (
  defaultShape: unknown,
  shapes: CustomShapes | undefined,
): string | undefined =>
  isNodeShapeReference(defaultShape) &&
  isMissingCustomShape(defaultShape, shapes)
    ? createMessageError(messages.missingDefaultShape)
    : undefined;

/** A refusal when the mapping names a custom shape the type lacks. */
export const mappedShapesIssue = (
  mapping: unknown,
  shapes: CustomShapes | undefined,
): string | undefined =>
  mappingReferences(mapping).some((reference) =>
    isMissingCustomShape(reference, shapes),
  )
    ? createMessageError(messages.missingMappedShape)
    : undefined;

/** The name a resource suggests for its shape: its own, without the extension. */
export const shapeNameFromFile = (
  fileName: string,
  takenNames: readonly string[],
): string => {
  const base = fileName.replace(/\.[^.]+$/, '').trim() || fileName;
  const taken = new Set(takenNames.map(nameKey));
  if (!taken.has(nameKey(base))) return base;
  for (let suffix = 2; suffix <= taken.size + 1; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
  return `${base} ${taken.size + 2}`;
};

/** The shape that already draws from this resource, if any. */
export const customShapeForAsset = (
  shapes: CustomShapes | undefined,
  asset: string,
): string | undefined =>
  Object.entries(shapes ?? {}).find(([, shape]) => shape.asset === asset)?.[0];

/**
 * A short id for a new shape, unused among the type's own. It starts with a
 * letter because an all-digit key would sort ahead of the others in the
 * record, moving the shape to the front of every picker.
 */
export const newCustomShapeId = (
  existing: CustomShapes | undefined,
): string => {
  const short = `s${uuid().slice(0, 8)}`;
  return Object.hasOwn(existing ?? {}, short) ? `s${uuid()}` : short;
};
