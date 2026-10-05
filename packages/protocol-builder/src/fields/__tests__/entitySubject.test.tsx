import { describe, expect, it } from 'vitest';

import { entitySubject } from '../EntityTypePickerField.tsx';

/**
 * The bridge between the two spellings of a stage's subject.
 *
 * The schema stores it as `{entity, type}` while the picker speaks bare type
 * ids, and the Fresco form store has no format/parse seam of its own — so the
 * picker's own module is the one place the two meet. Asked of the function
 * directly rather than through the radio group, because the group can only
 * ever hand over values it drew, which is exactly the set that leaves the
 * boundary's other answers untested.
 */
describe('turning a picked type into a stage subject', () => {
  /**
   * The two branches are written out rather than assembled from `entityType`,
   * because the union discriminates on `entity` and a computed discriminant is
   * only a subject after a cast — a cast that would go on compiling if the
   * discriminant were wrong. So each branch is exercised by name.
   */
  it('tags a node pick as a node and an edge pick as an edge', () => {
    expect(entitySubject('node', 'person')).toEqual({
      entity: 'node',
      type: 'person',
    });
    expect(entitySubject('edge', 'knows')).toEqual({
      entity: 'edge',
      type: 'knows',
    });
  });

  /**
   * A picker that hands back nothing leaves the stage with NO subject, never
   * with a subject whose type is empty. The schema has one spelling for absent
   * — the key is not there — and `{entity: 'node', type: ''}` is a configured
   * subject pointing at a type that does not exist, which every section
   * reading the subject would believe in: prompts would offer variables of it,
   * a filter would name it, and the save would be refused against a path
   * rather than at the control.
   */
  it.each([
    ['an empty string', ''],
    ['nothing at all', undefined],
  ])('answers with no subject at all when given %s', (_name, answer) => {
    expect(entitySubject('node', answer)).toBeUndefined();
    expect(entitySubject('edge', answer)).toBeUndefined();
  });
});
