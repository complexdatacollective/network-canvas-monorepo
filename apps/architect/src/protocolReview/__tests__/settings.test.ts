import { describe, expect, it } from 'vitest';

import {
  STUDY_CONTEXT_LIMITS,
  type StudyContext,
  StudyContextSchema,
} from '@codaco/shared-consts';

import {
  completeStudyContext,
  parseProtocolReviewSettings,
  serializeProtocolReviewSettings,
} from '../settings';

const EMPTY = {
  researchQuestions: [],
  population: '',
  administration: null,
  synopsis: '',
};

const studyContext: StudyContext = {
  researchQuestions: ['How do students find support?', 'Who helps most?'],
  population: 'First-year students',
  administration: 'face_to_face',
  synopsis: 'A two-wave study.',
};

const parse = (studyContextValue: unknown) =>
  parseProtocolReviewSettings({ studyContext: studyContextValue }).studyDetails;

describe('parseProtocolReviewSettings', () => {
  it('reads a complete study context as it is', () => {
    expect(parse(studyContext)).toEqual(studyContext);
  });

  it('salvages each field on its own', () => {
    expect(parse({ ...studyContext, researchQuestions: 'one' })).toEqual({
      ...studyContext,
      researchQuestions: [],
    });
    expect(parse({ ...studyContext, researchQuestions: ['ok', 3] })).toEqual({
      ...studyContext,
      researchQuestions: [],
    });
    expect(parse({ ...studyContext, population: 7 })).toEqual({
      ...studyContext,
      population: '',
    });
    expect(parse({ ...studyContext, administration: 'by_post' })).toEqual({
      ...studyContext,
      administration: null,
    });
    expect(parse({ ...studyContext, synopsis: ['x'] })).toEqual({
      ...studyContext,
      synopsis: '',
    });
  });

  it('drops text over its limit and keeps the rest', () => {
    expect(
      parse({
        ...studyContext,
        population: 'x'.repeat(STUDY_CONTEXT_LIMITS.population + 1),
        synopsis: 'y'.repeat(STUDY_CONTEXT_LIMITS.synopsis + 1),
        researchQuestions: [
          'q'.repeat(STUDY_CONTEXT_LIMITS.researchQuestion + 1),
        ],
      }),
    ).toEqual({
      ...studyContext,
      population: '',
      synopsis: '',
      researchQuestions: [],
    });
  });

  it('fills in fields that are missing', () => {
    expect(parse({ population: 'Adults' })).toEqual({
      ...EMPTY,
      population: 'Adults',
    });
  });

  it('gives the empty draft for a wholly wrong shape', () => {
    for (const raw of [
      null,
      undefined,
      'text',
      7,
      [],
      {},
      { studyContext: 5 },
      { studyContext: null },
      { studyContext: [studyContext] },
      { studyContext: { questions: 'x' } },
    ]) {
      expect(parseProtocolReviewSettings(raw)).toEqual({ studyDetails: EMPTY });
    }
  });

  it('ignores unknown keys at both levels', () => {
    const result = parseProtocolReviewSettings({
      other: 1,
      studyContext: { ...studyContext, extra: true },
    });
    expect(result).toEqual({ studyDetails: studyContext });
    expect(result.studyDetails).not.toHaveProperty('extra');
  });

  it('round trips through serialize', () => {
    const stored = serializeProtocolReviewSettings(studyContext);
    expect(stored).toEqual({ studyContext });
    expect(parseProtocolReviewSettings(stored).studyDetails).toEqual(
      studyContext,
    );
  });
});

describe('completeStudyContext', () => {
  const draft = {
    researchQuestions: ['Q?'],
    population: 'Adults',
    administration: 'self_administered' as const,
    synopsis: '',
  };

  it('returns a context the review service accepts', () => {
    const result = completeStudyContext(parse(studyContext));
    expect(result).toEqual(studyContext);
    expect(StudyContextSchema.safeParse(result).success).toBe(true);
  });

  it('leaves out a blank synopsis', () => {
    const result = completeStudyContext({ ...draft, synopsis: '  ' });
    expect(result).toEqual({
      researchQuestions: ['Q?'],
      population: 'Adults',
      administration: 'self_administered',
    });
    expect(result).not.toHaveProperty('synopsis');
  });

  it('returns undefined for an incomplete draft', () => {
    expect(completeStudyContext(EMPTY as never)).toBeUndefined();
    expect(
      completeStudyContext({ ...draft, researchQuestions: [] }),
    ).toBeUndefined();
    expect(
      completeStudyContext({ ...draft, researchQuestions: ['  '] }),
    ).toBeUndefined();
    expect(completeStudyContext({ ...draft, population: ' ' })).toBeUndefined();
    expect(
      completeStudyContext({ ...draft, administration: null }),
    ).toBeUndefined();
  });

  it('returns undefined for an over-limit draft', () => {
    expect(
      completeStudyContext({
        ...draft,
        population: 'x'.repeat(STUDY_CONTEXT_LIMITS.population + 1),
      }),
    ).toBeUndefined();
  });
});
