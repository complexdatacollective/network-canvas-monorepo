import { beforeEach, describe, expect, it } from 'vitest';

import {
  readCachedNotes,
  selectLatestForApp,
  writeCachedNotes,
} from '../releaseNotes';

describe('selectLatestForApp', () => {
  it('returns the newest release whose tag matches the app prefix', () => {
    const releases = [
      { tag_name: '@codaco/interviewer@8.0.0-beta.2', body: 'iv' },
      { tag_name: '@codaco/architect@8.0.0-beta.4', body: 'newest arch' },
      { tag_name: '@codaco/architect@8.0.0-beta.3', body: 'older arch' },
    ];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '8.0.0-beta.4',
      body: 'newest arch',
    });
  });

  it('returns null when no tag matches the app', () => {
    const releases = [
      { tag_name: '@codaco/interviewer@8.0.0-beta.2', body: 'iv' },
    ];
    expect(selectLatestForApp('architect', releases)).toBeNull();
  });

  it('coerces a null body to an empty string', () => {
    const releases = [{ tag_name: '@codaco/architect@1.0.0', body: null }];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '1.0.0',
      body: '',
    });
  });
});

describe('notes cache', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips notes through localStorage', () => {
    writeCachedNotes('interviewer', { version: '9.9.9', body: '# hi' });
    expect(readCachedNotes('interviewer')).toEqual({
      version: '9.9.9',
      body: '# hi',
    });
  });

  it('returns null when nothing is cached', () => {
    expect(readCachedNotes('architect')).toBeNull();
  });
});
