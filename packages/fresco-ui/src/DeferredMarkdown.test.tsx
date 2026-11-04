import { act, cleanup, render, screen } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGemoji from 'remark-gemoji';
import { afterEach, expect, it, vi } from 'vitest';

import {
  DeferredFieldLabelMarkdown,
  DeferredMarkdown,
  isPlainMarkdownText,
} from './DeferredMarkdown';

const markdownModuleEvaluated = vi.hoisted(() => vi.fn());

vi.mock('./RenderMarkdown', async (importOriginal) => {
  markdownModuleEvaluated();
  return importOriginal();
});

afterEach(cleanup);

const plainLabels = [
  'What is your name?',
  'Date of birth (DD/MM/YYYY)',
  "Partner's age, in years",
  'Emails sent per week — approx. 5%',
  'Ünïcödé label 你好',
  'Count 1-10 = fine',
];

it('renders plain text without loading the markdown module', () => {
  for (const label of plainLabels) {
    expect(isPlainMarkdownText(label)).toBe(true);
    const { container } = render(
      <>
        <DeferredMarkdown>{label}</DeferredMarkdown>
        <DeferredMarkdown render={<span lang="fr" />}>{label}</DeferredMarkdown>
        <DeferredFieldLabelMarkdown>{label}</DeferredFieldLabelMarkdown>
      </>,
    );
    expect(container.innerHTML).toBe(
      `${label}<span lang="fr">${label}</span>${label}`,
    );
    cleanup();
  }

  expect(markdownModuleEvaluated).not.toHaveBeenCalled();
});

it('renders markdown through the sanitizing renderer once it loads', async () => {
  const source =
    'Read the **manual** <script>alert(1)</script><img src=x onerror=alert(1)>';
  const view = await act(async () =>
    render(<DeferredMarkdown>{source}</DeferredMarkdown>),
  );

  const fallback = view.container.firstElementChild;
  expect(fallback).toHaveClass('text-transparent');
  expect(fallback?.childElementCount).toBe(0);
  expect(fallback?.textContent).toContain('Read the manual');
  expect(fallback?.textContent).not.toContain('*');

  expect(
    (await screen.findByText('manual', {}, { timeout: 10_000 })).tagName,
  ).toBe('STRONG');
  expect(markdownModuleEvaluated).toHaveBeenCalledTimes(1);
  expect(document.querySelector('script, img')).toBeNull();
  expect(document.body).not.toHaveTextContent('**');
});

it('renders markdown synchronously once the renderer has registered', () => {
  render(
    <DeferredFieldLabelMarkdown>
      {'Visit [docs](https://example.com) :smile:'}
    </DeferredFieldLabelMarkdown>,
  );

  expect(screen.getByRole('link', { name: 'docs' })).toBeInTheDocument();
  expect(document.body).toHaveTextContent('Visit docs 😄');
});

it('only treats text as plain when every label dialect renders it unchanged', async () => {
  const { RenderMarkdown, DEFAULT_MARKDOWN_REHYPE_PLUGINS } =
    await import('./RenderMarkdown');
  const alphabet = [
    'a',
    'Z',
    '1',
    ' ',
    '  ',
    '.',
    ')',
    '-',
    '+',
    '=',
    '*',
    '_',
    '~',
    '`',
    '#',
    '>',
    '<',
    '&',
    ':',
    '@',
    '[',
    ']',
    '(',
    '!',
    '|',
    '\\',
    '\n',
    '\t',
    'www.',
    'smile',
    '"',
    "'",
    'é',
  ];
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const textOnly = document.createElement('div');

  for (let i = 0; i < 2000; i++) {
    const length = 1 + Math.floor(random() * 8);
    const text = Array.from(
      { length },
      () => alphabet[Math.floor(random() * alphabet.length)],
    ).join('');
    if (!isPlainMarkdownText(text)) continue;

    textOnly.textContent = text;
    const { container } = render(
      <>
        <div>
          <RenderMarkdown>{text}</RenderMarkdown>
        </div>
        <div>
          <ReactMarkdown
            allowedElements={['em', 'strong', 'ul', 'ol', 'li', 'a']}
            remarkPlugins={[remarkGemoji]}
            rehypePlugins={DEFAULT_MARKDOWN_REHYPE_PLUGINS}
            unwrapDisallowed
          >
            {text}
          </ReactMarkdown>
        </div>
      </>,
    );
    const [defaultDialect, fieldLabelDialect] = container.children;
    expect(defaultDialect?.innerHTML).toBe(textOnly.innerHTML);
    expect(fieldLabelDialect?.innerHTML).toBe(textOnly.innerHTML);
    cleanup();
  }
});
