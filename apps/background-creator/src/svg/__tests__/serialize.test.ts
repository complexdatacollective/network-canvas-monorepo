import { describe, expect, it } from 'vitest';

import { createQuadrantsTemplate } from '~/model/templates';
import type { BackgroundDocument } from '~/model/types';
import { serializeDocument } from '~/svg/serialize';

function rootTag(svg: string): string {
  const [firstLine = ''] = svg.split('\n');
  return firstLine;
}

function renderedBody(svg: string): string {
  return svg.slice(svg.indexOf('</metadata>') + '</metadata>'.length);
}

function docWith(
  elements: BackgroundDocument['elements'],
  zones: BackgroundDocument['zones'] = [],
): BackgroundDocument {
  return { version: 1, title: 'T', description: 'D', elements, zones };
}

describe('serializeDocument root element', () => {
  it('has width/height 100% and never a viewBox', () => {
    const svg = serializeDocument(createQuadrantsTemplate());
    expect(rootTag(svg)).toContain('width="100%"');
    expect(rootTag(svg)).toContain('height="100%"');
    expect(rootTag(svg)).not.toContain('viewBox');
    expect(rootTag(svg)).toContain('role="img"');
    expect(rootTag(svg)).toContain('aria-labelledby="title description"');
  });

  it('escapes the title and description', () => {
    const svg = serializeDocument({
      version: 1,
      title: 'A & B <x>',
      description: 'quote " here',
      elements: [],
      zones: [],
    });
    expect(svg).toContain('<title id="title">A &amp; B &lt;x&gt;</title>');
    expect(svg).toContain('<desc id="description">quote " here</desc>');
  });
});

describe('serializeDocument percentage formatting', () => {
  it('formats values with trailing zeros trimmed', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'r',
          kind: 'rect',
          x: 0.235,
          y: 0,
          width: 1,
          height: 0.5,
          fill: '#000000',
          fillOpacity: 1,
          stroke: null,
          strokeWidth: 1,
        },
      ]),
    );
    expect(svg).toContain('x="23.5%"');
    expect(svg).toContain('y="0%"');
    expect(svg).toContain('width="100%"');
    expect(svg).toContain('height="50%"');
  });
});

describe('serializeDocument stroke handling', () => {
  it('omits stroke attributes and fill-opacity when appropriate', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'r',
          kind: 'rect',
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.5,
          fill: '#112233',
          fillOpacity: 1,
          stroke: null,
          strokeWidth: 4,
        },
      ]),
    );
    expect(svg).toContain(
      '<rect x="0%" y="0%" width="50%" height="50%" fill="#112233" />',
    );
    expect(svg).not.toContain('fill-opacity');
    expect(svg).not.toContain('vector-effect');
  });

  it('emits vector-effect on every stroked shape', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'r',
          kind: 'rect',
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.5,
          fill: '#112233',
          fillOpacity: 0.5,
          stroke: '#ffffff',
          strokeWidth: 2,
        },
        {
          id: 'e',
          kind: 'ellipse',
          cx: 0.5,
          cy: 0.5,
          rx: 0.2,
          ry: 0.2,
          fill: '#000000',
          fillOpacity: 0,
          stroke: '#ffffff',
          strokeWidth: 2,
        },
        {
          id: 'p',
          kind: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0.5, y: 1 },
          ],
          fill: '#000000',
          fillOpacity: 1,
          stroke: '#ffffff',
          strokeWidth: 2,
        },
      ]),
    );
    const matches = svg.match(/vector-effect="non-scaling-stroke"/g) ?? [];
    expect(matches).toHaveLength(3);
  });
});

describe('serializeDocument arrow markers', () => {
  it('emits no defs when no line uses an arrow', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'l',
          kind: 'line',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          stroke: '#ffffff',
          strokeWidth: 2,
          startArrow: false,
          endArrow: false,
        },
      ]),
    );
    expect(svg).not.toContain('<defs>');
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('marker-start');
  });

  it('emits one marker per distinct arrow colour in order of first appearance', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'l1',
          kind: 'line',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 0,
          stroke: '#ffffff',
          strokeWidth: 2,
          startArrow: true,
          endArrow: true,
        },
        {
          id: 'l2',
          kind: 'line',
          x1: 0,
          y1: 1,
          x2: 1,
          y2: 1,
          stroke: '#ff8800',
          strokeWidth: 2,
          startArrow: false,
          endArrow: true,
        },
      ]),
    );
    const markers = svg.match(/<marker /g) ?? [];
    expect(markers).toHaveLength(2);
    expect(svg).toContain('id="arrow"');
    expect(svg).toContain('id="arrow-2"');
    expect(svg).toContain('markerUnits="userSpaceOnUse"');
    expect(svg).toContain('orient="auto-start-reverse"');
    expect(svg).toContain('<path d="M 0 0 L 10 5 L 0 10 z" fill="#ffffff" />');
    expect(svg).toContain('<path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8800" />');
    // The first colour's line references "arrow"; the second references "arrow-2".
    expect(svg).toContain('marker-start="url(#arrow)"');
    expect(svg).toContain('marker-end="url(#arrow-2)"');
  });
});

describe('serializeDocument polygon', () => {
  it('wraps the polygon in a stretched nested svg', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'p',
          kind: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0.5 },
            { x: 0.235, y: 1 },
          ],
          fill: '#000000',
          fillOpacity: 1,
          stroke: null,
          strokeWidth: 1,
        },
      ]),
    );
    expect(svg).toContain(
      '<svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">',
    );
    expect(svg).toContain(
      '<polygon points="0,0 100,50 23.5,100" fill="#000000" />',
    );
  });
});

describe('serializeDocument text', () => {
  it('renders a single-line text without tspans', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 't',
          kind: 'text',
          x: 0.5,
          y: 0.5,
          lines: ['Solo'],
          fill: '#ffffff',
          fontMinPx: 14,
          fontVmin: 2.6,
          fontMaxPx: 32,
          fontWeight: 600,
          anchor: 'middle',
          opacity: 1,
        },
      ]),
    );
    expect(svg).toContain('>Solo</text>');
    expect(svg).not.toContain('<tspan');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain(
      'font-size: clamp(14px, 2.6vmin, 32px); font-weight: 600',
    );
  });

  it('centres a two-line block and steps subsequent lines by 1.2em', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 't',
          kind: 'text',
          x: 0.25,
          y: 0.75,
          lines: ['Work &', 'study'],
          fill: '#ffffff',
          fontMinPx: 14,
          fontVmin: 2.6,
          fontMaxPx: 32,
          fontWeight: 600,
          anchor: 'middle',
          opacity: 0.5,
        },
      ]),
    );
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('<tspan x="25%" dy="-0.15em">Work &amp;</tspan>');
    expect(svg).toContain('<tspan x="25%" dy="1.2em">study</tspan>');
  });
});

describe('serializeDocument zones', () => {
  it('never renders zones and keeps their data in metadata only', () => {
    const svg = serializeDocument(
      docWith(
        [],
        [
          {
            id: 'z1',
            label: 'ZONELABEL_UNIQUE',
            shape: 'circle',
            cx: 0.5,
            cy: 0.5,
            r: 0.3,
          },
        ],
      ),
    );
    // The label exists in the embedded document JSON...
    expect(svg.slice(0, svg.indexOf('</metadata>'))).toContain(
      'ZONELABEL_UNIQUE',
    );
    // ...but never appears as a rendered element.
    const body = renderedBody(svg);
    expect(body).not.toContain('ZONELABEL_UNIQUE');
    expect(body).not.toContain('<circle');
  });

  it('escapes XML-hostile zone labels inside the metadata JSON', () => {
    const svg = serializeDocument(
      docWith(
        [],
        [
          {
            id: 'z1',
            label: 'A & B <"quotes">',
            shape: 'rect',
            x: 0,
            y: 0,
            width: 0.5,
            height: 0.5,
          },
        ],
      ),
    );
    expect(svg).toContain('A &amp; B &lt;');
    expect(svg).not.toContain('<"quotes">');
  });
});
