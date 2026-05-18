import { describe, expect, it } from 'vitest';

import { isPreviewMessage } from '../messages';

describe('isPreviewMessage', () => {
  it('accepts a preview:ready message', () => {
    expect(isPreviewMessage({ type: 'preview:ready' })).toBe(true);
  });

  it('accepts a preview:payload message', () => {
    expect(
      isPreviewMessage({
        type: 'preview:payload',
        protocol: {},
        startStage: 0,
        useSyntheticData: true,
      }),
    ).toBe(true);
  });

  it('rejects unknown shapes', () => {
    expect(isPreviewMessage(null)).toBe(false);
    expect(isPreviewMessage(undefined)).toBe(false);
    expect(isPreviewMessage('preview:ready')).toBe(false);
    expect(isPreviewMessage({ type: 'other' })).toBe(false);
    expect(isPreviewMessage({})).toBe(false);
  });
});
