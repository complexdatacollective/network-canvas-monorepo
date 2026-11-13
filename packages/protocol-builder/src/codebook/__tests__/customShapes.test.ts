import { describe, expect, it } from 'vitest';

import { isValidNodeShapeSvg } from '@codaco/protocol-validation';

import {
  customShapeNameIssues,
  customShapesIssue,
  customShapeUsage,
  defaultShapeIssue,
  importCustomShape,
  isNodeShapeReference,
  mappedShapesIssue,
  readCustomShapes,
  shapeNameFromFile,
} from '../customShapes.ts';

const HOME_SVG =
  '<svg viewBox="0 0 100 100"><path d="M10 50 L50 10 L90 50 V90 H10 Z" fill="var(--node-color, #e04f6d)"/><rect id="label-area" x="20" y="55" width="60" height="30" fill="#ffffff"/></svg>';

const messageId = (encoded: string | undefined) =>
  encoded === undefined
    ? undefined
    : /protocolBuilder\.[A-Za-z.]+/.exec(encoded)?.[0];

describe('isNodeShapeReference', () => {
  it('accepts the built-in shapes and custom references only', () => {
    expect(isNodeShapeReference('circle')).toBe(true);
    expect(isNodeShapeReference('custom:home_1')).toBe(true);
    expect(isNodeShapeReference('custom:')).toBe(false);
    expect(isNodeShapeReference('custom:has space')).toBe(false);
    expect(isNodeShapeReference('hexagon')).toBe(false);
    expect(isNodeShapeReference(undefined)).toBe(false);
  });
});

describe('readCustomShapes', () => {
  it('keeps well-formed shapes and drops anything else', () => {
    expect(
      readCustomShapes({
        home: { name: 'Home', svg: HOME_SVG },
        broken: { name: 'Broken' },
        other: 'nope',
      }),
    ).toEqual({ home: { name: 'Home', svg: HOME_SVG } });
    expect(readCustomShapes(undefined)).toBeUndefined();
  });
});

describe('customShapeUsage', () => {
  it('reports where each custom shape is used', () => {
    expect(
      customShapeUsage('custom:home', {
        map: [
          { value: 'a', shape: 'custom:home' },
          { value: 'b', shape: 'custom:school' },
          { value: 'c', shape: 'square' },
        ],
      }),
    ).toEqual({ home: 'defaultAndMapping', school: 'mapping' });
    expect(
      customShapeUsage('custom:home', {
        thresholds: [{ value: 3, shape: 'custom:place' }],
      }),
    ).toEqual({ home: 'default', place: 'mapping' });
    expect(customShapeUsage('circle', undefined)).toEqual({});
  });
});

describe('custom shape names', () => {
  it('refuses a blank name and a name shared ignoring case', () => {
    const issues = customShapeNameIssues({
      a: { name: 'Home', svg: HOME_SVG },
      b: { name: ' home ', svg: HOME_SVG },
      c: { name: '  ', svg: HOME_SVG },
      d: { name: 'School', svg: HOME_SVG },
    });
    expect(messageId(issues.a)).toBe('protocolBuilder.customShapes.nameTaken');
    expect(messageId(issues.b)).toBe('protocolBuilder.customShapes.nameTaken');
    expect(messageId(issues.c)).toBe(
      'protocolBuilder.customShapes.nameRequired',
    );
    expect(issues.d).toBeUndefined();
  });

  it('reports one refusal for the list only when a name is wrong', () => {
    expect(
      customShapesIssue({ a: { name: 'Home', svg: HOME_SVG } }),
    ).toBeUndefined();
    expect(customShapesIssue(undefined)).toBeUndefined();
    expect(
      messageId(customShapesIssue({ a: { name: '', svg: HOME_SVG } })),
    ).toBe('protocolBuilder.customShapes.namesIncomplete');
  });
});

describe('references to shapes the type lacks', () => {
  const shapes = { home: { name: 'Home', svg: HOME_SVG } };

  it('refuses a default shape that is gone', () => {
    expect(defaultShapeIssue('custom:home', shapes)).toBeUndefined();
    expect(defaultShapeIssue('square', undefined)).toBeUndefined();
    expect(messageId(defaultShapeIssue('custom:gone', shapes))).toBe(
      'protocolBuilder.customShapes.missingDefaultShape',
    );
    expect(messageId(defaultShapeIssue('custom:home', undefined))).toBe(
      'protocolBuilder.customShapes.missingDefaultShape',
    );
  });

  it('refuses a mapping row that names a shape that is gone', () => {
    expect(
      mappedShapesIssue(
        { map: [{ value: 'a', shape: 'custom:home' }] },
        shapes,
      ),
    ).toBeUndefined();
    expect(
      messageId(
        mappedShapesIssue(
          { thresholds: [{ value: 1, shape: 'custom:gone' }] },
          shapes,
        ),
      ),
    ).toBe('protocolBuilder.customShapes.missingMappedShape');
  });
});

describe('importCustomShape', () => {
  it('stores a clean file in its canonical form', () => {
    const result = importCustomShape('Home', 'home.svg', HOME_SVG);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.imported.shape.name).toBe('Home');
    expect(isValidNodeShapeSvg(result.imported.shape.svg)).toBe(true);
    expect(result.imported.removed).toEqual([]);
    expect(result.imported.centredLabel).toBe(false);
  });

  it('removes unsupported content, says what kind, and stores a valid shape', () => {
    const result = importCustomShape(
      'Risky',
      'risky.svg',
      '<svg viewBox="0 0 10 10"><script>alert(1)</script><style>.a{}</style><filter id="f"><feGaussianBlur/></filter><circle cx="5" cy="5" r="4" onclick="x()"/></svg>',
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.imported.removed).toEqual(['scripts', 'styles', 'filters']);
    expect(result.imported.centredLabel).toBe(true);
    expect(result.imported.shape.svg).not.toContain('script');
    expect(result.imported.shape.svg).not.toContain('onclick');
    expect(isValidNodeShapeSvg(result.imported.shape.svg)).toBe(true);
  });

  it('explains why a file cannot be used at all', () => {
    const failure = (source: string) => {
      const result = importCustomShape('x', 'x.svg', source);
      return result.success ? undefined : messageId(result.error);
    };
    expect(failure('not an image')).toBe('protocolBuilder.customShapes.notSvg');
    expect(failure('<svg><circle r="2"/></svg>')).toBe(
      'protocolBuilder.customShapes.noViewBox',
    );
    expect(failure('<svg viewBox="0 0 10 10"><script/></svg>')).toBe(
      'protocolBuilder.customShapes.nothingToDraw',
    );
    expect(
      failure(
        `<svg viewBox="0 0 10 10"><path d="${'M0 0 '.repeat(12_000)}"/></svg>`,
      ),
    ).toBe('protocolBuilder.customShapes.tooLarge');
  });
});

describe('shapeNameFromFile', () => {
  it('uses the file name without its extension, numbered when taken', () => {
    expect(shapeNameFromFile('home.svg', [])).toBe('home');
    expect(shapeNameFromFile('home.svg', ['Home'])).toBe('home 2');
    expect(shapeNameFromFile('home.svg', ['home', 'HOME 2'])).toBe('home 3');
  });
});
