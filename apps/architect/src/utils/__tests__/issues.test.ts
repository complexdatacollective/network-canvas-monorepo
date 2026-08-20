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
        { id: 'label#0', issue: 'Required', field: 'label' },
        {
          id: 'form.fields#0',
          issue: 'You must create at least one field',
          field: 'form.fields',
        },
      ]);
    });

    it('emits one entry per message when a field has several', () => {
      expect(
        issues.flattenIssues({ name: ['Required', 'Must be unique'] }),
      ).toEqual([
        { id: 'name#0', issue: 'Required', field: 'name' },
        { id: 'name#1', issue: 'Must be unique', field: 'name' },
      ]);
    });

    it('gives sibling messages on one field distinct ids while keeping the field', () => {
      const flattened = issues.flattenIssues({
        'introductionPanel.title': ['Required', 'Too long'],
        'label': ['Required'],
      });

      expect(new Set(flattened.map(({ id }) => id)).size).toBe(
        flattened.length,
      );
      expect(flattened.map(({ field }) => field)).toEqual([
        'introductionPanel.title',
        'introductionPanel.title',
        'label',
      ]);
      // Ids are field-qualified, so they do not collide across fields when
      // `Object.entries` order changes.
      expect(flattened.map(({ id }) => id)).toEqual([
        'introductionPanel.title#0',
        'introductionPanel.title#1',
        'label#0',
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
