import { createElement, type ReactNode } from 'react';

import { type CSSVariablesStyle } from '../utils/cssVariables';
import {
  HREF_ELEMENTS,
  ID_PATTERN,
  ID_REFERENCE_PATTERN,
  NODE_SHAPE_ELEMENTS,
  PRESENTATION_ATTRIBUTES,
  STRUCTURAL_ATTRIBUTES,
  TEXT_ELEMENTS,
  UNSAFE_VALUE_PATTERN,
  URL_ATTRIBUTES,
  URL_REFERENCE_PATTERN,
} from './nodeShapeGrammar';
import {
  LABEL_PLATE_ID,
  type NodeShapeSvgElement,
  type ParsedNodeShapeSvg,
  parseNodeShapeSvg,
} from './nodeShapeSvg';

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
    const match = ID_REFERENCE_PATTERN.exec(trimmed);
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
  labelPlateGrowth: number,
): ReactNode[] =>
  children.map((child, index) => {
    if (typeof child === 'string') return keepsText ? child : null;
    return renderElement(child, idPrefix, index, labelPlateGrowth);
  });

const renderElement = (
  element: NodeShapeSvgElement,
  idPrefix: string,
  key: number,
  labelPlateGrowth: number,
): ReactNode => {
  // The parser already applied the grammar; applying it again here keeps
  // anything the renderer was not written to draw out of the DOM.
  if (!NODE_SHAPE_ELEMENTS.has(element.tag)) return null;
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(element.attributes)) {
    const reactName =
      PRESENTATION_ATTRIBUTES.get(name) ??
      (STRUCTURAL_ATTRIBUTES.has(name) ? name : undefined);
    if (reactName === undefined) continue;
    const rendered = renderAttribute(element.tag, name, value, idPrefix);
    if (rendered !== undefined) props[reactName] = rendered;
  }
  if (
    labelPlateGrowth > 0 &&
    element.tag === 'rect' &&
    element.attributes.id === LABEL_PLATE_ID
  ) {
    props.height = Number(element.attributes.height) + labelPlateGrowth;
  }
  return createElement(
    element.tag,
    props,
    ...renderChildren(
      element.children,
      idPrefix,
      TEXT_ELEMENTS.has(element.tag),
      labelPlateGrowth,
    ),
  );
};

/** A valid id prefix (and `url(#…)` fragment) derived from a React `useId`. */
export const toNodeShapeIdPrefix = (reactId: string) =>
  `node-shape-${reactId.replace(/[^A-Za-z0-9_-]/g, '')}-`;

type NodeShapeArtworkProps = {
  shape: ParsedNodeShapeSvg;
  idPrefix: string;
  /** Extra height, in viewBox units, for the artwork's label plate. */
  labelPlateGrowth?: number;
};

export function NodeShapeArtwork({
  shape,
  idPrefix,
  labelPlateGrowth = 0,
}: NodeShapeArtworkProps) {
  const { x, y, width, height } = shape.viewBox;
  return (
    <svg
      aria-hidden
      focusable="false"
      // A drawing placed by its own coordinates, not a layout in the reading
      // direction.
      data-direction-exempt
      data-node-shape-artwork
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      viewBox={`${x} ${y} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ ...NODE_SHAPE_TOKEN_STYLE, color: 'var(--base)' }}
    >
      {renderChildren(
        shape.children,
        idPrefix,
        false,
        shape.labelPlate ? labelPlateGrowth : 0,
      )}
    </svg>
  );
}
