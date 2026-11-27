import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';

import { FixText } from '../fixEditText';

afterEach(cleanup);

/** The words a rendering shows, with its spacing evened out. */
const words = (element: Element) =>
  (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * The text as the interview reads it: stored markdown handed unchanged to the
 * shared renderer with the section elements. A review's Now and After boxes
 * draw no file, so neither does this.
 */
const interviewWords = (text: string) => {
  const { container, unmount } = render(
    <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
      {text}
    </RenderMarkdown>,
  );
  const shown = words(container);
  unmount();
  return shown;
};

const fixWords = (text: string) => {
  const { container, unmount } = render(
    <FixText text={text} markdown singleLine={false} />,
  );
  const shown = words(container);
  unmount();
  return shown;
};

describe('protocol text in a review’s Now and After boxes', () => {
  it.each([
    ['a bare address', 'Before\n\n![Map](asset:map)\n\nAfter'],
    ['a bracketed address', 'Before\n\n![Map](<asset:map>)\n\nAfter'],
    [
      'a bracketed address with settings',
      '![Map](<asset:map?size=small&loop=false>)',
    ],
    ['angle brackets beside a block', 'a < b ![Map](<asset:map>) c > d'],
    ['a line opening with an angle bracket', '> 5 years'],
  ])('reads %s as the interview does', (_case, text) => {
    expect(fixWords(text)).toBe(interviewWords(text));
  });

  it('never shows the markdown a file is written in', () => {
    expect(fixWords('![Map](<asset:map>)')).not.toContain('asset:map');
  });

  it('draws a one-line text in a paragraph, as each paragraph of several lines', () => {
    const { container } = render(
      <>
        <FixText text="Several lines" markdown singleLine={false} />
        <FixText text="One *line*" markdown singleLine />
      </>,
    );
    const [several, line] = Array.from(container.querySelectorAll('p'));
    expect(several).toHaveTextContent('Several lines');
    expect(line).toHaveTextContent('One line');
    expect(line?.className).toBe(several?.className);
  });
});
