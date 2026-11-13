import type { NodeDefinition } from '@codaco/protocol-validation';

import { resolveNodeShape } from '../../selectors/session';
import type { Person } from '../FamilyPedigree/model';
import type { PedigreeSymbolShape } from '../FamilyPedigree/pedigree-layout/types';

/**
 * The shape each person's symbol is drawn with, by person id, as the
 * codebook's person type sets it (a circle without one). A pedigree draws
 * each symbol, and lays out the lines that meet it, from this one map, so
 * the lines meet the edge of the symbol actually drawn: a line into a square
 * ends on its flat top. A custom (researcher-drawn) shape is not a pedigree
 * symbol, so its person is drawn as a circle.
 */
export function symbolShapesOf(
  people: readonly Pick<Person, 'id' | 'attributes'>[],
  shapeDefinition: NodeDefinition['shape'] | undefined,
): Map<string, PedigreeSymbolShape> {
  return new Map(
    people.map((person) => {
      const shape = shapeDefinition
        ? resolveNodeShape({ shape: shapeDefinition }, person.attributes)
        : 'circle';
      return [person.id, typeof shape === 'string' ? shape : 'circle'];
    }),
  );
}
