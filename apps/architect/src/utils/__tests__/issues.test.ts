import { describe, expect, it } from 'vitest';

import * as issues from '../issues';

const issueObject = {
  foo: 'bar',
  baz: [
    {
      buzz: 'foo',
      deeper: [{ fizz: 'pop' }, { buzz: 'pow' }],
      beep: {
        boop: 'bop',
      },
    },
  ],
};

describe('utils/issues', () => {
  describe('flattenIssues()', () => {
    it('Converts a nested object into a flattened version with paths', () => {
      expect(issues.flattenIssues(issueObject)).toEqual([
        { issue: 'bar', field: 'foo' },
        { issue: 'foo', field: 'baz[0].buzz' },
        { issue: 'pop', field: 'baz[0].deeper[0].fizz' },
        { issue: 'pow', field: 'baz[0].deeper[1].buzz' },
        { issue: 'bop', field: 'baz[0].beep.boop' },
      ]);
    });

    it('captures array-level _error (redux-form stores it on the array)', () => {
      const items: unknown[] = [];
      (items as { _error?: string })._error =
        'You must create at least one item';

      expect(issues.flattenIssues({ items })).toEqual([
        { issue: 'You must create at least one item', field: 'items._error' },
      ]);
    });

    it('captures both per-item and array-level errors', () => {
      const items: unknown[] = [{ content: 'Required' }];
      (items as { _error?: string })._error = 'Array level error';

      expect(issues.flattenIssues({ items })).toEqual([
        { issue: 'Required', field: 'items[0].content' },
        { issue: 'Array level error', field: 'items._error' },
      ]);
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
