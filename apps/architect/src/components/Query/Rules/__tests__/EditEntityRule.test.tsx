import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The type picker reaches for the protocol store and the new-type dialog, and
// this suite is about the section's own copy, not the picker.
vi.mock('../../../sections/fields/EntitySelectField/EntitySelectField', () => ({
  EntitySelectControl: () => null,
}));

import EditEntityRule, { toEditValue } from '../EditEntityRule';

describe('toEditValue', () => {
  it('passes categorical array operands through so saved selections survive', () => {
    expect(toEditValue(['green', 'blue'])).toEqual(['green', 'blue']);
  });

  it('preserves scalar operands', () => {
    expect(toEditValue('exact')).toBe('exact');
    expect(toEditValue(7)).toBe(7);
    expect(toEditValue(true)).toBe(true);
    expect(toEditValue(false)).toBe(false);
  });

  it('keeps only primitive members of an array operand', () => {
    expect(toEditValue(['green', 3, { nested: true }, null])).toEqual([
      'green',
      3,
    ]);
  });

  it('falls back to an empty string for nullish operands', () => {
    expect(toEditValue(undefined)).toBe('');
    expect(toEditValue(null)).toBe('');
  });
});

const codebook = {
  node: {
    person: { name: 'Person', color: 'node-color-seq-1', variables: {} },
  },
  edge: {
    friend: { name: 'Friend', color: 'edge-color-seq-1', variables: {} },
  },
};

const renderRule = (entityType: 'node' | 'edge') =>
  render(
    <EditEntityRule
      rule={{ type: entityType, options: {} }}
      codebook={codebook}
      onChange={vi.fn()}
    />,
  );

/**
 * `rule.type` is the entity CLASS ('node'/'edge'), an internal token. It was
 * interpolated straight into the section heading and its summary sentence, so
 * the rule builder greeted every researcher with "node Type" and "Choose an
 * node type to base your rule on." (#1400).
 *
 * The heading and the summary are asserted per entity because the two branches
 * differ by more than capitalisation: the indefinite article changes, which is
 * why the sentences are written out whole rather than built from the token.
 */
describe('EditEntityRule copy', () => {
  it('names the node type section in prose, with the right article', () => {
    renderRule('node');

    expect(screen.getByText('Node Type')).toBeInTheDocument();
    expect(
      screen.getByText(/^Choose a node type to base your rule on\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('node Type')).toBeNull();
  });

  it('names the edge type section in prose, with the right article', () => {
    renderRule('edge');

    expect(screen.getByText('Edge Type')).toBeInTheDocument();
    expect(
      screen.getByText(/^Choose an edge type to base your rule on\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('edge Type')).toBeNull();
  });

  /**
   * A drift guard, not a claim about the Issues panel: rule-dialog fields live
   * outside the stage form store (`RuleField.tsx`), so no stage-form error is
   * ever keyed by this `type` path and the panel cannot currently harvest this
   * anchor. It exists so that if it ever is harvested, it says what the
   * researcher can see.
   */
  it.each([
    ['node', 'Node Type'],
    ['edge', 'Edge Type'],
  ] as const)(
    'gives the %s rule issue anchor the same name as its heading',
    (entityType, heading) => {
      const { container } = renderRule(entityType);

      expect(container.querySelector('#field_type')).toHaveAttribute(
        'data-name',
        heading,
      );
    },
  );
});
