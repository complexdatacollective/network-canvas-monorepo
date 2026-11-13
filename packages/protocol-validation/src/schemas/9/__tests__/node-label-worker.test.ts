import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import { NODE_LABEL_WORKER_MAX_LENGTH } from '../node-label-worker.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

const withWorker = (nodeLabelWorker: string) =>
  withFinishStage({ ...createBaseProtocol(), nodeLabelWorker });

describe('node label worker', () => {
  it('is optional', () => {
    expect(
      ProtocolSchemaV9.safeParse(withFinishStage(createBaseProtocol())).success,
    ).toBe(true);
  });

  it('accepts a source', () => {
    const result = ProtocolSchemaV9.safeParse(
      withWorker('function nodeLabelWorker({ node }) { return node.name; }'),
    );
    expect(result.success).toBe(true);
    expect(result.data?.nodeLabelWorker).toContain('nodeLabelWorker');
  });

  it.each(['', '   \n\t'])('refuses a blank source (%j)', (source) => {
    const result = ProtocolSchemaV9.safeParse(withWorker(source));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['nodeLabelWorker']);
  });

  it('refuses a source over the size limit', () => {
    const atLimit = '/'.repeat(NODE_LABEL_WORKER_MAX_LENGTH);
    expect(ProtocolSchemaV9.safeParse(withWorker(atLimit)).success).toBe(true);
    expect(ProtocolSchemaV9.safeParse(withWorker(`${atLimit}/`)).success).toBe(
      false,
    );
  });
});
