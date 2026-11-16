import { describe, expect, it } from 'vitest';

import {
  composeStudyText,
  studyIsComplete,
  type StudyInput,
} from '../study.ts';

const study: StudyInput = {
  questions: ['Who do first-year students go to for advice?'],
  population: 'First-year undergraduates at one university.',
  synopsis: '',
  administration: 'face_to_face',
};

describe('mode of administration', () => {
  it('is required before a study can be designed', () => {
    expect(studyIsComplete(study)).toBe(true);
    expect(studyIsComplete({ ...study, administration: null })).toBe(false);
  });

  it('is sent to the server after the population', () => {
    expect(composeStudyText(study)).toBe(
      'Research questions\n1. Who do first-year students go to for advice?\n\nResearch population\nFirst-year undergraduates at one university.\n\nMode of administration\nFace-to-face: an interviewer sits with each participant and administers the interview.',
    );
  });
});
