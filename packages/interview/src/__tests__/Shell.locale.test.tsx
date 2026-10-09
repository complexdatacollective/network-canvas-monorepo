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
import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import ActionButton from '../components/ActionButton';
import type {
  InterviewPayload,
  ProtocolLocaleChangeHandler,
  SyncHandler,
} from '../contract/types';
import { interviewCatalogSource } from '../i18n/catalog';
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
    return (
      <Form onSubmit={() => ({ success: true })}>
        <h1>{title.text}</h1>
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

function makePayload(localePreference: string | null = null) {
  return {
    session: {
      id: 'locale-session',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localePreference,
      locale: null,
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
    protocol: {
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
    },
  } satisfies InterviewPayload;
}

const payload = makePayload();

const handlers = {
  onSync: () => Promise.resolve(),
  onProtocolLocaleChange: () => Promise.resolve(),
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

// Loaded before anything renders, as a host loads a language before it
// mounts an interview, so renders in these languages are synchronous.
beforeAll(async () => {
  await Promise.all(
    ['es', 'en-GB'].map((locale) => interviewCatalogSource.load(locale)),
  );
});
// The built-in Next button's name, in the language of the catalog it came from.
const nextStep = { es: 'Siguiente paso', en: 'Next Step' };

describe('Shell interview languages', () => {
  it.each([
    {
      requested: ['ja', 'es-MX'],
      lang: 'ja',
      next: nextStep.es,
      title: titles.ja,
    },
    { requested: ['en-GB'], lang: 'en', next: nextStep.en, title: titles.en },
    {
      requested: ['not_a_locale'],
      lang: 'en',
      next: nextStep.en,
      title: titles.en,
    },
    { requested: [], lang: 'en', next: nextStep.en, title: titles.en },
  ])(
    "negotiates both languages from the browser's languages $requested",
    async ({ requested, lang, next, title }) => {
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
      expect(within(region).getByRole('button', { name: next })).toBeVisible();
      expect(observed.mounts).toBe(1);
    },
  );

  it.each([
    { preference: 'es', next: nextStep.es, title: titles.es },
    { preference: 'ja', next: nextStep.es, title: titles.ja },
  ])(
    'shows the stated preference $preference, and uses it for built-in text only when a catalog has it',
    async ({ preference, next, title }) => {
      render(
        <Shell
          {...handlers}
          payload={makePayload(preference)}
          requestedLocales={['es-MX']}
          disableAnalytics
        />,
      );
      await expectVisibleHeading(title);
      const region = screen.getByRole('main');
      expect(region).toHaveAttribute('lang', preference);
      expect(within(region).getByRole('button', { name: next })).toBeVisible();
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
    // No Arabic catalog: the built-in text falls back to English.
    expect(
      within(region).getByRole('button', { name: 'Next Step' }),
    ).toBeVisible();
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

  it('uses its own supported languages and catalogs, independently of the host document', async () => {
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
    await waitFor(() =>
      expect(
        within(region).getByRole('button', { name: 'Siguiente paso' }),
      ).toBeVisible(),
    );
    await expectVisibleHeading(titles.es, region);
    expect(
      within(region).getByRole('textbox', {
        name: /^Nombre elegido por el estudio/,
      }),
    ).toBeVisible();
    expect(
      within(region).queryByRole('button', { name: 'Wrong host message' }),
    ).not.toBeInTheDocument();
  });

  it('records the language shown once, through the locale handler alone', async () => {
    const onSync = vi.fn<SyncHandler>(() => Promise.resolve());
    const onProtocolLocaleChange = vi.fn<ProtocolLocaleChangeHandler>(() =>
      Promise.resolve(),
    );
    const view = render(
      <Shell
        {...handlers}
        onSync={onSync}
        onProtocolLocaleChange={onProtocolLocaleChange}
        payload={payload}
        requestedLocales={['es']}
        flags={{ isE2E: true }}
        disableAnalytics
      />,
    );
    await screen.findByRole('heading', { name: titles.es });
    await waitFor(() =>
      expect(onProtocolLocaleChange).toHaveBeenCalledWith('locale-session', {
        locale: 'es',
        localePreference: null,
      }),
    );
    expect(liveStore().getState().session.locale).toBe('es');

    view.rerender(
      <Shell
        {...handlers}
        onSync={onSync}
        onProtocolLocaleChange={onProtocolLocaleChange}
        payload={payload}
        requestedLocales={['es']}
        flags={{ isE2E: true }}
        disableAnalytics
      />,
    );
    await act(async () => undefined);

    expect(onProtocolLocaleChange).toHaveBeenCalledTimes(1);
    expect(onSync).not.toHaveBeenCalled();
  });

  it('does not record again when a resumed session already shows the same language', async () => {
    const onProtocolLocaleChange = vi.fn<ProtocolLocaleChangeHandler>(() =>
      Promise.resolve(),
    );
    const resumed = makePayload();
    render(
      <Shell
        {...handlers}
        onProtocolLocaleChange={onProtocolLocaleChange}
        payload={{
          ...resumed,
          session: { ...resumed.session, locale: 'ja' },
        }}
        requestedLocales={['ja']}
        disableAnalytics
      />,
    );
    await screen.findByRole('heading', { name: titles.ja });
    await act(async () => undefined);

    expect(onProtocolLocaleChange).not.toHaveBeenCalled();
  });

  it('applies a stated preference at once and saves it through the locale handler alone', async () => {
    const onSync = vi.fn<SyncHandler>(() => Promise.resolve());
    const onProtocolLocaleChange = vi.fn<ProtocolLocaleChangeHandler>(() =>
      Promise.resolve(),
    );
    render(
      <Shell
        {...handlers}
        onSync={onSync}
        onProtocolLocaleChange={onProtocolLocaleChange}
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
    await waitFor(() =>
      expect(onProtocolLocaleChange).toHaveBeenCalledTimes(1),
    );
    const networkBefore = structuredClone(
      liveStore().getState().session.network,
    );

    await user.click(screen.getByRole('button', { name: 'Prefer Spanish' }));

    await expectVisibleHeading(titles.es);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    await waitFor(() =>
      expect(onProtocolLocaleChange).toHaveBeenCalledTimes(2),
    );
    expect(onProtocolLocaleChange).toHaveBeenLastCalledWith('locale-session', {
      locale: 'es',
      localePreference: 'es',
    });
    expect(onSync).not.toHaveBeenCalled();
    expect(liveStore().getState().session.network).toEqual(networkBefore);
    expect(
      screen.getByRole('textbox', { name: /^Nombre elegido por el estudio/ }),
    ).toBe(input);
    expect(input).toHaveValue('Retained answer');
    expect(observed.mounts).toBe(1);
  });

  it('replaces a held preference with the language the host states, keeping unsaved input', async () => {
    const onProtocolLocaleChange = vi.fn<ProtocolLocaleChangeHandler>(() =>
      Promise.resolve(),
    );
    function Host() {
      const [stated, setStated] = useState<string | undefined>(undefined);
      return (
        <>
          <button onClick={() => setStated('ja')}>State Japanese</button>
          <Shell
            {...handlers}
            onProtocolLocaleChange={onProtocolLocaleChange}
            payload={makePayload('es')}
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
    expect(liveStore().getState().session.localePreference).toBe('ja');
    await waitFor(() =>
      expect(onProtocolLocaleChange).toHaveBeenLastCalledWith(
        'locale-session',
        { locale: 'ja', localePreference: 'ja' },
      ),
    );
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
    expect(
      screen.getByRole('button', { name: 'Siguiente paso' }),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: /^Nombre elegido por el estudio/ }),
    ).toBe(input);
    expect(input).toHaveValue('Málaga & <respuesta>');
    expect(observed.mounts).toBe(1);
    expect(window.__interviewStore).toBe(store);
    const after = store.getState();
    expect(after.protocol).toEqual(before.protocol);
    expect(after.session).toEqual({ ...before.session, locale: 'es' });
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
      name: 'Exit this interview?',
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
      await screen.findByRole('dialog', { name: '¿Salir de esta entrevista?' }),
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
    await waitFor(() => {
      expect(
        within(screen.getByTestId('spanish')).getByRole('button', {
          name: 'Siguiente paso',
        }),
      ).toBeVisible();
      expect(
        within(screen.getByTestId('fallback')).getByRole('button', {
          name: 'Next Step',
        }),
      ).toBeVisible();
    });
    await expectVisibleHeading(titles.es, screen.getByTestId('spanish'));
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
