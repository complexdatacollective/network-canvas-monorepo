import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SubjectSelectField from '../SubjectSelectField.tsx';

/**
 * The picker the field wraps, replaced by something that hands its `onChange`
 * straight back.
 *
 * The unit under test is the BRIDGE — the schema stores a subject as
 * `{entity, type}` while a picker speaks bare type ids, and the Fresco form
 * store has no format/parse seam of its own, so this field is the one place
 * the two meet. Driving the real radio group would only ever send values the
 * real radio group can produce, which is exactly the set that leaves the
 * boundary's other answers untested.
 */
const bridged = vi.hoisted(() => ({
  onChange: undefined as ((next: string | undefined) => void) | undefined,
}));

vi.mock('../EntitySelectField.tsx', () => ({
  EntitySelectControl: (props: {
    onChange?: (next: string | undefined) => void;
  }) => {
    bridged.onChange = props.onChange;
    return null;
  },
}));

const pick = (
  entityType: 'node' | 'edge',
  answer: string | undefined,
): unknown => {
  const onChange = vi.fn();
  render(<SubjectSelectField entityType={entityType} onChange={onChange} />);
  bridged.onChange?.(answer);
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0]?.[0];
};

describe('turning a picked type into a stage subject', () => {
  /**
   * The two branches are written out rather than assembled from `entityType`,
   * because the union discriminates on `entity` and a computed discriminant is
   * only a subject after a cast — a cast that would go on compiling if the
   * discriminant were wrong. So each branch is exercised by name.
   */
  it('tags a node pick as a node and an edge pick as an edge', () => {
    expect(pick('node', 'person')).toEqual({ entity: 'node', type: 'person' });
    expect(pick('edge', 'knows')).toEqual({ entity: 'edge', type: 'knows' });
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
    expect(pick('node', answer)).toBeUndefined();
    expect(pick('edge', answer)).toBeUndefined();
  });
});
