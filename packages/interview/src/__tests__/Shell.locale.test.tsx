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
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import ActionButton from '../components/ActionButton';
import type { InterviewPayload } from '../contract/types';
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
  function AuthoredStage({ stage }: { stage: { title: string } }) {
    useEffect(() => {
      observed.mounts += 1;
    }, []);
    return (
      <Form onSubmit={() => ({ success: true })}>
        <h1>{stage.title}</h1>
        <ProtocolField
          field={{
            variable: 'respuesta.original',
            type: 'text',
            component: 'Text',
            label: 'Nombre elegido por el estudio',
            hint: 'Texto original: café, Ana & <literal>.',
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

const payload = {
  session: {
    id: 'locale-session',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
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
    schemaVersion: 8,
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [
      {
        id: 'authored-screen',
        type: 'Information',
        label: 'Literal screen label',
        title: 'Pregunta original sin traducir',
        items: [],
      },
    ],
  },
} satisfies InterviewPayload;

const handlers = {
  onSync: () => Promise.resolve(),
  onFinish: () => Promise.resolve(),
  onRequestAsset: () => Promise.resolve(''),
  analytics: { installationId: 'test', hostApp: 'test' },
};

describe('Shell built-in interface language', () => {
  it.each([
    { preference: 'fr', expectedLocale: 'es', expectedChoice: '__automatic' },
    {
      preference: 'not_a_locale',
      expectedLocale: 'es',
      expectedChoice: '__automatic',
    },
    { preference: 'es-MX', expectedLocale: 'es', expectedChoice: 'es' },
    { preference: 'en', expectedLocale: 'en', expectedChoice: 'en' },
  ])(
    'negotiates the controlled preference $preference with the requested fallback chain',
    async ({ preference, expectedLocale, expectedChoice }) => {
      render(
        <Shell
          {...handlers}
          payload={payload}
          requestedLocale={['fr', 'es-MX']}
          localePreference={preference}
          disableAnalytics
        />,
      );
      await screen.findByRole('textbox', {
        name: /^Nombre elegido por el estudio/,
      });
      expect(screen.getByRole('main')).toHaveAttribute('lang', expectedLocale);
      const spanish = expectedLocale === 'es';
      await userEvent.setup().click(
        screen.getByRole('button', {
          name: spanish ? 'Configuración' : 'Settings',
        }),
      );
      expect(
        screen.getByRole('combobox', {
          name: spanish ? 'Idioma de la interfaz' : 'Interface language',
        }),
      ).toHaveValue(expectedChoice);
      expect(
        screen.getByRole('heading', { name: 'Pregunta original sin traducir' }),
      ).toBeVisible();
      expect(observed.mounts).toBe(1);
    },
  );

  it('shows a restored explicit host preference and permits a direct Automatic reset', async () => {
    const change = vi.fn();
    function Host() {
      const [preference, setPreference] = useState<string | null>('es');
      return (
        <Shell
          {...handlers}
          payload={payload}
          requestedLocale={preference ?? 'en-GB'}
          localePreference={preference}
          disableAnalytics
          onLocaleChange={(next) => {
            change(next);
            setPreference(next);
          }}
        />
      );
    }
    render(<Host />);
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', {
      name: /^Nombre elegido por el estudio/,
    });
    await user.type(input, 'Retained after preference reset');
    await user.click(screen.getByRole('button', { name: 'Configuración' }));
    const menu = await screen.findByRole('combobox', {
      name: 'Idioma de la interfaz',
    });
    expect(menu).toHaveValue('es');
    await user.selectOptions(menu, '__automatic');
    expect(change).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en-GB');
    expect(
      screen.getByRole('combobox', { name: 'Interface language' }),
    ).toHaveValue('__automatic');
    expect(input).toHaveValue('Retained after preference reset');
    expect(observed.mounts).toBe(1);
  });

  it('keeps an acknowledged menu choice explicit so the host preference can be cleared', async () => {
    const onLocaleChange = vi.fn();
    function Host() {
      const [request, setRequest] = useState('en-GB');
      return (
        <>
          <button onClick={() => setRequest('es-MX')}>
            Change host request
          </button>
          <Shell
            {...handlers}
            payload={payload}
            requestedLocale={request}
            disableAnalytics
            onLocaleChange={(next) => {
              onLocaleChange(next);
              setRequest(next ?? 'en-GB');
            }}
          />
        </>
      );
    }
    render(<Host />);
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', {
      name: /^Nombre elegido por el estudio/,
    });
    await user.type(input, 'Retained answer');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Interface language' }),
      'es',
    );
    expect(
      screen.getByRole('combobox', { name: 'Idioma de la interfaz' }),
    ).toHaveValue('es');
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Idioma de la interfaz' }),
      '__automatic',
    );
    expect(onLocaleChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en-GB');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Interface language' }),
      'en',
    );
    await user.click(
      screen.getByRole('button', { name: 'Change host request' }),
    );
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    expect(input).toHaveValue('Retained answer');
    expect(observed.mounts).toBe(1);
  });

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
          requestedLocale="es-MX"
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
    expect(
      await within(region).findByRole('heading', {
        name: 'Pregunta original sin traducir',
      }),
    ).toBeVisible();
    expect(
      within(region).getByRole('textbox', {
        name: /^Nombre elegido por el estudio/,
      }),
    ).toBeVisible();
    expect(
      within(region).getByText('Nombre elegido por el estudio', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      within(region).queryByRole('button', { name: 'Wrong host message' }),
    ).not.toBeInTheDocument();
  });

  it('changes menu language without remounting fields or rewriting protocol, answers or navigation', async () => {
    const original = structuredClone(payload);
    const onLocaleChange = vi.fn();
    render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocale="en-GB"
        onLocaleChange={onLocaleChange}
        allowUserScaling
        flags={{ isE2E: true }}
        disableAnalytics
      />,
    );
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', {
      name: /^Nombre elegido por el estudio/,
    });
    await user.type(input, 'Málaga & <respuesta>');
    const store = window.__interviewStore;
    if (!store) throw new Error('The real Shell did not expose its store');
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
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const language = await screen.findByRole('combobox', {
      name: 'Interface language',
    });
    expect(
      within(language)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['__automatic', 'en', 'en-GB', 'es']);
    await user.selectOptions(language, 'es');
    expect(onLocaleChange).toHaveBeenLastCalledWith('es');
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    expect(
      screen.getByRole('combobox', { name: 'Idioma de la interfaz' }),
    ).toHaveValue('es');
    expect(
      screen.getByRole('button', { name: 'Siguiente paso' }),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: /^Nombre elegido por el estudio/ }),
    ).toBe(input);
    expect(
      screen.getByText('Nombre elegido por el estudio', { exact: true }),
    ).toBeVisible();
    expect(input).toHaveValue('Málaga & <respuesta>');
    expect(observed.mounts).toBe(1);
    expect(window.__interviewStore).toBe(store);
    expect(store.getState()).toEqual(before);
    expect(payload).toEqual(original);
    expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Idioma de la interfaz' }),
      '__automatic',
    );
    expect(onLocaleChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en-GB');
    expect(input).toHaveValue('Málaga & <respuesta>');
  });

  it('applies new host requests immediately and does not revive an override for an older request', async () => {
    const view = render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocale="es"
        disableAnalytics
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Configuración' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Idioma de la interfaz' }),
      'en-GB',
    );
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en-GB');
    view.rerender(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocale="de"
        disableAnalytics
      />,
    );
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    view.rerender(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocale="es"
        disableAnalytics
      />,
    );
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'es');
    expect(observed.mounts).toBe(1);
  });

  it('updates an already-open confirmation while retaining its action and cancel behavior', async () => {
    const onExit = vi.fn();
    const view = render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocale="en"
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
        requestedLocale="es"
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
            requestedLocale="es"
            disableAnalytics
          />
        </section>
        <section data-testid="fallback">
          <Shell
            {...handlers}
            payload={payload}
            requestedLocale="not_a_locale"
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
