/**
 * The SVG subset a custom node shape may use. The parser applies it when a
 * shape is read; the renderer applies it again to whatever it is handed, so
 * nothing outside it can reach the DOM even from a shape that was never
 * parsed.
 */
export const NODE_SHAPE_ELEMENTS = new Set([
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

export const TEXT_ELEMENTS = new Set(['text', 'tspan']);

export const HREF_ELEMENTS = new Set([
  'use',
  'linearGradient',
  'radialGradient',
]);

export const URL_ATTRIBUTES = new Set(['fill', 'stroke', 'clip-path', 'mask']);

/**
 * Attributes that may also be written as `style` declarations, by SVG name,
 * with the prop name React renders each as.
 */
export const PRESENTATION_ATTRIBUTES = new Map<string, string>([
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
]);

/**
 * Attributes allowed only as attributes, never in `style`, each limited to
 * particular elements by the parser. React renders them under the same name.
 */
export const STRUCTURAL_ATTRIBUTES = new Set([
  'id',
  'href',
  'viewBox',
  'preserveAspectRatio',
]);

export const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
/** `#id`; the id is the first group. */
export const ID_REFERENCE_PATTERN = /^#([A-Za-z_][A-Za-z0-9_.:-]*)$/;
/** `url(#id)`, optionally quoted; the id is the second group. */
export const URL_REFERENCE_PATTERN =
  /^url\(\s*(['"]?)#([A-Za-z_][A-Za-z0-9_.:-]*)\1\s*\)$/i;
// `;`, braces and comment markers never occur in a legitimate value (a
// `style` attribute is split into declarations before this is applied), and
// refusing them keeps a value from ending the declaration it is written into.
export const UNSAFE_VALUE_PATTERN =
  /[<\\;{}]|\/\*|javascript:|expression\(|@import/i;
