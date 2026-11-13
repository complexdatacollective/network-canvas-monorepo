import { createElement, type ReactNode } from 'react';

import {
  type NodeShapeSvgElement,
  type ParsedNodeShapeSvg,
  parseNodeShapeSvg,
} from '@codaco/protocol-validation';

import { type CSSVariablesStyle } from '../utils/cssVariables';

// A canvas re-renders every node on each interaction; parsing the same artwork
// again each time would dominate the render.
const PARSE_CACHE_LIMIT = 64;
const parseCache = new Map<string, ParsedNodeShapeSvg | null>();

export function getParsedNodeShape(svg: string): ParsedNodeShapeSvg | null {
  const cached = parseCache.get(svg);
  if (cached !== undefined) return cached;
  const result = parseNodeShapeSvg(svg);
  const parsed = result.success ? result.shape : null;
  if (parseCache.size >= PARSE_CACHE_LIMIT) {
    const oldest = parseCache.keys().next();
    if (!oldest.done) parseCache.delete(oldest.value);
  }
  parseCache.set(svg, parsed);
  return parsed;
}

/**
 * The named colour tokens an artwork may read, aliased to the variables the
 * node and the theme define. The remaining tokens (`--text`, `--surface`, …)
 * are the theme's own variables and inherit unchanged.
 */
export const NODE_SHAPE_TOKEN_STYLE: CSSVariablesStyle = {
  '--node-color': 'var(--base)',
  '--node-color-dark': 'var(--dark)',
  '--node-color-seq-1': 'var(--node-1)',
  '--node-color-seq-2': 'var(--node-2)',
  '--node-color-seq-3': 'var(--node-3)',
  '--node-color-seq-4': 'var(--node-4)',
  '--node-color-seq-5': 'var(--node-5)',
  '--node-color-seq-6': 'var(--node-6)',
  '--node-color-seq-7': 'var(--node-7)',
  '--node-color-seq-8': 'var(--node-8)',
};

// The parser already enforces this allow-list; the renderer keeps its own so
// that nothing it was not written to draw can reach the DOM.
const RENDERED_ELEMENTS = new Set([
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'symbol',
  'use',
]);
const TEXT_ELEMENTS = new Set(['text', 'tspan']);

const REACT_ATTRIBUTE_NAMES = new Map<string, string>([
  ['id', 'id'],
  ['transform', 'transform'],
  ['d', 'd'],
  ['x', 'x'],
  ['y', 'y'],
  ['x1', 'x1'],
  ['y1', 'y1'],
  ['x2', 'x2'],
  ['y2', 'y2'],
  ['cx', 'cx'],
  ['cy', 'cy'],
  ['r', 'r'],
  ['rx', 'rx'],
  ['ry', 'ry'],
  ['width', 'width'],
  ['height', 'height'],
  ['points', 'points'],
  ['dx', 'dx'],
  ['dy', 'dy'],
  ['fill', 'fill'],
  ['fill-opacity', 'fillOpacity'],
  ['fill-rule', 'fillRule'],
  ['clip-rule', 'clipRule'],
  ['stroke', 'stroke'],
  ['stroke-width', 'strokeWidth'],
  ['stroke-linecap', 'strokeLinecap'],
  ['stroke-linejoin', 'strokeLinejoin'],
  ['stroke-miterlimit', 'strokeMiterlimit'],
  ['stroke-dasharray', 'strokeDasharray'],
  ['stroke-dashoffset', 'strokeDashoffset'],
  ['stroke-opacity', 'strokeOpacity'],
  ['opacity', 'opacity'],
  ['color', 'color'],
  ['stop-color', 'stopColor'],
  ['stop-opacity', 'stopOpacity'],
  ['offset', 'offset'],
  ['gradientUnits', 'gradientUnits'],
  ['gradientTransform', 'gradientTransform'],
  ['spreadMethod', 'spreadMethod'],
  ['fx', 'fx'],
  ['fy', 'fy'],
  ['fr', 'fr'],
  ['clip-path', 'clipPath'],
  ['mask', 'mask'],
  ['clipPathUnits', 'clipPathUnits'],
  ['maskUnits', 'maskUnits'],
  ['maskContentUnits', 'maskContentUnits'],
  ['viewBox', 'viewBox'],
  ['preserveAspectRatio', 'preserveAspectRatio'],
  ['font-family', 'fontFamily'],
  ['font-size', 'fontSize'],
  ['font-weight', 'fontWeight'],
  ['font-style', 'fontStyle'],
  ['text-anchor', 'textAnchor'],
  ['dominant-baseline', 'dominantBaseline'],
  ['letter-spacing', 'letterSpacing'],
  ['paint-order', 'paintOrder'],
  ['vector-effect', 'vectorEffect'],
  ['display', 'display'],
  ['visibility', 'visibility'],
  ['href', 'href'],
]);

const URL_ATTRIBUTES = new Set(['fill', 'stroke', 'clip-path', 'mask']);
const HREF_ELEMENTS = new Set(['use', 'linearGradient', 'radialGradient']);

const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const HREF_PATTERN = /^#([A-Za-z_][A-Za-z0-9_.:-]*)$/;
const URL_REFERENCE_PATTERN =
  /^url\(\s*(['"]?)#([A-Za-z_][A-Za-z0-9_.:-]*)\1\s*\)$/i;
const UNSAFE_VALUE_PATTERN = /[<\\;{}]|\/\*|javascript:|expression\(|@import/i;

/**
 * Rewrites one attribute for rendering, or drops it. Every id, and every
 * reference to one, gains the instance prefix so two nodes drawing the same
 * artwork cannot resolve each other's gradients or clip paths.
 */
const renderAttribute = (
  tag: string,
  name: string,
  value: string,
  idPrefix: string,
): string | undefined => {
  if (UNSAFE_VALUE_PATTERN.test(value)) return undefined;
  const trimmed = value.trim();
  if (name === 'id') {
    return ID_PATTERN.test(trimmed) ? `${idPrefix}${trimmed}` : undefined;
  }
  if (name === 'href') {
    if (!HREF_ELEMENTS.has(tag)) return undefined;
    const match = HREF_PATTERN.exec(trimmed);
    return match ? `#${idPrefix}${match[1]}` : undefined;
  }
  if (/url\s*\(/i.test(trimmed)) {
    if (!URL_ATTRIBUTES.has(name)) return undefined;
    const match = URL_REFERENCE_PATTERN.exec(trimmed);
    return match ? `url(#${idPrefix}${match[2]})` : undefined;
  }
  return value;
};

const renderChildren = (
  children: Array<NodeShapeSvgElement | string>,
  idPrefix: string,
  keepsText: boolean,
): ReactNode[] =>
  children.map((child, index) => {
    if (typeof child === 'string') return keepsText ? child : null;
    return renderElement(child, idPrefix, index);
  });

const renderElement = (
  element: NodeShapeSvgElement,
  idPrefix: string,
  key: number,
): ReactNode => {
  if (!RENDERED_ELEMENTS.has(element.tag)) return null;
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(element.attributes)) {
    const reactName = REACT_ATTRIBUTE_NAMES.get(name);
    if (reactName === undefined) continue;
    const rendered = renderAttribute(element.tag, name, value, idPrefix);
    if (rendered !== undefined) props[reactName] = rendered;
  }
  return createElement(
    element.tag,
    props,
    ...renderChildren(
      element.children,
      idPrefix,
      TEXT_ELEMENTS.has(element.tag),
    ),
  );
};

/** A valid id prefix (and `url(#…)` fragment) derived from a React `useId`. */
export const toNodeShapeIdPrefix = (reactId: string) =>
  `node-shape-${reactId.replace(/[^A-Za-z0-9_-]/g, '')}-`;

type NodeShapeArtworkProps = {
  shape: ParsedNodeShapeSvg;
  idPrefix: string;
};

export function NodeShapeArtwork({ shape, idPrefix }: NodeShapeArtworkProps) {
  const { x, y, width, height } = shape.viewBox;
  return (
    <svg
      aria-hidden
      focusable="false"
      // A drawing placed by its own coordinates, not a layout in the reading
      // direction.
      data-direction-exempt
      data-node-shape-artwork
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`${x} ${y} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ ...NODE_SHAPE_TOKEN_STYLE, color: 'var(--base)' }}
    >
      {renderChildren(shape.children, idPrefix, false)}
    </svg>
  );
}
