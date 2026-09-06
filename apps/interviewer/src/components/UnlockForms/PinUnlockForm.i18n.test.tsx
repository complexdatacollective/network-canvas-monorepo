import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import { interviewerProductionLocales } from '~/i18n/locales';
import { interviewerCatalogs } from '~/locales/catalogs';

import { PinUnlockForm } from './PinUnlockForm';

it('reformats a submitted PIN error without resubmitting and preserves focus for a successful retry', async () => {
  const verifyPin = vi.fn(async () => ({ ok: false }));
  const user = userEvent.setup();
  const form = (locale: 'en' | 'es') => (
    <AppI18nProvider
      locale={locale}
      locales={interviewerProductionLocales}
      messages={interviewerCatalogs[locale]}
    >
      <FormStoreProvider>
        <PinUnlockForm formId="live-pin" verifyPin={verifyPin} />
      </FormStoreProvider>
    </AppI18nProvider>
  );
  const view = render(form('en'));
  await user.keyboard('00000000');
  await expect(screen.findByText('Incorrect PIN.')).resolves.toBeVisible();
  expect(verifyPin).toHaveBeenCalledExactlyOnceWith('00000000');
  view.rerender(form('es'));
  await waitFor(() =>
    expect(screen.getByText('PIN incorrecto.')).toBeVisible(),
  );
  expect(screen.queryByText('Incorrect PIN.')).not.toBeInTheDocument();
  expect(verifyPin).toHaveBeenCalledTimes(1);
  const segments = within(
    screen.getByTestId('segmented-code-pin'),
  ).getAllByLabelText(/oculto/);
  expect(segments).toHaveLength(8);
  for (const segment of segments) expect(segment).toHaveValue('');
  expect(segments[0]).toHaveFocus();

  verifyPin.mockResolvedValue({ ok: true });
  await user.keyboard('12345678');
  await waitFor(() => expect(verifyPin).toHaveBeenCalledTimes(2));
  expect(verifyPin).toHaveBeenLastCalledWith('12345678');
  await waitFor(() =>
    expect(screen.queryByText('PIN incorrecto.')).not.toBeInTheDocument(),
  );
  for (const [index, segment] of segments.entries()) {
    expect(segment).toHaveValue(String(index + 1));
  }
});
