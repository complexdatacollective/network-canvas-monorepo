import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  LocaleTag,
  LocalizationDeclaration,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import StagesMenu from '../StagesMenu';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class StubWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('Worker', StubWorker);
});

const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
};

function renderMenu({
  stages,
  localization = ENGLISH_ONLY,
  locale = null,
}: {
  stages: unknown[];
  localization?: LocalizationDeclaration;
  locale?: LocaleTag | null;
}) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'session',
        network: {
          ego: { [entityAttributesProperty]: {} },
          nodes: [],
          edges: [],
        },
      } as never,
      protocol: {
        id: 'protocol',
        hash: 'hash',
        schemaVersion: 9,
        localization,
        codebook: { node: {}, edge: {}, ego: { variables: {} } },
        stages,
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <TestProtocolLocalization localization={localization} locale={locale}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <StagesMenu open onClosed={vi.fn()} onSelect={vi.fn()} />
        </CurrentStepProvider>
      </TestProtocolLocalization>
    </Provider>,
  );
}

describe('StagesMenu route status', () => {
  it('visibly and accessibly distinguishes locally hidden and bypassed screens', () => {
    renderMenu({
      stages: [
        {
          id: 'decision',
          type: 'Information',
          label: { en: 'Decision' },
          items: [],
        },
        {
          id: 'hidden',
          type: 'Information',
          label: { en: 'Hidden screen' },
          items: [],
          skipLogic: {
            action: 'SKIP',
            filter: { join: 'AND', rules: [] },
            destination: { type: 'stage', stageId: 'destination' },
          },
        },
        {
          id: 'bypassed',
          type: 'Information',
          label: { en: 'Bypassed screen' },
          items: [],
        },
        {
          id: 'destination',
          type: 'Information',
          label: { en: 'Destination' },
          items: [],
        },
      ],
    });

    expect(
      screen.getByRole('listbox', { name: 'Interview screens' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hidden by answers')).toBeVisible();
    expect(screen.getByText('Outside current path')).toBeVisible();
  });
});

describe('StagesMenu screen names', () => {
  it('shows each name in the interview language, falling back to the default, with no language of its own', () => {
    renderMenu({
      localization: { defaultLocale: 'en', locales: ['en', 'ar'] },
      locale: 'ar',
      stages: [
        {
          id: 'translated',
          type: 'Information',
          label: { en: 'Welcome', ar: 'مرحبا' },
          items: [],
        },
        {
          id: 'untranslated',
          type: 'Information',
          label: { en: 'Thank you' },
          items: [],
        },
      ],
    });

    // The interview sets one language for everything it renders, so neither
    // name, nor anything between it and the menu, names a language.
    expect(screen.getByText('مرحبا').closest('[lang], [dir]')).toBeNull();
    expect(screen.getByText('Thank you').closest('[lang], [dir]')).toBeNull();
  });
});
