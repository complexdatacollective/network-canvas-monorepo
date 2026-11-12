import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import {
  setActiveProtocol,
  setProtocolDefaultLocale,
  setProtocolLocalizedStrings,
} from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getLabelCollisions } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { BUNDLED_TEMPLATES } from '~/templates';
import { bundleProtocol, DownloadRefusedError } from '~/utils/bundleProtocol';
import { findDownloadRefusal } from '~/utils/downloadRefusal';

import LabelCollisionsAlert from '../LabelCollisionsAlert';

vi.mock('~/utils/assetUtils', () => ({
  getAssetById: vi.fn(() => Promise.resolve(new Blob(['asset']))),
}));

const template = BUNDLED_TEMPLATES.find(
  ({ id }) => id === 'eco-genetic-relationship-maps',
)?.protocol;

const OPTIONS_PATH = [
  'codebook',
  'node',
  'person',
  'variables',
  'living_status',
  'options',
] as const;

/**
 * A protocol in English, French and Spanish, written in English, with nothing
 * missing in French, whose living-status options are labelled `{ en: 'A', fr:
 * 'B' }` and `{ en: 'C', es: 'B' }`: different in every language while
 * English is the default. Made French's default, a Spanish reader sees the
 * first option's French label "B", which is the second option's Spanish one.
 */
const trilingual = (): CurrentProtocol => {
  if (!template) throw new Error('Missing the eco-genetic template');
  const protocol = structuredClone(template);
  protocol.localization = { defaultLocale: 'en', locales: ['en', 'fr', 'es'] };
  // Every text with an English translation has a French one, so French can
  // be the default without leaving any text missing in it.
  const fill = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(fill);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    const values = Object.values(record);
    if (
      typeof record.en === 'string' &&
      values.every((value) => typeof value === 'string')
    ) {
      record.fr ??= record.en;
      return;
    }
    values.forEach(fill);
  };
  fill(protocol.stages);
  fill(protocol.codebook);
  fill(protocol.interfaceText);
  const livingStatus = protocol.codebook.node?.person?.variables?.living_status;
  if (livingStatus?.type !== 'categorical') throw new Error('No options');
  livingStatus.options = [
    { value: 'living', label: { en: 'A', fr: 'B' } },
    { value: 'deceased', label: { en: 'C', es: 'B' } },
  ];
  return protocol;
};

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(trilingual()));
  return store;
};

const current = (store: ReturnType<typeof makeStore>) => {
  const protocol = getProtocol(store.getState());
  if (!protocol) throw new Error('No protocol');
  return protocol;
};

const renderAlert = (store: ReturnType<typeof makeStore>) =>
  render(
    <Provider store={store}>
      <Router hook={memoryLocation({ path: '/protocol' }).hook}>
        <LabelCollisionsAlert />
      </Router>
    </Provider>,
  );

describe('a change of default language that makes two labels read the same', () => {
  it('starts from a protocol whose labels a participant can tell apart', async () => {
    const store = makeStore();
    expect(getLabelCollisions(store.getState())).toEqual([]);
    expect(
      await validateProtocol(current(store), { draft: true }),
    ).toMatchObject({ success: true });
  });

  it('is made, and leaves a protocol that can still be written', async () => {
    const store = makeStore();
    store.dispatch(setProtocolDefaultLocale({ locale: 'fr' }));

    const protocol = current(store);
    expect(protocol.localization.defaultLocale).toBe('fr');
    expect(
      (await validateProtocol(protocol, { draft: true })).error?.issues,
    ).toBeUndefined();
  });

  it('is listed as an issue naming the attribute, both labels and the language', () => {
    const store = makeStore();
    store.dispatch(setProtocolDefaultLocale({ locale: 'fr' }));
    renderAlert(store);

    expect(screen.getByText('Some labels are the same')).toBeVisible();
    expect(
      screen.getByText(
        'Options 1 and 2 of the attribute “living_status” have the same label in Spanish: “B” and “B”.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Edit the translations into Spanish' }),
    ).toHaveAttribute('href', '/protocol/localization?table=open&language=es');
  });

  it('stops the protocol being downloaded', async () => {
    const store = makeStore();
    store.dispatch(setProtocolDefaultLocale({ locale: 'fr' }));
    const protocol = current(store);

    expect(findDownloadRefusal(protocol)).toEqual({ kind: 'labelCollisions' });
    await expect(bundleProtocol(protocol)).rejects.toBeInstanceOf(
      DownloadRefusedError,
    );
  });

  it('clears once one of the two labels is changed', async () => {
    const store = makeStore();
    store.dispatch(setProtocolDefaultLocale({ locale: 'fr' }));
    renderAlert(store);
    expect(screen.getByText('Some labels are the same')).toBeVisible();

    act(() => {
      store.dispatch(
        setProtocolLocalizedStrings({
          updates: [
            {
              path: [...OPTIONS_PATH, 1, 'label'],
              value: { en: 'C', es: 'D' },
            },
          ],
        }),
      );
    });

    expect(getLabelCollisions(store.getState())).toEqual([]);
    expect(screen.queryByText('Some labels are the same')).toBeNull();
    expect(findDownloadRefusal(current(store))).toBeNull();
    await expect(bundleProtocol(current(store))).resolves.toBeInstanceOf(Blob);
  });
});
