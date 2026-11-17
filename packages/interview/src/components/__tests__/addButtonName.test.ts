import { describe, expect, it } from 'vitest';

import { addButtonName } from '../addButtonName';

describe('addButtonName', () => {
  it('names what the icon says it adds', () => {
    expect(addButtonName('add-a-person')).toBe('Add a person');
    expect(addButtonName('add-a-place')).toBe('Add a place');
    expect(addButtonName('add-a-relationship')).toBe('Add a relationship');
  });

  it('says only "Add" for an icon that does not name what it adds', () => {
    expect(addButtonName('user-plus')).toBe('Add');
    expect(addButtonName('add-a-')).toBe('Add');
  });
});
