import { describe, expect, it } from 'vitest';

import { hashProtocol } from '../../../utils/hashProtocol.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import { ExperimentsSchema } from '../common/experiments.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

const studyContext = {
  researchQuestions: ['How do people find support?'],
  population: 'Adults in two cities',
  administration: 'face_to_face',
};

describe('ExperimentsSchema', () => {
  it('accepts no experiments', () => {
    expect(ExperimentsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts the protocol review turned on without study details', () => {
    const result = ExperimentsSchema.safeParse({ protocolReview: {} });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ protocolReview: {} });
  });

  it('accepts any object content inside the protocol review', () => {
    for (const content of [
      { studyContext },
      { studyContext: { researchQuestions: [] } },
      { studyContext: 5 },
      { unknownInnerKey: [1, { a: null }] },
    ]) {
      const result = ExperimentsSchema.safeParse({ protocolReview: content });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ protocolReview: content });
    }
  });

  it('refuses an experiment it does not implement', () => {
    expect(ExperimentsSchema.safeParse({ somethingElse: {} }).success).toBe(
      false,
    );
  });

  it('refuses a protocol review that is not an object', () => {
    for (const value of [true, 'on', 5, null, [], [{}]]) {
      expect(
        ExperimentsSchema.safeParse({ protocolReview: value }).success,
      ).toBe(false);
    }
  });
});

describe('experiments in a whole protocol', () => {
  it('validates the protocol the tests start from', async () => {
    expect((await validateProtocol(completeProtocol())).success).toBe(true);
  });

  it('validates a protocol with the protocol review turned on', async () => {
    for (const protocolReview of [{}, { studyContext }, { studyContext: 5 }]) {
      const result = await validateProtocol({
        ...completeProtocol(),
        experiments: { protocolReview },
      });
      expect(result.success).toBe(true);
    }
  });

  it('refuses a protocol with an unknown experiment', async () => {
    const result = await validateProtocol({
      ...completeProtocol(),
      experiments: { unknownExperiment: {} },
    });
    expect(result.success).toBe(false);
  });

  it('does not let experiments change the protocol hash', () => {
    const base = completeProtocol();
    const withExperiment = {
      ...base,
      experiments: { protocolReview: { studyContext } },
    };
    expect(hashProtocol(withExperiment)).toBe(hashProtocol(base));
  });
});
