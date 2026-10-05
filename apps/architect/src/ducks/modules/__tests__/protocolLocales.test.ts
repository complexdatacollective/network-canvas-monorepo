import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline, { timelineActions } from '~/ducks/middleware/timeline';
import activeProtocol, {
  actionCreators,
  addProtocolLocales,
  moveProtocolLocale,
  relabelProtocolLocale,
  removeProtocolLocale,
  setActiveProtocol,
  setProtocolDefaultLocale,
} from '~/ducks/modules/activeProtocol';
import app from '~/ducks/modules/app';
import { timelineOptions } from '~/ducks/modules/root';

/** The protocol timeline as the app builds it, so undo is the real undo. */
const makeStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      activeProtocol: createTimeline(activeProtocol, timelineOptions),
    }),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

type Store = ReturnType<typeof makeStore>;

const migratedProtocol = (): CurrentProtocol => ({
  name: 'Migrated study',
  schemaVersion: 9,
  localization: { defaultLocale: 'und', locales: ['und'] },
  assetManifest: {},
  codebook: {
    node: {
      person: {
        name: 'Person',
        label: { und: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { und: 'Welcome' },
      title: { und: 'Hello' },
      items: [],
    },
  ],
});

const presentOf = (store: Store) => {
  const present = store.getState().activeProtocol.present;
  if (!present) throw new Error('No active protocol');
  return present;
};

const pastLength = (store: Store) =>
  store.getState().activeProtocol.past.length;

const stageLabel = (store: Store) => presentOf(store).stages[0]?.label;

describe('protocol language reducers and undo', () => {
  let store: Store;

  beforeEach(() => {
    store = makeStore();
    store.dispatch(setActiveProtocol(migratedProtocol()));
  });

  it('identifies migrated text as a language in one undo step', () => {
    const before = pastLength(store);

    store.dispatch(relabelProtocolLocale({ from: 'und', to: 'en' }));

    expect(pastLength(store)).toBe(before + 1);
    expect(presentOf(store).localization).toEqual({
      defaultLocale: 'en',
      locales: ['en'],
    });
    expect(stageLabel(store)).toEqual({ en: 'Welcome' });
    expect(presentOf(store).codebook.node?.person?.label).toEqual({
      en: 'Person',
    });

    store.dispatch(timelineActions.undo());

    expect(presentOf(store)).toEqual(migratedProtocol());
  });

  it('undoes adding, reordering, changing the default and removing one step at a time', () => {
    store.dispatch(relabelProtocolLocale({ from: 'und', to: 'en' }));
    const english = presentOf(store);

    store.dispatch(addProtocolLocales({ locales: ['fr', 'de'] }));
    const added = presentOf(store);
    expect(added.localization.locales).toEqual(['en', 'fr', 'de']);

    store.dispatch(moveProtocolLocale({ locale: 'de', index: 0 }));
    const moved = presentOf(store);
    expect(moved.localization.locales).toEqual(['de', 'en', 'fr']);

    store.dispatch(setProtocolDefaultLocale({ locale: 'de' }));
    const defaulted = presentOf(store);
    expect(defaulted.localization.defaultLocale).toBe('de');

    store.dispatch(removeProtocolLocale({ locale: 'fr' }));
    expect(presentOf(store).localization).toEqual({
      defaultLocale: 'de',
      locales: ['de', 'en'],
    });

    store.dispatch(timelineActions.undo());
    expect(presentOf(store)).toEqual(defaulted);
    store.dispatch(timelineActions.undo());
    expect(presentOf(store)).toEqual(moved);
    store.dispatch(timelineActions.undo());
    expect(presentOf(store)).toEqual(added);
    store.dispatch(timelineActions.undo());
    expect(presentOf(store)).toEqual(english);
  });

  it('removes a language from every string in the same step that undeclares it', () => {
    store.dispatch(relabelProtocolLocale({ from: 'und', to: 'en' }));
    store.dispatch(addProtocolLocales({ locales: ['fr'] }));
    store.dispatch(
      actionCreators.updateProtocol({
        stages: presentOf(store).stages.map((stage) => ({
          ...stage,
          label: { en: 'Welcome', fr: 'Bienvenue' },
        })),
      }),
    );
    const translated = presentOf(store);
    const before = pastLength(store);

    store.dispatch(removeProtocolLocale({ locale: 'fr' }));

    expect(pastLength(store)).toBe(before + 1);
    expect(stageLabel(store)).toEqual({ en: 'Welcome' });

    store.dispatch(timelineActions.undo());

    expect(presentOf(store)).toEqual(translated);
  });

  it('records nothing for a refused operation', () => {
    const before = pastLength(store);
    const present = presentOf(store);

    store.dispatch(removeProtocolLocale({ locale: 'und' }));
    store.dispatch(addProtocolLocales({ locales: ['und'] }));
    store.dispatch(addProtocolLocales({ locales: ['not a tag'] }));
    store.dispatch(setProtocolDefaultLocale({ locale: 'de' }));

    expect(pastLength(store)).toBe(before);
    expect(presentOf(store)).toBe(present);
  });
});
