import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { Redacted } from 'effect';

import {
  createMessageError,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import {
  MAX_NODE_SHAPE_SVG_LENGTH,
  type NodeShapeSvgIssue,
  parseNodeShapeSvg,
  serializeNodeShapeSvg,
} from '@codaco/fresco-ui/node/nodeShapeSvg';

import type { ProtocolBuilderContextValue } from '../../state/context.ts';
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
  removedContent: {
    id: 'protocolBuilder.customShapes.removedContent',
    defaultMessage:
      'Some content in this file cannot be used in a node shape and was left out: {removed}.',
    description:
      'Notice shown under a custom node shape that was added from an SVG file after unsupported content was removed from it. removed is a list of the kinds of content, such as "scripts, embedded images and filters".',
  },
  ignoredContent: {
    id: 'protocolBuilder.customShapes.ignoredContent',
    defaultMessage:
      'Some content in this image cannot be used in a node shape and will not be drawn: {removed}.',
    description:
      'Notice shown under a custom node shape made from an SVG image already stored in the protocol. The image is kept as it is, but the listed content is skipped when a node is drawn. removed is a list of the kinds of content, such as "scripts, embedded images and filters".',
  },
  removedKind: {
    id: 'protocolBuilder.customShapes.removedKind',
    defaultMessage:
      '{kind, select, scripts {scripts} images {embedded images} styles {unsupported styles} filters {filters} animations {animations} links {links and references to other files} colors {unrecognized color variables} labelArea {an unusable label area} other {other unsupported content}}',
    description:
      'Name of one kind of content in an SVG image that a custom node shape cannot use. Used as one item of a list in the removedContent and ignoredContent notices, so write it as a phrase that fits there.',
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

/** The sentence saying what in a shape's SVG a node does not draw. */
export const contentNotice = (intl: IntlShape, notice: NodeShapeNotice) =>
  intl.formatMessage(
    notice.origin === 'imported'
      ? messages.removedContent
      : messages.ignoredContent,
    {
      removed: intl.formatList(
        notice.removed.map((kind) =>
          intl.formatMessage(messages.removedKind, { kind }),
        ),
        { type: 'conjunction' },
      ),
    },
  );

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
const isOversizeShapeFile = (byteLength: number) =>
  // UTF-8 spends at most four bytes on a character.
  byteLength > MAX_NODE_SHAPE_SVG_LENGTH * 4;

const oversizeShapeFileMessage = (file: string) =>
  createMessageError(messages.tooLarge, {
    file,
    limit: MAX_NODE_SHAPE_SVG_LENGTH,
  });

type NodeShapeUpload =
  | Readonly<{
      /** The SVG in the canonical form a node draws, ready to stage. */
      bytes: Uint8Array;
      contentType: string;
      notice: NodeShapeNotice;
    }>
  | Readonly<{ error: string }>;

/**
 * Checks a file being imported as a shape and turns it into what is staged:
 * the cleaned SVG a node draws, so the protocol never holds a shape the
 * interview would refuse.
 */
export function prepareNodeShapeUpload(
  file: string,
  bytes: Uint8Array,
): NodeShapeUpload {
  if (isOversizeShapeFile(bytes.byteLength)) {
    return { error: oversizeShapeFileMessage(file) };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { error: createMessageError(messages.notSvg, { file }) };
  }
  const checked = checkNodeShapeSvg(file, text);
  if (!checked.success) return { error: checked.error };
  return {
    // Copied into this realm's Uint8Array: an encoder's output can come from
    // another one, which the contract's bytes schema refuses.
    bytes: Uint8Array.from(new TextEncoder().encode(checked.svg)),
    contentType: 'image/svg+xml',
    notice: {
      origin: 'imported',
      removed: checked.removed,
      centredLabel: checked.centredLabel,
    },
  };
}

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
 * The SVG text of one shape image, read through the URL the host gives for
 * previewing it and cached for the session. Inside an open edit the read
 * names it, so an image imported but not yet saved can be read too.
 */
export const nodeShapeSvgQuery = (
  { adapter, protocolId }: ProtocolBuilderContextValue,
  editId: string | undefined,
  asset: string,
) =>
  queryOptions({
    queryKey: ['protocol-builder', protocolId, 'node-shape-svg', asset],
    queryFn: async (): Promise<Readonly<{ asset: string; svg: string }>> => {
      const preview = await adapter.rpcCall('ResourcesPreview', {
        protocolId,
        ...(editId === undefined ? {} : { editId }),
        resourceId: asset,
      });
      if (preview.status !== 'ok') {
        throw new Error(`the shape asset ${asset} has no preview`);
      }
      const response = await fetch(Redacted.value(preview.data.url));
      if (!response.ok) {
        throw new Error(`the shape asset ${asset} could not be read`);
      }
      return { asset, svg: await response.text() };
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

/**
 * Reads an image the protocol already holds and checks it can draw a node.
 *
 * Read through the same cached query a shape preview draws from, so an image
 * just checked is drawn without being read again. It is only ever read: what
 * it holds that a node cannot draw is reported, not removed.
 */
export async function checkExistingNodeShape(
  queryClient: QueryClient,
  host: ProtocolBuilderContextValue,
  editId: string | undefined,
  descriptor: ResourceDescriptor,
): Promise<
  | Readonly<{ success: true; notice: NodeShapeNotice }>
  | Readonly<{ success: false; error: string }>
> {
  const file = Redacted.value(descriptor.name);
  let source: string;
  try {
    ({ svg: source } = await queryClient.fetchQuery(
      nodeShapeSvgQuery(host, editId, descriptor.id),
    ));
  } catch {
    return {
      success: false,
      error: createMessageError(messages.unreadable, { file }),
    };
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
