import { describe, expect, expectTypeOf, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import {
  getCustomShapeId,
  isCustomShapeReference,
  type NodeDefinition,
  type NodeShape,
  type NodeShapeReference,
  resolveNodeShapeReference,
} from '../codebook/definitions.ts';
import { asEntityAttributeReference } from '../entity-attribute-reference.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

const ASSET_MANIFEST = {
  'home-image': { type: 'image', name: 'home.svg', source: 'home-image.svg' },
  'tree-image': { type: 'image', name: 'tree.svg', source: 'tree-image.svg' },
  'roster-data': {
    type: 'network',
    name: 'roster.csv',
    source: 'roster-data.csv',
  },
};

const withPerson = (
  customShapes: unknown,
  shape: NodeDefinition['shape'] = { default: 'circle' },
) => {
  const protocol = createBaseProtocol();
  return withFinishStage({
    ...protocol,
    assetManifest: ASSET_MANIFEST,
    codebook: {
      ...protocol.codebook,
      node: {
        ...protocol.codebook.node,
        person: { ...protocol.codebook.node.person, customShapes, shape },
      },
    },
  });
};

const SHAPES = {
  home: { name: 'Home', asset: 'home-image' },
  tree_1: { name: 'Tree', asset: 'tree-image' },
};

const issuesFor = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success ? [] : result.error.issues;
};

describe('custom node shape references', () => {
  it('infers built-in names or custom:<id>', () => {
    expectTypeOf<NodeShapeReference>().toEqualTypeOf<
      NodeShape | `custom:${string}`
    >();
  });

  it('identifies custom references and extracts their id', () => {
    expect(isCustomShapeReference('custom:home')).toBe(true);
    expect(isCustomShapeReference('circle')).toBe(false);
    expect(getCustomShapeId('custom:tree_1')).toBe('tree_1');
  });
});

describe('custom node shapes in the schema', () => {
  it('still accepts a node type without customShapes', () => {
    const protocol = withFinishStage(createBaseProtocol());
    expect(issuesFor(protocol)).toEqual([]);
  });

  it('accepts custom shapes used as default, in a discrete map and in thresholds', () => {
    const discrete = withPerson(SHAPES, {
      default: 'custom:home',
      dynamic: {
        variable: asEntityAttributeReference('category'),
        type: 'discrete',
        map: [
          { value: 'friend', shape: 'custom:tree_1' },
          { value: 'family', shape: 'square' },
        ],
      },
    });
    expect(issuesFor(discrete)).toEqual([]);

    const breakpoints = withPerson(SHAPES, {
      default: 'diamond',
      dynamic: {
        variable: asEntityAttributeReference('age'),
        type: 'breakpoints',
        thresholds: [
          { value: 20, shape: 'custom:home' },
          { value: 40, shape: 'custom:tree_1' },
        ],
      },
    });
    expect(issuesFor(breakpoints)).toEqual([]);
  });

  it.each([
    [
      'the default',
      { default: 'custom:missing' },
      ['codebook', 'node', 'person', 'shape', 'default'],
    ],
    [
      'a discrete map entry',
      {
        default: 'circle',
        dynamic: {
          variable: asEntityAttributeReference('category'),
          type: 'discrete',
          map: [
            { value: 'friend', shape: 'custom:home' },
            { value: 'family', shape: 'custom:missing' },
          ],
        },
      },
      ['codebook', 'node', 'person', 'shape', 'dynamic', 'map', 1, 'shape'],
    ],
    [
      'a threshold',
      {
        default: 'circle',
        dynamic: {
          variable: asEntityAttributeReference('age'),
          type: 'breakpoints',
          thresholds: [{ value: 20, shape: 'custom:missing' }],
        },
      },
      [
        'codebook',
        'node',
        'person',
        'shape',
        'dynamic',
        'thresholds',
        0,
        'shape',
      ],
    ],
  ] satisfies [string, NodeDefinition['shape'], (string | number)[]][])(
    'rejects a dangling custom reference in %s',
    (_, shape, path) => {
      const issues = issuesFor(withPerson(SHAPES, shape));
      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(path);
      expect(issues[0]?.message).toBe(
        'Shape "custom:missing" refers to a custom shape "missing" that node type "Person" does not define',
      );
    },
  );

  it('rejects a custom reference when the node type has no customShapes', () => {
    const protocol = createBaseProtocol();
    protocol.codebook.node.person.shape = { default: 'custom:home' };
    const issues = issuesFor(withFinishStage(protocol));
    expect(issues.map((issue) => issue.path)).toEqual([
      ['codebook', 'node', 'person', 'shape', 'default'],
    ]);
  });

  it('does not resolve a reference against another node type', () => {
    const protocol = createBaseProtocol();
    const shared = withFinishStage({
      ...protocol,
      assetManifest: ASSET_MANIFEST,
      codebook: {
        ...protocol.codebook,
        node: {
          ...protocol.codebook.node,
          colleague: {
            ...protocol.codebook.node.colleague,
            customShapes: SHAPES,
          },
          person: {
            ...protocol.codebook.node.person,
            shape: { default: 'custom:home' },
          },
        },
      },
    });
    expect(issuesFor(shared).map((issue) => issue.path)).toEqual([
      ['codebook', 'node', 'person', 'shape', 'default'],
    ]);
  });

  it.each(['custom:', 'custom:has space', 'custom:a:b', 'hexagon'])(
    'rejects the malformed shape reference %j',
    (reference) => {
      const protocol = withPerson(SHAPES);
      const malformed = {
        ...protocol,
        codebook: {
          ...protocol.codebook,
          node: {
            ...protocol.codebook.node,
            person: {
              ...protocol.codebook.node.person,
              shape: { default: reference },
            },
          },
        },
      };
      expect(issuesFor(malformed).map((issue) => issue.path)).toEqual([
        ['codebook', 'node', 'person', 'shape', 'default'],
      ]);
    },
  );

  it('rejects a custom shape whose asset is not in the manifest', () => {
    const issues = issuesFor(
      withPerson({ home: { name: 'Home', asset: 'missing-image' } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual([
      'codebook',
      'node',
      'person',
      'customShapes',
      'home',
      'asset',
    ]);
    expect(issues[0]?.message).toBe(
      'Custom shape "Home" uses the image "missing-image", which is not an asset in the manifest.',
    );
  });

  it('rejects a custom shape whose asset is not an image', () => {
    const issues = issuesFor(
      withPerson({ home: { name: 'Home', asset: 'roster-data' } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual([
      'codebook',
      'node',
      'person',
      'customShapes',
      'home',
      'asset',
    ]);
    expect(issues[0]?.message).toBe(
      `Custom shape "Home" must use an 'image' asset, but "roster-data" is of type "network".`,
    );
  });

  it('rejects a custom shape with an empty asset id', () => {
    const issues = issuesFor(withPerson({ home: { name: 'Home', asset: '' } }));
    expect(issues.map((issue) => issue.path)).toContainEqual([
      'codebook',
      'node',
      'person',
      'customShapes',
      'home',
      'asset',
    ]);
  });

  it.each(['has space', 'dot.id', '', 'custom:home'])(
    'rejects the shape id %j',
    (id) => {
      const issues = issuesFor(withPerson({ [id]: SHAPES.home }));
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.path.slice(0, 5)).toEqual([
        'codebook',
        'node',
        'person',
        'customShapes',
        id,
      ]);
    },
  );

  it.each([
    ['exact', 'Home', 'Home'],
    ['case-insensitive', 'Home', 'HOME'],
    ['trimmed', 'Home', ' home '],
  ])('rejects %s duplicate shape names', (_, first, second) => {
    const issues = issuesFor(
      withPerson({
        a: { name: first, asset: 'home-image' },
        b: { name: second, asset: 'tree-image' },
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual([
      'codebook',
      'node',
      'person',
      'customShapes',
      'b',
      'name',
    ]);
  });

  it('allows the same shape name on different node types', () => {
    const protocol = createBaseProtocol();
    const shared = withFinishStage({
      ...protocol,
      assetManifest: ASSET_MANIFEST,
      codebook: {
        ...protocol.codebook,
        node: {
          colleague: {
            ...protocol.codebook.node.colleague,
            customShapes: SHAPES,
          },
          person: { ...protocol.codebook.node.person, customShapes: SHAPES },
        },
      },
    });
    expect(issuesFor(shared)).toEqual([]);
  });

  it.each(['', '   '])('rejects the blank shape name %j', (name) => {
    const issues = issuesFor(
      withPerson({ home: { name, asset: 'home-image' } }),
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      ['codebook', 'node', 'person', 'customShapes', 'home', 'name'],
    ]);
  });

  it('rejects unknown keys on a custom shape', () => {
    const issues = issuesFor(
      withPerson({ home: { ...SHAPES.home, color: 'red' } }),
    );
    expect(issues).toHaveLength(1);
  });
});

describe('resolveNodeShapeReference', () => {
  const houseSvg =
    '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  const customShapes = { home: { name: 'Home', asset: 'home-image' } };
  const shapeSvgs = { 'home-image': houseSvg };

  it('passes built-in shapes through', () => {
    expect(resolveNodeShapeReference('diamond', customShapes, shapeSvgs)).toBe(
      'diamond',
    );
    expect(
      resolveNodeShapeReference(undefined, customShapes, shapeSvgs),
    ).toBeUndefined();
  });

  it("resolves a custom reference to its asset's svg", () => {
    expect(
      resolveNodeShapeReference('custom:home', customShapes, shapeSvgs),
    ).toEqual({ svg: houseSvg });
  });

  it('falls back to a circle for a reference the node type does not define', () => {
    expect(
      resolveNodeShapeReference('custom:gone', customShapes, shapeSvgs),
    ).toBe('circle');
    expect(resolveNodeShapeReference('custom:home', undefined, shapeSvgs)).toBe(
      'circle',
    );
  });

  it('falls back to a circle when the svg of the asset is not loaded', () => {
    expect(resolveNodeShapeReference('custom:home', customShapes, {})).toBe(
      'circle',
    );
  });

  it('falls back to a circle for an id that only exists on the prototype', () => {
    expect(resolveNodeShapeReference('custom:constructor', {}, {})).toBe(
      'circle',
    );
    expect(resolveNodeShapeReference('custom:__proto__', {}, {})).toBe(
      'circle',
    );
  });

  it('falls back to a circle for an asset id that only exists on the prototype', () => {
    expect(
      resolveNodeShapeReference(
        'custom:home',
        { home: { asset: 'constructor' } },
        {},
      ),
    ).toBe('circle');
  });
});
