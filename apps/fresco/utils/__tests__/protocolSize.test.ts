import { describe, expect, it } from 'vitest';

import { getProtocolSizeError } from '~/utils/protocolSize';

describe('getProtocolSizeError', () => {
  it('returns null for a file at the limit', () => {
    expect(getProtocolSizeError({ size: 256 * 1024 * 1024 })).toBeNull();
  });

  it('returns null for a small file', () => {
    expect(getProtocolSizeError({ size: 1024 })).toBeNull();
  });

  it('rejects a file just over the limit and rounds its size up', () => {
    const error = getProtocolSizeError({ size: 256 * 1024 * 1024 + 1 });
    // Math.ceil avoids displaying an over-limit file as exactly "256 MB".
    expect(error).toContain('257');
  });

  it('reports the size and phrases the limit inclusively, to match the <= check', () => {
    expect(getProtocolSizeError({ size: 300 * 1024 * 1024 })).toBe(
      'This protocol is 300 MB. Protocols must be 256 MB or smaller to import.',
    );
  });
});
