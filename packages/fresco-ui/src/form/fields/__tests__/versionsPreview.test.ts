import { describe, expect, it } from 'vitest';

import { versionsPreview } from '../RichTextEditor';

const text = (value: string) => [{ type: 'text', text: value }];
const version = (key: string, content: Record<string, unknown>[]) => ({
  key,
  label: key,
  content,
});

describe('versionsPreview', () => {
  it('shows what the first three versions read, and counts the rest', () => {
    expect(
      versionsPreview({
        label: 'group',
        versions: [
          version('a', text('👪')),
          version('b', text('🎉')),
          version('c', text('💼')),
          version('d', text('🎓')),
          version('e', text('🏥')),
        ],
      }),
    ).toEqual({ shown: ['👪', '🎉', '💼'], more: 2 });
  });

  it('leaves out a version that shows nothing, and one that repeats another', () => {
    expect(
      versionsPreview({
        label: 'group',
        versions: [
          version('a', text('Friend')),
          version('b', []),
          version('c', text('  Friend ')),
          version('d', text('Other')),
        ],
      }),
    ).toEqual({ shown: ['Friend', 'Other'], more: 0 });
  });

  it('names a value a version shows, and leaves out a version that shows only what the pill is already called', () => {
    const preview = versionsPreview(
      {
        label: 'Wording by Age',
        summary: 'Age',
        versions: [
          version('other', [{ type: 'token', attrs: { id: 'age' } }]),
          version('missing', text('unknown')),
          version('x', [
            { type: 'text', text: 'aged ' },
            { type: 'token', attrs: { id: 'age' } },
          ]),
        ],
      },
      (id) => (id === 'age' ? 'Age' : undefined),
    );
    expect(preview).toEqual({ shown: ['unknown', 'aged Age'], more: 0 });
  });

  it('cuts a long version short, by characters and not by code units', () => {
    const [shown] = versionsPreview({
      label: 'x',
      versions: [version('a', text('👪'.repeat(40)))],
    }).shown;
    expect(Array.from(shown ?? '')).toHaveLength(16);
    expect(shown?.endsWith('…')).toBe(true);
  });
});
