import {
  act,
  render as renderUI,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import {
  getLocaleMetadata,
  type LocalizationDeclaration,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type {
  InterviewPayload,
  ProtocolLocaleChangeHandler,
  SyncHandler,
} from '../../../contract/types';
import Shell from '../../../Shell';

vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));

// The real Shell, store, providers and navigation, with every other interface
// replaced by a heading naming its stage: the full registry pulls in WebGL
// dependencies that jsdom cannot load.
vi.mock('../../index', async () => {
  const { default: LanguageChooser } = await import('../LanguageChooser');
  function OtherStage({ stage }: { stage: { id: string } }) {
    return <h1>{`Stage ${stage.id}`}</h1>;
  }
  return {
    default: (type: string) =>
      type === 'LanguageChooser' ? LanguageChooser : OtherStage,
  };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

const ENGLISH_SPANISH_ARABIC: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'es', 'ar'],
};

const label = (locale: string) => getLocaleMetadata(locale).label;

function makePayload({
  localization = ENGLISH_SPANISH_ARABIC,
}: {
  localization?: LocalizationDeclaration;
} = {}) {
  return {
    session: {
      id: 'chooser-session',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localePreference: null,
      locale: null,
      localeOptions: localization.locales.map((locale) =>
        getLocaleMetadata(locale),
      ),
      network: {
        ego: {
          [entityPrimaryKeyProperty]: 'ego-1',
          [entityAttributesProperty]: { existing: 'answer' },
        },
        nodes: [],
        edges: [],
      },
    },
    protocol: {
      id: 'chooser-protocol',
      hash: 'chooser-hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Chooser protocol',
      schemaVersion: 9,
      localization: {
        defaultLocale: localization.defaultLocale,
        locales: [...localization.locales],
      },
      codebook: { ego: { variables: {} }, node: {}, edge: {} },
      assets: [],
      stages: [
        {
          id: 'chooser',
          type: 'LanguageChooser',
          label: { [localization.defaultLocale]: 'Language' },
        },
        {
          id: 'after',
          type: 'Information',
          label: { [localization.defaultLocale]: 'After' },
          title: { [localization.defaultLocale]: 'After' },
          items: [],
        },
      ],
    },
  } satisfies InterviewPayload;
}

function renderChooser({
  payload = makePayload(),
  requestedLocales = [],
}: {
  payload?: InterviewPayload;
  requestedLocales?: readonly string[];
} = {}) {
  const onSync = vi.fn<SyncHandler>(() => Promise.resolve());
  const onProtocolLocaleChange = vi.fn<ProtocolLocaleChangeHandler>(() =>
    Promise.resolve(),
  );
  renderUI(
    <Shell
      payload={payload}
      requestedLocales={requestedLocales}
      onSync={onSync}
      onProtocolLocaleChange={onProtocolLocaleChange}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      flags={{ isE2E: true }}
      disableAnalytics
    />,
    { wrapper: WithoutMotion },
  );
  return { onSync, onProtocolLocaleChange };
}

function liveStore() {
  const store = window.__interviewStore;
  if (!store) throw new Error('The real Shell did not expose its store');
  return store;
}

const languageGroup = (name = 'Choose a language') =>
  screen.findByRole('listbox', { name });

// The element that decides the language and direction a label is read in.
const languageOf = (element: HTMLElement) => element.closest('[lang]');

describe('LanguageChooser', () => {
  it("lists exactly the protocol's languages, alphabetically by name, each in its own language and direction", async () => {
    renderChooser({
      payload: makePayload({
        localization: { defaultLocale: 'en', locales: ['ar', 'es', 'en'] },
      }),
    });
    const group = await languageGroup();

    expect(within(group).getAllByRole('option')).toEqual(
      ['en', 'es', 'ar'].map((locale) =>
        within(group).getByRole('option', { name: label(locale) }),
      ),
    );

    for (const [locale, direction] of [
      ['en', 'ltr'],
      ['es', 'ltr'],
      ['ar', 'rtl'],
    ] as const) {
      const text = within(group).getByText(label(locale));
      expect(languageOf(text)).toHaveAttribute('lang', locale);
      expect(languageOf(text)).toHaveAttribute('dir', direction);
    }
  });

  it('offers the single language of a protocol that declares one', async () => {
    renderChooser({
      payload: makePayload({
        localization: { defaultLocale: 'fr', locales: ['fr'] },
      }),
    });
    const group = await languageGroup();

    const languages = within(group).getAllByRole('option');
    expect(languages).toHaveLength(1);
    expect(
      within(group).getByRole('option', { name: label('fr') }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('preselects the language the interview is shown in', async () => {
    renderChooser({ requestedLocales: ['es-MX'] });
    const group = await languageGroup('Elige un idioma');

    expect(
      within(group).getByRole('option', { name: label('es') }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      within(group).getByRole('option', { name: label('en') }),
    ).toHaveAttribute('aria-selected', 'false');
  });

  it('applies a choice at once to the interface and saves it as the stated preference', async () => {
    const { onProtocolLocaleChange } = renderChooser();
    const user = userEvent.setup();
    const group = await languageGroup();
    expect(
      within(group).getByRole('option', { name: label('en') }),
    ).toHaveAttribute('aria-selected', 'true');

    await user.click(within(group).getByRole('option', { name: label('es') }));

    expect(
      await screen.findByRole('heading', { name: 'Elige un idioma' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('listbox', { name: 'Elige un idioma' })).toBe(
      group,
    );
    expect(
      within(group).getByRole('option', { name: label('es') }),
    ).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(onProtocolLocaleChange).toHaveBeenLastCalledWith(
        'chooser-session',
        { locale: 'es', localePreference: 'es' },
      ),
    );
    expect(liveStore().getState().session.localePreference).toBe('es');
  });

  it('is operated from the keyboard, choosing only the language it confirms', async () => {
    renderChooser();
    const user = userEvent.setup();
    const group = await languageGroup();
    const english = within(group).getByRole('option', { name: label('en') });
    const spanish = within(group).getByRole('option', { name: label('es') });
    expect(english).toHaveAttribute('tabindex', '0');
    expect(spanish).toHaveAttribute('tabindex', '-1');

    act(() => english.focus());
    await user.keyboard('{ArrowDown}');

    expect(spanish).toHaveFocus();
    expect(english).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('heading', { name: 'Choose a language' }),
    ).toBeVisible();

    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('heading', { name: 'Elige un idioma' }),
    ).toBeVisible();
    expect(spanish).toHaveAttribute('aria-selected', 'true');
    expect(spanish).toHaveAttribute('tabindex', '0');
    expect(spanish).toHaveFocus();
  });

  it('lays the stage out right to left for a right-to-left language', async () => {
    renderChooser();
    const user = userEvent.setup();
    const group = await languageGroup();

    await user.click(within(group).getByRole('option', { name: label('ar') }));

    await waitFor(() =>
      expect(document.getElementById('stage')).toHaveAttribute('dir', 'rtl'),
    );
    // The interface has no Arabic, so its own text stays in English.
    expect(
      screen.getByRole('heading', { name: 'Choose a language' }),
    ).toBeVisible();
    expect(
      within(group).getByRole('option', { name: label('ar') }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('shows only the heading and the languages', async () => {
    renderChooser();
    await languageGroup();

    expect(document.getElementById('stage')?.textContent).toBe(
      ['Choose a language', label('en'), label('es'), label('ar')].join(''),
    );
  });

  it('keeps Next enabled and writes nothing to the network', async () => {
    const { onSync } = renderChooser();
    const user = userEvent.setup();
    const group = await languageGroup();
    const networkBefore = structuredClone(
      liveStore().getState().session.network,
    );
    const next = screen.getByRole('button', { name: 'Next Step' });
    expect(next).toBeEnabled();

    await user.click(within(group).getByRole('option', { name: label('es') }));
    await screen.findByRole('heading', { name: 'Elige un idioma' });

    expect(liveStore().getState().session.network).toEqual(networkBefore);
    expect(onSync).not.toHaveBeenCalled();

    const siguiente = screen.getByRole('button', { name: 'Siguiente paso' });
    expect(siguiente).toBeEnabled();
    await user.click(siguiente);

    expect(
      await screen.findByRole('heading', { name: 'Stage after' }),
    ).toBeInTheDocument();
    expect(liveStore().getState().session.network).toEqual(networkBefore);
  });
});
