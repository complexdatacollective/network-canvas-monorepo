import { describe, expect, it } from 'vitest';

import { resolveTimelineNavTarget } from '../timelineNavigation';

describe('resolveTimelineNavTarget', () => {
  it('collapses stage editor paths to the stage list', () => {
    expect(resolveTimelineNavTarget('/protocol/stage/stage-1')).toBe(
      '/protocol',
    );
    expect(resolveTimelineNavTarget('/protocol/stage/new')).toBe('/protocol');
  });

  it('returns non-stage paths unchanged', () => {
    expect(resolveTimelineNavTarget('/protocol/codebook')).toBe(
      '/protocol/codebook',
    );
    expect(resolveTimelineNavTarget('/protocol/assets')).toBe(
      '/protocol/assets',
    );
    expect(resolveTimelineNavTarget('/protocol')).toBe('/protocol');
    expect(resolveTimelineNavTarget('')).toBe('');
  });
});
