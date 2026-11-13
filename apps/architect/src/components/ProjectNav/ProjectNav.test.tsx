import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import ProjectNav from './ProjectNav';

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
};

const renderNav = (path: string) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <Router hook={memoryLocation({ path }).hook}>
          <ProjectNav />
        </Router>
      </ArchitectI18nProvider>
    </Provider>,
  );
};

describe('<ProjectNav /> experimental features entry', () => {
  it('is an icon link named Experimental features that goes to the page', () => {
    renderNav('/protocol');

    const link = screen.getAllByRole('link', {
      name: 'Experimental features',
    })[0];
    expect(link).toHaveAttribute('href', '/protocol/experiments');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('comes after the Summary tab', () => {
    renderNav('/protocol');

    const names = screen
      .getAllByRole('link')
      .map((link) => link.textContent?.trim());
    expect(names.indexOf('Experimental features')).toBeGreaterThan(
      names.indexOf('Summary'),
    );
  });

  it('is the current page, and no other tab is, on the experiments page', () => {
    renderNav('/protocol/experiments');

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.length).toBeGreaterThan(0);
    for (const link of current) {
      expect(link).toHaveAccessibleName('Experimental features');
    }
  });

  it('keeps Summary as the current page on its own address', () => {
    renderNav('/protocol/summary');

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent?.trim())).not.toContain(
      'Experimental features',
    );
  });
});
