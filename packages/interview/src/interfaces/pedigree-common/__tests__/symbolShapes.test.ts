import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type NodeDefinition,
} from '@codaco/protocol-validation';

import { testVariableId } from '../../../__tests__/testIds';
import type { Person } from '../../FamilyPedigree/model';
import {
  notationShapesOf,
  symbolOutlinesOf,
  symbolShapesOf,
} from '../symbolShapes';

const SEX_VAR = testVariableId('sex');

const WIDE =
  '<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>';
const TALL = '<svg viewBox="0 0 50 100"><rect width="50" height="100"/></svg>';

const definition: Pick<NodeDefinition, 'shape' | 'customShapes'> = {
  shape: {
    default: 'custom:wide',
    dynamic: {
      variable: asEntityAttributeReference(SEX_VAR),
      type: 'discrete',
      map: [
        { value: 'female', shape: 'circle' },
        { value: 'male', shape: 'square' },
        { value: 'intersex', shape: 'custom:tall' },
      ],
    },
  },
  customShapes: {
    wide: { name: 'Wide', asset: 'wide-asset' },
    tall: { name: 'Tall', asset: 'tall-asset' },
  },
};

const people: Pick<Person, 'id' | 'attributes'>[] = [
  { id: 'mother', attributes: { [SEX_VAR]: 'female' } },
  { id: 'father', attributes: { [SEX_VAR]: 'male' } },
  { id: 'child', attributes: { [SEX_VAR]: 'intersex' } },
  { id: 'cousin', attributes: {} },
];

const svgs = { 'wide-asset': WIDE, 'tall-asset': TALL };

describe('symbolShapesOf', () => {
  it('draws everyone as a circle without a person type', () => {
    expect([...symbolShapesOf(people, undefined, svgs).values()]).toEqual([
      'circle',
      'circle',
      'circle',
      'circle',
    ]);
  });

  it('gives each person the shape their attributes map to, custom drawings included', () => {
    expect(
      Object.fromEntries(symbolShapesOf(people, definition, svgs)),
    ).toEqual({
      mother: 'circle',
      father: 'square',
      child: { svg: TALL },
      cousin: { svg: WIDE },
    });
  });

  it('draws a custom shape as a circle until its drawing has loaded', () => {
    const shapes = symbolShapesOf(people, definition, { 'wide-asset': WIDE });
    expect(shapes.get('child')).toBe('circle');
    expect(shapes.get('cousin')).toEqual({ svg: WIDE });
  });
});

describe('symbolOutlinesOf', () => {
  it('keeps the built-in shapes and gives a custom drawing the box its viewBox fills in the square symbol', () => {
    const outlines = symbolOutlinesOf(symbolShapesOf(people, definition, svgs));
    expect(Object.fromEntries(outlines)).toEqual({
      mother: 'circle',
      father: 'square',
      child: { width: 0.5, height: 1 },
      cousin: { width: 1, height: 0.5 },
    });
  });

  it('gives a drawing that cannot be read the circle it is drawn as', () => {
    const outlines = symbolOutlinesOf(
      new Map([['a', { svg: 'not a drawing' }]]),
    );
    expect(outlines.get('a')).toBe('circle');
  });
});

describe('notationShapesOf', () => {
  it('keeps the built-in shapes and gives a custom drawing the circle', () => {
    const shapes = notationShapesOf(symbolShapesOf(people, definition, svgs));
    expect(Object.fromEntries(shapes)).toEqual({
      mother: 'circle',
      father: 'square',
      child: 'circle',
      cousin: 'circle',
    });
  });
});
