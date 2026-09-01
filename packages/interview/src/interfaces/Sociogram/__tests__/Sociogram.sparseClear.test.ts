import { describe, expect, it } from 'vitest';

import { applyEntityAttributePatch } from '../../../store/entityAttributePatch';
import { unplaceNodeAttributePatch } from '../Sociogram';

describe('Sociogram sparse clearing', () => {
  it('removes the layout key when a node is unplaced', () => {
    const result = applyEntityAttributePatch(
      { layout: { x: 0.2, y: 0.3 }, keep: true },
      undefined,
      unplaceNodeAttributePatch('layout'),
    );

    expect(result.attributes).toStrictEqual({ keep: true });
    expect(Object.hasOwn(result.attributes, 'layout')).toBe(false);
  });
});
