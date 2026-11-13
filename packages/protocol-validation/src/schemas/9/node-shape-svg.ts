import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from 'saxes';

import { NodeColorSequence } from './color-reference.ts';

export const NodeShapeColorTokens = [
  'node-color',
  'node-color-dark',
  ...NodeColorSequence,
  'text',
  'background',
  'surface',
  'primary',
  'accent',
  'selected',
] as const;
export type NodeShapeColorToken = (typeof NodeShapeColorTokens)[number];

export const MAX_NODE_SHAPE_SVG_LENGTH = 50_000;

const MAX_DEPTH = 32;
const MAX_ELEMENTS = 2_000;

export type NodeShapeSvgElement = {
  tag: string;
  attributes: Record<string, string>;
  children: Array<NodeShapeSvgElement | string>;
};

type Box = { x: number; y: number; width: number; height: number };

export type ParsedNodeShapeSvg = {
  viewBox: Box;
  children: Array<NodeShapeSvgElement | string>;
  /** Label rectangle as fractions (0–1) of the SQUARE node box, after the
   *  xMidYMid-meet fit of the viewBox into the square. */
  labelArea: Box;
  /** Raw colour value from the label-area fill; undefined → default. */
  labelColor?: string;
  /** The label-area rect in viewBox units, when the SVG declared one. */
  labelRect?: Box;
};

type NodeShapeSvgIssueCode =
  | 'not-xml'
  | 'no-svg-root'
  | 'no-view-box'
  | 'too-long'
  | 'empty'
  | 'unsupported-element'
  | 'unsupported-attribute'
  | 'unsupported-style'
  | 'unsafe-value'
  | 'unknown-token'
  | 'invalid-label-area';

export type NodeShapeSvgIssue = { code: NodeShapeSvgIssueCode; detail: string };

export type NodeShapeSvgResult =
  | { success: true; shape: ParsedNodeShapeSvg; issues: NodeShapeSvgIssue[] }
  | { success: false; issues: NodeShapeSvgIssue[] };

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

const LABEL_AREA_ID = 'label-area';
const DEFAULT_LABEL_AREA: Box = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };

const ALLOWED_ELEMENTS = new Set([
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
const SILENTLY_DROPPED_ELEMENTS = new Set(['title', 'desc', 'metadata']);
const TEXT_ELEMENTS = new Set(['text', 'tspan']);
const DRAWABLE_ELEMENTS = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'use',
]);
const NON_RENDERED_CONTAINERS = new Set(['defs', 'clipPath', 'mask', 'symbol']);

// Attributes that may also be written as `style` declarations.
const PRESENTATION_ATTRIBUTES = new Set([
  'transform',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'points',
  'dx',
  'dy',
  'fill',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'color',
  'stop-color',
  'stop-opacity',
  'offset',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'fx',
  'fy',
  'fr',
  'clip-path',
  'mask',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'paint-order',
  'vector-effect',
  'display',
  'visibility',
]);
const VIEW_BOX_ELEMENTS = new Set(['svg', 'symbol']);
const PRESERVE_ASPECT_RATIO_ELEMENTS = new Set(['symbol']);
const HREF_ELEMENTS = new Set(['use', 'linearGradient', 'radialGradient']);
const URL_ATTRIBUTES = new Set(['fill', 'stroke', 'clip-path', 'mask']);
const VAR_ATTRIBUTES = new Set(['fill', 'stroke', 'stop-color', 'color']);
const ROOT_ONLY_SILENT_ATTRIBUTES = new Set(['width', 'height', 'version']);

const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const ID_REFERENCE_PATTERN = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/;
const URL_REFERENCE_PATTERN =
  /^url\(\s*(?:#[A-Za-z_][A-Za-z0-9_.:-]*|'#[A-Za-z_][A-Za-z0-9_.:-]*'|"#[A-Za-z_][A-Za-z0-9_.:-]*")\s*\)$/i;
const VAR_PATTERN = /^var\(\s*--([A-Za-z0-9-]+)\s*(?:,\s*(.*?)\s*)?\)$/is;
const COLOR_FUNCTION_PATTERN =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)$/i;
const UNSAFE_VALUE_PATTERN = /[<\\]|javascript:|expression\(|@import/i;
const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const LENGTH_PATTERN = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:px)?$/i;

const TOKEN_SET = new Set<string>(NodeShapeColorTokens);

type Frame = {
  // null when the element and its subtree are being dropped.
  element: NodeShapeSvgElement | null;
  keepsText: boolean;
  nonRendered: boolean;
  transformed: boolean;
};

type ParseState = {
  issues: NodeShapeSvgIssue[];
  issueKeys: Set<string>;
};

class ParseAborted extends Error {}

const addIssue = (
  state: ParseState,
  code: NodeShapeSvgIssueCode,
  detail: string,
) => {
  const key = `${code}\u0000${detail}`;
  if (state.issueKeys.has(key)) return;
  state.issueKeys.add(key);
  state.issues.push({ code, detail });
};

const parseNumber = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return NUMBER_PATTERN.test(trimmed) ? Number(trimmed) : undefined;
};

const parseLength = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const match = LENGTH_PATTERN.exec(value.trim());
  return match?.[1] === undefined ? undefined : Number(match[1]);
};

const parseViewBox = (value: string): Box | undefined => {
  const parts = value.trim().split(/[\s,]+/);
  if (parts.length !== 4) return undefined;
  const numbers = parts.map((part) => parseNumber(part));
  const [x, y, width, height] = numbers;
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    !numbers.every((n) => n !== undefined && Number.isFinite(n)) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { x, y, width, height };
};

const parseStyle = (style: string) => {
  const declarations: Array<[string, string]> = [];
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) {
      if (declaration.trim() !== '')
        declarations.push([declaration.trim(), '']);
      continue;
    }
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, '')
      .trim();
    declarations.push([property, value]);
  }
  return declarations;
};

const isAttributeAllowedOn = (name: string, tag: string) => {
  if (name === 'id') return true;
  if (name === 'viewBox') return VIEW_BOX_ELEMENTS.has(tag);
  if (name === 'preserveAspectRatio') {
    return PRESERVE_ASPECT_RATIO_ELEMENTS.has(tag);
  }
  if (name === 'href') return HREF_ELEMENTS.has(tag);
  return PRESENTATION_ATTRIBUTES.has(name);
};

const validateValue = (
  state: ParseState,
  tag: string,
  name: string,
  value: string,
) => {
  const describe = `${name}="${value}" on <${tag}>`;
  if (UNSAFE_VALUE_PATTERN.test(value)) {
    addIssue(state, 'unsafe-value', describe);
    return false;
  }
  if (name === 'id' && !ID_PATTERN.test(value)) {
    addIssue(state, 'unsafe-value', describe);
    return false;
  }
  if (name === 'href' && !ID_REFERENCE_PATTERN.test(value.trim())) {
    addIssue(state, 'unsafe-value', describe);
    return false;
  }
  if (/url\s*\(/i.test(value)) {
    if (
      !URL_ATTRIBUTES.has(name) ||
      !URL_REFERENCE_PATTERN.test(value.trim())
    ) {
      addIssue(state, 'unsafe-value', describe);
      return false;
    }
  }
  if (/var\s*\(/i.test(value)) {
    const match = VAR_ATTRIBUTES.has(name)
      ? VAR_PATTERN.exec(value.trim())
      : null;
    const token = match?.[1];
    const fallback = match?.[2];
    if (
      token === undefined ||
      (fallback !== undefined &&
        (fallback === '' ||
          (/[()]/.test(fallback) && !COLOR_FUNCTION_PATTERN.test(fallback))))
    ) {
      addIssue(state, 'unsafe-value', describe);
      return false;
    }
    if (!TOKEN_SET.has(token)) {
      addIssue(state, 'unknown-token', `--${token} in ${describe}`);
      return false;
    }
  }
  return true;
};

const sortAttributes = (attributes: Map<string, string>) =>
  Object.fromEntries(
    [...attributes.entries()].toSorted(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );

/**
 * Applies the attribute allow-list to one element. Returns the kept attributes
 * (style declarations expanded, overriding plain attributes) and the raw root
 * sizing attributes, which never survive as attributes.
 */
const collectAttributes = (
  state: ParseState,
  tag: SaxesTagNS,
  localName: string,
  isRoot: boolean,
) => {
  const kept = new Map<string, string>();
  const rootSizing = new Map<string, string>();
  let style: string | undefined;

  for (const attribute of Object.values<SaxesAttributeNS>(tag.attributes)) {
    const { uri, local, name, value } = attribute;
    if (uri === XMLNS_NAMESPACE) continue;
    if (uri === XML_NAMESPACE && local === 'space') continue;

    let attributeName: string;
    if (uri === XLINK_NAMESPACE && local === 'href') {
      attributeName = 'href';
    } else if (uri !== '') {
      addIssue(state, 'unsupported-attribute', `${name} on <${localName}>`);
      continue;
    } else {
      attributeName = name;
    }

    if (attributeName.startsWith('data-') || attributeName === 'class') {
      continue;
    }
    if (isRoot && attributeName === 'viewBox') {
      rootSizing.set('viewBox', value);
      continue;
    }
    if (isRoot && ROOT_ONLY_SILENT_ATTRIBUTES.has(attributeName)) {
      rootSizing.set(attributeName, value);
      continue;
    }
    // The root element is never rendered as an element, so its id is moot.
    if (isRoot && attributeName === 'id') continue;
    if (attributeName === 'style') {
      style = value;
      continue;
    }
    if (isRoot && attributeName === 'preserveAspectRatio') {
      addIssue(state, 'unsupported-attribute', `${name} on <${localName}>`);
      continue;
    }
    if (!isAttributeAllowedOn(attributeName, localName)) {
      addIssue(state, 'unsupported-attribute', `${name} on <${localName}>`);
      continue;
    }
    kept.set(attributeName, value);
  }

  if (style !== undefined) {
    for (const [property, value] of parseStyle(style)) {
      if (
        PRESENTATION_ATTRIBUTES.has(property) &&
        isAttributeAllowedOn(property, localName)
      ) {
        kept.set(property, value);
      } else {
        addIssue(
          state,
          'unsupported-style',
          `${property}${value === '' ? '' : `: ${value}`} in style on <${localName}>`,
        );
      }
    }
  }

  for (const [attributeName, value] of kept) {
    if (!validateValue(state, localName, attributeName, value)) {
      kept.delete(attributeName);
    }
  }

  return { kept, rootSizing };
};

const clampedLabelArea = (rect: Box, viewBox: Box): Box | undefined => {
  const left = Math.max(rect.x, viewBox.x);
  const top = Math.max(rect.y, viewBox.y);
  const right = Math.min(rect.x + rect.width, viewBox.x + viewBox.width);
  const bottom = Math.min(rect.y + rect.height, viewBox.y + viewBox.height);
  if (right <= left || bottom <= top) return undefined;

  const scale = 1 / Math.max(viewBox.width, viewBox.height);
  const offsetX = (1 - viewBox.width * scale) / 2;
  const offsetY = (1 - viewBox.height * scale) / 2;
  return {
    x: offsetX + (left - viewBox.x) * scale,
    y: offsetY + (top - viewBox.y) * scale,
    width: (right - left) * scale,
    height: (bottom - top) * scale,
  };
};

const appendText = (element: NodeShapeSvgElement, text: string) => {
  const last = element.children.at(-1);
  if (typeof last === 'string') {
    element.children[element.children.length - 1] = last + text;
  } else {
    element.children.push(text);
  }
};

/** Lenient parse: unsupported content is REMOVED and reported in `issues`;
 *  `success: false` only when nothing usable remains (not XML, no <svg> root,
 *  no viewBox, too long, no drawable content). */
export function parseNodeShapeSvg(source: string): NodeShapeSvgResult {
  if (source.length > MAX_NODE_SHAPE_SVG_LENGTH) {
    return {
      success: false,
      issues: [
        {
          code: 'too-long',
          detail: `The file is ${source.length} characters long; the limit is ${MAX_NODE_SHAPE_SVG_LENGTH}.`,
        },
      ],
    };
  }

  const state: ParseState = { issues: [], issueKeys: new Set() };
  const stack: Frame[] = [];
  const root: NodeShapeSvgElement = {
    tag: 'svg',
    attributes: {},
    children: [],
  };
  let wrapper: NodeShapeSvgElement | undefined;
  let viewBox: Box | undefined;
  let rootFound = false;
  let rootFailure: NodeShapeSvgIssue | undefined;
  let elementCount = 0;
  let hasDrawable = false;
  let labelRect: Box | undefined;
  let labelColor: string | undefined;

  const parser = new SaxesParser({
    xmlns: true,
    // Unbound prefixes (common in hand-edited files) become foreign
    // namespaces, so the element or attribute is removed rather than
    // rejecting the whole file.
    resolvePrefix: (prefix: string) => {
      if (prefix === '') return undefined;
      return prefix === 'xlink'
        ? XLINK_NAMESPACE
        : `urn:x-unbound-prefix:${prefix}`;
    },
  });

  parser.on('opentag', (tag) => {
    elementCount += 1;
    if (elementCount > MAX_ELEMENTS) {
      throw new ParseAborted(
        `The file has more than ${MAX_ELEMENTS} elements.`,
      );
    }
    if (stack.length >= MAX_DEPTH) {
      throw new ParseAborted(
        `Elements are nested more than ${MAX_DEPTH} levels deep.`,
      );
    }

    const isSvgNamespace = tag.uri === SVG_NAMESPACE || tag.uri === '';
    const localName = tag.local;

    if (!rootFound) {
      rootFound = true;
      if (!isSvgNamespace || localName !== 'svg') {
        rootFailure = {
          code: 'no-svg-root',
          detail: `The root element is <${tag.name}>, not <svg>.`,
        };
        throw new ParseAborted(rootFailure.detail);
      }
      const { kept, rootSizing } = collectAttributes(state, tag, 'svg', true);
      const viewBoxValue = rootSizing.get('viewBox');
      if (viewBoxValue !== undefined) {
        viewBox = parseViewBox(viewBoxValue);
      } else {
        const width = parseLength(rootSizing.get('width'));
        const height = parseLength(rootSizing.get('height'));
        if (
          width !== undefined &&
          height !== undefined &&
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width > 0 &&
          height > 0
        ) {
          viewBox = { x: 0, y: 0, width, height };
        }
      }
      // Root presentation attributes inherit to every child; a wrapping <g>
      // keeps them without giving the root element attributes of its own.
      if (kept.size > 0) {
        wrapper = {
          tag: 'g',
          attributes: sortAttributes(kept),
          children: [],
        };
        root.children.push(wrapper);
      }
      stack.push({
        element: wrapper ?? root,
        keepsText: false,
        nonRendered: false,
        transformed: kept.has('transform'),
      });
      return;
    }

    const parent = stack.at(-1);
    if (!parent) return;
    const dropped: Frame = {
      element: null,
      keepsText: false,
      nonRendered: true,
      transformed: true,
    };

    if (parent.element === null) {
      stack.push(dropped);
      return;
    }
    if (isSvgNamespace && SILENTLY_DROPPED_ELEMENTS.has(localName)) {
      stack.push(dropped);
      return;
    }
    if (!isSvgNamespace || !ALLOWED_ELEMENTS.has(localName)) {
      addIssue(state, 'unsupported-element', `<${tag.name}>`);
      stack.push(dropped);
      return;
    }

    const { kept } = collectAttributes(state, tag, localName, false);
    const transformed = parent.transformed || kept.has('transform');
    const nonRendered =
      parent.nonRendered || NON_RENDERED_CONTAINERS.has(localName);

    if (localName === 'rect' && kept.get('id') === LABEL_AREA_ID) {
      stack.push(dropped);
      const x = kept.has('x') ? parseNumber(kept.get('x')) : 0;
      const y = kept.has('y') ? parseNumber(kept.get('y')) : 0;
      const width = parseNumber(kept.get('width'));
      const height = parseNumber(kept.get('height'));
      if (labelRect !== undefined) {
        addIssue(
          state,
          'invalid-label-area',
          'There is more than one label area.',
        );
        return;
      }
      if (transformed) {
        addIssue(
          state,
          'invalid-label-area',
          'The label area, or a group around it, has a transform.',
        );
        return;
      }
      if (nonRendered) {
        addIssue(
          state,
          'invalid-label-area',
          'The label area is inside <defs>, <clipPath>, <mask> or <symbol>.',
        );
        return;
      }
      if (
        x === undefined ||
        y === undefined ||
        width === undefined ||
        height === undefined ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        addIssue(
          state,
          'invalid-label-area',
          'The label area needs numeric x and y and a width and height greater than zero.',
        );
        return;
      }
      labelRect = { x, y, width, height };
      const fill = kept.get('fill')?.trim();
      if (fill !== undefined && fill !== '' && fill !== 'none') {
        labelColor = fill;
      }
      return;
    }

    const element: NodeShapeSvgElement = {
      tag: localName,
      attributes: sortAttributes(kept),
      children: [],
    };
    parent.element.children.push(element);
    if (!nonRendered && DRAWABLE_ELEMENTS.has(localName)) hasDrawable = true;
    stack.push({
      element,
      keepsText: TEXT_ELEMENTS.has(localName),
      nonRendered,
      transformed,
    });
  });

  parser.on('closetag', () => {
    stack.pop();
  });

  const onText = (text: string) => {
    const frame = stack.at(-1);
    if (frame?.element && frame.keepsText) appendText(frame.element, text);
  };
  parser.on('text', onText);
  parser.on('cdata', onText);

  try {
    parser.write(source).close();
  } catch (error) {
    if (rootFailure) return { success: false, issues: [rootFailure] };
    if (error instanceof ParseAborted) {
      return {
        success: false,
        issues: [{ code: 'too-long', detail: error.message }],
      };
    }
    return {
      success: false,
      issues: [
        {
          code: 'not-xml',
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  if (!rootFound) {
    return {
      success: false,
      issues: [
        { code: 'no-svg-root', detail: 'The file has no <svg> element.' },
      ],
    };
  }
  if (!viewBox) {
    return {
      success: false,
      issues: [
        ...state.issues,
        {
          code: 'no-view-box',
          detail:
            'The <svg> element needs a viewBox of four numbers with a positive width and height, or numeric width and height attributes.',
        },
      ],
    };
  }
  if (!hasDrawable) {
    return {
      success: false,
      issues: [
        ...state.issues,
        { code: 'empty', detail: 'The file has nothing to draw.' },
      ],
    };
  }

  let labelArea = DEFAULT_LABEL_AREA;
  if (labelRect) {
    const area = clampedLabelArea(labelRect, viewBox);
    if (area) {
      labelArea = area;
    } else {
      addIssue(
        state,
        'invalid-label-area',
        'The label area lies outside the viewBox.',
      );
      labelRect = undefined;
      labelColor = undefined;
    }
  }

  const shape: ParsedNodeShapeSvg = {
    viewBox,
    children: root.children,
    labelArea,
  };
  if (labelRect) shape.labelRect = labelRect;
  if (labelColor !== undefined) shape.labelColor = labelColor;

  return { success: true, shape, issues: state.issues };
}

/** Strict: true only when the lenient parse succeeds with zero issues. */
export function isValidNodeShapeSvg(source: string): boolean {
  const result = parseNodeShapeSvg(source);
  return result.success && result.issues.length === 0;
}

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\t', '&#9;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;');

const escapeText = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#13;');

const serializeAttributes = (attributes: Record<string, string>) =>
  Object.keys(attributes)
    .toSorted()
    .map((name) => ` ${name}="${escapeAttribute(attributes[name] ?? '')}"`)
    .join('');

const serializeNode = (node: NodeShapeSvgElement | string): string => {
  if (typeof node === 'string') return escapeText(node);
  const attributes = serializeAttributes(node.attributes);
  if (node.children.length === 0) return `<${node.tag}${attributes}/>`;
  return `<${node.tag}${attributes}>${node.children.map(serializeNode).join('')}</${node.tag}>`;
};

/** Canonical, safe SVG text for a parsed shape (re-emits the label-area rect).
 *  `isValidNodeShapeSvg(serializeNodeShapeSvg(shape))` is always true, and
 *  parse(serialize(parse(x))) deep-equals parse(x).shape. */
export function serializeNodeShapeSvg(shape: ParsedNodeShapeSvg): string {
  const { viewBox, labelRect, labelColor } = shape;
  const viewBoxValue = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  const content = shape.children.map(serializeNode).join('');
  let label = '';
  if (labelRect) {
    const attributes: Record<string, string> = {
      id: LABEL_AREA_ID,
      x: String(labelRect.x),
      y: String(labelRect.y),
      width: String(labelRect.width),
      height: String(labelRect.height),
    };
    if (labelColor !== undefined) attributes.fill = labelColor;
    label = `<rect${serializeAttributes(attributes)}/>`;
  }
  return `<svg xmlns="${SVG_NAMESPACE}" viewBox="${escapeAttribute(viewBoxValue)}">${content}${label}</svg>`;
}
