import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import MissingTranslations, { ALL_LANGUAGES } from '../MissingTranslations';

const bilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome' },
      title: { en: 'Hello' },
      items: [],
    },
  ],
};

const renderMissingTranslations = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(bilingual));
  render(
    <Provider store={store}>
      <MissingTranslations
        filter={ALL_LANGUAGES}
        onFilterChange={() => {}}
        headingRef={createRef()}
      />
    </Provider>,
  );
};

describe('MissingTranslations', () => {
  it('heads each place one level below the section title', () => {
    renderMissingTranslations();

    const title = screen.getByRole('heading', { name: 'Missing translations' });
    const place = screen.getByRole('heading', { name: /Welcome/ });
    const titleLevel = Number(title.tagName.slice(1));

    expect(Number(place.tagName.slice(1))).toBe(titleLevel + 1);
  });
});
