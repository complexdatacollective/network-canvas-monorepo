import { describe, expect, it } from 'vitest';

import { applyEntityAttributePatch } from '../../../store/entityAttributePatch';
import { locationValueToAttributePatch } from '../Geospatial';

describe('Geospatial sparse clearing', () => {
  it('removes the location key on deselection', () => {
    const result = applyEntityAttributePatch(
      { location: 'POINT (1 2)', keep: true },
      undefined,
      locationValueToAttributePatch('location', null),
    );

    expect(result.attributes).toStrictEqual({ keep: true });
    expect(Object.hasOwn(result.attributes, 'location')).toBe(false);
  });
});
