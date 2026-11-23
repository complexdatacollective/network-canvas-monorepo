import { describe, expect, it } from 'vitest';

import {
  articleFeedbackEvent,
  articleFeedbackShownEvent,
} from '../articleFeedback';

const RATING = '$survey_response_c5b666c2-1e43-4ff8-b212-ea3b3bd327ae';
const COMMENT = '$survey_response_220d2d7a-3cb1-4061-9c03-dc02ff1b44e4';
const article = {
  docPath: '/design-protocols/stages/sociogram',
  section: 'design-protocols',
  locale: 'es',
};

describe('articleFeedbackEvent', () => {
  it('sends a rating alone as a complete response, in the survey’s English choice text', () => {
    const event = articleFeedbackEvent(
      { submissionId: 's1', rating: 'no', comment: '' },
      article,
    );
    expect(event).toEqual({
      $survey_id: '01a1fa2f-5595-0000-a91f-b16efc12bc06',
      $survey_submission_id: 's1',
      $survey_completed: true,
      [RATING]: 'No',
      doc_path: '/design-protocols/stages/sociogram',
      section: 'design-protocols',
      locale: 'es',
    });
  });

  it('includes a comment only when there is one', () => {
    const event: Record<string, unknown> = articleFeedbackEvent(
      { submissionId: 's1', rating: 'yes', comment: 'More screenshots' },
      article,
    );
    expect(event[RATING]).toBe('Yes');
    expect(event[COMMENT]).toBe('More screenshots');
  });
});

describe('articleFeedbackShownEvent', () => {
  it('names the survey and the article, and carries no response', () => {
    expect(articleFeedbackShownEvent(article)).toEqual({
      $survey_id: '01a1fa2f-5595-0000-a91f-b16efc12bc06',
      doc_path: '/design-protocols/stages/sociogram',
      section: 'design-protocols',
      locale: 'es',
    });
  });
});
