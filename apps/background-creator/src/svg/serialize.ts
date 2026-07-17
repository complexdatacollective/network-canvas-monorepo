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

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
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

  if (element.lines.length === 1) {
    const [single = ''] = element.lines;
    return `${open}${escapeText(single)}</text>`;
  }

  const lineCount = element.lines.length;
  // First tspan lifts the multi-line block so it stays vertically centred on the
  // element's y anchor; each following line advances one line-height (1.2em).
  const firstDy = round2(-((lineCount - 1) / 2 - 0.35));
  const tspans = element.lines.map((line, index) => {
    const dy = index === 0 ? `${firstDy}em` : '1.2em';
    return `    <tspan x="${pct(element.x)}" dy="${dy}">${escapeText(line)}</tspan>`;
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
  const markers = collectArrowMarkers(doc.elements);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" role="img" aria-labelledby="title description">`,
    `  <title id="title">${escapeText(doc.title)}</title>`,
    `  <desc id="description">${escapeText(doc.description)}</desc>`,
    `  <metadata id="nc-background-creator">`,
    `    <nc:document xmlns:nc="${NC_NAMESPACE}">${escapeText(JSON.stringify(doc))}</nc:document>`,
    `  </metadata>`,
  ];

  if (markers.size > 0) {
    lines.push(`  <defs>`);
    for (const [colour, markerId] of markers) {
      lines.push(serializeMarker(markerId, colour));
    }
    lines.push(`  </defs>`);
  }

  for (const element of doc.elements) {
    lines.push(serializeElement(element, markers));
  }

  lines.push(`</svg>`, '');
  return lines.join('\n');
}
