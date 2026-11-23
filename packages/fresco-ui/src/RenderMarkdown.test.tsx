import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import remarkGfm from 'remark-gfm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { escapeMarkdownText } from '@codaco/protocol-validation';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  getMarkdownAttributeValues,
  getMarkdownLabelText,
  RenderMarkdown,
} from './RenderMarkdown';

afterEach(cleanup);

it.each([
  ['plain', 'Isabel', 'Isabel'],
  ['emphasis', '*Isabel*', 'Isabel'],
  ['strong', '**Isabel**', 'Isabel'],
  ['tildes', '~~Isabel~~', '~~Isabel~~'],
  ['one tilde on each side', '~Isabel~', '~Isabel~'],
  ['inline HTML', '<em>Isabel</em>', '<em>Isabel</em>'],
  ['an HTML element', '<span>Isabel</span>', '<span>Isabel</span>'],
  [
    'a script element',
    '<script>ignored</script>Isabel',
    '<script>ignored</script>Isabel',
  ],
  ['numeric entity', '&#73;sabel', 'Isabel'],
  ['named entity', 'Isabel &amp; Irene', 'Isabel & Irene'],
  ['link', '[Isabel](https://example.org)', 'Isabel'],
  [
    'reference link',
    '[Isabel][person]\n\n[person]: https://example.org',
    'Isabel',
  ],
  [
    'an HTML link',
    '<a href="https://example.org">Isabel</a>',
    '<a href="https://example.org">Isabel</a>',
  ],
  ['unsafe link', '[Isabel](javascript:ignored)', 'Isabel'],
  [
    'image removal',
    '![unspoken](https://example.org/image.png)Isabel',
    'Isabel',
  ],
  [
    'an HTML image',
    '<img src="/image.png" alt="x">Isabel',
    '<img src="/image.png" alt="x">Isabel',
  ],
  ['unwrapped code', '`Isabel`', 'Isabel'],
  ['an emoji', '❤️ Isabel', '❤️ Isabel'],
  ['an emoji shortcode', ':smile: Isabel', ':smile: Isabel'],
  ['escaped syntax', '\\~\\~Isabel\\~\\~', '~~Isabel~~'],
  ['paragraphs', 'Isabel\n\nZelda', 'Isabel\nZelda'],
] as const)(
  'extracts %s as the renderer shows it with its default options',
  (_kind, markdown, expected) => {
    // Invoke the synchronous helper outside React before mounting the actual
    // renderer. A hook-dependent implementation cannot satisfy this contract.
    expect(getMarkdownLabelText(markdown)).toBe(expected);
    const { container } = render(<RenderMarkdown>{markdown}</RenderMarkdown>);
    expect(container.textContent).toBe(expected);
    expect(getMarkdownLabelText(markdown)).toBe(container.textContent);
  },
);

// The whitespace between blocks is whatever the markdown pipeline emits; the
// contract is only that the label text and the rendered text agree on it.
it.each([
  [
    'a table written with pipes',
    '| Name |\n| --- |\n| Isabel |',
    '| Name | | --- | | Isabel |',
  ],
  [
    'list items that look like tasks',
    '- [x] Isabel\n- [ ] Zelda',
    '[x] Isabel [ ] Zelda',
  ],
  ['a block quote', '> Isabel', 'Isabel'],
  ['ordered list', '1. Isabel\n2. Zelda', 'Isabel Zelda'],
  [
    'nested inline content',
    '**[~~Isabel~~](https://example.org)**',
    '~~Isabel~~',
  ],
  ['line break', 'Isabel  \nZelda', 'Isabel Zelda'],
  ['an HTML comment', '<!-- hidden -->Isabel', '<!-- hidden -->Isabel'],
  [
    'a bare address',
    'Isabel https://example.org',
    'Isabel https://example.org',
  ],
] as const)(
  'agrees with the renderer, whitespace included, on %s',
  (_kind, markdown, words) => {
    const { container } = render(<RenderMarkdown>{markdown}</RenderMarkdown>);
    expect(getMarkdownLabelText(markdown)).toBe(container.textContent);
    expect(container.textContent?.replace(/\s+/g, ' ').trim()).toBe(words);
  },
);

// A caption generated from an attribute name or option value is escaped
// markdown, and is shown to the participant exactly as the name was written.
it.each([
  ['an HTML tag', '<img>'],
  ['an HTML tag with attributes', '<img src="/x.png" alt="x">'],
  ['a closing tag', 'a </b> c'],
  ['an HTML comment', '<!-- note -->'],
  ['an autolink', '<https://example.org>'],
  ['an email autolink', '<isabel@example.org>'],
  ['a named character reference', 'Isabel &amp; Irene'],
  ['a numeric character reference', '&#73;sabel'],
  ['a lone ampersand', 'Isabel & Irene'],
  ['a block quote marker', '> 65'],
  ['a comparison', '18 < age > 65'],
  ['emphasis and a heading marker', '# *Isabel* _Zelda_'],
  ['a bullet', '- Isabel'],
  ['an ordered list marker', '1. Isabel'],
  ['a link', '[Isabel](https://example.org)'],
  ['a backslash before a tag', '\\<b>'],
  ['a run of heading markers in a line', 'Section ## 2'],
  ['a longer run of heading markers', 'a ### b'],
  ['a run of heading markers opening a line', '## Isabel'],
  ['struck-through words', '~~Isabel~~ Zelda'],
  ['a tilde on either side of words', 'about ~5 to ~10 minutes'],
  ['a lone tilde', 'about ~5 minutes'],
] as const)(
  'renders escaped plain text holding %s as written',
  (_kind, text) => {
    const markdown = escapeMarkdownText(text);
    expect(getMarkdownLabelText(markdown)).toBe(text);
    const { container } = render(<RenderMarkdown>{markdown}</RenderMarkdown>);
    expect(container.textContent).toBe(text);
  },
);

it('shows inline HTML as the characters typed, in place', () => {
  const { container } = render(
    <RenderMarkdown>{'Before <em class="x">Isabel</em> after'}</RenderMarkdown>,
  );

  expect(container.querySelector('em')).toBeNull();
  expect(container.textContent).toBe('Before <em class="x">Isabel</em> after');
});

it('shows a block of HTML as a paragraph of the characters typed, with a line break at each newline', () => {
  const { container } = render(
    <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
      {'Before\n\n<div>\n<b>Isabel</b>\n</div>\n\nAfter'}
    </RenderMarkdown>,
  );

  expect(container.querySelector('div, b')).toBeNull();
  const paragraphs = [...container.querySelectorAll('p')];
  expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
    'Before',
    // A line break is drawn as a `br` followed by the newline.
    '<div>\n<b>Isabel</b>\n</div>',
    'After',
  ]);
  expect(paragraphs[1]?.querySelectorAll('br')).toHaveLength(2);
});

it('draws a block quote as its content', () => {
  const { container } = render(
    <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
      {'> Isabel\n>\n> Zelda'}
    </RenderMarkdown>,
  );

  expect(container.querySelector('blockquote')).toBeNull();
  expect(
    [...container.querySelectorAll('p')].map((p) => p.textContent),
  ).toEqual(['Isabel', 'Zelda']);
});

it('draws an emoji character, and a shortcode as typed', () => {
  const { container } = render(
    <RenderMarkdown>{'😄 and :smile:'}</RenderMarkdown>,
  );

  expect(container.textContent).toBe('😄 and :smile:');
});

it('draws tildes as typed, not as struck-through words', () => {
  const { container } = render(<RenderMarkdown>{'~~Isabel~~'}</RenderMarkdown>);

  expect(container.querySelector('del, s')).toBeNull();
  expect(container.textContent).toBe('~~Isabel~~');
});

it('makes an explicit link a link, and leaves a bare address as words', () => {
  render(
    <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
      {'[Isabel](https://example.org) and https://example.com'}
    </RenderMarkdown>,
  );

  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Isabel' })).toHaveAttribute(
    'href',
    'https://example.org',
  );
});

it('opens a link outside the app', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(
    <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
      {'Visit [docs](https://example.com)'}
    </RenderMarkdown>,
  );

  fireEvent.click(screen.getByRole('link', { name: 'docs' }));

  expect(open).toHaveBeenCalledWith(
    'https://example.com',
    '_blank',
    'noopener,noreferrer',
  );
  open.mockRestore();
});

// One line is drawn with what the editor offers for one line: bold and
// italics. A link, an address between angle brackets and a list are words.
it('draws a link and a list in one line as their words', () => {
  const { container, rerender } = render(
    <RenderMarkdown>
      {'**Ask** [Isabel](https://example.org) at <https://example.com>'}
    </RenderMarkdown>,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(container.querySelector('strong')).toHaveTextContent('Ask');
  expect(container.textContent).toBe('Ask Isabel at https://example.com');

  rerender(<RenderMarkdown>{'- [ ] first'}</RenderMarkdown>);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(container.textContent?.trim()).toBe('[ ] first');
});

/**
 * A link is drawn only where its address passes `linkAddress`, the rule the
 * editor shares; any other is drawn as its words, with no address at all.
 */
describe('which link addresses are links', () => {
  it.each([
    ['a web address', 'https://example.org/a'],
    ['an email address', 'mailto:help@example.org'],
    ['a telephone number', 'tel:+15555550123'],
  ])('draws %s as a link', (_kind, address) => {
    render(
      <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
        {`[Isabel](${address})`}
      </RenderMarkdown>,
    );
    expect(screen.getByRole('link', { name: 'Isabel' })).toHaveAttribute(
      'href',
      address,
    );
  });

  it.each([
    ['a relative address', '/docs/page'],
    ['an address with no scheme', 'example.org'],
    ['an address only starting with //', '//example.org'],
    ['an address the URL parser rejects', 'https://example.com"\\>a'],
    ['a script', 'javascript:alert(1)'],
    ['a data address', 'data:text/html,hi'],
  ])('draws a link to %s as its words', (_kind, address) => {
    const { container } = render(
      <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
        {`[Isabel](${address})`}
      </RenderMarkdown>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('[href]')).toBeNull();
    expect(container).toHaveTextContent('Isabel');
  });
});

it('retains custom components and wrapper props', () => {
  render(
    <RenderMarkdown
      render={<div role="note" aria-label="Custom wrapper" />}
      components={{
        strong: ({ children }) => <mark>Custom {children}</mark>,
      }}
    >
      {'**Isabel**'}
    </RenderMarkdown>,
  );
  expect(
    screen.getByRole('note', { name: 'Custom wrapper' }),
  ).toHaveTextContent('Custom Isabel');
});

it('adds a caller’s remark plugins, and still shows HTML as typed', () => {
  const { container } = render(
    <RenderMarkdown
      allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
      remarkPlugins={[remarkGfm]}
    >
      {'~~Isabel~~ https://example.org <em>Zelda</em>'}
    </RenderMarkdown>,
  );

  expect(
    screen.getByRole('link', { name: 'https://example.org' }),
  ).toBeVisible();
  expect(container.querySelector('em')).toBeNull();
  expect(container.textContent).toBe(
    'Isabel https://example.org <em>Zelda</em>',
  );
});

it('retains section tag and explicit disallowed-unwrapping options', () => {
  const { container, rerender } = render(
    <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
      {'# Isabel'}
    </RenderMarkdown>,
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'Isabel' }),
  ).toBeVisible();
  rerender(
    <RenderMarkdown allowedElements={['em']} unwrapDisallowed={false}>
      {'*Isabel*'}
    </RenderMarkdown>,
  );
  expect(container).toBeEmptyDOMElement();
});

it('lists the attribute values markdown produces, and not its text', () => {
  expect(
    getMarkdownAttributeValues(
      'See [the *page*](https://a.example "Title") and ![alt text](b.png) here',
    ),
  ).toEqual(
    expect.arrayContaining(['https://a.example', 'Title', 'b.png', 'alt text']),
  );
  expect(getMarkdownAttributeValues('See [the *page*](x)')).not.toContain(
    'the',
  );
  expect(getMarkdownAttributeValues('Just **text**')).toEqual([]);
});
