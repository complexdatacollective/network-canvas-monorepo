import { describe, expect, it } from 'vitest';

import {
  isValidNodeShapeSvg,
  MAX_NODE_SHAPE_SVG_LENGTH,
  type NodeShapeSvgResult,
  parseNodeShapeSvg,
  serializeNodeShapeSvg,
} from '../node-shape-svg.ts';

const svg = (content: string, rootAttributes = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${rootAttributes}>${content}</svg>`;

const parsed = (source: string) => {
  const result = parseNodeShapeSvg(source);
  if (!result.success) {
    throw new Error(`Expected a successful parse: ${JSON.stringify(result)}`);
  }
  return result;
};

const codes = (result: NodeShapeSvgResult) =>
  result.issues.map((issue) => issue.code);

const INKSCAPE_FILE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape -->
<svg
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   width="100mm"
   height="100mm"
   viewBox="0 0 100 100"
   version="1.1"
   id="svg8"
   inkscape:version="1.0">
  <sodipodi:namedview id="base" pagecolor="#ffffff" inkscape:zoom="0.35" />
  <metadata id="metadata5"><rdf:RDF><dc:title>House</dc:title></rdf:RDF></metadata>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <path
       style="fill:var(--node-color, #e04f6d);fill-opacity:1;stroke:none;-inkscape-stroke:none"
       d="M 10,50 50,10 90,50 V 90 H 10 Z"
       id="path10"
       sodipodi:nodetypes="cccccc" />
  </g>
</svg>`;

describe('parseNodeShapeSvg', () => {
  it('parses a clean shape with no issues', () => {
    const result = parsed(
      svg(
        '<g fill="var(--node-color)"><path d="M0 0 L100 100" stroke="currentColor" stroke-width="2"/></g>',
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.shape.viewBox).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(result.shape.children).toEqual([
      {
        tag: 'g',
        attributes: { fill: 'var(--node-color)' },
        children: [
          {
            tag: 'path',
            attributes: {
              'd': 'M0 0 L100 100',
              'stroke': 'currentColor',
              'stroke-width': '2',
            },
            children: [],
          },
        ],
      },
    ]);
    expect(result.shape.labelArea).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.8,
      height: 0.6,
    });
    expect(result.shape.labelColor).toBeUndefined();
    expect(result.shape.labelRect).toBeUndefined();
  });

  it('accepts an svg element with no namespace declaration', () => {
    const result = parsed('<svg viewBox="0 0 10 10"><circle r="5"/></svg>');
    expect(result.issues).toEqual([]);
  });

  it('derives the viewBox from numeric width and height', () => {
    const result = parsed(svg('<circle r="5"/>', 'width="40" height="20px"'));
    expect(result.issues).toEqual([]);
    expect(result.shape.viewBox).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });

  it('prefers the viewBox over width and height', () => {
    const result = parsed(
      svg('<circle r="5"/>', 'viewBox="-5 -5 10 10" width="40" height="20"'),
    );
    expect(result.shape.viewBox).toEqual({
      x: -5,
      y: -5,
      width: 10,
      height: 10,
    });
  });

  it.each([
    ['missing', 'width="10mm" height="10mm"'],
    ['three numbers', 'viewBox="0 0 10"'],
    ['zero width', 'viewBox="0 0 0 10"'],
    ['negative height', 'viewBox="0 0 10 -1"'],
    ['not numbers', 'viewBox="0 0 a b"'],
  ])('fails with no-view-box when the viewBox is %s', (_, rootAttributes) => {
    const result = parseNodeShapeSvg(svg('<circle r="5"/>', rootAttributes));
    expect(result.success).toBe(false);
    expect(codes(result)).toContain('no-view-box');
  });

  it('fails with not-xml for malformed markup', () => {
    const result = parseNodeShapeSvg('<svg viewBox="0 0 1 1"><path></svg>');
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['not-xml']);
  });

  it('fails with not-xml for an undefined entity reference', () => {
    const result = parseNodeShapeSvg(svg('<text>&nbsp;</text><circle r="1"/>'));
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['not-xml']);
  });

  it('fails with no-svg-root when the root is another element', () => {
    const result = parseNodeShapeSvg(
      '<html xmlns="http://www.w3.org/1999/xhtml"><svg/></html>',
    );
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['no-svg-root']);
  });

  it('fails with no-svg-root when the root svg is in a foreign namespace', () => {
    const result = parseNodeShapeSvg(
      '<svg xmlns="urn:not-svg" viewBox="0 0 1 1"><circle r="1"/></svg>',
    );
    expect(codes(result)).toEqual(['no-svg-root']);
  });

  it('fails with empty when nothing remains to draw', () => {
    const result = parseNodeShapeSvg(
      svg('<defs><circle id="c" r="1"/></defs><script>x</script>'),
    );
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['unsupported-element', 'empty']);
  });

  it('rejects a billion-laughs DOCTYPE quickly as not-xml', () => {
    const entities = Array.from(
      { length: 10 },
      (_, index) => `<!ENTITY lol${index + 1} "${`&lol${index};`.repeat(10)}">`,
    ).join('');
    const source = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol0 "lol">${entities}]>${svg('<text>&lol10;</text><circle r="1"/>')}`;
    const started = performance.now();
    const result = parseNodeShapeSvg(source);
    expect(performance.now() - started).toBeLessThan(100);
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['not-xml']);
  });

  it('drops a DOCTYPE without entity references silently', () => {
    const result = parsed(
      `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${svg('<circle r="1"/>')}`,
    );
    expect(result.issues).toEqual([]);
  });

  it('checks the length before parsing', () => {
    const source = `${svg('<circle r="1"/>')}${' '.repeat(MAX_NODE_SHAPE_SVG_LENGTH)}`;
    const result = parseNodeShapeSvg(source);
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['too-long']);
  });

  it('accepts a file exactly at the length limit', () => {
    const base = svg('<circle r="1"/>');
    const source = `${base}${' '.repeat(MAX_NODE_SHAPE_SVG_LENGTH - base.length)}`;
    expect(source).toHaveLength(MAX_NODE_SHAPE_SVG_LENGTH);
    expect(isValidNodeShapeSvg(source)).toBe(true);
  });

  it('reports too-long for nesting deeper than the cap', () => {
    const depth = 40;
    const source = svg(
      `${'<g>'.repeat(depth)}<circle r="1"/>${'</g>'.repeat(depth)}`,
    );
    const result = parseNodeShapeSvg(source);
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['too-long']);
  });

  it('reports too-long for more elements than the cap', () => {
    const result = parseNodeShapeSvg(svg('<circle r="1"/>'.repeat(2_001)));
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual(['too-long']);
  });

  it('accepts nesting and element counts within the caps', () => {
    const nested = svg(
      `${'<g>'.repeat(30)}<circle r="1"/>${'</g>'.repeat(30)}`,
    );
    expect(isValidNodeShapeSvg(nested)).toBe(true);
    expect(isValidNodeShapeSvg(svg('<circle r="1"/>'.repeat(1_999)))).toBe(
      true,
    );
  });

  describe('removals', () => {
    it.each([
      ['script', '<script>alert(1)</script>', '<script>'],
      ['style element', '<style>path{fill:red}</style>', '<style>'],
      [
        'foreignObject',
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
        '<foreignObject>',
      ],
      ['image', '<image href="https://example.com/x.png"/>', '<image>'],
      ['link', '<a href="https://example.com"><circle r="1"/></a>', '<a>'],
      ['animation', '<animate attributeName="r" to="5"/>', '<animate>'],
      ['filter', '<filter id="f"><feGaussianBlur/></filter>', '<filter>'],
      ['nested svg', '<svg viewBox="0 0 1 1"><circle r="1"/></svg>', '<svg>'],
      [
        'namespaced editor element',
        '<sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"/>',
        '<sodipodi:namedview>',
      ],
      ['unbound namespaced element', '<inkscape:thing/>', '<inkscape:thing>'],
    ])('removes a %s element and its content', (_, content, detail) => {
      const result = parsed(svg(`<circle r="1"/>${content}`));
      expect(result.issues).toEqual([{ code: 'unsupported-element', detail }]);
      expect(result.shape.children).toEqual([
        { tag: 'circle', attributes: { r: '1' }, children: [] },
      ]);
    });

    it.each([
      ['onload', 'onload="alert(1)"'],
      ['onclick', 'onclick="alert(1)"'],
      ['namespaced inkscape:label', 'inkscape:label="Layer"'],
      ['unknown', 'filter="url(#f)"'],
    ])('removes an unsupported %s attribute', (_, attribute) => {
      const result = parsed(
        svg(
          `<g xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ${attribute}><circle r="1"/></g>`,
        ),
      );
      expect(codes(result)).toEqual(['unsupported-attribute']);
      const [group] = result.shape.children;
      expect(group).toEqual({
        tag: 'g',
        attributes: {},
        children: [{ tag: 'circle', attributes: { r: '1' }, children: [] }],
      });
    });

    it.each([
      ['external href on use', '<use href="https://example.com/x.svg#a"/>'],
      ['javascript href on use', '<use href="javascript:alert(1)"/>'],
      [
        'external xlink:href on use',
        '<use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:image/svg+xml,x"/>',
      ],
      [
        'external url() fill',
        '<rect width="1" height="1" fill="url(https://example.com/x)"/>',
      ],
      [
        'url() fill with fallback',
        '<rect width="1" height="1" fill="url(#a) red"/>',
      ],
      [
        'url() on an attribute that does not take one',
        '<rect width="1" height="1" opacity="url(#a)"/>',
      ],
      [
        'javascript: in a value',
        '<rect width="1" height="1" fill="javascript:alert(1)"/>',
      ],
      [
        'expression()',
        '<rect width="1" height="1" fill="expression(alert(1))"/>',
      ],
      ['@import', '<rect width="1" height="1" font-family="@import x"/>'],
      ['backslash escape', '<rect width="1" height="1" fill="u\\72l(x)"/>'],
      ['angle bracket', '<rect width="1" height="1" fill="&lt;x"/>'],
      [
        'var() on a non-colour attribute',
        '<rect width="var(--text)" height="1"/>',
      ],
      [
        'var() with a nested function fallback',
        '<rect width="1" height="1" fill="var(--text, var(--x))"/>',
      ],
      ['malformed id', '<rect id="1bad id" width="1" height="1"/>'],
    ])('removes an unsafe value: %s', (_, content) => {
      const result = parsed(svg(`<circle r="1"/>${content}`));
      expect(codes(result)).toEqual(['unsafe-value']);
      expect(JSON.stringify(result.shape)).not.toMatch(
        /https:|javascript:|data:|expression|@import|\\|<x|var\(--x|1bad|url\(#a\) red/,
      );
    });

    it('removes a var() naming an unknown token', () => {
      const result = parsed(
        svg('<rect width="1" height="1" fill="var(--brand-red)"/>'),
      );
      expect(codes(result)).toEqual(['unknown-token']);
      expect(result.shape.children).toEqual([
        { tag: 'rect', attributes: { height: '1', width: '1' }, children: [] },
      ]);
    });

    it('removes style declarations with disallowed properties', () => {
      const result = parsed(
        svg(
          '<rect width="1" height="1" style="fill:red;background-image:url(https://example.com/x);-inkscape-stroke:none"/>',
        ),
      );
      expect(result.issues).toEqual([
        {
          code: 'unsupported-style',
          detail:
            'background-image: url(https://example.com/x) in style on <rect>',
        },
        {
          code: 'unsupported-style',
          detail: '-inkscape-stroke: none in style on <rect>',
        },
      ]);
      expect(result.shape.children).toEqual([
        {
          tag: 'rect',
          attributes: { fill: 'red', height: '1', width: '1' },
          children: [],
        },
      ]);
    });

    it('keeps text only inside text and tspan', () => {
      const result = parsed(
        svg(
          'stray<g>also stray<text x="1">Hi &amp; <tspan>there</tspan></text></g>',
        ),
      );
      expect(result.issues).toEqual([]);
      expect(result.shape.children).toEqual([
        {
          tag: 'g',
          attributes: {},
          children: [
            {
              tag: 'text',
              attributes: { x: '1' },
              children: [
                'Hi & ',
                { tag: 'tspan', attributes: {}, children: ['there'] },
              ],
            },
          ],
        },
      ]);
    });

    it('silently drops title, desc, metadata, comments and data attributes', () => {
      const result = parsed(
        svg(
          '<title>t</title><desc>d</desc><metadata><x/></metadata><!-- c --><?pi x?><circle r="1" data-name="x" class="c" xml:space="preserve"/>',
          'viewBox="0 0 1 1" version="1.1" width="10" height="10" id="root"',
        ),
      );
      expect(result.issues).toEqual([]);
      expect(result.shape.children).toEqual([
        { tag: 'circle', attributes: { r: '1' }, children: [] },
      ]);
    });

    it('cleans an Inkscape file', () => {
      const result = parsed(INKSCAPE_FILE);
      expect(result.issues).toEqual([
        { code: 'unsupported-attribute', detail: 'inkscape:version on <svg>' },
        { code: 'unsupported-element', detail: '<sodipodi:namedview>' },
        { code: 'unsupported-attribute', detail: 'inkscape:label on <g>' },
        { code: 'unsupported-attribute', detail: 'inkscape:groupmode on <g>' },
        {
          code: 'unsupported-attribute',
          detail: 'sodipodi:nodetypes on <path>',
        },
        {
          code: 'unsupported-style',
          detail: '-inkscape-stroke: none in style on <path>',
        },
      ]);
      expect(result.shape.children).toEqual([
        {
          tag: 'g',
          attributes: { id: 'layer1' },
          children: [
            {
              tag: 'path',
              attributes: {
                'd': 'M 10,50 50,10 90,50 V 90 H 10 Z',
                'fill': 'var(--node-color, #e04f6d)',
                'fill-opacity': '1',
                'id': 'path10',
                'stroke': 'none',
              },
              children: [],
            },
          ],
        },
      ]);
    });
  });

  describe('attribute rules', () => {
    it('expands style declarations, which win over attributes', () => {
      const result = parsed(
        svg(
          '<rect width="1" height="1" fill="blue" style="fill: red !important; stroke-width:2;"/>',
        ),
      );
      expect(result.issues).toEqual([]);
      expect(result.shape.children).toEqual([
        {
          tag: 'rect',
          attributes: {
            'fill': 'red',
            'height': '1',
            'stroke-width': '2',
            'width': '1',
          },
          children: [],
        },
      ]);
    });

    it('accepts currentColor, tokens, tokens with fallbacks and colour functions', () => {
      const result = parsed(
        svg(
          [
            '<circle r="1" fill="currentColor"/>',
            '<circle r="1" fill="var(--node-color-seq-3)"/>',
            '<circle r="1" stroke="var(--node-color-dark, #123456)"/>',
            '<circle r="1" fill="var(--accent, oklch(0.7 0.1 200))"/>',
            '<circle r="1" color="rgb(1, 2, 3)"/>',
          ].join(''),
        ),
      );
      expect(result.issues).toEqual([]);
    });

    it('accepts internal url() references and href links', () => {
      const result = parsed(
        svg(
          [
            '<defs><linearGradient id="g1"><stop offset="0" stop-color="var(--primary)"/></linearGradient>',
            '<linearGradient id="g2" href="#g1"/>',
            '<clipPath id="c"><rect width="1" height="1"/></clipPath>',
            '<symbol id="s" viewBox="0 0 1 1" preserveAspectRatio="none"><circle r="1"/></symbol></defs>',
            '<rect width="1" height="1" fill="url(#g2)" clip-path="url(\'#c\')"/>',
            '<use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#s"/>',
          ].join(''),
        ),
      );
      expect(result.issues).toEqual([]);
      const use = result.shape.children.at(-1);
      expect(use).toEqual({
        tag: 'use',
        attributes: { href: '#s' },
        children: [],
      });
    });

    it('restricts href, viewBox and preserveAspectRatio to their elements', () => {
      const result = parsed(
        svg(
          '<circle r="1" href="#a"/><g viewBox="0 0 1 1" preserveAspectRatio="none"/>',
        ),
      );
      expect(result.issues).toEqual([
        { code: 'unsupported-attribute', detail: 'href on <circle>' },
        { code: 'unsupported-attribute', detail: 'viewBox on <g>' },
        { code: 'unsupported-attribute', detail: 'preserveAspectRatio on <g>' },
      ]);
    });

    it('keeps root presentation attributes on a wrapping group', () => {
      const result = parsed(
        svg('<circle r="1"/>', 'viewBox="0 0 1 1" fill="var(--node-color)"'),
      );
      expect(result.issues).toEqual([]);
      expect(result.shape.children).toEqual([
        {
          tag: 'g',
          attributes: { fill: 'var(--node-color)' },
          children: [{ tag: 'circle', attributes: { r: '1' }, children: [] }],
        },
      ]);
    });
  });

  describe('label area', () => {
    it('extracts the label area, removes it and reads its colour', () => {
      const result = parsed(
        svg(
          '<circle r="10"/><rect id="label-area" x="20" y="62" width="60" height="26" fill="var(--text, #fff)"/>',
        ),
      );
      expect(result.issues).toEqual([]);
      expect(result.shape.children).toEqual([
        { tag: 'circle', attributes: { r: '10' }, children: [] },
      ]);
      expect(result.shape.labelRect).toEqual({
        x: 20,
        y: 62,
        width: 60,
        height: 26,
      });
      expect(result.shape.labelColor).toBe('var(--text, #fff)');
      expect(result.shape.labelArea.x).toBeCloseTo(0.2);
      expect(result.shape.labelArea.y).toBeCloseTo(0.62);
      expect(result.shape.labelArea.width).toBeCloseTo(0.6);
      expect(result.shape.labelArea.height).toBeCloseTo(0.26);
    });

    it('reads the label colour from style and ignores fill none', () => {
      const styled = parsed(
        svg(
          '<circle r="1"/><rect id="label-area" width="1" height="1" style="fill:#abcdef"/>',
        ),
      );
      expect(styled.shape.labelColor).toBe('#abcdef');
      const unfilled = parsed(
        svg(
          '<circle r="1"/><rect id="label-area" width="1" height="1" fill="none"/>',
        ),
      );
      expect(unfilled.shape.labelColor).toBeUndefined();
    });

    it('maps a wide viewBox into the square node box', () => {
      // 200×100 fits as 1 × 0.5, centred vertically from y = 0.25.
      const result = parsed(
        svg(
          '<circle r="1"/><rect id="label-area" x="50" y="0" width="100" height="100"/>',
          'viewBox="0 0 200 100"',
        ),
      );
      expect(result.shape.labelArea.x).toBeCloseTo(0.25);
      expect(result.shape.labelArea.y).toBeCloseTo(0.25);
      expect(result.shape.labelArea.width).toBeCloseTo(0.5);
      expect(result.shape.labelArea.height).toBeCloseTo(0.5);
    });

    it('maps a tall, offset viewBox into the square node box', () => {
      // 50×100 at (10, 20) fits as 0.5 × 1, centred horizontally from x = 0.25.
      const result = parsed(
        svg(
          '<circle r="1"/><rect id="label-area" x="10" y="70" width="50" height="50"/>',
          'viewBox="10 20 50 100"',
        ),
      );
      expect(result.shape.labelArea.x).toBeCloseTo(0.25);
      expect(result.shape.labelArea.y).toBeCloseTo(0.5);
      expect(result.shape.labelArea.width).toBeCloseTo(0.5);
      // Clamped at the viewBox bottom (y 120): 50 units → 0.5.
      expect(result.shape.labelArea.height).toBeCloseTo(0.5);
    });

    it('clamps a label area that overhangs the viewBox', () => {
      const result = parsed(
        svg(
          '<circle r="1"/><rect id="label-area" x="-50" y="80" width="300" height="50"/>',
        ),
      );
      expect(result.shape.labelArea.x).toBeCloseTo(0);
      expect(result.shape.labelArea.y).toBeCloseTo(0.8);
      expect(result.shape.labelArea.width).toBeCloseTo(1);
      expect(result.shape.labelArea.height).toBeCloseTo(0.2);
    });

    it.each([
      [
        'a transformed ancestor',
        '<g transform="translate(1 1)"><rect id="label-area" width="10" height="10"/></g>',
      ],
      [
        'its own transform',
        '<rect id="label-area" width="10" height="10" transform="scale(2)"/>',
      ],
      [
        'a transformed root',
        '<rect id="label-area" width="10" height="10"/>',
        'viewBox="0 0 100 100" transform="scale(2)"',
      ],
      [
        'a place inside defs',
        '<defs><rect id="label-area" width="10" height="10"/></defs>',
      ],
      ['zero width', '<rect id="label-area" width="0" height="10"/>'],
      [
        'a non-numeric x',
        '<rect id="label-area" x="1em" width="10" height="10"/>',
      ],
      [
        'a place outside the viewBox',
        '<rect id="label-area" x="200" width="10" height="10"/>',
      ],
    ])(
      'rejects a label area with %s',
      (_, content, rootAttributes = 'viewBox="0 0 100 100"') => {
        const result = parsed(svg(`<circle r="1"/>${content}`, rootAttributes));
        expect(codes(result)).toEqual(['invalid-label-area']);
        expect(result.shape.labelArea).toEqual({
          x: 0.1,
          y: 0.2,
          width: 0.8,
          height: 0.6,
        });
        expect(result.shape.labelRect).toBeUndefined();
        expect(JSON.stringify(result.shape.children)).not.toContain(
          'label-area',
        );
      },
    );

    it('rejects a second label area and keeps the first', () => {
      const result = parsed(
        svg(
          '<circle r="1"/><rect id="label-area" width="10" height="10"/><rect id="label-area" x="50" width="10" height="10"/>',
        ),
      );
      expect(codes(result)).toEqual(['invalid-label-area']);
      expect(result.shape.labelRect).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
    });

    it('does not count the label area as drawable content', () => {
      const result = parseNodeShapeSvg(
        svg('<rect id="label-area" width="10" height="10"/>'),
      );
      expect(codes(result)).toEqual(['empty']);
    });
  });
});

describe('isValidNodeShapeSvg', () => {
  it('is true only for a successful parse with no issues', () => {
    expect(isValidNodeShapeSvg(svg('<circle r="1"/>'))).toBe(true);
    expect(isValidNodeShapeSvg(svg('<circle r="1" onclick="x"/>'))).toBe(false);
    expect(isValidNodeShapeSvg('not xml')).toBe(false);
  });
});

const DIRTY_FIXTURES = [
  INKSCAPE_FILE,
  svg(
    '<script>alert(1)</script><circle r="1" onload="x" fill="url(https://x)"/><rect id="label-area" width="10" height="10" fill="var(--selected)"/>',
  ),
  svg(
    '<text x="1" style="font-size:3;cursor:pointer">a &lt; b &amp; "c"<tspan>&#10;line</tspan></text>',
    'viewBox="-5 -5 50 20" fill="var(--node-color)" style="stroke:red"',
  ),
  svg(
    '<defs><radialGradient id="r" fx="0.5"><stop offset="1" stop-color="var(--surface, hsl(1 2% 3%))"/></radialGradient></defs><ellipse rx="2" ry="1" fill="url(&quot;#r&quot;)" font-family="Helvetica, &quot;Arial&quot;" d="&#9;x&#10;y"/>',
  ),
];

describe('serializeNodeShapeSvg', () => {
  it('emits canonical markup with sorted attributes and the label area last', () => {
    const result = parsed(
      svg(
        '<rect id="label-area" y="2" x="1" width="3" height="4" fill="#fff"/><circle r="1" fill="red" cx="0"/>',
      ),
    );
    expect(serializeNodeShapeSvg(result.shape)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="0" fill="red" r="1"/><rect fill="#fff" height="4" id="label-area" width="3" x="1" y="2"/></svg>',
    );
  });

  it.each(DIRTY_FIXTURES.map((fixture, index) => [index, fixture]))(
    'produces a strictly valid file from dirty fixture %i',
    (_, fixture) => {
      const shape = parsed(fixture).shape;
      expect(isValidNodeShapeSvg(serializeNodeShapeSvg(shape))).toBe(true);
    },
  );

  it.each(DIRTY_FIXTURES.map((fixture, index) => [index, fixture]))(
    'round-trips dirty fixture %i: parse(serialize(parse(x))) equals parse(x)',
    (_, fixture) => {
      const shape = parsed(fixture).shape;
      const reparsed = parsed(serializeNodeShapeSvg(shape));
      expect(reparsed.issues).toEqual([]);
      expect(reparsed.shape).toEqual(shape);
    },
  );
});
