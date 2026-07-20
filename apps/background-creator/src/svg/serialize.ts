import {
  type BackgroundDocument,
  type EllipseElement,
  type LineElement,
  type PolygonElement,
  type RectElement,
  type SvgElement,
  TEXT_SIZE_PRESETS,
  type TextElement,
} from '~/model/types';

const NC_NAMESPACE =
  'https://documentation.networkcanvas.com/xmlns/background-creator';

// Literal fresco DARK theme values for --color-text / --color-background
// (tooling/tailwind/fresco/themes/default.css `[data-theme='dark']`, with
// --base-hue: 290 resolved). They are the fallbacks in the embedded <style>
// below, so a standalone render of the file — a blob-URL <img> preview, a CSS
// background-image, a bare browser tab — paints theme-sentinel colours as the
// dark theme would, with no live theme resolution. Image contexts are the
// consumption path; a host that instead INLINES the SVG into its DOM themes it
// by defining the --color-text / --color-background custom properties in scope
// (the class names alone cannot re-theme it: fresco's `--color-*` @theme-inline
// tokens are not runtime custom properties, so the var() fallbacks win
// otherwise). Every rule is scoped under `svg.nc-background` so an inlined
// copy's document-scoped <style> cannot restyle host elements that share these
// utility-like class names.
const TEXT_DEFAULT = 'oklch(0.95 0.01 290)';
const BACKGROUND_DEFAULT = 'oklch(0.2 0.03 290)';

const EMBEDDED_STYLE = [
  `  <style>`,
  `    svg.nc-background { color: var(--color-text, ${TEXT_DEFAULT}) }`,
  `    svg.nc-background .fill-current { fill: currentColor }`,
  `    svg.nc-background .stroke-current { stroke: currentColor }`,
  `    svg.nc-background .fill-background { fill: var(--color-background, ${BACKGROUND_DEFAULT}) }`,
  `    svg.nc-background .stroke-background { stroke: var(--color-background, ${BACKGROUND_DEFAULT}) }`,
  `  </style>`,
].join('\n');

// A sentinel colour paints through a class (resolved by the embedded <style>
// or a host theme) and must NOT also emit a fill/stroke attribute, which would
// override the class. A hex colour stays a literal presentation attribute.
type Paint = { attr: string | null; className: string | null };

function fillPaint(colour: string): Paint {
  if (colour === 'text') return { attr: null, className: 'fill-current' };
  if (colour === 'background') {
    return { attr: null, className: 'fill-background' };
  }
  return { attr: `fill="${escapeAttr(colour)}"`, className: null };
}

function strokePaint(colour: string): Paint {
  if (colour === 'text') return { attr: null, className: 'stroke-current' };
  if (colour === 'background') {
    return { attr: null, className: 'stroke-background' };
  }
  return { attr: `stroke="${escapeAttr(colour)}"`, className: null };
}

function classAttr(...paints: (Paint | null)[]): string[] {
  const classes = paints.flatMap((paint) =>
    paint !== null && paint.className !== null ? [paint.className] : [],
  );
  return classes.length > 0 ? [`class="${classes.join(' ')}"`] : [];
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function pct(value: number): string {
  return `${round2(value * 100)}%`;
}

function coord100(value: number): string {
  return `${round2(value * 100)}`;
}

// Keeps only characters allowed by the XML 1.0 `Char` production: tab (0x09),
// line feed (0x0A), carriage return (0x0D), and the valid scalar ranges below.
// This drops the C0 controls that arrive when pasting from Word or a PDF
// (U+000B, U+000C) as well as lone surrogates and U+FFFE/U+FFFF, any of which
// would make the whole SVG unparseable. A code-point filter is used rather than
// a regex because a control-character character class is itself a lint hazard.
function stripXmlInvalid(value: string): string {
  let out = '';
  // for-of iterates by code point, so a valid surrogate pair is one char here
  // while a lone surrogate is a single code unit that fails the ranges below.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const allowed =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    if (allowed) out += char;
  }
  return out;
}

function escapeText(value: string): string {
  return stripXmlInvalid(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

// btoa only accepts a "binary string" (one UTF-16 code unit per byte), and
// spreading a large byte array onto String.fromCharCode risks the engine's
// call-stack/argument-count limit, so bytes are converted in bounded chunks.
const BASE64_CHUNK_SIZE = 0x8000;

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Returns a copy of the document with XML-invalid control characters stripped
// from every painted free-text field (title, description, text lines).
// Serialization derives both the painted markup and the embedded JSON from this
// copy, so reopening a saved file restores the stripped form instead of
// reintroducing the original control characters. Zone labels are not painted and
// JSON.stringify already escapes control characters, so they round-trip losslessly.
function sanitizeDocument(doc: BackgroundDocument): BackgroundDocument {
  return {
    ...doc,
    title: stripXmlInvalid(doc.title),
    description: stripXmlInvalid(doc.description),
    elements: doc.elements.map((element) =>
      element.kind === 'text'
        ? { ...element, lines: element.lines.map(stripXmlInvalid) }
        : element,
    ),
  };
}

// A per-document id prefix. Fragment ids (markers, the title/desc referenced by
// aria-labelledby) share the document-wide id space when an SVG is INLINED — as
// the interview runtime does — so two backgrounds on one page would otherwise
// both define `#arrow`, and the later line's `url(#arrow)` could resolve to the
// first file's marker and paint the wrong arrowhead. A content hash keeps the
// prefix deterministic (same document → identical bytes, so round-trips and the
// golden tests stay stable) while making distinct documents collide-free.
function documentIdPrefix(json: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `bg${(hash >>> 0).toString(36)}-`;
}

// Assigns a marker id to each distinct arrow stroke colour, in order of first
// appearance: the first colour is "<prefix>arrow", subsequent colours
// "<prefix>arrow-2", etc.
function collectArrowMarkers(
  elements: readonly SvgElement[],
  idPrefix: string,
): Map<string, string> {
  const markers = new Map<string, string>();
  for (const element of elements) {
    if (
      element.kind === 'line' &&
      (element.startArrow || element.endArrow) &&
      !markers.has(element.stroke)
    ) {
      const index = markers.size + 1;
      markers.set(
        element.stroke,
        `${idPrefix}${index === 1 ? 'arrow' : `arrow-${index}`}`,
      );
    }
  }
  return markers;
}

// Marker content does not inherit paint from the referencing line, so an
// arrowhead re-states its line's stroke as its own fill: a hex stroke becomes a
// literal fill, and a sentinel stroke becomes the matching fill-* class. The
// class resolves against the root's inherited color / the embedded <style>, so
// arrowheads match their line in a standalone <img> render too.
function serializeMarker(markerId: string, colour: string): string {
  const paint = fillPaint(colour);
  const attrs = [...classAttr(paint), ...(paint.attr ? [paint.attr] : [])];
  return [
    `    <marker id="${markerId}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">`,
    `      <path d="M 0 0 L 10 5 L 0 10 z" ${attrs.join(' ')} />`,
    `    </marker>`,
  ].join('\n');
}

function paintAttrs(
  fill: string,
  fillOpacity: number,
  stroke: string | null,
  strokeWidth: number,
): string[] {
  const fillP = fillPaint(fill);
  const strokeP = stroke !== null ? strokePaint(stroke) : null;
  const attrs = [...classAttr(fillP, strokeP)];
  if (fillP.attr !== null) attrs.push(fillP.attr);
  if (fillOpacity !== 1) {
    attrs.push(`fill-opacity="${fillOpacity}"`);
  }
  if (strokeP !== null) {
    if (strokeP.attr !== null) attrs.push(strokeP.attr);
    attrs.push(
      `stroke-width="${strokeWidth}"`,
      `vector-effect="non-scaling-stroke"`,
    );
  }
  return attrs;
}

function serializeRect(element: RectElement): string {
  const attrs = [
    `x="${pct(element.x)}"`,
    `y="${pct(element.y)}"`,
    `width="${pct(element.width)}"`,
    `height="${pct(element.height)}"`,
    ...paintAttrs(
      element.fill,
      element.fillOpacity,
      element.stroke,
      element.strokeWidth,
    ),
  ];
  return `  <rect ${attrs.join(' ')} />`;
}

function serializeEllipse(element: EllipseElement): string {
  const attrs = [
    `cx="${pct(element.cx)}"`,
    `cy="${pct(element.cy)}"`,
    `rx="${pct(element.rx)}"`,
    `ry="${pct(element.ry)}"`,
    ...paintAttrs(
      element.fill,
      element.fillOpacity,
      element.stroke,
      element.strokeWidth,
    ),
  ];
  return `  <ellipse ${attrs.join(' ')} />`;
}

function serializeLine(
  element: LineElement,
  markers: Map<string, string>,
): string {
  const strokeP = strokePaint(element.stroke);
  const attrs = [
    `x1="${pct(element.x1)}"`,
    `y1="${pct(element.y1)}"`,
    `x2="${pct(element.x2)}"`,
    `y2="${pct(element.y2)}"`,
    ...classAttr(strokeP),
    ...(strokeP.attr !== null ? [strokeP.attr] : []),
    `stroke-width="${element.strokeWidth}"`,
    `vector-effect="non-scaling-stroke"`,
  ];
  const markerId = markers.get(element.stroke);
  if (element.startArrow && markerId !== undefined) {
    attrs.push(`marker-start="url(#${markerId})"`);
  }
  if (element.endArrow && markerId !== undefined) {
    attrs.push(`marker-end="url(#${markerId})"`);
  }
  return `  <line ${attrs.join(' ')} />`;
}

function serializePolygon(element: PolygonElement): string {
  const points = element.points
    .map((point) => `${coord100(point.x)},${coord100(point.y)}`)
    .join(' ');
  const attrs = [
    `points="${points}"`,
    ...paintAttrs(
      element.fill,
      element.fillOpacity,
      element.stroke,
      element.strokeWidth,
    ),
  ];
  // Percentages are invalid inside `points`, so the polygon is drawn in a nested
  // SVG whose 0..100 viewBox is stretched edge-to-edge (preserveAspectRatio
  // "none"). overflow="visible" stops non-scaling strokes being clipped at the
  // nested viewport edge.
  return [
    `  <svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">`,
    `    <polygon ${attrs.join(' ')} />`,
    `  </svg>`,
  ].join('\n');
}

function serializeText(element: TextElement): string {
  const { minPx, vmin, maxPx } = TEXT_SIZE_PRESETS[element.fontSize];
  // white-space: pre keeps leading/trailing/multiple spaces in rendered lines,
  // matching what the inline editor shows and what measured bounds count (SVG's
  // default white-space processing would collapse them).
  const fontStyle = `font-family: system-ui, sans-serif; font-size: clamp(${minPx}px, ${vmin}vmin, ${maxPx}px); font-weight: ${element.fontWeight}; white-space: pre`;
  const fillP = fillPaint(element.fill);
  const attrs = [
    `x="${pct(element.x)}"`,
    `y="${pct(element.y)}"`,
    ...classAttr(fillP),
    ...(fillP.attr !== null ? [fillP.attr] : []),
    `text-anchor="middle"`,
    `style="${escapeAttr(fontStyle)}"`,
  ];
  if (element.opacity !== 1) {
    attrs.push(`opacity="${element.opacity}"`);
  }
  const open = `  <text ${attrs.join(' ')}>`;

  const lineCount = element.lines.length;
  // First tspan lifts the block so it stays vertically centred on the element's
  // y anchor (the editor treats y as the visual centre — inline textarea and
  // textBounds both do); each following line advances one line-height (1.2em),
  // so the lift must be measured in the same 1.2em steps (0.35em nudges the
  // block onto the visual baseline). A single line takes the same path — its
  // lift is just the 0.35em baseline nudge — so it does not sit above its
  // clicked/selected position the way a bare baseline-anchored <text> would.
  const firstDy = round2(-((1.2 * (lineCount - 1)) / 2 - 0.35));
  const tspans = element.lines.map((line, index) => {
    const dy = index === 0 ? `${firstDy}em` : '1.2em';
    // A glyphless <tspan> applies no dy and collapses the line; a non-breaking
    // space keeps blank (empty or whitespace-only) lines advancing the block.
    const content = line.trim() === '' ? '\u00A0' : escapeText(line);
    return `<tspan x="${pct(element.x)}" dy="${dy}">${content}</tspan>`;
  });
  // Emitted with no whitespace between tspans: under white-space: pre the
  // pretty-printing text nodes would themselves render as glyph advances.
  return `${open}${tspans.join('')}</text>`;
}

function serializeElement(
  element: SvgElement,
  markers: Map<string, string>,
): string {
  switch (element.kind) {
    case 'rect':
      return serializeRect(element);
    case 'ellipse':
      return serializeEllipse(element);
    case 'line':
      return serializeLine(element, markers);
    case 'polygon':
      return serializePolygon(element);
    case 'text':
      return serializeText(element);
    default:
      throw new Error(`Unsupported element kind: ${JSON.stringify(element)}`);
  }
}

export function serializeDocument(doc: BackgroundDocument): string {
  // Both the painted markup and the embedded JSON are derived from the sanitized
  // copy so the file is valid XML and reopening it restores the stripped form.
  const sanitized = sanitizeDocument(doc);
  const json = JSON.stringify(sanitized);
  const idPrefix = documentIdPrefix(json);
  const titleId = `${idPrefix}title`;
  const descriptionId = `${idPrefix}description`;
  const markers = collectArrowMarkers(sanitized.elements, idPrefix);
  // The root carries class="text-text" so `currentColor` (fill-current /
  // stroke-current, arrowhead fills) resolves to the theme text colour
  // everywhere in the document; the single embedded <style> supplies the
  // dark-theme fallbacks for standalone rendering.
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" role="img" aria-labelledby="${titleId} ${descriptionId}" class="nc-background text-text">`,
    `  <title id="${titleId}">${escapeText(sanitized.title)}</title>`,
    `  <desc id="${descriptionId}">${escapeText(sanitized.description)}</desc>`,
    EMBEDDED_STYLE,
    `  <metadata id="nc-background-creator">`,
    // The document is embedded as base64 of its UTF-8 JSON rather than
    // XML-escaped text. Base64's alphabet contains no XML meta-characters, so
    // the payload needs no escaping and can't break the surrounding markup;
    // more importantly, it lets parseDocument recover the document by
    // scanning the raw file text instead of parsing untrusted file contents
    // as markup (the reopened-file DOM-XSS sink), while still round-tripping
    // any JSON content — including XML-hostile characters — byte-exactly.
    `    <nc:document xmlns:nc="${NC_NAMESPACE}">${base64EncodeUtf8(json)}</nc:document>`,
    `  </metadata>`,
  ];

  if (markers.size > 0) {
    lines.push(`  <defs>`);
    for (const [colour, markerId] of markers) {
      lines.push(serializeMarker(markerId, colour));
    }
    lines.push(`  </defs>`);
  }

  for (const element of sanitized.elements) {
    lines.push(serializeElement(element, markers));
  }

  lines.push(`</svg>`, '');
  return lines.join('\n');
}
