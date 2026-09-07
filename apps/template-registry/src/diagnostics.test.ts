import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { logRegistryDiagnostic } from './diagnostics.ts';

it('writes only fixed codes, timestamps, and valid request UUIDs', () => {
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const requestId = randomUUID();
  try {
    logRegistryDiagnostic('REGISTRY_REQUEST_FAILED', requestId);
    logRegistryDiagnostic(
      'REGISTRY_REQUEST_FAILED',
      'secret-user-address@example.test',
    );
    expect(write).toHaveBeenCalledTimes(2);
    const [first, second] = write.mock.calls;
    if (typeof first?.[0] !== 'string' || typeof second?.[0] !== 'string')
      throw new Error('Expected structured diagnostic records');
    expect(JSON.parse(first[0])).toEqual({
      timestamp: expect.any(String),
      code: 'REGISTRY_REQUEST_FAILED',
      request_id: requestId,
    });
    expect(JSON.parse(second[0])).toEqual({
      timestamp: expect.any(String),
      code: 'REGISTRY_REQUEST_FAILED',
    });
    expect(second[0]).not.toContain('secret-user-address');
  } finally {
    write.mockRestore();
  }
});
