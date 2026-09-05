import { describe, expect, it } from 'vitest';

import {
  resourceFailure,
  stagedSecretHandle,
  validateManifestEntry,
} from '../gateway.ts';

const SECRET_VALUE = 'pk.entry-secret-must-never-appear';

describe('validateManifestEntry', () => {
  it('accepts an entry the protocol schema accepts, parsed', () => {
    const result = validateManifestEntry('staged-image', {
      type: 'image',
      id: 'staged-image',
      name: 'Staged backdrop',
      source: 'staged-backdrop.png',
    });

    expect(result).toMatchObject({
      status: 'ok',
      data: { type: 'image', source: 'staged-backdrop.png' },
    });
  });

  it('refuses an entry the protocol schema rejects, naming the resource', () => {
    // A file the host holds but cannot name: the manifest records a `source`,
    // and promoting bytes behind an entry without one commits a resource the
    // protocol cannot resolve.
    const result = validateManifestEntry('staged-image', {
      type: 'image',
      id: 'staged-image',
      name: 'Pasted image',
    });

    expect(result).toMatchObject({
      status: 'failed',
      failure: { reason: 'invalid-content', resourceId: 'staged-image' },
    });
    expect(result.status === 'failed' && result.failure.message).toContain(
      'staged-image',
    );
    expect(result.status === 'failed' && result.failure.retryable).toBe(false);
  });

  it('reports the schema message without the entry, so a secret cannot leak', () => {
    const result = validateManifestEntry('staged-secret', {
      type: 'apikey',
      id: 'staged-secret',
      name: 'Map token',
      value: SECRET_VALUE,
      unexpected: 'a field the schema does not allow',
    });

    expect(result.status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain(SECRET_VALUE);
  });
});

describe('stagedSecretHandle', () => {
  it('brands a non-empty handle', () => {
    expect(String(stagedSecretHandle('staged-secret-1'))).toBe(
      'staged-secret-1',
    );
  });

  it('refuses an empty handle, which would name every staged secret at once', () => {
    expect(() => stagedSecretHandle('')).toThrow(/handle must be non-empty/);
  });
});

describe('resourceFailure', () => {
  it('carries the resource a failure concerns', () => {
    const result = resourceFailure('not-found', 'that resource is gone', {
      resourceId: 'staged-image',
    });

    expect(result).toEqual({
      status: 'failed',
      failure: {
        reason: 'not-found',
        message: 'that resource is gone',
        retryable: false,
        resourceId: 'staged-image',
      },
    });
  });

  it('leaves the resource key absent rather than undefined when there is none', () => {
    const result = resourceFailure('unavailable', 'the host is unreachable');

    expect(result.status === 'failed' && result.failure.retryable).toBe(true);
    expect(
      result.status === 'failed' && Object.hasOwn(result.failure, 'resourceId'),
    ).toBe(false);
  });

  it('takes an explicit retryable over the default for the reason', () => {
    const result = resourceFailure('unavailable', 'the host gave up', {
      retryable: false,
    });

    expect(result.status === 'failed' && result.failure.retryable).toBe(false);
  });
});
