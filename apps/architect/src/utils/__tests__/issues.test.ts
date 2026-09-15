import { afterEach, describe, expect, it } from 'vitest';

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

  describe('resolveIssueTarget()', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    /** A field as fresco-ui's `Field` renders one: the seam, and a label. */
    const mountField = (path: string, label: string) => {
      document.body.innerHTML = `
        <div data-field-name="${path}" data-field-path="${path}">
          <label id="${path}-label" for="${path}-control">${label}<span aria-hidden="true"> *</span></label>
          <div><button type="button">Create new prompt</button></div>
        </div>
      `;
    };

    /** A field as Architect's own `ArchitectField` still renders one. */
    const mountAnchor = (path: string, label: string) => {
      document.body.innerHTML = `<div id="${issues.getFieldId(path)}" data-name="${label}"></div>`;
    };

    it('names a field by the label the researcher reads, without its required marker', () => {
      mountField('prompts', 'Prompts');

      expect(issues.resolveIssueTarget('prompts')?.label).toBe('Prompts');
    });

    it('answers with an id that is mounted, so a row can link to it', () => {
      mountField('prompts', 'Prompts');
      const anchorId = issues.resolveIssueTarget('prompts')?.anchorId;

      expect(anchorId).toBe('prompts-label');
      expect(document.getElementById(anchorId!)).not.toBeNull();
    });

    it('reads the field itself rather than whichever control comes first inside it', () => {
      // The defect this replaced: the label was read off the control's
      // `aria-labelledby`, and a list's only operable control is an add button
      // named by its own words. Every list, picker and radio group in the
      // stage editor fell through to the store's internal path.
      mountField('prompts', 'Prompts');

      expect(issues.resolveIssueTarget('prompts')?.label).not.toBe(
        'Create new prompt',
      );
    });

    it('ignores the labels of fields nested inside a composite one', () => {
      document.body.innerHTML = `
        <div data-field-path="prompts">
          <label id="prompts-label">Prompts</label>
          <div data-field-path="prompts[0].text">
            <label id="row-label">Prompt text</label>
          </div>
        </div>
      `;

      expect(issues.resolveIssueTarget('prompts')?.label).toBe('Prompts');
    });

    it('falls back to the legacy anchor for the forms that still render one', () => {
      mountAnchor('introductionPanel.title', 'Page heading');
      const target = issues.resolveIssueTarget('introductionPanel.title');

      expect(target?.label).toBe('Page heading');
      expect(target?.anchorId).toBe('field_introductionPanel_title');
    });

    it('walks up to an ancestor anchor when the exact field has none', () => {
      mountAnchor('form.fields', 'Form fields');

      expect(issues.resolveIssueTarget('form.fields[0].variable')?.label).toBe(
        'Form fields',
      );
    });

    it('answers with nothing at all when the field is not on the page', () => {
      expect(issues.resolveIssueTarget('prompts')).toBeNull();
    });

    it('terminates on degenerate paths (trailing/empty delimiters)', () => {
      for (const input of ['a.', 'foo..bar', '.', '', '[0]']) {
        expect(() => issues.resolveIssueTarget(input)).not.toThrow();
      }
    });
  });
});
