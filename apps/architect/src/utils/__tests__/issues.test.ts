import { describe, expect, it } from 'vitest';

import * as issues from '../issues';

describe('utils/issues', () => {
  describe('flattenIssues()', () => {
    it('pairs every message with its field', () => {
      expect(
        issues.flattenIssues({
          'label': ['Required'],
          'form.fields': ['You must create at least one field'],
        }),
      ).toEqual([
        { issue: 'Required', field: 'label' },
        {
          issue: 'You must create at least one field',
          field: 'form.fields',
        },
      ]);
    });

    it('emits one entry per message when a field has several', () => {
      expect(
        issues.flattenIssues({ name: ['Required', 'Must be unique'] }),
      ).toEqual([
        { issue: 'Required', field: 'name' },
        { issue: 'Must be unique', field: 'name' },
      ]);
    });

    it('ignores fields with no messages', () => {
      expect(
        issues.flattenIssues({ label: [], interviewScript: undefined }),
      ).toEqual([]);
    });
  });

  describe('candidateIdsFor()', () => {
    it('returns the exact id (and its _error variant) for a flat field', () => {
      expect(issues.candidateIdsFor('interviewScript')).toEqual([
        'field_interviewScript',
        'field_interviewScript__error',
      ]);
    });

    it('walks up to ancestor anchors for a nested array field', () => {
      const ids = issues.candidateIdsFor('form.fields[0].variable');
      expect(ids[0]).toBe('field_form_fields_0__variable');
      expect(ids).toContain('field_form_fields__error');
      expect(ids).toContain('field_form');
    });

    it('trims array indices as well as dotted segments', () => {
      const ids = issues.candidateIdsFor('prompts[0].text');
      expect(ids).toContain('field_prompts_0__text');
      expect(ids).toContain('field_prompts__error');
      expect(ids).toContain('field_prompts');
    });

    it('terminates on degenerate paths (trailing/empty delimiters)', () => {
      for (const input of ['a.', 'foo..bar', '.', '', '[0]']) {
        expect(() => issues.candidateIdsFor(input)).not.toThrow();
      }
    });
  });
});
