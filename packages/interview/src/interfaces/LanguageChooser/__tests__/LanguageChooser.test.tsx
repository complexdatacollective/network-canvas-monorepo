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
  type LocalizedString,
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
  introduction,
}: {
  localization?: LocalizationDeclaration;
  introduction?: LocalizedString;
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
      localization,
      codebook: { ego: { variables: {} }, node: {}, edge: {} },
      assets: [],
      stages: [
        {
          id: 'chooser',
          type: 'LanguageChooser',
          label: { [localization.defaultLocale]: 'Language' },
          ...(introduction ? { introduction } : {}),
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
  screen.findByRole('radiogroup', { name });

// The element that decides the language and direction a label is read in.
const languageOf = (element: HTMLElement) => element.closest('[lang]');

describe('LanguageChooser', () => {
  it("lists exactly the protocol's languages, in declaration order, each in its own language and direction", async () => {
    renderChooser();
    const group = await languageGroup();

    expect(within(group).getAllByRole('radio')).toEqual(
      ['en', 'es', 'ar'].map((locale) =>
        within(group).getByRole('radio', { name: label(locale) }),
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

    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(1);
    expect(
      within(group).getByRole('radio', { name: label('fr') }),
    ).toBeChecked();
  });

  it('preselects the language the interview is shown in', async () => {
    renderChooser({ requestedLocales: ['es-MX'] });
    const group = await languageGroup('Elige un idioma');

    expect(
      within(group).getByRole('radio', { name: label('es') }),
    ).toBeChecked();
    expect(
      within(group).getByRole('radio', { name: label('en') }),
    ).not.toBeChecked();
  });

  it('applies a choice at once to the interface and saves it as the stated preference', async () => {
    const { onProtocolLocaleChange } = renderChooser();
    const user = userEvent.setup();
    const group = await languageGroup();
    expect(
      within(group).getByRole('radio', { name: label('en') }),
    ).toBeChecked();

    await user.click(within(group).getByRole('radio', { name: label('es') }));

    expect(
      await screen.findByRole('heading', { name: 'Elige un idioma' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('radiogroup', { name: 'Elige un idioma' })).toBe(
      group,
    );
    expect(
      within(group).getByRole('radio', { name: label('es') }),
    ).toBeChecked();
    await waitFor(() =>
      expect(onProtocolLocaleChange).toHaveBeenLastCalledWith(
        'chooser-session',
        { locale: 'es', localePreference: 'es' },
      ),
    );
    expect(liveStore().getState().session.localePreference).toBe('es');
  });

  it('is operated from the keyboard, keeping focus on the chosen language', async () => {
    renderChooser();
    const user = userEvent.setup();
    const group = await languageGroup();
    const english = within(group).getByRole('radio', { name: label('en') });
    const spanish = within(group).getByRole('radio', { name: label('es') });

    act(() => english.focus());
    await user.keyboard('{ArrowDown}');

    expect(
      await screen.findByRole('heading', { name: 'Elige un idioma' }),
    ).toBeVisible();
    expect(spanish).toBeChecked();
    expect(spanish).toHaveFocus();
  });

  it('lays the stage out right to left for a right-to-left language', async () => {
    renderChooser();
    const user = userEvent.setup();
    const group = await languageGroup();

    await user.click(within(group).getByRole('radio', { name: label('ar') }));

    await waitFor(() =>
      expect(document.getElementById('stage')).toHaveAttribute('dir', 'rtl'),
    );
    // The interface has no Arabic, so its own text stays in English.
    expect(
      screen.getByRole('heading', { name: 'Choose a language' }),
    ).toBeVisible();
    expect(
      within(group).getByRole('radio', { name: label('ar') }),
    ).toBeChecked();
  });

  it('names the unspecified language in the interface language', async () => {
    renderChooser({
      payload: makePayload({
        localization: { defaultLocale: 'und', locales: ['und', 'fr'] },
      }),
    });
    const user = userEvent.setup();
    const group = await languageGroup();

    const unspecified = within(group).getByText('Unspecified language');
    expect(languageOf(unspecified)).toBe(screen.getByRole('main'));
    expect(
      within(group).getByRole('radio', { name: 'Unspecified language' }),
    ).toBeChecked();

    await user.click(within(group).getByRole('radio', { name: label('fr') }));

    expect(
      await within(group).findByRole('radio', { name: 'Langue non précisée' }),
    ).not.toBeChecked();
  });

  it('shows a formatted markdown introduction in the language it is written in', async () => {
    renderChooser({
      payload: makePayload({
        introduction: {
          en: "Choose the language you would like to use. Braces stay literal: '{'en'}'.\n\nYou can **change it** later.",
          es: 'Elige el idioma que prefieras.\n\nPuedes **cambiarlo** más tarde.',
        },
      }),
    });
    const user = userEvent.setup();
    await languageGroup();

    const literal = screen.getByText(
      'Choose the language you would like to use. Braces stay literal: {en}.',
    );
    expect(literal.tagName).toBe('P');
    expect(screen.getByText('change it').tagName).toBe('STRONG');
    expect(languageOf(literal)).toHaveAttribute('lang', 'en');
    expect(languageOf(literal)).toHaveAttribute('dir', 'ltr');

    await user.click(screen.getByRole('radio', { name: label('es') }));

    const spanish = await screen.findByText('Elige el idioma que prefieras.');
    expect(languageOf(spanish)).toHaveAttribute('lang', 'es');
    expect(
      screen.queryByText(/Choose the language you would like to use/),
    ).not.toBeInTheDocument();
  });

  it('shows an introduction in the unspecified language without claiming a language for it', async () => {
    renderChooser({
      payload: makePayload({
        localization: { defaultLocale: 'und', locales: ['und'] },
        introduction: { und: 'Welcome.' },
      }),
    });
    await languageGroup();

    expect(languageOf(screen.getByText('Welcome.'))).toBe(
      screen.getByRole('main'),
    );
  });

  it('shows only the heading and the languages without an introduction', async () => {
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

    await user.click(within(group).getByRole('radio', { name: label('es') }));
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
