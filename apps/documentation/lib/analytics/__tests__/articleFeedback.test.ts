import { beforeEach, describe, expect, it } from 'vitest';

import {
  articleFeedbackEvent,
  parseArticleFeedback,
  readStoredArticleFeedback,
  saveArticleFeedback,
} from '../articleFeedback';

const RATING = '$survey_response_c5b666c2-1e43-4ff8-b212-ea3b3bd327ae';
const COMMENT = '$survey_response_220d2d7a-3cb1-4061-9c03-dc02ff1b44e4';
const context = { docPath: '/design-protocols/stages/sociogram', locale: 'es' };

describe('articleFeedbackEvent', () => {
  it('sends a rating as the survey’s English choice text', () => {
    const event = articleFeedbackEvent(
      { submissionId: 's1', rating: 'no', comment: '' },
      context,
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
      context,
    );
    expect(event[RATING]).toBe('Yes');
    expect(event[COMMENT]).toBe('More screenshots');
  });

  it('marks a withdrawn rating as an incomplete response', () => {
    const event = articleFeedbackEvent(
      { submissionId: 's1', rating: null, comment: '' },
      context,
    );
    expect(event.$survey_completed).toBe(false);
    expect(event).not.toHaveProperty(RATING);
    expect(event).not.toHaveProperty(COMMENT);
  });
});

describe('stored feedback', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips per article', () => {
    saveArticleFeedback('/a', {
      submissionId: 's1',
      rating: 'yes',
      comment: 'x',
    });
    expect(parseArticleFeedback(readStoredArticleFeedback('/a'))).toEqual({
      submissionId: 's1',
      rating: 'yes',
      comment: 'x',
    });
    expect(parseArticleFeedback(readStoredArticleFeedback('/b'))).toBeNull();
  });

  it('ignores a malformed stored value', () => {
    window.localStorage.setItem('nc-docs-article-feedback:/a', '{"rating":1}');
    expect(parseArticleFeedback(readStoredArticleFeedback('/a'))).toBeNull();
  });
});
