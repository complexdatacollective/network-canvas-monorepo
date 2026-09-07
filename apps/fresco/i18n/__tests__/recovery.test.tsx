import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage } from '@codaco/app-i18n/react';
import RecoveryI18nProvider from '~/i18n/RecoveryI18nProvider';

it('renders a valid fatal-error document and hydrates its independent mirrored-language recovery', async () => {
  const previous = document.documentElement.outerHTML;
  const view = (
    <RecoveryI18nProvider>
      <main>
        <AppMessage message={commonMessages.retry} />
      </main>
    </RecoveryI18nProvider>
  );
  const markup = renderToString(view);
  expect(markup).toContain('<html lang="en" dir="ltr">');
  expect(markup).toContain('<body>');
  expect(markup).toContain('Try again');
  document.cookie = 'fresco.locale=es; Path=/';
  document.open();
  document.write(markup);
  document.close();
  const recoverableError = vi.fn();
  const root = hydrateRoot(document, view, {
    onRecoverableError: recoverableError,
  });
  try {
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.documentElement.lang).toBe('es');
    expect(document.body.textContent).toBe('Volver a intentarlo');
    expect(recoverableError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    document.cookie = 'fresco.locale=; Path=/; Max-Age=0';
    document.open();
    document.write(previous);
    document.close();
  }
});
