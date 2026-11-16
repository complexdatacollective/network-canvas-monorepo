import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCacheTag, mockUpdateTag, mockRevalidateTag } = vi.hoisted(() => ({
  mockCacheTag: vi.fn(),
  mockUpdateTag: vi.fn(),
  mockRevalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheTag: mockCacheTag,
  updateTag: mockUpdateTag,
  revalidateTag: mockRevalidateTag,
}));

import { safeCacheTag, safeRevalidateTag, safeUpdateTag } from '../cache';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('safeUpdateTag', () => {
  it('calls updateTag once for a single tag and once per tag in an array', () => {
    safeUpdateTag('getInterviews');
    safeUpdateTag(['getInterviews-abc', 'getParticipants']);

    expect(mockUpdateTag.mock.calls).toEqual([
      ['getInterviews'],
      ['getInterviews-abc'],
      ['getParticipants'],
    ]);
  });
});

describe('safeRevalidateTag', () => {
  it('revalidates every tag with the max profile', () => {
    safeRevalidateTag('getInterviews');
    safeRevalidateTag(['getInterviews-abc', 'getParticipants']);

    expect(mockRevalidateTag.mock.calls).toEqual([
      ['getInterviews', 'max'],
      ['getInterviews-abc', 'max'],
      ['getParticipants', 'max'],
    ]);
  });
});

describe('safeCacheTag', () => {
  it('calls cacheTag once for a single tag and once per tag in an array', () => {
    safeCacheTag('getInterviews');
    safeCacheTag(['getInterviews-abc', 'getParticipants']);

    expect(mockCacheTag.mock.calls).toEqual([
      ['getInterviews'],
      ['getInterviews-abc'],
      ['getParticipants'],
    ]);
  });
});
