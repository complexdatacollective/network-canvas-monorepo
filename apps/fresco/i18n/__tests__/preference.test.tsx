import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppIntl } from '@codaco/app-i18n/react';
import { FrescoI18nProvider, useFrescoLocale } from '~/i18n/FrescoI18nProvider';
import LanguageSetting from '~/i18n/LanguageSetting';
import type { FrescoI18nInitialization } from '~/i18n/resolve';

const { updateLocale, refresh } = vi.hoisted(() => ({
  updateLocale: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('~/actions/locale', () => ({ updateLocale }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const initial: FrescoI18nInitialization = {
  locale: 'en',
  preference: null,
  userId: 'alice',
  requested: ['en'],
};
function Probe() {
  const intl = useAppIntl();
  const { preference, failed, saving } = useFrescoLocale();
  return (
    <div data-testid="state">
      {JSON.stringify({ locale: intl.locale, preference, failed, saving })}
    </div>
  );
}
function App({ value = initial }: { value?: FrescoI18nInitialization }) {
  return (
    <FrescoI18nProvider initial={value}>
      <LanguageSetting />
      <Probe />
      <div lang="en" dir="ltr" data-testid="interview">
        Participant content
      </div>
    </FrescoI18nProvider>
  );
}
const readState = () =>
  JSON.parse(screen.getByTestId('state').textContent ?? '{}') as {
    locale: string;
    preference: string | null;
    failed: boolean;
    saving: boolean;
  };
function deferred() {
  let resolve!: (value: { success: boolean }) => void;
  const promise = new Promise<{ success: boolean }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateLocale.mockResolvedValue({ success: true });
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: ['en-GB'],
  });
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'rtl';
});

describe('Fresco locale preference control', () => {
  it('hydrates the exact Spanish server markup despite a British browser preference', async () => {
    const value = { ...initial, locale: 'es', preference: 'es' };
    const markup = renderToString(<App value={value} />);
    expect(markup).toContain('Idioma');
    expect(markup).not.toContain('Choose the language for Fresco');
    const container = document.createElement('div');
    container.innerHTML = markup;
    document.body.append(container);
    const recoverableError = vi.fn();
    const root = hydrateRoot(container, <App value={value} />, {
      onRecoverableError: recoverableError,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('select')).toHaveValue('es');
    expect(document.documentElement.lang).toBe('es');
    expect(recoverableError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
  it('starts from serialized server locale before reading a different browser preference', () => {
    render(<App value={{ ...initial, locale: 'es', preference: 'es' }} />);
    expect(readState().locale).toBe('es');
    expect(document.documentElement).toHaveAttribute('lang', 'es');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('combobox')).toHaveValue('es');
    expect(screen.getByRole('option', { name: 'Español' })).toHaveAttribute(
      'lang',
      'es',
    );
  });
  it('changes immediately, persists to the correct account, refreshes server fragments, and keeps interview lang', async () => {
    const write = deferred();
    updateLocale.mockReturnValue(write.promise);
    render(<App />);
    expect(document.documentElement.lang).toBe('en');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
    expect(document.documentElement.lang).toBe('es');
    expect(readState()).toMatchObject({ locale: 'es', saving: true });
    expect(screen.getByTestId('interview')).toHaveAttribute('lang', 'en');
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith('es', 'alice'),
    );
    await act(async () => write.resolve({ success: true }));
    expect(refresh).toHaveBeenCalled();
    expect(readState().saving).toBe(false);
  });
  it('saves Automatic as null and uses current browser best fit', async () => {
    render(<App value={{ ...initial, locale: 'es', preference: 'es' }} />);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '__automatic' },
    });
    expect(document.documentElement.lang).toBe('en-GB');
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith(null, 'alice'),
    );
  });
  it('restores the confirmed language and announces a failed write', async () => {
    updateLocale.mockRejectedValue(new Error('offline'));
    render(<App />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
    await waitFor(() =>
      expect(readState()).toMatchObject({
        locale: 'en',
        failed: true,
        saving: false,
      }),
    );
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement();
  });
  it('serializes writes and keeps a late response from replacing the latest choice', async () => {
    const first = deferred(),
      second = deferred();
    updateLocale
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<App />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
    await waitFor(() => expect(updateLocale).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'en-GB' },
    });
    expect(document.documentElement.lang).toBe('en-GB');
    expect(updateLocale).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve({ success: true }));
    await waitFor(() => expect(updateLocale).toHaveBeenCalledTimes(2));
    expect(readState()).toMatchObject({ locale: 'en-GB', saving: true });
    await act(async () => second.resolve({ success: true }));
    expect(readState()).toMatchObject({ locale: 'en-GB', saving: false });
  });
  it('applies a new account’s automatic preference and ignores the former account’s in-flight response', async () => {
    const write = deferred();
    updateLocale.mockReturnValue(write.promise);
    const view = render(<App />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith('es', 'alice'),
    );
    view.rerender(
      <App value={{ ...initial, userId: 'bob', locale: 'en-GB' }} />,
    );
    expect(readState()).toMatchObject({ locale: 'en-GB', preference: null });
    await act(async () => write.resolve({ success: true }));
    expect(readState()).toMatchObject({ locale: 'en-GB', preference: null });
  });
  it('rolls back two failed overlapping choices to the last confirmed server preference', async () => {
    const first = deferred(),
      second = deferred();
    updateLocale
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<App />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
    await waitFor(() => expect(updateLocale).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'en-GB' },
    });
    await act(async () => first.resolve({ success: false }));
    await waitFor(() => expect(updateLocale).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve({ success: false }));
    expect(readState()).toEqual({
      locale: 'en',
      preference: null,
      saving: false,
      failed: true,
    });
  });
});
