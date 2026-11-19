import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  type AssetBlock,
  assetBlockMarkdown,
  type LocaleTag,
  type LocalizationDeclaration,
  type LocalizedString,
} from '@codaco/protocol-validation';

import { InterviewQueryClientProvider } from '../../../contexts/InterviewQueryClientProvider';
import { ContractProvider } from '../../../contract/context';
import type { ResolvedAsset } from '../../../contract/types';
import protocol from '../../../store/modules/protocol';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import Information from '../Information';

type InformationStage = StageProps<'Information'>['stage'];

// fresco-ui's ScrollArea observes its content via ResizeObserver, which jsdom
// does not implement. A no-op stub is enough for these render assertions.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Each asset's address is its id, so a test can tell which file a block drew.
const requestAsset = vi.fn((assetId: string) =>
  Promise.resolve(`blob://${assetId}`),
);

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

beforeEach(() => {
  requestAsset.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
};

const ENGLISH_AND_ARABIC: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'ar'],
};

function makeStore(
  assets: ResolvedAsset[],
  localization: LocalizationDeclaration,
) {
  return configureStore({
    reducer: { protocol },
    preloadedState: {
      // Partial protocol slice — only `assets` is read by the Information
      // stage. Mirrors the `as never` preloadedState idiom used by the other
      // interface tests (a full ProtocolPayload is not needed here).
      protocol: { assets, localization } as never,
    },
  });
}

function renderInformation(
  stage: InformationStage,
  assets: ResolvedAsset[] = [],
  {
    localization = ENGLISH_ONLY,
    locale = null,
  }: { localization?: LocalizationDeclaration; locale?: LocaleTag | null } = {},
) {
  const store = makeStore(assets, localization);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <InterviewQueryClientProvider protocolKey="test-protocol">
          <TestProtocolLocalization localization={localization} locale={locale}>
            <ContractProvider onFinish={vi.fn()} onRequestAsset={requestAsset}>
              {children}
            </ContractProvider>
          </TestProtocolLocalization>
        </InterviewQueryClientProvider>
      </Provider>
    );
  }

  return render(
    <Information
      stage={stage}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
    { wrapper: Wrapper },
  );
}

const makeStage = (content: LocalizedString | string): InformationStage => ({
  id: 'info-1',
  type: 'Information',
  label: { en: 'Info' },
  content: typeof content === 'string' ? { en: content } : content,
});

/** A page of just one block, under a heading. */
const pageWith = (block: AssetBlock) =>
  makeStage(`# Page\n\n${assetBlockMarkdown(block)}`);

const IMAGE: ResolvedAsset = {
  assetId: 'img-1',
  name: 'Photo',
  type: 'image',
  source: 'photo.png',
};
const AUDIO: ResolvedAsset = {
  assetId: 'aud-1',
  name: 'Intro Clip',
  type: 'audio',
  source: 'clip.mp3',
};
const VIDEO: ResolvedAsset = {
  assetId: 'vid-1',
  name: 'Intro Clip',
  type: 'video',
  source: 'intro.mp4',
};

const query = (selector: string) => document.querySelector(selector);

/** Waits for the one element the page's media block draws. */
const mediaElement = async (selector: string) => {
  await waitFor(() => expect(query(selector)).not.toBeNull());
  const element = query(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`${selector} was not drawn`);
  }
  return element;
};

/** `mediaElement` for an audio or video player. */
const playerElement = async (selector: string) => {
  const element = await mediaElement(selector);
  if (!(element instanceof HTMLMediaElement)) {
    throw new Error(`${selector} is not a media player`);
  }
  return element;
};

describe('the page’s heading and text', () => {
  it('shows a heading written in the text as the page’s heading', () => {
    renderInformation(makeStage('# Before you begin\n\nSome words.'));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Before you begin' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Some words.').tagName).toBe('P');
  });

  it('centres a heading that opens the page', () => {
    renderInformation(makeStage('# Before you begin\n\nSome words.'));

    const heading = screen.getByRole('heading', { name: 'Before you begin' });
    expect(heading.parentElement).toHaveClass('[&>h1:first-child]:text-center');
    expect(heading.matches('h1:first-child')).toBe(true);
  });

  it('formats the text as a message before rendering it as markdown', () => {
    renderInformation(
      makeStage("# Title\n\nPress '{'Next'}' when you are **ready**."),
    );

    expect(screen.getByText('ready').tagName).toBe('STRONG');
    expect(
      screen.getByText((_, element) =>
        element?.tagName === 'P'
          ? element.textContent === 'Press {Next} when you are ready.'
          : false,
      ),
    ).toBeInTheDocument();
  });

  it('keeps the page’s blocks as siblings of its heading', () => {
    renderInformation(
      makeStage('# Before you begin\n\n## Section\n\nSome **context**.'),
    );

    // Siblings: the typography's `not-first:`/`not-last:` spacing reads that
    // order, so a wrapper around the text would respace it.
    const title = screen.getByRole('heading', { name: 'Before you begin' });
    const section = screen.getByRole('heading', { name: 'Section' });
    expect(section.previousElementSibling).toBe(title);
    expect(section.nextElementSibling).toBe(
      screen.getByText('context').closest('p'),
    );
  });
});

describe('Information asset fallbacks', () => {
  it('renders a visible placeholder for an asset id absent from the manifest', () => {
    renderInformation(pageWith({ assetId: 'missing-asset' }), []);

    expect(screen.getByTestId('information-item-fallback')).toBeTruthy();
    expect(query('img')).toBeNull();
  });

  it.each(['network', 'geojson', 'apikey'] as const)(
    'renders a visible placeholder for a %s asset',
    async (type) => {
      renderInformation(pageWith({ assetId: 'other-1' }), [
        { assetId: 'other-1', name: 'Classmates', type },
      ]);

      await waitFor(() =>
        expect(screen.getByTestId('information-item-fallback')).toBeTruthy(),
      );
      expect(query('img, audio, video')).toBeNull();
    },
  );

  it('does NOT render the fallback for a valid image block', async () => {
    renderInformation(pageWith({ assetId: 'img-1' }), [IMAGE]);

    await mediaElement('img');
    expect(screen.queryByTestId('information-item-fallback')).toBeNull();
  });

  it('draws the file the block names', async () => {
    renderInformation(pageWith({ assetId: 'img-1' }), [
      IMAGE,
      { ...IMAGE, assetId: 'img-2' },
    ]);

    const image = await mediaElement('img');
    expect(image.getAttribute('src')).toBe('blob://img-1');
    expect(requestAsset).not.toHaveBeenCalledWith('img-2');
  });
});

describe('Information media MIME type derives from source', () => {
  it('audio <source> type derives from source when name lacks an extension', async () => {
    renderInformation(pageWith({ assetId: 'aud-1' }), [AUDIO]);

    const source = await mediaElement('audio source');
    expect(source.getAttribute('type')).toBe('audio/mpeg');
  });

  it('video <source> type derives from source (.mov -> video/mp4)', async () => {
    renderInformation(pageWith({ assetId: 'vid-1' }), [
      { ...VIDEO, source: 'intro.mov' },
    ]);

    const source = await mediaElement('video source');
    expect(source.getAttribute('type')).toBe('video/mp4');
  });
});

/**
 * A block's description is what the researcher wrote about the file, and it
 * is the only thing a participant who cannot see or hear it is given: an
 * image's alt text, and the accessible name of an audio or video player. The
 * asset's own name is a filing label — "Intro Clip" — in no particular
 * language, so a player nobody described is named only for what it is.
 */
describe('what a participant who cannot see a media block is told', () => {
  it('describes an image with the researcher’s words', async () => {
    renderInformation(
      pageWith({
        assetId: 'img-1',
        description: 'Two people talking at a kitchen table.',
      }),
      [IMAGE],
    );

    const image = await mediaElement('img');
    expect(image.getAttribute('alt')).toBe(
      'Two people talking at a kitchen table.',
    );
  });

  it('names an audio player with the researcher’s words', async () => {
    renderInformation(
      pageWith({
        assetId: 'aud-1',
        description: 'A researcher explaining what happens next.',
      }),
      [AUDIO],
    );

    expect((await mediaElement('audio')).getAttribute('aria-label')).toBe(
      'A researcher explaining what happens next.',
    );
    expect(
      screen.getByLabelText('A researcher explaining what happens next.'),
    ).toBe(query('audio'));
  });

  it('names a video player with the researcher’s words', async () => {
    renderInformation(
      pageWith({
        assetId: 'vid-1',
        description: 'A researcher demonstrating how to draw a connection.',
      }),
      [VIDEO],
    );

    expect((await mediaElement('video')).getAttribute('aria-label')).toBe(
      'A researcher demonstrating how to draw a connection.',
    );
  });

  it('names an undescribed video player as a video, in English, not after the file', async () => {
    renderInformation(pageWith({ assetId: 'vid-1' }), [VIDEO]);

    const video = await mediaElement('video');
    expect(video.getAttribute('aria-label')).toBe('Video');
    expect(video.getAttribute('lang')).toBe('en');
  });

  it('names an undescribed audio player as audio, in English, not after the file', async () => {
    renderInformation(pageWith({ assetId: 'aud-1' }), [AUDIO]);

    const audio = await mediaElement('audio');
    expect(audio.getAttribute('aria-label')).toBe('Audio');
    expect(audio.getAttribute('lang')).toBe('en');
  });

  it('gives a described player no language of its own', async () => {
    renderInformation(
      pageWith({ assetId: 'aud-1', description: 'Eine Erklärung.' }),
      [AUDIO],
    );

    expect((await mediaElement('audio')).hasAttribute('lang')).toBe(false);
  });

  it('leaves a picture with no description decorative', async () => {
    renderInformation(pageWith({ assetId: 'img-1' }), [IMAGE]);

    expect((await mediaElement('img')).getAttribute('alt')).toBe('');
  });
});

/**
 * A description that is only whitespace.
 *
 * Text written by hand can hold `![   ](asset:id)`. Read literally, such a
 * description names the player nothing at all — an empty accessible name — so
 * blank and absent have to be the same answer.
 */
describe('a media block described with nothing but whitespace', () => {
  const blankly = (assetId: string) =>
    makeStage(`# Page\n\n![   ](asset:${assetId})`);

  it('names a video player as a video', async () => {
    renderInformation(blankly('vid-1'), [VIDEO]);

    expect((await mediaElement('video')).getAttribute('aria-label')).toBe(
      'Video',
    );
  });

  it('names an audio player as audio', async () => {
    renderInformation(blankly('aud-1'), [AUDIO]);

    expect((await mediaElement('audio')).getAttribute('aria-label')).toBe(
      'Audio',
    );
  });

  /**
   * A picture is the one case where saying nothing is right: an empty `alt` is
   * how a decorative image is declared, and a researcher who left the
   * description blank described nothing. What must not survive is the blank
   * itself — an `alt` of spaces is announced as a run of whitespace rather
   * than skipped.
   */
  it('leaves a picture decorative rather than alt-texting the blank', async () => {
    renderInformation(blankly('img-1'), [IMAGE]);

    expect((await mediaElement('img')).getAttribute('alt')).toBe('');
  });
});

describe('a block’s size', () => {
  const HEIGHT_CLASSES = ['max-h-48', 'max-h-96', 'max-h-[60vh]'];

  it.each([
    ['small', 'max-h-48'],
    ['medium', 'max-h-96'],
    ['large', 'max-h-[60vh]'],
  ] as const)('holds a %s image to its band: %s', async (size, expected) => {
    renderInformation(pageWith({ assetId: 'img-1', size }), [IMAGE]);

    const image = await mediaElement('img');
    expect(image).toHaveClass(expected);
    for (const other of HEIGHT_CLASSES.filter((band) => band !== expected)) {
      expect(image).not.toHaveClass(other);
    }
  });

  it('holds a video to its band', async () => {
    renderInformation(pageWith({ assetId: 'vid-1', size: 'medium' }), [VIDEO]);

    expect(await mediaElement('video')).toHaveClass('max-h-96');
  });

  it('leaves an image with no size as tall as its width makes it', async () => {
    renderInformation(pageWith({ assetId: 'img-1' }), [IMAGE]);

    const image = await mediaElement('img');
    for (const band of HEIGHT_CLASSES) expect(image).not.toHaveClass(band);
  });
});

describe('a block’s alignment', () => {
  it('sits a sized image at the start or the end of its box', async () => {
    renderInformation(
      makeStage(
        [
          '# Page',
          assetBlockMarkdown({
            assetId: 'img-1',
            size: 'small',
            align: 'start',
            description: 'start',
          }),
          assetBlockMarkdown({
            assetId: 'img-1',
            size: 'small',
            description: 'centre',
          }),
          assetBlockMarkdown({
            assetId: 'img-1',
            size: 'small',
            align: 'end',
            description: 'end',
          }),
        ].join('\n\n'),
      ),
      [IMAGE],
    );

    await waitFor(() =>
      expect(document.querySelectorAll('img')).toHaveLength(3),
    );
    expect(screen.getByAltText('start')).toHaveClass('object-left');
    expect(screen.getByAltText('start')).not.toHaveClass('object-right');
    expect(screen.getByAltText('end')).toHaveClass('object-right');
    expect(screen.getByAltText('end')).not.toHaveClass('object-left');
    expect(screen.getByAltText('centre')).not.toHaveClass('object-left');
    expect(screen.getByAltText('centre')).not.toHaveClass('object-right');
  });

  it('leaves an image with no size nowhere to sit but the full width', async () => {
    renderInformation(pageWith({ assetId: 'img-1', align: 'end' }), [IMAGE]);

    expect(await mediaElement('img')).not.toHaveClass('object-right');
  });

  it.each([
    ['start', 'justify-start'],
    ['center', 'justify-center'],
    ['end', 'justify-end'],
  ] as const)('sits an audio player at the %s', async (align, expected) => {
    // `center` is written as no setting at all, which is how it is stored.
    renderInformation(pageWith({ assetId: 'aud-1', align }), [AUDIO]);

    const audio = await mediaElement('audio');
    const block = audio.closest('[data-asset-block]');
    expect(block).toHaveClass('flex', expected);
    for (const other of ['justify-start', 'justify-center', 'justify-end']) {
      if (other !== expected) expect(block).not.toHaveClass(other);
    }
  });

  it('centres an audio player that names no alignment', async () => {
    renderInformation(pageWith({ assetId: 'aud-1' }), [AUDIO]);

    const audio = await mediaElement('audio');
    expect(audio.closest('[data-asset-block]')).toHaveClass('justify-center');
  });
});

describe('a block’s autoplay and loop settings', () => {
  it('starts and repeats audio by default', async () => {
    renderInformation(pageWith({ assetId: 'aud-1' }), [AUDIO]);

    const audio = await playerElement('audio');
    expect(audio.autoplay).toBe(true);
    expect(audio.loop).toBe(true);
  });

  it('keeps audio from starting when autoplay is off, and repeating when loop is off', async () => {
    renderInformation(
      pageWith({ assetId: 'aud-1', autoplay: false, loop: false }),
      [AUDIO],
    );

    const audio = await playerElement('audio');
    expect(audio.autoplay).toBe(false);
    expect(audio.loop).toBe(false);
  });

  it('switches audio autoplay and loop independently', async () => {
    renderInformation(pageWith({ assetId: 'aud-1', loop: false }), [AUDIO]);

    const audio = await playerElement('audio');
    expect(audio.autoplay).toBe(true);
    expect(audio.loop).toBe(false);
  });

  it('starts video by itself only without its sound', async () => {
    renderInformation(pageWith({ assetId: 'vid-1' }), [VIDEO]);

    const video = await playerElement('video');
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
  });

  it('plays video with its sound, and starts only when the participant does, when autoplay is off', async () => {
    renderInformation(pageWith({ assetId: 'vid-1', autoplay: false }), [VIDEO]);

    const video = await playerElement('video');
    expect(video.autoplay).toBe(false);
    expect(video.muted).toBe(false);
    expect(video.loop).toBe(true);
  });

  it('keeps video from repeating when loop is off', async () => {
    renderInformation(pageWith({ assetId: 'vid-1', loop: false }), [VIDEO]);

    const video = await playerElement('video');
    expect(video.loop).toBe(false);
    expect(video.autoplay).toBe(true);
  });
});

describe('where a block sits among the text', () => {
  it('shows each block as an element of its own, among the paragraphs', async () => {
    renderInformation(
      makeStage(
        [
          '# Page',
          'Before the picture.',
          assetBlockMarkdown({ assetId: 'img-1', description: 'A map' }),
          'After the picture.',
        ].join('\n\n'),
      ),
      [IMAGE],
    );

    const image = await mediaElement('img');
    const block = image.closest('[data-asset-block]');
    expect(block).not.toBeNull();
    expect(block?.tagName).not.toBe('P');
    expect(block?.previousElementSibling).toBe(
      screen.getByText('Before the picture.'),
    );
    expect(block?.nextElementSibling).toBe(
      screen.getByText('After the picture.'),
    );
  });

  it('splits a paragraph around an image written in the middle of a sentence', async () => {
    renderInformation(
      makeStage('# Page\n\nBefore ![A map](asset:img-1) after'),
      [IMAGE],
    );

    const image = await mediaElement('img');
    const block = image.closest('[data-asset-block]');
    // Text, block, text: the words either side are paragraphs of their own,
    // and the block is not inside one.
    expect(block?.closest('p')).toBeNull();
    expect(block?.previousElementSibling?.tagName).toBe('P');
    expect(block?.previousElementSibling).toHaveTextContent(/^Before$/);
    expect(block?.nextElementSibling?.tagName).toBe('P');
    expect(block?.nextElementSibling).toHaveTextContent(/^after$/);
  });

  it('shows blocks in the order the text names them', async () => {
    renderInformation(
      makeStage(
        [
          '# Page',
          assetBlockMarkdown({ assetId: 'aud-1', description: 'first' }),
          assetBlockMarkdown({ assetId: 'img-1', description: 'second' }),
        ].join('\n\n'),
      ),
      [IMAGE, AUDIO],
    );

    await waitFor(() =>
      expect(
        document.querySelectorAll(
          '[data-asset-block] img, [data-asset-block] audio',
        ),
      ).toHaveLength(2),
    );
    const [first, second] = [
      ...document.querySelectorAll('[data-asset-block]'),
    ];
    expect(first?.querySelector('audio')).not.toBeNull();
    expect(second?.querySelector('img')).not.toBeNull();
  });
});

describe('what is not a block', () => {
  it('shows an image that is not a file of the protocol as nothing, and asks for nothing', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('no network')));
    vi.stubGlobal('fetch', fetchSpy);

    renderInformation(
      makeStage('# Page\n\nBefore\n\n![x](https://example.com/a.png)\n\nAfter'),
      [IMAGE],
    );

    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    // Let any request an image would make get as far as it would.
    await Promise.resolve();
    expect(query('img')).toBeNull();
    expect(query('[data-asset-block]')).toBeNull();
    expect(requestAsset).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not make a block of an image written as HTML', async () => {
    renderInformation(
      makeStage(
        '# Page\n\n<img src="asset:img-1" alt="raw">\n\nAfter the raw image.',
      ),
      [IMAGE],
    );

    expect(screen.getByText('After the raw image.')).toBeInTheDocument();
    await Promise.resolve();
    expect(query('[data-asset-block]')).toBeNull();
    expect(
      document.querySelector('img[src^="blob:"], img[src^="asset:"]'),
    ).toBeNull();
    expect(requestAsset).not.toHaveBeenCalled();
  });

  it('does not make a block of an element written to look like one', async () => {
    renderInformation(
      makeStage(
        '# Page\n\n<figure data-block-image="%7B%22url%22%3A%22asset%3Aimg-1%22%2C%22alt%22%3A%22forged%22%7D">forged</figure>\n\nAfter the figure.',
      ),
      [IMAGE],
    );

    expect(screen.getByText('After the figure.')).toBeInTheDocument();
    await Promise.resolve();
    expect(query('[data-asset-block]')).toBeNull();
    expect(query('img')).toBeNull();
    expect(requestAsset).not.toHaveBeenCalled();
  });
});

describe('protocol text in the interview language', () => {
  it('leaves a heading shown in a fallback language to the interview’s boundary', () => {
    renderInformation(makeStage({ en: '# Before you begin' }), [], {
      localization: ENGLISH_AND_ARABIC,
      locale: 'ar',
    });

    const heading = screen.getByRole('heading', { name: 'Before you begin' });
    expect(heading.closest('[lang], [dir]')).toBeNull();
  });

  it('shows a translated heading with no language of its own', () => {
    renderInformation(
      makeStage({ en: '# Before you begin', ar: '# قبل أن تبدأ' }),
      [],
      { localization: ENGLISH_AND_ARABIC, locale: 'ar' },
    );

    const heading = screen.getByRole('heading', { name: 'قبل أن تبدأ' });
    expect(heading.closest('[lang], [dir]')).toBeNull();
  });

  it('leaves the text’s language to the interview’s boundary', () => {
    renderInformation(makeStage({ en: '# Title\n\nSome **context**.' }), [], {
      localization: ENGLISH_AND_ARABIC,
      locale: 'ar',
    });

    // Even shown in a fallback language, the text names none of its own: the
    // interview sets one language for everything it renders.
    expect(screen.getByText('context').closest('[lang], [dir]')).toBeNull();
  });

  it('leaves an image description shown in a fallback language to the interview’s boundary', async () => {
    renderInformation(
      makeStage({
        en: `# Page\n\n${assetBlockMarkdown({
          assetId: 'img-1',
          description: 'Two people talking at a kitchen table.',
        })}`,
      }),
      [IMAGE],
      { localization: ENGLISH_AND_ARABIC, locale: 'ar' },
    );

    const image = await mediaElement('img');
    expect(image).toHaveAttribute(
      'alt',
      'Two people talking at a kitchen table.',
    );
    expect(image.closest('[lang], [dir]')).toBeNull();
  });

  it('shows the file the participant’s language names', async () => {
    const stage = makeStage({
      en: `# Page\n\n${assetBlockMarkdown({ assetId: 'img-en', description: 'English picture' })}`,
      ar: `# صفحة\n\n${assetBlockMarkdown({ assetId: 'img-ar', description: 'صورة عربية' })}`,
    });
    const assets: ResolvedAsset[] = [
      { ...IMAGE, assetId: 'img-en' },
      { ...IMAGE, assetId: 'img-ar' },
    ];

    renderInformation(stage, assets, {
      localization: ENGLISH_AND_ARABIC,
      locale: 'ar',
    });

    const arabic = await mediaElement('img');
    expect(arabic.getAttribute('src')).toBe('blob://img-ar');
    expect(arabic.getAttribute('alt')).toBe('صورة عربية');
    expect(document.querySelectorAll('img')).toHaveLength(1);
    expect(requestAsset).not.toHaveBeenCalledWith('img-en');
  });

  it('shows the default language’s file where the participant’s language has none', async () => {
    renderInformation(
      makeStage({
        en: `# Page\n\n${assetBlockMarkdown({ assetId: 'img-en', description: 'English picture' })}`,
      }),
      [{ ...IMAGE, assetId: 'img-en' }],
      { localization: ENGLISH_AND_ARABIC, locale: 'ar' },
    );

    const image = await mediaElement('img');
    expect(image.getAttribute('src')).toBe('blob://img-en');
  });
});
