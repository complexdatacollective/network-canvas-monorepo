import { Redacted } from 'effect';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  MAX_NODE_SHAPE_SVG_LENGTH,
  type NodeShapeSvgIssue,
  parseNodeShapeSvg,
  serializeNodeShapeSvg,
} from '@codaco/fresco-ui/node/nodeShapeSvg';

import type { ResourceClient } from '../client.tsx';
import type { ResourceDescriptor } from '../types.ts';
import { fileExtension } from './resourceKinds.ts';

const messages = defineMessages({
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
      'Shown when the file or stored image the researcher chose as a custom node shape could not be read. file is the name of the file or image.',
  },
});

/** The kinds of content a shape's SVG can hold that a node never draws. */
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

/**
 * What a researcher is told about a shape once it has been accepted.
 *
 * `origin` says whether unsupported content was taken out of a file being
 * imported, or is still in an image the protocol already holds and is skipped
 * when a node is drawn: a stored resource is never rewritten.
 */
export type NodeShapeNotice = Readonly<{
  origin: 'imported' | 'existing';
  removed: readonly RemovedContentKind[];
  /** The SVG declares no label area, so the label sits in the centre. */
  centredLabel: boolean;
}>;

type NodeShapeSvgCheck =
  | Readonly<{
      success: true;
      /** The SVG in the canonical form a node draws. */
      svg: string;
      removed: readonly RemovedContentKind[];
      centredLabel: boolean;
    }>
  | Readonly<{ success: false; error: string }>;

/** Whether an SVG's text can draw a node, with the refusal when it cannot. */
export function checkNodeShapeSvg(
  file: string,
  source: string,
): NodeShapeSvgCheck {
  const result = parseNodeShapeSvg(source);
  if (!result.success) {
    const codes = new Set(result.issues.map((issue) => issue.code));
    const error = codes.has('too-long')
      ? oversizeShapeFileMessage(file)
      : codes.has('no-view-box')
        ? createMessageError(messages.noViewBox, { file })
        : codes.has('empty')
          ? createMessageError(messages.nothingToDraw, { file })
          : createMessageError(messages.notSvg, { file });
    return { success: false, error };
  }
  const kinds = new Set(
    result.issues.map(({ code, detail }) => ISSUE_KINDS[code](detail)),
  );
  return {
    success: true,
    svg: serializeNodeShapeSvg(result.shape),
    removed: KIND_ORDER.filter((kind) => kinds.has(kind)),
    centredLabel: result.shape.labelRect === undefined,
  };
}

/** A file whose bytes cannot possibly fit the character limit. */
export const isOversizeShapeFile = (byteLength: number) =>
  // UTF-8 spends at most four bytes on a character.
  byteLength > MAX_NODE_SHAPE_SVG_LENGTH * 4;

export const oversizeShapeFileMessage = (file: string) =>
  createMessageError(messages.tooLarge, {
    file,
    limit: MAX_NODE_SHAPE_SVG_LENGTH,
  });

export const notSvgMessage = (file: string) =>
  createMessageError(messages.notSvg, { file });

/** Whether a stored resource is an SVG image a shape picker may offer. */
export function isNodeShapeResource(descriptor: ResourceDescriptor): boolean {
  if (descriptor.kind !== 'image') return false;
  const source =
    descriptor.source === undefined ? '' : Redacted.value(descriptor.source);
  return (
    fileExtension(source) === '.svg' ||
    fileExtension(Redacted.value(descriptor.name)) === '.svg'
  );
}

/**
 * Reads an image the protocol already holds and checks it can draw a node.
 *
 * The image is read through the URL the host gives for previewing it, and is
 * only ever read: what it holds that a node cannot draw is reported, not
 * removed.
 */
export async function checkExistingNodeShape(
  resources: ResourceClient,
  descriptor: ResourceDescriptor,
): Promise<
  | Readonly<{ success: true; notice: NodeShapeNotice }>
  | Readonly<{ success: false; error: string }>
> {
  const file = Redacted.value(descriptor.name);
  const unreadable: Readonly<{ success: false; error: string }> = {
    success: false,
    error: createMessageError(messages.unreadable, { file }),
  };
  const preview = await resources.resolvePreview(descriptor.id);
  if (preview.status !== 'ok') return unreadable;
  let source: string;
  try {
    const response = await fetch(Redacted.value(preview.data.url));
    if (!response.ok) return unreadable;
    source = await response.text();
  } catch {
    return unreadable;
  }
  const checked = checkNodeShapeSvg(file, source);
  if (!checked.success) return checked;
  return {
    success: true,
    notice: {
      origin: 'existing',
      removed: checked.removed,
      centredLabel: checked.centredLabel,
    },
  };
}
