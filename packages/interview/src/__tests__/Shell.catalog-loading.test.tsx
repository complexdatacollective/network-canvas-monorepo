import { act, render as renderUI, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import { createCatalogSource } from '@codaco/app-i18n/locales';
import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';
import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../contract/types';
import { interviewCatalogSource } from '../i18n/catalog';
import Shell from '../Shell';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

vi.mock('../interfaces', () => {
  function AuthoredStage({ stage }: { stage: { title: { en: string } } }) {
    return <h1>{stage.title.en}</h1>;
  }
  return { default: () => AuthoredStage };
});

// The interview's German and French catalogs arrive only when a test lets
// them, so the Shell can be looked at while one is still on its way. Dutch
// never arrives: only a server can supply it. Italian cannot be downloaded.
const neverLoadsDutch = vi.hoisted(() =>
  vi.fn(() => new Promise<never>(() => {})),
);
const italianUnavailable = vi.hoisted(() =>
  vi.fn(() => Promise.reject(new Error('Failed to fetch'))),
);
const gates = vi.hoisted(() => {
  const gate = () => {
    let open = () => {};
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { opened, open: () => open() };
  };
  return { de: gate(), fr: gate() };
});

vi.mock('../locales/catalogs', async (importOriginal) => {
  const { interviewCatalogLoaders } =
    await importOriginal<typeof import('../locales/catalogs')>();
  const heldBack = (locale: keyof typeof gates) => {
    const load = interviewCatalogLoaders[locale];
    if (load === undefined) throw new Error(`No ${locale} catalog`);
    return async () => {
      await gates[locale].opened;
      return load();
    };
  };
  return {
    interviewCatalogLoaders: {
      ...interviewCatalogLoaders,
      de: heldBack('de'),
      fr: heldBack('fr'),
      nl: neverLoadsDutch,
      it: italianUnavailable,
    },
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

const render = (ui: ReactNode) => renderUI(ui, { wrapper: WithoutMotion });

// The protocol is English only, so the interview region is marked English
// whatever language the interface's own words load in.
const payload = {
  session: {
    id: 'catalog-loading-session',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    localePreference: null,
    locale: null,
    localeOptions: [getLocaleMetadata('en')],
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego-1',
        [entityAttributesProperty]: {},
      },
      nodes: [],
      edges: [],
    },
  },
  protocol: {
    id: 'catalog-loading-protocol',
    hash: 'catalog-loading-hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    name: 'Catalog loading protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [
      {
        id: 'authored-screen',
        type: 'Information',
        label: { en: 'Authored screen' },
        title: { en: 'Authored screen title' },
        items: [],
      },
    ],
  },
} satisfies InterviewPayload;

const handlers = {
  onSync: () => Promise.resolve(),
  onProtocolLocaleChange: () => Promise.resolve(),
  onFinish: () => Promise.resolve(),
  onRequestAsset: () => Promise.resolve(''),
  analytics: { installationId: 'test', hostApp: 'test' },
};

/** Lets every pending task run, short of the gates opening. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe('Shell catalog loading', () => {
  it('waits for the language it mounts in instead of rendering English and switching', async () => {
    // Every DOM state the Shell commits, so the check below covers the
    // whole load rather than only the moments the test looks.
    const states: string[] = [];
    const observer = new MutationObserver(() => {
      states.push(document.body.innerHTML);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });

    try {
      // Awaited so React retries the suspended render once the catalog is in;
      // a render begun in a synchronous act is never retried.
      await act(async () => {
        render(
          <Shell
            {...handlers}
            payload={payload}
            requestedLocales={['de']}
            disableAnalytics
          />,
        );
      });

      const loading = screen.getByRole('main');
      expect(loading).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();

      await settle();
      expect(screen.getByRole('main')).toBe(loading);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();

      gates.de.open();
      expect(
        await screen.findByRole('button', { name: 'Nächster Schritt' }),
      ).toBeVisible();
      const region = screen.getByRole('main');
      expect(region).toHaveAttribute('lang', 'en');
      expect(region).not.toHaveAttribute('aria-busy');
      expect(
        screen.getByRole('heading', { name: 'Authored screen title' }),
      ).toBeVisible();

      states.push(document.body.innerHTML);
      expect(states.some((state) => state.includes('Nächster Schritt'))).toBe(
        true,
      );
      expect(states.filter((state) => state.includes('Next Step'))).toEqual([]);
    } finally {
      observer.disconnect();
    }
  });

  it('runs in English, and says so, when the language it mounts in cannot be downloaded', async () => {
    await act(async () => {
      render(
        <Shell
          {...handlers}
          payload={payload}
          requestedLocales={['it']}
          disableAnalytics
        />,
      );
    });

    expect(
      await screen.findByRole('button', { name: 'Next Step' }),
    ).toBeVisible();
    const region = screen.getByRole('main');
    expect(region).toHaveAttribute('lang', 'en');
    expect(region).not.toHaveAttribute('aria-busy');
    expect(
      screen.getByRole('heading', { name: 'Couldn’t load Italiano' }),
    ).toBeVisible();
    expect(screen.getByText('Showing English instead.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Reload' }),
    ).not.toBeInTheDocument();
    expect(italianUnavailable).toHaveBeenCalled();
  });

  it('renders a server-delivered catalog at once, without loading it again', async () => {
    // The server's module instance, not this page's: nothing it loaded is in
    // the source the Shell reads.
    const { interviewCatalogLoaders } = await vi.importActual<
      typeof import('../locales/catalogs')
    >('../locales/catalogs');
    const catalog = {
      locale: 'nl',
      messages: await createCatalogSource(
        commonCatalogLoaders,
        frescoUiCatalogLoaders,
        interviewCatalogLoaders,
      ).load('nl'),
    };

    render(
      <Shell
        {...handlers}
        payload={payload}
        requestedLocales={['nl-BE']}
        catalog={catalog}
        disableAnalytics
      />,
    );

    const region = screen.getByRole('main');
    expect(region).toHaveAttribute('lang', 'en');
    expect(region).not.toHaveAttribute('aria-busy');
    const next = screen.getByRole('button', { name: 'Volgende stap' });
    await settle();
    expect(next).toBeVisible();
    expect(neverLoadsDutch).not.toHaveBeenCalled();
  });

  it('keeps the current language while a newly requested one loads', async () => {
    await interviewCatalogSource.load('es');
    function Host() {
      const [requested, setRequested] = useState<readonly string[]>(['es']);
      return (
        <>
          <button type="button" onClick={() => setRequested(['fr'])}>
            Change browser languages
          </button>
          <Shell
            {...handlers}
            payload={payload}
            requestedLocales={requested}
            disableAnalytics
          />
        </>
      );
    }
    render(<Host />);
    const user = userEvent.setup();
    const heading = screen.getByRole('heading', {
      name: 'Authored screen title',
    });
    await user.click(
      screen.getByRole('button', { name: 'Change browser languages' }),
    );
    await settle();

    const region = screen.getByRole('main');
    expect(region).toHaveAttribute('lang', 'en');
    expect(region).not.toHaveAttribute('aria-busy');
    expect(
      screen.getByRole('button', { name: 'Siguiente paso' }),
    ).toBeVisible();

    gates.fr.open();
    expect(
      await screen.findByRole('button', { name: 'Étape suivante' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toBe(region);
    expect(region).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { name: 'Authored screen title' })).toBe(
      heading,
    );
  });
});
