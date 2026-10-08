import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
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

it.each([
  [
    'GFM table',
    '| Name |\n| --- |\n| Isabel |',
    '\n\n\n\n\n\n\n\n\n\n\nNameIsabel',
  ],
  ['GFM task list', '- [x] Isabel\n- [ ] Zelda', '\n Isabel\n Zelda\n'],
  ['ordered list', '1. Isabel\n2. Zelda', '\nIsabel\nZelda\n'],
  ['nested inline content', '**[~~Isabel~~](https://example.org)**', 'Isabel'],
  ['line break', 'Isabel  \nZelda', 'Isabel\nZelda'],
  ['comment removal', '<!-- hidden -->Isabel', 'Isabel'],
  ['GFM autolink', 'Isabel https://example.org', 'Isabel https://example.org'],
] as const)(
  'retains the rendered text and whitespace of %s',
  (_kind, markdown, expected) => {
    const { container } = render(<RenderMarkdown>{markdown}</RenderMarkdown>);
    expect(container.textContent).toBe(expected);
    expect(getMarkdownLabelText(markdown)).toBe(expected);
    expect(getMarkdownLabelText(markdown)).toBe(container.textContent);
  },
);

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

it('gives each top-level block a named language without wrapping the blocks', () => {
  render(
    <div data-testid="host">
      <h1>Title</h1>
      <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
        {{ text: '## Sección\n\nUn párrafo.\n\n- uno', lang: 'es', dir: 'ltr' }}
      </RenderMarkdown>
    </div>,
  );
  const host = screen.getByTestId('host');
  // Siblings of the content around them, which is what `not-first:` and
  // `not-last:` spacing reads.
  expect(Array.from(host.children, (element) => element.tagName)).toEqual([
    'H1',
    'H2',
    'P',
    'UL',
  ]);
  for (const block of Array.from(host.children).slice(1)) {
    expect(block).toHaveAttribute('lang', 'es');
    expect(block).toHaveAttribute('dir', 'ltr');
  }
  // What is inside a block inherits the language from it.
  expect(screen.getByRole('listitem')).not.toHaveAttribute('lang');
});

it('adds no element for text outside any element', () => {
  render(
    <div data-testid="host">
      <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
        {{ text: '<script>ignored</script> tail', lang: 'ar', dir: 'rtl' }}
      </RenderMarkdown>
    </div>,
  );
  const host = screen.getByTestId('host');
  expect(host.children).toHaveLength(0);
  expect(host).toHaveTextContent('tail');
});

it('puts a named language on the render element', () => {
  render(
    <RenderMarkdown render={<span data-testid="label" />}>
      {{ text: '**Isabel**', lang: 'fr', dir: 'ltr' }}
    </RenderMarkdown>,
  );
  const label = screen.getByTestId('label');
  expect(label).toHaveAttribute('lang', 'fr');
  expect(label).toHaveAttribute('dir', 'ltr');
  expect(label).toHaveTextContent('Isabel');
});

it('names no language for text in the page language', () => {
  const { container } = render(
    <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
      {'## Section\n\nA paragraph.'}
    </RenderMarkdown>,
  );
  expect(container.querySelector('[lang], [dir]')).toBeNull();
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
