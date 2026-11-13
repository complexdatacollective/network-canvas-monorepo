import { v4 as uuid } from 'uuid';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  type CustomNodeShape,
  getCustomShapeId,
  isCustomShapeReference,
  MAX_NODE_SHAPE_SVG_LENGTH,
  type NodeShapeReference,
  type NodeShapeSvgIssue,
  NodeShapes,
  parseNodeShapeSvg,
  serializeNodeShapeSvg,
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
  notSvg: {
    id: 'protocolBuilder.customShapes.notSvg',
    defaultMessage: '"{file}" is not an SVG image.',
    description:
      'Shown when a file the researcher chose as a custom node shape cannot be read as an SVG image. file is the name of the file. SVG is a file format name and is not translated.',
  },
  noViewBox: {
    id: 'protocolBuilder.customShapes.noViewBox',
    defaultMessage:
      '"{file}" has no viewBox, so its size cannot be worked out. Add a viewBox to the svg element, or a numeric width and height, and choose it again.',
    description:
      'Shown when an SVG file chosen as a custom node shape does not say how large its drawing is. file is the name of the file. viewBox, width and height are SVG attribute names and svg is an element name: none of them is translated.',
  },
  tooLarge: {
    id: 'protocolBuilder.customShapes.tooLarge',
    defaultMessage:
      '"{file}" is too large. A shape can be at most {limit, number} characters long.',
    description:
      'Shown when an SVG file chosen as a custom node shape is longer than the limit. file is the name of the file; limit is the largest number of characters a shape may have.',
  },
  nothingToDraw: {
    id: 'protocolBuilder.customShapes.nothingToDraw',
    defaultMessage:
      '"{file}" has nothing that can be drawn once unsupported content is removed.',
    description:
      'Shown when an SVG file chosen as a custom node shape contains no drawing that a node shape can use. file is the name of the file.',
  },
  unreadable: {
    id: 'protocolBuilder.customShapes.unreadable',
    defaultMessage: '"{file}" could not be read. Choose it again.',
    description:
      'Shown when the browser could not read a file the researcher chose as a custom node shape. file is the name of the file.',
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
 * is not a name and an SVG is not one this editor can show or keep.
 */
export const readCustomShapes = (value: unknown): CustomShapes | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(([id, shape]) =>
    isRecord(shape) &&
    typeof shape.name === 'string' &&
    typeof shape.svg === 'string'
      ? [[id, { name: shape.name, svg: shape.svg }] as const]
      : [],
  );
  return Object.fromEntries(entries);
};

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

/** The kinds of content a shape's file can lose on the way in. */
export type RemovedContentKind =
  | 'scripts'
  | 'images'
  | 'styles'
  | 'filters'
  | 'animations'
  | 'links'
  | 'colors'
  | 'labelArea'
  | 'other';

const ELEMENT_KINDS: Readonly<Record<string, RemovedContentKind>> = {
  script: 'scripts',
  image: 'images',
  foreignObject: 'images',
  style: 'styles',
  filter: 'filters',
  animate: 'animations',
  animateMotion: 'animations',
  animateTransform: 'animations',
  set: 'animations',
  a: 'links',
};

const elementKind = (detail: string): RemovedContentKind => {
  const tag = /^<([^>\s]+)>$/.exec(detail)?.[1] ?? '';
  if (tag.startsWith('fe')) return 'filters';
  return ELEMENT_KINDS[tag] ?? 'other';
};

const ISSUE_KINDS: Readonly<
  Record<NodeShapeSvgIssue['code'], (detail: string) => RemovedContentKind>
> = {
  'unsupported-element': elementKind,
  // Event handler attributes (onload, onclick) are scripts.
  'unsupported-attribute': (detail) =>
    /^on/i.test(detail) ? 'scripts' : 'other',
  'unsupported-style': () => 'styles',
  'unsafe-value': () => 'links',
  'unknown-token': () => 'colors',
  'invalid-label-area': () => 'labelArea',
  'not-xml': () => 'other',
  'no-svg-root': () => 'other',
  'no-view-box': () => 'other',
  'too-long': () => 'other',
  'empty': () => 'other',
};

const issueKind = ({ code, detail }: NodeShapeSvgIssue) =>
  ISSUE_KINDS[code](detail);

const KIND_ORDER: readonly RemovedContentKind[] = [
  'scripts',
  'images',
  'styles',
  'filters',
  'animations',
  'links',
  'colors',
  'labelArea',
  'other',
];

export type ImportedCustomShape = Readonly<{
  shape: CustomNodeShape;
  removed: readonly RemovedContentKind[];
  /** The file declared no label area, so the label sits in the centre. */
  centredLabel: boolean;
}>;

export type CustomShapeImport =
  | Readonly<{ success: true; imported: ImportedCustomShape }>
  | Readonly<{ success: false; error: string }>;

/**
 * A file's text as a custom shape: parsed, cleaned of what a node shape may
 * not hold, and stored in its canonical, safe form.
 */
export const importCustomShape = (
  name: string,
  file: string,
  source: string,
): CustomShapeImport => {
  const result = parseNodeShapeSvg(source);
  if (!result.success) {
    const codes = new Set(result.issues.map((issue) => issue.code));
    const error = codes.has('too-long')
      ? createMessageError(messages.tooLarge, {
          file,
          limit: MAX_NODE_SHAPE_SVG_LENGTH,
        })
      : codes.has('no-view-box')
        ? createMessageError(messages.noViewBox, { file })
        : codes.has('empty')
          ? createMessageError(messages.nothingToDraw, { file })
          : createMessageError(messages.notSvg, { file });
    return { success: false, error };
  }
  const kinds = new Set(result.issues.map(issueKind));
  return {
    success: true,
    imported: {
      shape: { name, svg: serializeNodeShapeSvg(result.shape) },
      removed: KIND_ORDER.filter((kind) => kinds.has(kind)),
      centredLabel: result.shape.labelRect === undefined,
    },
  };
};

/** A file whose bytes cannot possibly fit the character limit. */
export const isOversizeShapeFile = (byteLength: number) =>
  // UTF-8 spends at most four bytes on a character.
  byteLength > MAX_NODE_SHAPE_SVG_LENGTH * 4;

export const oversizeShapeFileMessage = (file: string) =>
  createMessageError(messages.tooLarge, {
    file,
    limit: MAX_NODE_SHAPE_SVG_LENGTH,
  });

export const unreadableShapeFileMessage = (file: string) =>
  createMessageError(messages.unreadable, { file });

/** The name a file suggests for its shape: its own, without the extension. */
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

/** A short id for a new shape, unused among the type's own. */
export const newCustomShapeId = (
  existing: CustomShapes | undefined,
): string => {
  const short = uuid().slice(0, 8);
  return Object.hasOwn(existing ?? {}, short) ? uuid() : short;
};
