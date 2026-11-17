import { describe, expect, it } from 'vitest';

import { parseStoredProtocol } from '../storedProtocol';

const row = (experiments: unknown) => ({
  stages: [],
  codebook: {},
  localization: { defaultLocale: 'en', locales: ['en'] },
  interfaceText: null,
  experiments,
});

describe('parseStoredProtocol experiments', () => {
  it('reads a protocol that turned no experiment on', () => {
    const result = parseStoredProtocol(row(null));
    expect(result.success).toBe(true);
    expect(result.data?.experiments).toEqual({});
  });

  it('keeps the protocol review experiment and its study details', () => {
    const studyContext = {
      researchQuestions: ['Q?'],
      population: 'Adults',
      administration: 'face_to_face',
    };
    const result = parseStoredProtocol(
      row({ protocolReview: { studyContext } }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.experiments).toEqual({
      protocolReview: { studyContext },
    });
  });

  it('reads protocol review content of any shape, which the app interprets', () => {
    const result = parseStoredProtocol(
      row({ protocolReview: { studyContext: { questions: 'x' } } }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.experiments).toEqual({
      protocolReview: { studyContext: { questions: 'x' } },
    });
  });

  it('refuses an experiment this version does not implement', () => {
    expect(parseStoredProtocol(row({ other: {} })).success).toBe(false);
  });
});
