import { describe, expect, it } from 'vitest';

import { feedbackMarkdown } from './feedbackMarkdown';

const text = (value: string, ...marks: string[]) => ({
  type: 'text',
  text: value,
  ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const item = (...content: object[]) => ({ type: 'listItem', content });

describe('feedbackMarkdown', () => {
  it('is empty for an empty document', () => {
    expect(feedbackMarkdown({ type: 'doc', content: [] })).toBe('');
    expect(
      feedbackMarkdown({ type: 'doc', content: [{ type: 'paragraph' }] }),
    ).toBe('');
  });

  it('separates paragraphs and keeps line breaks', () => {
    expect(
      feedbackMarkdown({
        type: 'doc',
        content: [
          paragraph(text('One'), { type: 'hardBreak' }, text('two')),
          paragraph(text('Three')),
        ],
      }),
    ).toBe('One\ntwo\n\nThree');
  });

  it('marks bold and italic without taking in the spaces around them', () => {
    expect(
      feedbackMarkdown({
        type: 'doc',
        content: [
          paragraph(
            text('A '),
            text('bold ', 'bold'),
            text('and '),
            text('both', 'bold', 'italic'),
          ),
        ],
      }),
    ).toBe('A **bold** and **_both_**');
  });

  it('writes bullet and numbered lists, nested ones indented', () => {
    expect(
      feedbackMarkdown({
        type: 'doc',
        content: [
          paragraph(text('Ideas:')),
          {
            type: 'bulletList',
            content: [
              item(paragraph(text('Dark theme'))),
              item(paragraph(text('Export')), {
                type: 'orderedList',
                attrs: { start: 3 },
                content: [
                  item(paragraph(text('CSV'))),
                  item(paragraph(text('GraphML'))),
                ],
              }),
            ],
          },
        ],
      }),
    ).toBe('Ideas:\n\n- Dark theme\n- Export\n  3. CSV\n  4. GraphML');
  });
});
