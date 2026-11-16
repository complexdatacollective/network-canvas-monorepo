import { describe, expect, it } from 'vitest';

import {
  customShapeForAsset,
  customShapeNameIssues,
  customShapesIssue,
  customShapeUsage,
  defaultShapeIssue,
  isNodeShapeReference,
  mappedShapesIssue,
  readCustomShapes,
  shapeNameFromFile,
} from '../customShapes.ts';

const HOME_ASSET = 'home-asset';

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
        home: { name: 'Home', asset: HOME_ASSET },
        broken: { name: 'Broken' },
        other: 'nope',
      }),
    ).toEqual({ home: { name: 'Home', asset: HOME_ASSET } });
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
      a: { name: 'Home', asset: HOME_ASSET },
      b: { name: ' home ', asset: HOME_ASSET },
      c: { name: '  ', asset: HOME_ASSET },
      d: { name: 'School', asset: HOME_ASSET },
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
      customShapesIssue({ a: { name: 'Home', asset: HOME_ASSET } }),
    ).toBeUndefined();
    expect(customShapesIssue(undefined)).toBeUndefined();
    expect(
      messageId(customShapesIssue({ a: { name: '', asset: HOME_ASSET } })),
    ).toBe('protocolBuilder.customShapes.namesIncomplete');
  });
});

describe('references to shapes the type lacks', () => {
  const shapes = { home: { name: 'Home', asset: HOME_ASSET } };

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

describe('customShapeForAsset', () => {
  it('finds the shape already drawn with an image', () => {
    const shapes = {
      home: { name: 'Home', asset: 'home-asset' },
      school: { name: 'School', asset: 'school-asset' },
    };
    expect(customShapeForAsset(shapes, 'school-asset')).toBe('school');
    expect(customShapeForAsset(shapes, 'other-asset')).toBeUndefined();
    expect(customShapeForAsset(undefined, 'home-asset')).toBeUndefined();
  });
});

describe('shapeNameFromFile', () => {
  it('uses the file name without its extension, numbered when taken', () => {
    expect(shapeNameFromFile('home.svg', [])).toBe('home');
    expect(shapeNameFromFile('home.svg', ['Home'])).toBe('home 2');
    expect(shapeNameFromFile('home.svg', ['home', 'HOME 2'])).toBe('home 3');
  });
});
