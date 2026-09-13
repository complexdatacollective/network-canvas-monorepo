// @vitest-environment node
// Nothing here renders; the subject is the contract's own input schema.
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { SubmitInputSchema } from '../schemas.ts';

const submit = (requestId: string) => ({
  protocolId: 'protocol-1',
  requestId,
  sectionId: sectionId({ kind: 'stage', stageId: 'information-1' }),
  document: { id: 'information-1', type: 'Information', label: 'A screen' },
  revision: { sequence: 1n, contentHash: 'hash-1' },
});

describe("a write's idempotency key", () => {
  it('is refused past the length a host can file it under', () => {
    // Studio files the key in `protocol_write_receipts`, whose own check is
    // `BETWEEN 1 AND 512`. A longer one has to be a bad request here rather
    // than a database error there.
    expect(SubmitInputSchema.safeParse(submit('k'.repeat(512))).success).toBe(
      true,
    );
    expect(SubmitInputSchema.safeParse(submit('k'.repeat(513))).success).toBe(
      false,
    );
  });
});
