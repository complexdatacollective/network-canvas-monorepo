import {
  act,
  render as renderUI,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import {
  getLocaleMetadata,
  withInterfaceText,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import ActionButton from '../components/ActionButton';
import type { InterviewPayload, SyncHandler } from '../contract/types';
import Shell from '../Shell';
import { updateStageMetadata } from '../store/modules/session';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

const observed = vi.hoisted(() => ({ mounts: 0 }));

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

const render = (ui: ReactNode) => renderUI(ui, { wrapper: WithoutMotion });
// Keep the real Shell, form controls, navigation, dialogs and store. This small
// stage probe isolates provider lifetime from unrelated WebGL dependencies;
// the production configuration matrix separately exercises the real stages.
vi.mock('../interfaces', async () => {
  const { useEffect } = await import('react');
  const { default: Form } = await import('@codaco/fresco-ui/form/Form');
  const { default: ProtocolField } = await import('../forms/ProtocolField');
  const { useAppIntl } = await import('@codaco/app-i18n/react');
  const { commonMessages } = await import('@codaco/app-i18n/common');
  const { useLocalizedString, useProtocolLocale } =
    await import('../localization/ProtocolLocalizationProvider');
  function AuthoredStage({
    stage,
  }: {
    stage: { title: Readonly<Record<string, string>> };
  }) {
    useEffect(() => {
      observed.mounts += 1;
    }, []);
    const title = useLocalizedString(stage.title);
    const { setLocale } = useProtocolLocale();
    const intl = useAppIntl();
    return (
      <Form onSubmit={() => ({ success: true })}>
        <h1>{title.text}</h1>
        {/* Built-in text, which the protocol's interface text words. */}
        <p data-testid="built-in-text">
          {intl.formatMessage(commonMessages.continue)}
        </p>
        <button type="button" onClick={() => setLocale('es')}>
          Prefer Spanish
        </button>
        <ProtocolField
          field={{
            variable: 'respuesta.original',
            type: 'text',
            component: 'Text',
            label: { en: 'Nombre elegido por el estudio' },
            hint: { en: 'Texto original: café, Ana & <literal>.' },
            validation: { required: true },
          }}
        />
      </Form>
    );
  }
  return { default: () => AuthoredStage };
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

beforeEach(() => {
  observed.mounts = 0;
  document.documentElement.lang = 'en-GB';
  document.documentElement.dir = 'ltr';
});

const localization = {
  defaultLocale: 'en',
  locales: ['en', 'es', 'ja', 'ar'],
};

const titles = {
  en: 'Original question',
  es: 'Pregunta original',
  ja: '元の質問',
  ar: 'السؤال الأصلي',
};

const PREFERENCE_KEY_PREFIX = 'network-canvas:interview-locale-preference:';

// A language chosen earlier in this tab, as the Shell keeps it.
function holdPreference(locale: string, interviewId = 'locale-session') {
  window.sessionStorage.setItem(
    `${PREFERENCE_KEY_PREFIX}${interviewId}`,
    locale,
  );
}

function makePayload(id = 'locale-session') {
  return {
    session: {
      id,
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localeOptions: localization.locales.map((locale) =>
        getLocaleMetadata(locale),
      ),
      network: {
        ego: {
          [entityPrimaryKeyProperty]: 'ego-1',
          [entityAttributesProperty]: { original: 'Ana & <literal>' },
        },
        nodes: [],
        edges: [],
      },
    },
    // Holding the interface text Network Canvas supplies: English and
    // Spanish, and none in Japanese or Arabic.
    protocol: withInterfaceText({
      id: 'locale-protocol',
      hash: 'stable-original-hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Protocol name stays literal',
      schemaVersion: 9,
      localization,
      codebook: { ego: { variables: {} }, node: {}, edge: {} },
      assets: [],
      stages: [
        {
          id: 'authored-screen',
          type: 'Information',
          label: { en: 'Literal screen label' },
          title: titles,
          items: [],
        },
      ],
    }),
  } satisfies InterviewPayload;
}

const payload = makePayload();

const handlers = {
  onSync: () => Promise.resolve(),
  onFinish: () => Promise.resolve(),
  onRequestAsset: () => Promise.resolve(''),
  analytics: { installationId: 'test', hostApp: 'test' },
};

// The stage fades in on an animation frame after its content mounts, so a
// heading can be in the document before it is visible.
async function expectVisibleHeading(
  name: string,
  region: HTMLElement = document.body,
) {
  const heading = await within(region).findByRole('heading', { name });
  await waitFor(() => expect(heading).toBeVisible());
}

function liveStore() {
  const store = window.__interviewStore;
  if (!store) throw new Error('The real Shell did not expose its store');
  return store;
}

// The probe's built-in text, as the protocol's interface text words it.
const builtIn = { es: 'Continuar', en: 'Continue' };

const expectBuiltIn = (text: string, region: HTMLElement = document.body) =>
  expect(within(region).getByTestId('built-in-text')).toHaveTextContent(text);

describe('Shell interview languages', () => {
  // One language, from the browser's languages and the protocol's: the
  // protocol's own text and its built-in text show in it together. Where the
  // protocol holds no interface text in that language, the text falls back as
  // any protocol text does: to the participant's next language that holds it,
  // then the protocol's default.
  it.each([
    {
      requested: ['fr-FR', 'es'],
      lang: 'es',
      builtInText: builtIn.es,
      title: titles.es,
    },
    {
      requested: ['ja', 'es-MX'],
      lang: 'ja',
      builtInText: builtIn.es,
      title: titles.ja,
    },
    {
      requested: ['en-GB'],
      lang: 'en',
      builtInText: builtIn.en,
      title: titles.en,
    },
    {
      requested: ['not_a_locale'],
      lang: 'en',
      builtInText: builtIn.en,
      title: titles.en,
    },
    { requested: [], lang: 'en', builtInText: builtIn.en, title: titles.en },
  ])(
    "negotiates one language from the browser's languages $requested",
    async ({ requested, lang, builtInText, title }) => {
      render(
        <Shell
          {...handlers}
          payload={payload}
          requestedLocales={requested}
          disableAnalytics
        />,
      );
      await expectVisibleHeading(title);
      const region = screen.getByRole('main');
      expect(region).toHaveAttribute('lang', lang);
      expectBuiltIn(builtInText, region);
      // Screen reader text stays in English.
      expect(
        within(region).getByRole('button', { name: 'Next Step' }),
      ).toBeVisible();
      expect(observed.mounts).toBe(1);
    },
  );

  it.each([
    { preference: 'es', builtInText: builtIn.es, title: titles.es },
    { preference: 'ja', builtInText: builtIn.es, title: titles.ja },
  ])(
    'shows the stated preference $preference, for built-in text too',
    async ({ preference, builtInText, title }) => {
      holdPreference(preference);
      render(
        <Shell
          {...handlers}
          payload={makePayload()}
          requestedLocales={['es-MX']}
          disableAnalytics
        />,
      );
      await expectVisibleHeading(title);
      const region = screen.getByRole('main');
      expect(region).toHaveAttribute('lang', preference);
      expectBuiltIn(builtInText, region);
    },
  );

  it('sets the interview language and direction once, for the whole Shell', async () => {
    render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocales={['ar']}
        disableAnalytics
      />,
    );
    const region = screen.getByRole('main');
    await expectVisibleHeading(titles.ar, region);
    expect(region).toHaveAttribute('lang', 'ar');
    expect(region).toHaveAttribute('dir', 'rtl');
    expect(document.getElementById('stage')).not.toHaveAttribute('lang');
    expect(document.getElementById('stage')).not.toHaveAttribute('dir');
    // The protocol holds no Arabic interface text, so its default language
    // shows.
    expectBuiltIn(builtIn.en, region);
  });

  it.each([
    { requested: ['ar'], back: 'chevron-right', next: 'chevron-left' },
    { requested: ['en'], back: 'chevron-left', next: 'chevron-right' },
  ])(
    'points the horizontal Back and Next arrows along the interview direction ($requested)',
    async ({ requested, back, next }) => {
      render(
        <Shell
          {...handlers}
          payload={payload}
          requestedLocales={requested}
          navigationOrientation="horizontal"
          disableAnalytics
        />,
      );
      const region = screen.getByRole('main');
      const arrow = (name: string) =>
        within(region).getByRole('button', { name }).querySelector('svg');
      expect(arrow('Previous Step')).toHaveClass(`lucide-${back}`);
      expect(arrow('Next Step')).toHaveClass(`lucide-${next}`);
    },
  );

  it("uses the protocol's languages, independently of the host document", async () => {
    render(
      <AppI18nProvider
        locale="fr"
        locales={[{ locale: 'fr', label: 'Français', direction: 'ltr' }]}
        messages={{ 'interview.navigation.nextStep': 'Wrong host message' }}
      >
        <Shell
          {...handlers}
          payload={payload}
          requestedLocales={['es-MX']}
          disableAnalytics
        />
      </AppI18nProvider>,
    );
    const region = screen.getByRole('main');
    expect(region).toHaveAttribute('lang', 'es');
    expect(region).toHaveAttribute('dir', 'ltr');
    expect(document.documentElement).toHaveAttribute('lang', 'fr');
    await expectVisibleHeading(titles.es, region);
    expectBuiltIn(builtIn.es, region);
    expect(
      within(region).getByRole('button', { name: 'Next Step' }),
    ).toBeVisible();
    expect(
      within(region).getByRole('textbox', {
        name: /^Nombre elegido por el estudio/,
      }),
    ).toBeVisible();
    expect(
      within(region).queryByRole('button', { name: 'Wrong host message' }),
    ).not.toBeInTheDocument();
  });

  it('applies a stated preference at once without writing to the host', async () => {
    const onSync = vi.fn<SyncHandler>(() => Promise.resolve());
    render(
      <Shell
        {...handlers}
        onSync={onSync}
        payload={payload}
        requestedLocales={['en-GB']}
        flags={{ isE2E: true }}
        disableAnalytics
      />,
    );
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', {
      name: /^Nombre elegido por el estudio/,
    });
    await user.type(input, 'Retained answer');
    const networkBefore = structuredClone(
      liveStore().getState().session.network,
    );

    await user.click(screen.getByRole('button', { name: 'Prefer Spanish' }));

    await expectVisibleHeading(titles.es);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    expect(onSync).not.toHaveBeenCalled();
    expect(liveStore().getState().session.network).toEqual(networkBefore);
    expect(
      screen.getByRole('textbox', { name: /^Nombre elegido por el estudio/ }),
    ).toBe(input);
    expect(input).toHaveValue('Retained answer');
    expect(observed.mounts).toBe(1);
  });

  it('replaces a held preference with the language the host states, keeping unsaved input', async () => {
    holdPreference('es');
    function Host() {
      const [stated, setStated] = useState<string | undefined>(undefined);
      return (
        <>
          <button onClick={() => setStated('ja')}>State Japanese</button>
          <Shell
            {...handlers}
            payload={makePayload()}
            requestedLocales={['en-GB']}
            statedLocale={stated}
            flags={{ isE2E: true }}
            disableAnalytics
          />
        </>
      );
    }
    render(<Host />);
    const user = userEvent.setup();
    await expectVisibleHeading(titles.es);
    const input = screen.getByRole('textbox', {
      name: /^Nombre elegido por el estudio/,
    });
    await user.type(input, 'Sin guardar');

    await user.click(screen.getByRole('button', { name: 'State Japanese' }));

    await expectVisibleHeading(titles.ja);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'ja');
    expect(liveStore().getState().ui.localePreference).toBe('ja');
    expect(
      screen.getByRole('textbox', { name: /^Nombre elegido por el estudio/ }),
    ).toBe(input);
    expect(input).toHaveValue('Sin guardar');
    expect(observed.mounts).toBe(1);
  });

  it("follows a change of the browser's languages without remounting fields or rewriting protocol, answers or navigation", async () => {
    const original = structuredClone(payload);
    function Host() {
      const [requested, setRequested] = useState<readonly string[]>(['en-GB']);
      return (
        <>
          <button onClick={() => setRequested(['es'])}>
            Change browser languages
          </button>
          <Shell
            {...handlers}
            payload={payload}
            requestedLocales={requested}
            flags={{ isE2E: true }}
            disableAnalytics
          />
        </>
      );
    }
    render(<Host />);
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', {
      name: /^Nombre elegido por el estudio/,
    });
    await user.type(input, 'Málaga & <respuesta>');
    const store = liveStore();
    act(() => {
      store.dispatch(
        updateStageMetadata({
          currentStep: 0,
          metadata: [[0, 'a', 'b', true]],
        }),
      );
    });
    await act(async () => undefined);
    const before = structuredClone(store.getState());

    await user.click(
      screen.getByRole('button', { name: 'Change browser languages' }),
    );

    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    await expectVisibleHeading(titles.es);
    expectBuiltIn(builtIn.es);
    expect(
      screen.getByRole('textbox', { name: /^Nombre elegido por el estudio/ }),
    ).toBe(input);
    expect(input).toHaveValue('Málaga & <respuesta>');
    expect(observed.mounts).toBe(1);
    expect(window.__interviewStore).toBe(store);
    const after = store.getState();
    expect(after.protocol).toEqual(before.protocol);
    expect(after.session).toEqual(before.session);
    expect(payload).toEqual(original);
    expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  });

  it('has no language control in the settings menu', async () => {
    render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocales={['en']}
        allowUserScaling
        onExit={vi.fn()}
        disableAnalytics
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(
      await screen.findByRole('button', { name: 'Exit interview' }),
    ).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/language/i)).not.toBeInTheDocument();
  });

  it('updates an already-open confirmation while retaining its action and cancel behavior', async () => {
    const onExit = vi.fn();
    const view = render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocales={['en']}
        onExit={onExit}
        disableAnalytics
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(
      await screen.findByRole('button', { name: 'Exit interview' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Exit interview',
    });
    view.rerender(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocales={['es']}
        onExit={onExit}
        disableAnalytics
      />,
    );
    expect(
      await screen.findByRole('dialog', { name: 'Salir de la entrevista' }),
    ).toBe(dialog);
    expect(
      within(dialog).getByText(
        'Tus respuestas hasta ahora se guardarán y podrás continuar más adelante.',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(onExit).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('textbox', {
        name: /^Nombre elegido por el estudio/,
      }),
    ).toBeVisible();
  });

  it('keeps simultaneous Shells independent, with an English fallback for an unsupported request', async () => {
    render(
      <>
        <section data-testid="spanish">
          <Shell
            {...handlers}
            payload={payload}
            requestedLocales={['es']}
            disableAnalytics
          />
        </section>
        <section data-testid="fallback">
          <Shell
            {...handlers}
            payload={payload}
            requestedLocales={['not_a_locale']}
            disableAnalytics
          />
        </section>
      </>,
    );
    await expectVisibleHeading(titles.es, screen.getByTestId('spanish'));
    expectBuiltIn(builtIn.es, screen.getByTestId('spanish'));
    expectBuiltIn(builtIn.en, screen.getByTestId('fallback'));
    expect(
      within(screen.getByTestId('fallback')).getByRole('main'),
    ).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
  });

  it('retains provider-optional English for standalone shared controls', () => {
    render(<ActionButton iconName="add-a-person" />);
    expect(screen.getByRole('button', { name: 'Add a person' })).toBeVisible();
  });
});

describe("Shell participant's language choice", () => {
  function renderShell(interviewPayload: InterviewPayload = payload) {
    return render(
      <Shell
        {...handlers}
        payload={interviewPayload}
        requestedLocales={['en-GB']}
        flags={{ isE2E: true }}
        disableAnalytics
      />,
    );
  }

  it('keeps the choice when the same interview is opened again in this tab', async () => {
    const first = renderShell();
    await expectVisibleHeading(titles.en);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Prefer Spanish' }));
    await expectVisibleHeading(titles.es);
    first.unmount();

    renderShell(makePayload());

    await expectVisibleHeading(titles.es);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    expectBuiltIn(builtIn.es);
    expect(liveStore().getState().ui.localePreference).toBe('es');
  });

  it('does not carry a choice into another interview', async () => {
    const first = renderShell();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Prefer Spanish' }),
    );
    await expectVisibleHeading(titles.es);
    first.unmount();

    renderShell(makePayload('another-session'));

    await expectVisibleHeading(titles.en);
    await act(async () => undefined);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(liveStore().getState().ui.localePreference).toBeNull();
  });

  it('ignores a kept choice the protocol does not declare', async () => {
    holdPreference('de');
    renderShell();

    await expectVisibleHeading(titles.en);
    await act(async () => undefined);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(liveStore().getState().ui.localePreference).toBeNull();
  });

  it('tells a host that follows the language what the participant chose', async () => {
    const onLocalePreferenceChange = vi.fn();
    render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocales={['en-GB']}
        onLocalePreferenceChange={onLocalePreferenceChange}
        flags={{ isE2E: true }}
        disableAnalytics
      />,
    );
    await expectVisibleHeading(titles.en);
    expect(onLocalePreferenceChange).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Prefer Spanish' }));

    await expectVisibleHeading(titles.es);
    expect(onLocalePreferenceChange).toHaveBeenCalledExactlyOnceWith('es');
  });

  it('never sends the choice, or the language shown, to the host', async () => {
    const onSync = vi.fn<SyncHandler>(() => Promise.resolve());
    render(
      <Shell
        {...handlers}
        onSync={onSync}
        payload={payload}
        requestedLocales={['en-GB']}
        flags={{ isE2E: true }}
        disableAnalytics
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Prefer Spanish' }),
    );
    await expectVisibleHeading(titles.es);
    await act(async () => undefined);
    const { session } = liveStore().getState();
    expect(session).not.toHaveProperty('localePreference');
    expect(session).not.toHaveProperty('locale');
    expect(onSync).not.toHaveBeenCalled();
  });

  it('still changes language, in memory, when storage refuses access', async () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('Access denied', 'SecurityError');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    try {
      renderShell();
      await expectVisibleHeading(titles.en);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Prefer Spanish' }));

      await expectVisibleHeading(titles.es);
      expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
      expect(liveStore().getState().ui.localePreference).toBe('es');
      expect(getItem).toHaveBeenCalled();
      expect(setItem).toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
