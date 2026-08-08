import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { isNodePressed } from '../ComposerCanvas';

const GROUP_VAR = 'affiliation';

const node = (attributes: Record<string, unknown> = {}): NcNode =>
  ({
    [entityPrimaryKeyProperty]: 'n1',
    type: 'person',
    [entityAttributesProperty]: attributes,
  }) as unknown as NcNode;

const noState = { selected: false, linking: false };

describe('isNodePressed', () => {
  it('follows selection under the select tool', () => {
    expect(isNodePressed(node(), { kind: 'select' }, noState)).toBe(false);
    expect(
      isNodePressed(node(), { kind: 'select' }, { ...noState, selected: true }),
    ).toBe(true);
  });

  it('follows the pending edge source under the edge tool', () => {
    const tool = { kind: 'edge' as const, edgeType: 'knows' };
    expect(isNodePressed(node(), tool, noState)).toBe(false);
    expect(isNodePressed(node(), tool, { ...noState, linking: true })).toBe(
      true,
    );
  });

  it('follows group membership under the group tool, not selection', () => {
    const tool = { kind: 'group' as const, variable: GROUP_VAR, value: 'work' };

    // The group tool toggles membership without ever selecting the node, so
    // selection is the wrong thing to report in this mode.
    expect(isNodePressed(node({ [GROUP_VAR]: ['work'] }), tool, noState)).toBe(
      true,
    );
    expect(
      isNodePressed(node({ [GROUP_VAR]: ['family'] }), tool, {
        ...noState,
        selected: true,
      }),
    ).toBe(false);
  });

  it('reads membership stored as a scalar, a list, or nothing at all', () => {
    const tool = { kind: 'group' as const, variable: GROUP_VAR, value: 'work' };

    expect(isNodePressed(node({ [GROUP_VAR]: 'work' }), tool, noState)).toBe(
      true,
    );
    expect(
      isNodePressed(node({ [GROUP_VAR]: ['family', 'work'] }), tool, noState),
    ).toBe(true);
    expect(isNodePressed(node({ [GROUP_VAR]: null }), tool, noState)).toBe(
      false,
    );
    expect(isNodePressed(node(), tool, noState)).toBe(false);
  });

  it('says nothing at all for a tool that makes nodes no kind of toggle', () => {
    expect(isNodePressed(node(), { kind: 'addNode' }, noState)).toBeUndefined();
  });
});
