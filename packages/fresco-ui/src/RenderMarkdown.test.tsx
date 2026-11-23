import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

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
  ['GFM strike', '~~Isabel~~', 'Isabel'],
  ['GFM single strike', '~Isabel~', 'Isabel'],
  ['raw emphasis', '<em>Isabel</em>', 'Isabel'],
  ['unwrapped HTML', '<span>Isabel</span>', 'Isabel'],
  ['sanitized script', '<script>ignored</script>Isabel', 'Isabel'],
  ['unwrapped style', '<style>ignored</style>Isabel', 'ignoredIsabel'],
  ['numeric entity', '&#73;sabel', 'Isabel'],
  ['named entity', 'Isabel &amp; Irene', 'Isabel & Irene'],
  ['link', '[Isabel](https://example.org)', 'Isabel'],
  [
    'reference link',
    '[Isabel][person]\n\n[person]: https://example.org',
    'Isabel',
  ],
  ['raw link', '<a href="https://example.org">Isabel</a>', 'Isabel'],
  ['unsafe link', '[Isabel](javascript:ignored)', 'Isabel'],
  [
    'image removal',
    '![unspoken](https://example.org/image.png)Isabel',
    'Isabel',
  ],
  [
    'raw image removal',
    '<img src="/image.png" alt="unspoken">Isabel',
    'Isabel',
  ],
  ['unwrapped code', '`Isabel`', 'Isabel'],
  ['emoji', ':heart: Isabel', '❤️ Isabel'],
  ['escaped syntax', '\\~\\~Isabel\\~\\~', '~~Isabel~~'],
  ['paragraphs', 'Isabel\n\nZelda', 'Isabel\nZelda'],
] as const)(
  'extracts %s through the same default label dialect that is actually rendered',
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
  ['GFM table', '| Name |\n| --- |\n| Isabel |', 'NameIsabel'],
  ['GFM task list', '- [x] Isabel\n- [ ] Zelda', 'Isabel Zelda'],
  ['ordered list', '1. Isabel\n2. Zelda', 'Isabel Zelda'],
  ['nested inline content', '**[~~Isabel~~](https://example.org)**', 'Isabel'],
  ['line break', 'Isabel  \nZelda', 'Isabel Zelda'],
  ['comment removal', '<!-- hidden -->Isabel', 'Isabel'],
  ['GFM autolink', 'Isabel https://example.org', 'Isabel https://example.org'],
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

it('strips style and class attributes from raw HTML', () => {
  const { container } = render(
    <RenderMarkdown>
      {'<em style="color: red" class="injected">Isabel</em>'}
    </RenderMarkdown>,
  );

  const emphasis = container.querySelector('em');
  expect(emphasis).toHaveTextContent('Isabel');
  expect(emphasis).not.toHaveAttribute('style');
  expect(emphasis).not.toHaveAttribute('class');
});

it('renders a javascript: link as text with no href', () => {
  // Both react-markdown's default urlTransform and rehypeSanitize strip the
  // href, so this fails only when both are removed.
  const { container } = render(
    <RenderMarkdown>{'[Isabel](javascript:alert(1))'}</RenderMarkdown>,
  );

  expect(container).toHaveTextContent('Isabel');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(container.querySelector('[href]')).toBeNull();
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

it('retains explicit empty remark and rehype plugin overrides', () => {
  const { container, rerender } = render(
    <RenderMarkdown remarkPlugins={[]}>{'~~Isabel~~ :heart:'}</RenderMarkdown>,
  );
  expect(container.textContent).toBe('~~Isabel~~ :heart:');
  rerender(
    <RenderMarkdown rehypePlugins={[]}>{'<em>Isabel</em>'}</RenderMarkdown>,
  );
  expect(container.textContent).toBe('<em>Isabel</em>');
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
