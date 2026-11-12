// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { headingIds } from '~/lib/headingIds';

describe('headingIds', () => {
  it('slugs headings as rehype-slug does', () => {
    expect(headingIds('## Name Generator\n\n### Name Generator\n')).toEqual([
      'name-generator',
      'name-generator-1',
    ]);
  });

  it('keeps an id written after the heading and drops the marker', () => {
    expect(
      headingIds(
        '## Generador de nombres {#name-generator}\n\n## Sin id\n\n### Con `código` {#with-code}\n',
      ),
    ).toEqual(['name-generator', 'sin-id', 'with-code']);
  });

  it('ignores headings in frontmatter and code blocks', () => {
    expect(
      headingIds(
        '---\ntitle: X\n---\n\n```md\n## Not a heading\n```\n\n## Real\n',
      ),
    ).toEqual(['real']);
  });
});
