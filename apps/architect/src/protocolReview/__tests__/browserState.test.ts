import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_REVIEW_INSTALLATION_ID_KEY,
  PROTOCOL_REVIEW_PROVIDER_KEY,
  PROTOCOL_REVIEW_QUOTA_KEY,
} from '~/utils/storageNames';

import {
  effectiveQuota,
  getReviewInstallationId,
  readStoredProvider,
  readStoredQuota,
  writeStoredProvider,
  writeStoredQuota,
} from '../browserState';

const ANALYTICS_ID_KEY = 'network-canvas-architect-installation-id';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('installation id', () => {
  it('mints a random UUID once and keeps it', () => {
    const id = getReviewInstallationId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(getReviewInstallationId()).toBe(id);
    expect(localStorage.getItem(PROTOCOL_REVIEW_INSTALLATION_ID_KEY)).toBe(id);
  });

  it('is never the analytics installation id', () => {
    localStorage.setItem(
      ANALYTICS_ID_KEY,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(getReviewInstallationId()).not.toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('still answers, for the session, when localStorage refuses', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const id = getReviewInstallationId();
    expect(getReviewInstallationId()).toBe(id);
  });
});

describe('quota', () => {
  const quota = {
    limit: 5,
    remaining: 0,
    resetsAt: '2026-11-11T12:00:00.000Z',
  };

  it('is remembered per browser', () => {
    expect(readStoredQuota()).toBeNull();
    writeStoredQuota(quota);
    expect(readStoredQuota()).toEqual(quota);
  });

  it('ignores a stored value that is not a quota', () => {
    localStorage.setItem(PROTOCOL_REVIEW_QUOTA_KEY, '{"limit":"many"}');
    expect(readStoredQuota()).toBeNull();
    localStorage.setItem(PROTOCOL_REVIEW_QUOTA_KEY, 'not json');
    expect(readStoredQuota()).toBeNull();
  });

  it('reads as full once its reset has passed', () => {
    const before = Date.parse(quota.resetsAt) - 1;
    expect(effectiveQuota(quota, before)).toEqual(quota);
    expect(effectiveQuota(quota, Date.parse(quota.resetsAt))).toEqual({
      ...quota,
      remaining: 5,
    });
    expect(effectiveQuota(null, before)).toBeNull();
  });
});

describe('provider', () => {
  it('is Anthropic until this browser chooses, and remembered once it has', () => {
    expect(readStoredProvider()).toBe('anthropic');
    writeStoredProvider('openai');
    expect(localStorage.getItem(PROTOCOL_REVIEW_PROVIDER_KEY)).toBe('openai');
    expect(readStoredProvider()).toBe('openai');
  });

  it('ignores a stored value that is not a provider', () => {
    localStorage.setItem(PROTOCOL_REVIEW_PROVIDER_KEY, 'someone-else');
    expect(readStoredProvider()).toBe('anthropic');
  });

  it('still answers when localStorage refuses', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => writeStoredProvider('openai')).not.toThrow();
    expect(readStoredProvider()).toBe('anthropic');
  });
});
