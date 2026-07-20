import { describe, expect, it } from 'vitest';

import { createQuadrantsTemplate } from '~/model/templates';
import type { BackgroundDocument, TextSize } from '~/model/types';
import { parseDocument } from '~/svg/parse';
import { serializeDocument } from '~/svg/serialize';

function rootTag(svg: string): string {
  const [firstLine = ''] = svg.split('\n');
  return firstLine;
}

function renderedBody(svg: string): string {
  return svg.slice(svg.indexOf('</metadata>') + '</metadata>'.length);
}

function docWith(elements: BackgroundDocument['elements']): BackgroundDocument {
  return { version: 1, title: 'T', description: 'D', elements };
}

// Fragment ids carry a per-document content-hash prefix so two inlined
// backgrounds never collide; the exact hash is an implementation detail, so
// tests recover it from the output rather than hard-coding it.
function idPrefix(svg: string): string {
  const match = svg.match(/id="(bg[a-z0-9]+-)title"/);
  if (!match?.[1]) throw new Error('no document id prefix found');
  return match[1];
}

describe('serializeDocument root element', () => {
  it('has width/height 100% and never a viewBox', () => {
    const svg = serializeDocument(createQuadrantsTemplate());
    expect(rootTag(svg)).toContain('width="100%"');
    expect(rootTag(svg)).toContain('height="100%"');
    expect(rootTag(svg)).not.toContain('viewBox');
    expect(rootTag(svg)).toContain('role="img"');
    const p = idPrefix(svg);
    expect(rootTag(svg)).toContain(
      `aria-labelledby="${p}title ${p}description"`,
    );
  });

  it('gives distinct documents distinct fragment-id prefixes but is deterministic per document', () => {
    const a = docWith([]);
    const b: BackgroundDocument = { ...a, title: 'Different' };
    // Same document → identical prefix (round-trips and golden output stay
    // stable); different document → different prefix (two inlined backgrounds
    // never share marker/title ids).
    expect(idPrefix(serializeDocument(a))).toBe(idPrefix(serializeDocument(a)));
    expect(idPrefix(serializeDocument(a))).not.toBe(
      idPrefix(serializeDocument(b)),
    );
  });

  it('carries the scoped root classes and exactly one embedded style block', () => {
    const svg = serializeDocument(docWith([]));
    expect(rootTag(svg)).toContain('class="nc-background text-text"');
    expect(svg.match(/<style>/g)).toHaveLength(1);
    // Every rule is scoped under svg.nc-background so an inlined copy's
    // document-scoped <style> cannot restyle host elements sharing the
    // utility-like class names.
    expect(svg).toContain(
      'svg.nc-background { color: var(--color-text, oklch(0.95 0.01 290)) }',
    );
    expect(svg).toContain(
      'svg.nc-background .fill-current { fill: currentColor }',
    );
    expect(svg).toContain(
      'svg.nc-background .stroke-current { stroke: currentColor }',
    );
    expect(svg).toContain(
      'svg.nc-background .fill-background { fill: var(--color-background, oklch(0.2 0.03 290)) }',
    );
    expect(svg).toContain(
      'svg.nc-background .stroke-background { stroke: var(--color-background, oklch(0.2 0.03 290)) }',
    );
    expect(svg.match(/\.text-text\s*\{/g)).toBeNull();
  });

  it('escapes the title and description', () => {
    const svg = serializeDocument({
      version: 1,
      title: 'A & B <x>',
      description: 'quote " here',
      elements: [],
    });
    const p = idPrefix(svg);
    expect(svg).toContain(`<title id="${p}title">A &amp; B &lt;x&gt;</title>`);
    expect(svg).toContain(`<desc id="${p}description">quote " here</desc>`);
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
          zoneLabel: null,
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
          zoneLabel: null,
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
          zoneLabel: null,
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
          zoneLabel: null,
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
          zoneLabel: null,
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
    const p = idPrefix(svg);
    expect(svg).toContain(`id="${p}arrow"`);
    expect(svg).toContain(`id="${p}arrow-2"`);
    expect(svg).toContain('markerUnits="userSpaceOnUse"');
    expect(svg).toContain('orient="auto-start-reverse"');
    expect(svg).toContain('<path d="M 0 0 L 10 5 L 0 10 z" fill="#ffffff" />');
    expect(svg).toContain('<path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8800" />');
    // The first colour's line references "arrow"; the second references "arrow-2".
    expect(svg).toContain(`marker-start="url(#${p}arrow)"`);
    expect(svg).toContain(`marker-end="url(#${p}arrow-2)"`);
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
          zoneLabel: null,
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
  it('centres a single-line text on its y anchor via the baseline nudge', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 't',
          kind: 'text',
          x: 0.5,
          y: 0.5,
          lines: ['Solo'],
          fill: '#ffffff',
          fontSize: 'medium',
          fontWeight: 600,
          opacity: 1,
        },
      ]),
    );
    // A bare baseline-anchored <text> would sit above the element's y (the
    // editor treats y as the visual centre), so even one line goes through the
    // centring tspan with the 0.35em baseline nudge.
    expect(svg).toContain('<tspan x="50%" dy="0.35em">Solo</tspan>');
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
          fontSize: 'medium',
          fontWeight: 600,
          opacity: 0.5,
        },
      ]),
    );
    expect(svg).toContain('opacity="0.5"');
    // Two lines lift by half of one 1.2em step less the 0.35em baseline nudge:
    // -(1.2 * 1 / 2 - 0.35) = -0.25em.
    expect(svg).toContain('<tspan x="25%" dy="-0.25em">Work &amp;</tspan>');
    expect(svg).toContain('<tspan x="25%" dy="1.2em">study</tspan>');
  });

  it('lifts a three-line block by a full 1.2em step less the baseline nudge', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 't',
          kind: 'text',
          x: 0.5,
          y: 0.5,
          lines: ['One', 'Two', 'Three'],
          fill: '#ffffff',
          fontSize: 'medium',
          fontWeight: 600,
          opacity: 1,
        },
      ]),
    );
    // -(1.2 * 2 / 2 - 0.35) = -0.85em.
    expect(svg).toContain('<tspan x="50%" dy="-0.85em">One</tspan>');
    expect(svg).toContain('<tspan x="50%" dy="1.2em">Two</tspan>');
    expect(svg).toContain('<tspan x="50%" dy="1.2em">Three</tspan>');
  });

  it('renders a blank line as a non-breaking space so it still advances', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 't',
          kind: 'text',
          x: 0.5,
          y: 0.5,
          lines: ['Top', '', 'Bottom'],
          fill: '#ffffff',
          fontSize: 'medium',
          fontWeight: 600,
          opacity: 1,
        },
      ]),
    );
    const tspans = svg.match(/<tspan /g) ?? [];
    expect(tspans).toHaveLength(3);
    // The middle line is empty in the model but renders a non-breaking space so
    // its <tspan> is not collapsed and the dy advance is preserved.
    const nbsp = String.fromCharCode(0x00a0);
    expect(svg).toContain(`<tspan x="50%" dy="1.2em">${nbsp}</tspan>`);
  });
});

describe('serializeDocument XML-invalid characters', () => {
  it('strips C0 control characters from painted text and metadata', () => {
    // U+000B and U+000C arrive routinely when pasting from Word or a PDF.
    const vt = String.fromCharCode(0x0b);
    const ff = String.fromCharCode(0x0c);
    const doc: BackgroundDocument = {
      version: 1,
      title: `Ti${vt}tle`,
      description: `De${ff}sc`,
      elements: [
        {
          id: 't',
          kind: 'text',
          x: 0.5,
          y: 0.5,
          lines: [`Li${vt}ne`, 'plain'],
          fill: '#ffffff',
          fontSize: 'medium',
          fontWeight: 600,
          opacity: 1,
        },
      ],
    };
    const svg = serializeDocument(doc);

    // No raw control character survives anywhere in the output (painted markup
    // or embedded JSON), so the whole SVG stays valid XML.
    expect(svg).not.toContain(vt);
    expect(svg).not.toContain(ff);

    // DOMParser reads it back without a parser error...
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.querySelector('title')?.textContent).toBe('Title');

    // ...and reopening restores the stripped (sanitized) form, not the original
    // control characters.
    const restored = parseDocument(svg);
    expect(restored.title).toBe('Title');
    expect(restored.description).toBe('Desc');
    const [text] = restored.elements;
    expect(text?.kind === 'text' ? text.lines : []).toEqual(['Line', 'plain']);
  });

  it('strips characters outside the XML 1.0 Char range and stays reopenable', () => {
    // A lone surrogate (U+D800) and the non-characters U+FFFE/U+FFFF are all
    // outside the XML Char production and would make the SVG unparseable.
    const loneSurrogate = '\uD800';
    const uFFFE = String.fromCharCode(0xfffe);
    const uFFFF = String.fromCharCode(0xffff);
    const doc: BackgroundDocument = {
      version: 1,
      title: `T${loneSurrogate}i${uFFFE}tle`,
      description: `De${uFFFF}sc`,
      elements: [],
    };
    const svg = serializeDocument(doc);

    expect(svg).not.toContain(loneSurrogate);
    expect(svg).not.toContain(uFFFE);
    expect(svg).not.toContain(uFFFF);

    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();

    const restored = parseDocument(svg);
    expect(restored.title).toBe('Title');
    expect(restored.description).toBe('Desc');
  });

  it('preserves a valid astral character (surrogate pair) that is inside Char', () => {
    // U+1F600 is a valid XML character; only lone surrogates are invalid.
    const emoji = '\u{1F600}';
    const svg = serializeDocument({
      version: 1,
      title: `hi ${emoji}`,
      description: '',
      elements: [],
    });
    expect(parseDocument(svg).title).toBe(`hi ${emoji}`);
  });
});

describe('serializeDocument ellipse', () => {
  it('emits a warping ellipse as <ellipse cx cy rx ry> in percentages', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'e',
          kind: 'ellipse',
          cx: 0.5,
          cy: 0.25,
          rx: 0.3,
          ry: 0.1,
          fill: '#000000',
          fillOpacity: 1,
          stroke: null,
          strokeWidth: 1,
          zoneLabel: null,
        },
      ]),
    );
    expect(svg).toContain(
      '<ellipse cx="50%" cy="25%" rx="30%" ry="10%" fill="#000000" />',
    );
  });
});

describe('serializeDocument zone-marked shapes', () => {
  it('renders a zone-marked shape as ordinary artwork and keeps its label out of painted markup', () => {
    const doc = docWith([
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
        strokeWidth: 1,
        zoneLabel: 'ZONELABEL_UNIQUE',
      },
    ]);
    const svg = serializeDocument(doc);
    // The label round-trips through the embedded (base64) document JSON...
    expect(parseDocument(svg)).toEqual(doc);
    // ...but the shape renders as an ordinary rect and the label itself is not painted.
    const body = renderedBody(svg);
    expect(body).toContain(
      '<rect x="0%" y="0%" width="50%" height="50%" fill="#112233" />',
    );
    expect(body).not.toContain('ZONELABEL_UNIQUE');
  });

  it('keeps XML-hostile zone labels out of the raw markup entirely and round-trips them', () => {
    const doc = docWith([
      {
        id: 'r',
        kind: 'rect',
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
        fill: '#000000',
        fillOpacity: 1,
        stroke: null,
        strokeWidth: 1,
        zoneLabel: 'A & B <"quotes">',
      },
    ]);
    const svg = serializeDocument(doc);
    // The label is embedded as base64, not XML-escaped text, so none of its
    // raw XML meta-characters appear anywhere in the serialized file.
    expect(svg).not.toContain('A & B <"quotes">');
    expect(svg).not.toContain('<"quotes">');
    const [, payload = ''] =
      /<nc:document[^>]*>\s*([^<]+?)\s*<\/nc:document>/.exec(svg) ?? [];
    expect(payload).not.toBe('');
    expect(payload).toMatch(/^[A-Za-z0-9+/=]+$/);
    // ...and the label survives byte-exactly on reopen.
    expect(parseDocument(svg)).toEqual(doc);
  });
});

describe('serializeDocument font size tokens', () => {
  const clamps: Array<[TextSize, string]> = [
    ['small', 'clamp(11px, 1.8vmin, 22px)'],
    ['medium', 'clamp(14px, 2.6vmin, 32px)'],
    ['large', 'clamp(18px, 3.6vmin, 44px)'],
    ['extra-large', 'clamp(24px, 5vmin, 64px)'],
  ];

  for (const [fontSize, clamp] of clamps) {
    it(`resolves the ${fontSize} token to ${clamp}`, () => {
      const svg = serializeDocument(
        docWith([
          {
            id: 't',
            kind: 'text',
            x: 0.5,
            y: 0.5,
            lines: ['Sized'],
            fill: '#ffffff',
            fontSize,
            fontWeight: 600,
            opacity: 1,
          },
        ]),
      );
      expect(svg).toContain(`font-size: ${clamp}; font-weight: 600`);
    });
  }
});

describe('serializeDocument theme-colour sentinels', () => {
  it('serialises a text fill sentinel as class="fill-current" with no fill attribute', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 't',
          kind: 'text',
          x: 0.5,
          y: 0.5,
          lines: ['Themed'],
          fill: 'text',
          fontSize: 'medium',
          fontWeight: 600,
          opacity: 1,
        },
      ]),
    );
    const [textTag = ''] = /<text [^>]*>/.exec(renderedBody(svg)) ?? [];
    expect(textTag).toContain('class="fill-current"');
    expect(textTag).not.toContain('fill=');
    expect(textTag).toContain('text-anchor="middle"');
  });

  it('serialises rect fill/stroke sentinels as classes with no paint attributes', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'r',
          kind: 'rect',
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.5,
          fill: 'background',
          fillOpacity: 1,
          stroke: 'text',
          strokeWidth: 2,
          zoneLabel: null,
        },
      ]),
    );
    const [rectTag = ''] = /<rect [^>]*\/>/.exec(renderedBody(svg)) ?? [];
    expect(rectTag).toContain('class="fill-background stroke-current"');
    expect(rectTag).not.toContain('fill=');
    expect(rectTag).not.toContain(' stroke=');
    expect(rectTag).toContain('stroke-width="2"');
  });

  it('serialises a sentinel-stroked line and matching arrowhead via classes', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'l',
          kind: 'line',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          stroke: 'text',
          strokeWidth: 3,
          startArrow: true,
          endArrow: true,
        },
      ]),
    );
    const [lineTag = ''] = /<line [^>]*\/>/.exec(svg) ?? [];
    const p = idPrefix(svg);
    expect(lineTag).toContain('class="stroke-current"');
    expect(lineTag).not.toContain(' stroke=');
    expect(lineTag).toContain(`marker-start="url(#${p}arrow)"`);
    expect(lineTag).toContain(`marker-end="url(#${p}arrow)"`);
    // The arrowhead re-states the line's sentinel as a fill class.
    expect(svg).toContain(
      '<path d="M 0 0 L 10 5 L 0 10 z" class="fill-current" />',
    );
  });

  it('serialises a background-stroked line with a fill-background arrowhead', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'l',
          kind: 'line',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 0,
          stroke: 'background',
          strokeWidth: 2,
          startArrow: false,
          endArrow: true,
        },
      ]),
    );
    const [lineTag = ''] = /<line [^>]*\/>/.exec(svg) ?? [];
    expect(lineTag).toContain('class="stroke-background"');
    expect(lineTag).not.toContain(' stroke=');
    expect(svg).toContain(
      '<path d="M 0 0 L 10 5 L 0 10 z" class="fill-background" />',
    );
  });

  it('keeps distinct markers for a sentinel and a hex stroke', () => {
    const svg = serializeDocument(
      docWith([
        {
          id: 'l1',
          kind: 'line',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 0,
          stroke: 'text',
          strokeWidth: 2,
          startArrow: false,
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
    expect(svg.match(/<marker /g)).toHaveLength(2);
    expect(svg).toContain(
      '<path d="M 0 0 L 10 5 L 0 10 z" class="fill-current" />',
    );
    expect(svg).toContain('<path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8800" />');
  });
});
