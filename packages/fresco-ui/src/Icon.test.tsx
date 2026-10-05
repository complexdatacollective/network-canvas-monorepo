import { describe, expect, it } from 'vitest';

import { isInterviewerIconName } from './Icon';

describe('isInterviewerIconName', () => {
  it('uses the exact custom and Lucide registries the renderer uses', () => {
    expect(isInterviewerIconName('add-a-person')).toBe(true);
    expect(isInterviewerIconName('Circle')).toBe(true);
    expect(isInterviewerIconName('not-a-rendered-icon')).toBe(false);
    expect(isInterviewerIconName('__proto__')).toBe(false);
  });
});
