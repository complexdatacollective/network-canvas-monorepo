import type {
  BackgroundDocument,
  EllipseElement,
  LineElement,
  PolygonElement,
  RectElement,
  SvgElement,
  TextElement,
} from '~/model/types';

const NC_NAMESPACE =
  'https://documentation.networkcanvas.com/xmlns/background-creator';

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

// Assigns a marker id to each distinct arrow stroke colour, in order of first
// appearance: the first colour uses "arrow", subsequent colours "arrow-2", etc.
function collectArrowMarkers(
  elements: readonly SvgElement[],
): Map<string, string> {
  const markers = new Map<string, string>();
  for (const element of elements) {
    if (
      element.kind === 'line' &&
      (element.startArrow || element.endArrow) &&
      !markers.has(element.stroke)
    ) {
      const index = markers.size + 1;
      markers.set(element.stroke, index === 1 ? 'arrow' : `arrow-${index}`);
    }
  }
  return markers;
}

function serializeMarker(markerId: string, colour: string): string {
  return [
    `    <marker id="${markerId}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">`,
    `      <path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeAttr(colour)}" />`,
    `    </marker>`,
  ].join('\n');
}

function paintAttrs(
  fill: string,
  fillOpacity: number,
  stroke: string | null,
  strokeWidth: number,
): string[] {
  const attrs = [`fill="${escapeAttr(fill)}"`];
  if (fillOpacity !== 1) {
    attrs.push(`fill-opacity="${fillOpacity}"`);
  }
  if (stroke !== null) {
    attrs.push(
      `stroke="${escapeAttr(stroke)}"`,
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
  const attrs = [
    `x1="${pct(element.x1)}"`,
    `y1="${pct(element.y1)}"`,
    `x2="${pct(element.x2)}"`,
    `y2="${pct(element.y2)}"`,
    `stroke="${escapeAttr(element.stroke)}"`,
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
  const fontStyle = `font-family: system-ui, sans-serif; font-size: clamp(${element.fontMinPx}px, ${element.fontVmin}vmin, ${element.fontMaxPx}px); font-weight: ${element.fontWeight}`;
  const attrs = [
    `x="${pct(element.x)}"`,
    `y="${pct(element.y)}"`,
    `fill="${escapeAttr(element.fill)}"`,
    `text-anchor="${element.anchor}"`,
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
    // An empty <tspan> applies no dy and collapses the line; a non-breaking
    // space keeps blank lines rendering so they still advance the block.
    const content = line === '' ? '\u00A0' : escapeText(line);
    return `    <tspan x="${pct(element.x)}" dy="${dy}">${content}</tspan>`;
  });
  return [open, ...tspans, `  </text>`].join('\n');
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
  const markers = collectArrowMarkers(sanitized.elements);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" role="img" aria-labelledby="title description">`,
    `  <title id="title">${escapeText(sanitized.title)}</title>`,
    `  <desc id="description">${escapeText(sanitized.description)}</desc>`,
    `  <metadata id="nc-background-creator">`,
    // The document is embedded as base64 of its UTF-8 JSON rather than
    // XML-escaped text. Base64's alphabet contains no XML meta-characters, so
    // the payload needs no escaping and can't break the surrounding markup;
    // more importantly, it lets parseDocument recover the document by
    // scanning the raw file text instead of parsing untrusted file contents
    // as markup (the reopened-file DOM-XSS sink), while still round-tripping
    // any JSON content — including XML-hostile characters — byte-exactly.
    `    <nc:document xmlns:nc="${NC_NAMESPACE}">${base64EncodeUtf8(JSON.stringify(sanitized))}</nc:document>`,
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
