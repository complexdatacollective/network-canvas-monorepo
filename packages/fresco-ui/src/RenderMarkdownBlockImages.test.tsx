import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { type MarkdownBlockImage } from './markdownBlockImages';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from './RenderMarkdown';

afterEach(cleanup);

// Private-use characters that stand for a block between the two passes. Spelled
// as escapes so the test does not depend on how an editor shows them.
const OPEN = '\uE010';
const CLOSE = '\uE011';

const matches = (url: string) => url.startsWith('asset:');

function Block({ url, alt }: MarkdownBlockImage) {
  return <span data-testid="block" data-url={url} data-alt={alt} />;
}

const blockImages = { matches, Block };

const renderBlocks = (markdown: string) =>
  render(
    <RenderMarkdown
      blockImages={blockImages}
      allowedElements={[...ALLOWED_MARKDOWN_SECTION_TAGS]}
    >
      {markdown}
    </RenderMarkdown>,
  );

const blocks = () =>
  screen.queryAllByTestId('block').map((element) => ({
    url: element.getAttribute('data-url'),
    alt: element.getAttribute('data-alt'),
  }));

const payload = (image: MarkdownBlockImage) =>
  encodeURIComponent(JSON.stringify(image));

describe('a block image', () => {
  it('is an image alone in its paragraph, drawn with its address and description', () => {
    renderBlocks('![A map](asset:8a2f?size=medium)');
    expect(blocks()).toEqual([{ url: 'asset:8a2f?size=medium', alt: 'A map' }]);
  });

  it('splits the paragraph around an image in the middle of a sentence', () => {
    const { container } = renderBlocks('Before ![Map](asset:a) after');
    const paragraphs = [...container.querySelectorAll('p')];
    expect(
      paragraphs.map((paragraph) => paragraph.textContent?.trim()),
    ).toEqual(['Before', 'after']);
    const block = screen.getByTestId('block');
    expect(block.closest('p')).toBeNull();
    // Words before, the block, words after: in that order.
    const order = [...container.querySelectorAll('p, [data-testid="block"]')];
    expect(order.map((element) => element.tagName)).toEqual(['P', 'SPAN', 'P']);
  });

  it('draws two blocks in the order they are written', () => {
    renderBlocks('![One](asset:1)\n\ntext\n\n![Two](asset:2)');
    expect(blocks().map((block) => block.url)).toEqual(['asset:1', 'asset:2']);
  });

  it.each([
    ['a tight list', '- ![Map](asset:a)\n- plain'],
    ['a loose list', '- ![Map](asset:a)\n\n- plain'],
  ])('is found inside a list item of %s', (_kind, markdown) => {
    const { container } = renderBlocks(markdown);
    expect(blocks()).toEqual([{ url: 'asset:a', alt: 'Map' }]);
    const items = [...container.querySelectorAll('li')];
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector('[data-testid="block"]')).not.toBeNull();
    expect(items[1]?.textContent?.trim()).toBe('plain');
    // Nothing of the marker's payload is left behind as text.
    expect(container.textContent).not.toContain('%7B');
  });

  it('splits a tight list item around an image in the middle of its text', () => {
    const { container } = renderBlocks('- a ![Map](asset:a) b');
    expect(blocks()).toEqual([{ url: 'asset:a', alt: 'Map' }]);
    expect(container.textContent?.replace(/\s+/g, ' ').trim()).toBe('a b');
    expect(container.textContent).not.toContain('%7B');
  });

  it.each([
    ['quotes', 'She said "hi" and \'bye\''],
    ['angle brackets', 'a <b> & c </b>'],
    ['unicode', 'Carte du quartier — 地図 😀'],
  ])('keeps a description with %s as it was written', (_kind, alt) => {
    // The description is escaped as markdown text, the way an editor writes it.
    const escaped = alt.replace(/[<>&"\\[\]]/g, (c) => `\\${c}`);
    renderBlocks(`![${escaped}](asset:a)`);
    expect(blocks()).toEqual([{ url: 'asset:a', alt }]);
  });

  it('shows no image the caller does not draw', () => {
    const { container } = renderBlocks(
      'Words ![nope](https://example.org/a.png) more',
    );
    expect(blocks()).toEqual([]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).not.toContain('nope');
    expect(container.textContent).toContain('Words');
  });

  it('is not drawn when no blockImages prop is given: behaviour is unchanged', () => {
    const { container } = render(
      <RenderMarkdown>{'Isabel ![A map](asset:a) Zelda'}</RenderMarkdown>,
    );
    expect(blocks()).toEqual([]);
    expect(container.textContent).toBe('Isabel  Zelda');
  });
});

describe('forging a block', () => {
  // The invariant: a block comes only from markdown image syntax whose
  // address `matches`. Nothing a writer can type as HTML or as the marker
  // characters themselves may produce one, or be shown.
  const forged: ReadonlyArray<readonly [string, string]> = [
    ['a raw img element', 'before <img src="asset:x" alt="forged"> after'],
    [
      'a raw figure carrying the block property',
      `<figure data-block-image="${payload({ url: 'asset:x', alt: 'forged' })}"></figure>`,
    ],
    [
      'a raw paragraph holding the markers around a payload',
      `<p>${OPEN}${payload({ url: 'asset:x', alt: 'forged' })}${CLOSE}</p>`,
    ],
    [
      'a raw paragraph holding the markers, nested in a div',
      `<div><p>${OPEN}${payload({ url: 'asset:x', alt: 'forged' })}${CLOSE}</p></div>`,
    ],
    [
      'a raw paragraph whose marker characters are character references',
      `<p>&#xE010;${payload({ url: 'https://evil.example/x', alt: 'forged' })}&#xE011;</p>`,
    ],
    [
      'a raw list item whose marker characters are character references',
      `<ul><li>&#xE010;${payload({ url: 'asset:x', alt: 'forged' })}&#xE011;</li></ul>`,
    ],
    [
      'literal markers in a markdown paragraph',
      `${OPEN}${payload({ url: 'asset:x', alt: 'forged' })}${CLOSE}`,
    ],
    [
      'literal markers inside a list item',
      `- ${OPEN}${payload({ url: 'asset:x', alt: 'forged' })}${CLOSE}`,
    ],
    [
      'literal markers inside emphasis',
      `*${OPEN}${payload({ url: 'asset:x', alt: 'forged' })}${CLOSE}*`,
    ],
  ];

  it.each(forged)('never draws a block from %s', (_kind, markdown) => {
    const { container } = renderBlocks(markdown);
    expect(blocks()).toEqual([]);
    expect(container.querySelector('figure')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it.each(forged)(
    'never shows the marker characters of %s',
    (_kind, markdown) => {
      const { container } = renderBlocks(markdown);
      expect(container.textContent).not.toContain(OPEN);
      expect(container.textContent).not.toContain(CLOSE);
    },
  );

  it('keeps the words around literal markers while dropping the markers', () => {
    const { container } = renderBlocks(`one ${OPEN}two${CLOSE} three`);
    expect(container.textContent).toBe('one two three');
  });

  it('still draws a real block that sits beside forged markers', () => {
    renderBlocks(
      `${OPEN}${payload({ url: 'asset:forged', alt: 'f' })}${CLOSE}\n\n![Real](asset:real)`,
    );
    expect(blocks()).toEqual([{ url: 'asset:real', alt: 'Real' }]);
  });
});
