import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import RichTextRenderer from './RichTextRenderer';

describe('RichTextRenderer', () => {
  it('renders safe links and unwraps unsafe links', () => {
    const { container } = render(
      <RichTextRenderer
        content={{
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Safe',
                  marks: [
                    {
                      type: 'link',
                      attrs: { href: 'https://example.com' },
                    },
                  ],
                },
                {
                  type: 'text',
                  text: ' unsafe',
                  marks: [
                    {
                      type: 'link',
                      attrs: { href: 'javascript:alert(1)' },
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );

    const links = container.querySelectorAll('a');

    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://example.com');
    expect(container.textContent).toBe('Safe unsafe');
  });

  it('allows relative, protocol-relative, and mailto links', () => {
    const { container } = render(
      <RichTextRenderer
        content={{
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Relative',
                  marks: [{ type: 'link', attrs: { href: '/docs' } }],
                },
                {
                  type: 'text',
                  text: ' Protocol',
                  marks: [{ type: 'link', attrs: { href: '//example.com/x' } }],
                },
                {
                  type: 'text',
                  text: ' Mail',
                  marks: [
                    {
                      type: 'link',
                      attrs: { href: 'mailto:team@example.com' },
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );

    const hrefs = Array.from(container.querySelectorAll('a')).map((link) =>
      link.getAttribute('href'),
    );

    expect(hrefs).toEqual([
      '/docs',
      '//example.com/x',
      'mailto:team@example.com',
    ]);
  });
});
