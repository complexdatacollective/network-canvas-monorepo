import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CurrentProtocolSchema, validateProtocol } from '..';

// packages/protocols is a pure-data package with no test runner, so this test
// is co-located here (which already runs vitest) and reads the e2e fixture by
// relative path instead of adding a dependency for a static-file read.
const fixturePath = path.resolve(
  import.meta.dirname,
  '../../../protocols/e2e/all-interfaces/protocol.json',
);

const EXPECTED_STAGE_TYPE_COUNT = 19;

describe('all-interfaces e2e fixture', () => {
  it('is a valid schema-8 protocol', async () => {
    const raw = readFileSync(fixturePath, 'utf8');
    const result = await validateProtocol(JSON.parse(raw));
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(
      true,
    );
  });

  it(`covers all ${EXPECTED_STAGE_TYPE_COUNT} stage types`, () => {
    const raw = readFileSync(fixturePath, 'utf8');
    const protocol = CurrentProtocolSchema.parse(JSON.parse(raw));
    const types = new Set(protocol.stages.map((stage) => stage.type));
    expect(types.size).toBe(EXPECTED_STAGE_TYPE_COUNT);
  });
});
