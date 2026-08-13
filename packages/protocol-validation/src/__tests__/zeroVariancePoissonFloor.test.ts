import { describe, expect, it } from 'vitest';

import ProtocolSchemaV8 from '../schemas/8/schema.ts';
import { createBaseProtocol } from '../utils/test-utils.ts';

type Loose = Record<string, unknown>;

const parse = (protocol: unknown) => ProtocolSchemaV8.safeParse(protocol);

const withNodeStageSynthetic = (synthetic: unknown) => {
  const protocol = createBaseProtocol();
  (protocol.stages[0] as Loose).synthetic = synthetic;
  return protocol;
};

describe('tmp-verify-26: zero-variance poisson count with unreachable floor', () => {
  it('baseline: rejects the identical zero-variance normal spelling', () => {
    // { mean: 0, sd: 0, min: 5 } — single-point support at 0, floor 5.
    const result = parse(
      withNodeStageSynthetic({
        count: { distribution: 'normal', mean: 0, sd: 0, min: 5 },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a poisson count with mean 0 and an unreachable floor', () => {
    // samplePoisson(0) returns 0 on every draw — single-point support at 0,
    // exactly like the zero-sd normal above. With min: 5 the sole draw is
    // clamped to 5 every time and the authored mean is discarded in silence,
    // which is the pathology requireReachableDegenerateMean exists to reject.
    const result = parse(
      withNodeStageSynthetic({
        count: { distribution: 'poisson', mean: 0, min: 5 },
      }),
    );
    expect(result.success).toBe(false);
  });
});
