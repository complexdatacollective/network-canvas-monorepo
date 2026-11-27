import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderBare, screen, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { assetBlockDescription } from '@codaco/protocol-builder/fields/assetBlocks/assetBlockDescription';
import {
  type CurrentProtocol,
  isAssetBlockUrl,
  type LocaleTag,
  type LocalizedString,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';
import { testProtocol } from '~/__tests__/helpers';

import SummaryContext from '../../SummaryContext';
import Stage from '../Stage';

const manifest: CurrentProtocol['assetManifest'] = {
  map: { id: 'map', type: 'image', name: 'map.png', source: 'map.png' },
  song: { id: 'song', type: 'audio', name: 'song.mp3', source: 'song.mp3' },
  clip: { id: 'clip', type: 'video', name: 'clip.mp4', source: 'clip.mp4' },
  people: {
    id: 'people',
    type: 'network',
    name: 'people.csv',
    source: 'people.csv',
  },
};

const protocolIn = (locales: LocaleTag[]) =>
  testProtocol({
    name: 'Summary protocol',
    localization: { defaultLocale: locales[0] ?? 'en', locales },
    assetManifest: manifest,
  });

const render = (ui: ReactElement) =>
  renderBare(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    ),
  });

const renderStage = (
  type: string,
  content: LocalizedString,
  locales: LocaleTag[] = ['en'],
) => {
  const protocol = protocolIn(locales);
  return render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index: [] }}
    >
      <Stage
        id="stage"
        label={{ en: 'A stage' }}
        stageNumber={1}
        type={type}
        configuration={{ content }}
      />
    </SummaryContext.Provider>,
  );
};

/** The label and value of each row of a block's table, as printed. */
const rowsOf = (block: Element) =>
  within(block as HTMLElement)
    .getAllByRole('row')
    .map((row) =>
      Array.from(row.querySelectorAll('td'), (cell) => cell.textContent),
    );

const blocks = (kind: string) =>
  Array.from(document.querySelectorAll(`[data-asset-block="${kind}"]`));

const only = (kind: string) => {
  const found = blocks(kind);
  expect(found).toHaveLength(1);
  const [block] = found;
  if (block === undefined) throw new Error('unreachable');
  return block;
};

describe('Protocol Summary page content', () => {
  it('prints the heading and the text of an Information stage under one Page Content section', () => {
    renderStage('Information', { en: '# Welcome\n\nSome *text* here.' });

    expect(screen.getAllByText('Page Content')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Welcome', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText(/Some/)).toBeInTheDocument();
  });

  it('prints an image block with its description and size, and no playback', () => {
    renderStage('Information', {
      en: '![A map of the area](asset:map?size=medium)',
    });

    expect(rowsOf(only('image'))).toEqual([
      ['Type', 'Image'],
      ['Name', 'map.png'],
      ['Description', 'A map of the area'],
      ['Block Size', 'Medium'],
    ]);
  });

  it('links the name of a file to its entry among the resources', () => {
    renderStage('Information', { en: '![](asset:map)' });

    expect(
      within(only('image') as HTMLElement).getByRole('link', {
        name: 'map.png',
      }),
    ).toHaveAttribute('href', expect.stringContaining('#asset-map'));
  });

  it('leaves out the size of an image as wide as the page, and the description of one with none', () => {
    renderStage('Information', { en: '![](asset:map)' });

    expect(rowsOf(only('image'))).toEqual([
      ['Type', 'Image'],
      ['Name', 'map.png'],
    ]);
  });

  // Every block is centred, so the summary never says where one sits, even
  // for an address that tries to place it.
  it('prints no position for a block whose address tries to place it', () => {
    renderStage('Information', {
      en: '![](asset:map?size=small&align=start)',
    });

    expect(rowsOf(only('image'))).toEqual([
      ['Type', 'Image'],
      ['Name', 'map.png'],
      ['Block Size', 'Small'],
    ]);
  });

  it('prints an audio block with its playback, and never a size', () => {
    renderStage('Information', {
      en: '![Their song](asset:song?size=large&autoplay=false&loop=false)',
    });

    expect(rowsOf(only('audio'))).toEqual([
      ['Type', 'Audio'],
      ['Name', 'song.mp3'],
      ['Description', 'Their song'],
      ['Playback', 'Started by the participant, and plays once'],
    ]);
  });

  it('prints a video block with its size and playback', () => {
    renderStage('Information', {
      en: '![](asset:clip?size=large)',
    });

    expect(rowsOf(only('video'))).toEqual([
      ['Type', 'Video'],
      ['Name', 'clip.mp4'],
      ['Block Size', 'Large'],
      ['Playback', 'Starts automatically and repeats'],
    ]);
  });

  it.each([
    ['', 'Starts automatically and repeats'],
    ['?loop=false', 'Starts automatically and plays once'],
    ['?autoplay=false', 'Started by the participant, then repeats'],
    [
      '?autoplay=false&loop=false',
      'Started by the participant, and plays once',
    ],
  ])('words the playback of an audio block with %j', (query, wording) => {
    renderStage('Information', { en: `![](asset:song${query})` });

    const playback = rowsOf(only('audio')).find(
      ([label]) => label === 'Playback',
    );
    expect(playback).toEqual(['Playback', wording]);
  });

  it('says so, in place of a table, for a file that is not among the resources', () => {
    renderStage('Information', { en: '![](asset:gone)' });

    expect(document.querySelector('[data-asset-block]')).toBeNull();
    expect(
      screen.getByText(/not among this protocol’s resources/),
    ).toBeInTheDocument();
  });

  it('says so for a file a page cannot show, such as a network data file', () => {
    renderStage('Information', { en: '![](asset:people)' });

    expect(document.querySelector('[data-asset-block]')).toBeNull();
    expect(
      screen.getByText(/not among this protocol’s resources/),
    ).toBeInTheDocument();
  });

  it('prints nothing for an image that does not name a resource', () => {
    renderStage('Information', {
      en: '# Welcome\n\n![A web picture](https://example.com/a.png)',
    });

    expect(document.querySelector('[data-asset-block]')).toBeNull();
    expect(screen.queryByText(/not among this protocol’s/)).toBeNull();
    // The stage's own illustration is an image; the web picture is not drawn.
    expect(document.querySelector('img[src*="example.com"]')).toBeNull();
    expect(screen.queryByText('A web picture')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Welcome' }),
    ).toBeInTheDocument();
  });

  it('prints the page once for each language, with that language’s own files', () => {
    renderStage(
      'Information',
      {
        en: '# Hello\n\n![](asset:map?size=small)',
        fr: '# Bonjour\n\n![](asset:song)',
      },
      ['en', 'fr'],
    );

    expect(screen.getAllByText('Page Content')).toHaveLength(1);
    const english = screen.getByText('Hello').closest('[lang]');
    const french = screen.getByText('Bonjour').closest('[lang]');
    expect(english).toHaveAttribute('lang', 'en');
    expect(french).toHaveAttribute('lang', 'fr');
    expect(english).not.toBe(french);

    expect(within(english as HTMLElement).getAllByRole('table')).toHaveLength(
      1,
    );
    expect(
      (english as HTMLElement).querySelector('[data-asset-block="image"]'),
    ).not.toBeNull();
    expect(
      (english as HTMLElement).querySelector('[data-asset-block="audio"]'),
    ).toBeNull();
    expect(
      (french as HTMLElement).querySelector('[data-asset-block="audio"]'),
    ).not.toBeNull();
    expect(
      (french as HTMLElement).querySelector('[data-asset-block="image"]'),
    ).toBeNull();
  });

  it('prints no Page Content section for a stage that is not an Information stage, though it holds content', () => {
    renderStage('FinishSession', { en: '# Thank you\n\n![](asset:map)' });

    expect(screen.queryByText('Page Content')).not.toBeInTheDocument();
    expect(document.querySelector('[data-asset-block]')).toBeNull();
    // A finish stage prints its closing text through its own section.
    expect(screen.getByText('Thank you')).toBeInTheDocument();
  });
});

describe('a file printed inside text of another language', () => {
  // The `lang` and `dir` that apply to an element: its own, or the nearest
  // ancestor's.
  const languageOf = (element: Element) => ({
    lang: element.closest('[lang]')?.getAttribute('lang'),
    dir: element.closest('[dir]')?.getAttribute('dir'),
  });

  const descriptionIn = (block: Element, text: string) =>
    within(block as HTMLElement).getByText(text);

  it('is described in the summary’s language, its description in the text’s', () => {
    renderStage(
      'Information',
      { ar: '![خريطة المنطقة](asset:map?size=medium)' },
      ['ar'],
    );

    const block = only('image');
    // The summary's own words: the interface's language, English here.
    expect(
      languageOf(within(block as HTMLElement).getByText('Medium')),
    ).toEqual({ lang: 'en', dir: 'ltr' });
    expect(languageOf(descriptionIn(block, 'خريطة المنطقة'))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
  });

  it('gives each translation’s description that translation’s language', () => {
    renderStage(
      'Information',
      {
        en: '![A map](asset:map)',
        ar: '![خريطة](asset:map)',
      },
      ['en', 'ar'],
    );

    const blockSaying = (text: string) => {
      const found = blocks('image').find((block) =>
        block.textContent?.includes(text),
      );
      if (found === undefined) throw new Error(`No block says ${text}`);
      return found;
    };
    expect(blocks('image')).toHaveLength(2);
    expect(languageOf(descriptionIn(blockSaying('A map'), 'A map'))).toEqual({
      lang: 'en',
      dir: 'ltr',
    });
    const arabic = blockSaying('خريطة');
    expect(languageOf(descriptionIn(arabic, 'خريطة'))).toEqual({
      lang: 'ar',
      dir: 'rtl',
    });
    expect(
      languageOf(within(arabic as HTMLElement).getByText('Image')),
    ).toEqual({ lang: 'en', dir: 'ltr' });
  });

  it('says a file it cannot find in the summary’s language', () => {
    renderStage('Information', { ar: '![](asset:gone)' }, ['ar']);

    expect(languageOf(screen.getByText(/is not among this protocol/))).toEqual({
      lang: 'en',
      dir: 'ltr',
    });
  });
});

/**
 * The page as the interview reads it: the Information interface hands the
 * stored text, unchanged, to the shared renderer with the section elements
 * and every file the text names drawn as a block (`Information.tsx`,
 * `LocalizedMarkdown`). Each block is drawn here as a mark of which file it
 * names and with what description, so only the reading is compared.
 */
const interviewReading = (text: string) => {
  const { container, unmount } = renderBare(
    <RenderMarkdown
      allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
      blockImages={{
        matches: isAssetBlockUrl,
        Block: ({ url, alt }) => (
          <figure
            data-probe-block={readAssetBlockUrl(url)?.block.assetId ?? ''}
            data-probe-description={assetBlockDescription(alt)}
          />
        ),
      }}
    >
      {text}
    </RenderMarkdown>,
  );
  const files = Array.from(
    container.querySelectorAll('[data-probe-block]'),
    (block) => ({
      file: block.getAttribute('data-probe-block'),
      description: block.getAttribute('data-probe-description'),
    }),
  );
  const words = container.cloneNode(true) as HTMLElement;
  for (const block of words.querySelectorAll('[data-probe-block]')) {
    block.replaceWith(' ');
  }
  unmount();
  return {
    files,
    words: (words.textContent ?? '').replace(/\s+/g, ' ').trim(),
  };
};

/** The page as the summary prints it: the same two things. */
const summaryReading = (text: string) => {
  const { unmount } = renderStage('Information', { en: text });
  const page = screen.getByRole('heading', { name: 'Page Content' })
    .nextElementSibling as HTMLElement;
  const files = Array.from(
    page.querySelectorAll('[data-asset-block]'),
    (block) => ({
      file:
        within(block as HTMLElement)
          .getByRole('link')
          .getAttribute('href')
          ?.replace(/^.*#asset-/, '') ?? null,
      description:
        rowsOf(block).find(([label]) => label === 'Description')?.[1] ?? '',
    }),
  );
  const words = page.cloneNode(true) as HTMLElement;
  for (const block of words.querySelectorAll('[data-asset-block]')) {
    block.replaceWith(' ');
  }
  unmount();
  return {
    files,
    words: (words.textContent ?? '').replace(/\s+/g, ' ').trim(),
  };
};

describe('a page printed as the interview reads it', () => {
  it.each([
    ['a bare address', '![Map](asset:map)'],
    ['a bracketed address', '![Map](<asset:map>)'],
    ['a bare address with settings', '![Map](asset:map?size=small&loop=false)'],
    [
      'a bracketed address with settings',
      '![Map](<asset:map?size=small&loop=false>)',
    ],
    ['a bare address with a title', '![Map](asset:map "The area")'],
    ['a bracketed address with a title', '![Map](<asset:map> "The area")'],
    [
      'a description holding brackets, an ampersand and backslashes',
      '![a < b > c & d \\] e \\\\ f](asset:map)',
    ],
    [
      'a bracketed address after such a description',
      '![a < b > c & d \\] e \\\\ f](<asset:map>)',
    ],
    ['a block in a list item', '- ![Map](<asset:map>)\n- ![Song](asset:song)'],
    ['a block in a quotation', '> ![Map](<asset:map>)'],
    [
      'two blocks on consecutive lines',
      '![Map](<asset:map>)\n![Song](asset:song)',
    ],
    ['a block named by reference', '![Map][ref]\n\n[ref]: asset:map'],
    [
      'a block named by a bracketed reference',
      '![Map][ref]\n\n[ref]: <asset:map>',
    ],
    [
      'angle brackets in the words beside a block',
      'a < b ![Map](<asset:map>) c > d',
    ],
    ['a line opening with an angle bracket', '> 5 years\n\n![Map](asset:map)'],
  ])('with %s', (_case, text) => {
    expect(summaryReading(text)).toEqual(interviewReading(text));
  });

  it('draws a bracketed address as a file, never as the text it is written in', () => {
    renderStage('Information', { en: '# Map\n\n![The area](<asset:map>)' });

    expect(rowsOf(only('image'))).toEqual([
      ['Type', 'Image'],
      ['Name', 'map.png'],
      ['Description', 'The area'],
    ]);
    expect(
      within(only('image') as HTMLElement).getByRole('link', {
        name: 'map.png',
      }),
    ).toHaveAttribute('href', expect.stringContaining('#asset-map'));
    expect(screen.queryByText(/asset:map/)).toBeNull();
  });
});
