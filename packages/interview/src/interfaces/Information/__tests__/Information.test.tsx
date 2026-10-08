import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  Item,
  LocaleTag,
  LocalizationDeclaration,
  LocalizedString,
} from '@codaco/protocol-validation';

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

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
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
  assets: ResolvedAsset[],
  {
    localization = ENGLISH_ONLY,
    locale = null,
  }: { localization?: LocalizationDeclaration; locale?: LocaleTag | null } = {},
) {
  const store = makeStore(assets, localization);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <TestProtocolLocalization localization={localization} locale={locale}>
          <ContractProvider
            onFinish={vi.fn()}
            onRequestAsset={() => Promise.resolve('blob://asset')}
          >
            {children}
          </ContractProvider>
        </TestProtocolLocalization>
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

const makeStage = (
  items: Item[],
  title: LocalizedString = { en: 'Information' },
): InformationStage => ({
  id: 'info-1',
  type: 'Information',
  label: { en: 'Info' },
  title,
  items,
});

describe('Information asset fallbacks', () => {
  it('renders a visible placeholder for an asset id absent from the manifest', () => {
    const stage = makeStage([
      { id: 'i1', type: 'asset', content: 'missing-asset' },
    ]);

    renderInformation(stage, []);

    expect(screen.getByTestId('information-item-fallback')).toBeTruthy();
  });

  it('renders a visible placeholder for a network/geojson/apikey asset', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'net-1' }]);
    const assets: ResolvedAsset[] = [
      { assetId: 'net-1', name: 'Classmates', type: 'network' },
    ];

    renderInformation(stage, assets);

    await waitFor(() =>
      expect(screen.getByTestId('information-item-fallback')).toBeTruthy(),
    );
  });

  it('does NOT render the fallback for a valid image item', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'img-1' }]);
    const assets: ResolvedAsset[] = [
      { assetId: 'img-1', name: 'Photo', type: 'image', source: 'photo.png' },
    ];

    renderInformation(stage, assets);

    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
    expect(screen.queryByTestId('information-item-fallback')).toBeNull();
  });
});

describe('Information media MIME type derives from source', () => {
  it('audio <source> type derives from source when name lacks an extension', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'aud-1' }]);
    const assets: ResolvedAsset[] = [
      {
        assetId: 'aud-1',
        name: 'Intro Clip',
        type: 'audio',
        source: 'clip.mp3',
      },
    ];

    renderInformation(stage, assets);

    await waitFor(() =>
      expect(document.querySelector('audio source')).toBeTruthy(),
    );
    const source = document.querySelector('audio source');
    expect(source?.getAttribute('type')).toBe('audio/mpeg');
  });

  it('video <source> type derives from source (.mov -> video/mp4)', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'vid-1' }]);
    const assets: ResolvedAsset[] = [
      {
        assetId: 'vid-1',
        name: 'Intro Clip',
        type: 'video',
        source: 'intro.mov',
      },
    ];

    renderInformation(stage, assets);

    await waitFor(() =>
      expect(document.querySelector('video source')).toBeTruthy(),
    );
    const source = document.querySelector('video source');
    expect(source?.getAttribute('type')).toBe('video/mp4');
  });
});

/**
 * An item's `description` is what the researcher wrote about the file, and it
 * is the only thing a participant who cannot see or hear it is given: an
 * image's alt text, and the accessible name of an audio or video player. The
 * asset's own name is a filing label — "Intro Clip" — in no particular
 * language, so a player nobody described is named only for what it is.
 */
describe('what a participant who cannot see a media item is told', () => {
  const named = async (selector: string) => {
    await waitFor(() => expect(document.querySelector(selector)).toBeTruthy());
    return document.querySelector(selector)?.getAttribute('aria-label');
  };

  it('describes an image with the researcher’s words', async () => {
    const stage = makeStage([
      {
        id: 'i1',
        type: 'asset',
        content: 'img-1',
        description: { en: 'Two people talking at a kitchen table.' },
      },
    ]);

    renderInformation(stage, [
      { assetId: 'img-1', name: 'Photo', type: 'image', source: 'photo.png' },
    ]);

    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
    expect(document.querySelector('img')?.getAttribute('alt')).toBe(
      'Two people talking at a kitchen table.',
    );
  });

  it('names an audio player with the researcher’s words', async () => {
    const stage = makeStage([
      {
        id: 'i1',
        type: 'asset',
        content: 'aud-1',
        description: { en: 'A researcher explaining what happens next.' },
      },
    ]);

    renderInformation(stage, [
      {
        assetId: 'aud-1',
        name: 'Intro Clip',
        type: 'audio',
        source: 'clip.mp3',
      },
    ]);

    expect(await named('audio')).toBe(
      'A researcher explaining what happens next.',
    );
  });

  it('names a video player with the researcher’s words', async () => {
    const stage = makeStage([
      {
        id: 'i1',
        type: 'asset',
        content: 'vid-1',
        description: {
          en: 'A researcher demonstrating how to draw a connection.',
        },
      },
    ]);

    renderInformation(stage, [
      {
        assetId: 'vid-1',
        name: 'Intro Clip',
        type: 'video',
        source: 'intro.mp4',
      },
    ]);

    expect(await named('video')).toBe(
      'A researcher demonstrating how to draw a connection.',
    );
  });

  it('names an undescribed video player as a video, not after the file', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'vid-1' }]);

    renderInformation(stage, [
      {
        assetId: 'vid-1',
        name: 'Intro Clip',
        type: 'video',
        source: 'intro.mp4',
      },
    ]);

    expect(await named('video')).toBe('Video');
  });

  it('names an undescribed audio player as audio, not after the file', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'aud-1' }]);

    renderInformation(stage, [
      {
        assetId: 'aud-1',
        name: 'Intro Clip',
        type: 'audio',
        source: 'clip.mp3',
      },
    ]);

    expect(await named('audio')).toBe('Audio');
  });
});

/**
 * A description that is only whitespace.
 *
 * The schema accepts any optional string, so an imported or hand-authored
 * protocol can carry `""` or `"   "`, and an item nobody has reopened in the
 * builder is never rewritten. Read literally, such a description names the
 * player nothing at all — an empty accessible name — so blank and absent have
 * to be the same answer.
 */
describe('a media item described with nothing but whitespace', () => {
  const blank = '   ';

  const named = async (selector: string) => {
    await waitFor(() => expect(document.querySelector(selector)).toBeTruthy());
    return document.querySelector(selector)?.getAttribute('aria-label');
  };

  it('names a video player as a video', async () => {
    const stage = makeStage([
      { id: 'i1', type: 'asset', content: 'vid-1', description: { en: blank } },
    ]);

    renderInformation(stage, [
      {
        assetId: 'vid-1',
        name: 'Intro Clip',
        type: 'video',
        source: 'intro.mp4',
      },
    ]);

    expect(await named('video')).toBe('Video');
  });

  it('names an audio player as audio', async () => {
    const stage = makeStage([
      { id: 'i1', type: 'asset', content: 'aud-1', description: { en: blank } },
    ]);

    renderInformation(stage, [
      {
        assetId: 'aud-1',
        name: 'Intro Clip',
        type: 'audio',
        source: 'clip.mp3',
      },
    ]);

    expect(await named('audio')).toBe('Audio');
  });

  /**
   * A picture is the one case where saying nothing is right: an empty `alt` is
   * how a decorative image is declared, and a researcher who left the
   * description blank described nothing. What must not survive is the blank
   * itself — an `alt` of spaces is announced as a run of whitespace rather
   * than skipped.
   */
  it('leaves a picture decorative rather than alt-texting the blank', async () => {
    const stage = makeStage([
      { id: 'i1', type: 'asset', content: 'img-1', description: { en: blank } },
    ]);

    renderInformation(stage, [
      { assetId: 'img-1', name: 'Photo', type: 'image', source: 'photo.png' },
    ]);

    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('');
  });
});

describe('protocol text in the interview language', () => {
  const ENGLISH_AND_ARABIC: LocalizationDeclaration = {
    defaultLocale: 'en',
    locales: ['en', 'ar'],
  };

  it('marks a title shown in a fallback language with that language and direction', () => {
    renderInformation(makeStage([], { en: 'Before you begin' }), [], {
      localization: ENGLISH_AND_ARABIC,
      locale: 'ar',
    });

    const heading = screen.getByRole('heading', { name: 'Before you begin' });
    expect(heading).toHaveAttribute('lang', 'en');
    expect(heading).toHaveAttribute('dir', 'ltr');
  });

  it('marks a translated title with the interview language and direction', () => {
    renderInformation(
      makeStage([], { en: 'Before you begin', ar: 'قبل أن تبدأ' }),
      [],
      { localization: ENGLISH_AND_ARABIC, locale: 'ar' },
    );

    const heading = screen.getByRole('heading', { name: 'قبل أن تبدأ' });
    expect(heading).toHaveAttribute('lang', 'ar');
    expect(heading).toHaveAttribute('dir', 'rtl');
  });

  it('formats a text item as a message before rendering it as markdown', () => {
    renderInformation(
      makeStage([
        {
          id: 'i1',
          type: 'text',
          content: { en: "Press '{'Next'}' when you are **ready**." },
        },
      ]),
      [],
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

  it('keeps the blocks of a text item beside the title', () => {
    renderInformation(
      makeStage(
        [
          {
            id: 'i1',
            type: 'text',
            content: { en: '## Section\n\nSome **context**.' },
          },
        ],
        { en: 'Before you begin' },
      ),
      [],
    );

    // Siblings: the typography's `not-first:`/`not-last:` spacing reads that
    // order, so a wrapper around the item would respace it.
    const title = screen.getByRole('heading', { name: 'Before you begin' });
    const section = screen.getByRole('heading', { name: 'Section' });
    expect(section.previousElementSibling).toBe(title);
    expect(section.nextElementSibling).toBe(
      screen.getByText('context').closest('p'),
    );
  });

  it('leaves a text item’s language to the interview’s boundary', () => {
    renderInformation(
      makeStage([
        { id: 'i1', type: 'text', content: { en: 'Some **context**.' } },
      ]),
      [],
      { localization: ENGLISH_AND_ARABIC, locale: 'ar' },
    );

    // Even shown in a fallback language, the item names none of its own: the
    // interview sets one language for everything it renders.
    expect(screen.getByText('context').closest('[lang], [dir]')).toBeNull();
  });

  it('marks an image description shown in a fallback language with that language', async () => {
    renderInformation(
      makeStage([
        {
          id: 'i1',
          type: 'asset',
          content: 'img-1',
          description: { en: 'Two people talking at a kitchen table.' },
        },
      ]),
      [{ assetId: 'img-1', name: 'Photo', type: 'image', source: 'photo.png' }],
      { localization: ENGLISH_AND_ARABIC, locale: 'ar' },
    );

    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
    const image = document.querySelector('img');
    expect(image).toHaveAttribute(
      'alt',
      'Two people talking at a kitchen table.',
    );
    expect(image).toHaveAttribute('lang', 'en');
    expect(image).toHaveAttribute('dir', 'ltr');
  });
});
