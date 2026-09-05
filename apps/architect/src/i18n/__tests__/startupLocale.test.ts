import { configureStore } from '@reduxjs/toolkit';
import { afterEach, expect, it, vi } from 'vitest';

import { formatMessageError } from '@codaco/app-i18n/messages';
import type { CurrentProtocol } from '@codaco/protocol-validation';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('uses the persisted researcher locale for startup restoration before React mounts', async () => {
  localStorage.setItem('architect.locale', 'es');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
  const { getArchitectIntl } = await import('../imperative');
  const { rootReducer } = await import('~/ducks/modules/root');
  const { setActiveProtocolId } = await import('~/ducks/modules/app');
  const { restoreActiveProtocolFromLibrary } =
    await import('~/ducks/restoreActiveProtocol');
  const { admitStoredProtocol } =
    await import('~/utils/storedProtocolAdmission');
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setActiveProtocolId('unchanged_id'));
  const protocol: CurrentProtocol = {
    name: 'Research_Name',
    schemaVersion: 8,
    stages: [],
    codebook: {},
  };
  const onInvalid = vi.fn();

  expect(document.body).toBeEmptyDOMElement();
  expect(getArchitectIntl().locale).toBe('es');
  const result = await restoreActiveProtocolFromLibrary(store, {
    getStoredProtocol: vi.fn().mockResolvedValue({
      id: 'unchanged_id',
      name: 'Research_Name',
      protocol,
      schemaVersion: 7,
    }),
    admitStoredProtocol: (row, _dependencies, intl) =>
      admitStoredProtocol(
        row,
        {
          migrate: () => {
            throw new Error('Unrecognized migration diagnostic');
          },
        },
        intl,
      ),
    replaceProtocolRoute: vi.fn(),
    onInvalid,
  });
  expect(result).toBe('invalid');
  expect(onInvalid).toHaveBeenCalledOnce();
  const refusal: { title: string; message: string } =
    onInvalid.mock.calls[0]![0];
  expect(
    formatMessageError(refusal.message, getArchitectIntl()) ?? refusal.message,
  ).toContain('No se pudo actualizar este protocolo.');
  expect(
    formatMessageError(refusal.title, getArchitectIntl()) ?? refusal.title,
  ).toBe('No se pudo abrir el protocolo');
  expect(store.getState().activeProtocol.present).toBeNull();
  expect(protocol.name).toBe('Research_Name');
  expect(document.body).toBeEmptyDOMElement();
  document.body.innerHTML = '<div id="boot-loader" aria-hidden="true"></div>';
  const { initializeArchitectDocument } = await import('../documentMetadata');
  initializeArchitectDocument(true);
  expect(document.documentElement).toHaveAttribute('lang', 'es');
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  expect(document.title).toBe('Vista previa de Architect');
  expect(document.getElementById('boot-loader')).toHaveAttribute(
    'aria-label',
    'Cargando…',
  );
  expect(document.getElementById('boot-loader')).not.toHaveAttribute(
    'aria-hidden',
  );
  document.body.replaceChildren();
});
