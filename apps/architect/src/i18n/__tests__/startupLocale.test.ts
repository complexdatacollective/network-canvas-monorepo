import { afterEach, expect, it, vi } from 'vitest';

import { formatMessageError } from '@codaco/app-i18n/messages';
import type { CurrentProtocol } from '@codaco/protocol-validation';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('uses the persisted researcher locale for startup messages before React mounts', async () => {
  localStorage.setItem('architect.locale', 'es');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
  const { getArchitectIntl, loadStartupLocale } = await import('../imperative');
  const { describeMigrationFailure } =
    await import('~/utils/describeMigrationFailure');
  const protocol: CurrentProtocol = {
    name: 'Research_Name',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    stages: [],
    codebook: {},
  };

  expect(document.body).toBeEmptyDOMElement();
  // What main.tsx awaits before restoring: Spanish is its own chunk, and
  // until it arrives there is nothing to format Spanish with.
  expect(getArchitectIntl().locale).toBe('en');
  await loadStartupLocale();
  expect(getArchitectIntl().locale).toBe('es');
  // Messages Architect builds outside React — here, why a protocol could not
  // be upgraded — are formatted with the catalog loaded here.
  const refusal = describeMigrationFailure(
    new Error('Unrecognized migration diagnostic'),
    protocol,
    getArchitectIntl(),
  );
  expect(
    formatMessageError(refusal.message, getArchitectIntl()) ?? refusal.message,
  ).toContain('No se pudo actualizar este protocolo.');
  expect(
    formatMessageError(refusal.title, getArchitectIntl()) ?? refusal.title,
  ).toBe('No se pudo abrir el protocolo');
  expect(document.body).toBeEmptyDOMElement();
  document.body.innerHTML =
    '<div id="boot-loader" role="status" aria-live="polite"><span id="boot-loader-message">Architect</span></div>';
  const { initializeArchitectDocument } = await import('../documentMetadata');
  initializeArchitectDocument(true);
  expect(document.documentElement).toHaveAttribute('lang', 'es');
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  expect(document.title).toBe('Vista previa de Architect');
  expect(document.getElementById('boot-loader-message')).toHaveTextContent(
    'Cargando…',
  );
  expect(document.getElementById('boot-loader')).not.toHaveAttribute(
    'aria-hidden',
  );
  document.body.replaceChildren();
});
