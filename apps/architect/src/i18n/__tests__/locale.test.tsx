import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAppIntl,
  useAppLocale,
  AppI18nProvider,
} from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import ArchitectField from '~/components/Form/ArchitectField';
import { VARIABLE_TYPES } from '~/config/variables';

import {
  ArchitectI18nProvider,
  useArchitectLocale,
} from '../ArchitectI18nProvider';
import { formatConfig } from '../formatConfig';
import {
  ARCHITECT_LOCALE_KEY,
  readLocalePreference,
  resolveDeviceLocale,
} from '../preference';

function Harness() {
  const intl = useAppIntl();
  const { locale, setLocale } = useAppLocale();
  const preference = useArchitectLocale();
  return (
    <>
      <output data-testid="locale">{locale}</output>
      <output data-testid="saved">{String(preference?.saved)}</output>
      <output data-testid="label">
        {formatConfig(VARIABLE_TYPES.number, intl).label}
      </output>
      <button onClick={() => setLocale('es')}>Spanish</button>
      <button onClick={() => setLocale('en-GB')}>British</button>
      <button onClick={() => setLocale(null)}>Automatic</button>
      <Form onSubmit={() => ({ success: true })}>
        <ArchitectField
          name="name"
          label="Authored identifier"
          component={InputField}
          initialValue="Research_1"
          validation={{ maxLength: 3 }}
        />
        <button type="submit">Validate</button>
      </Form>
      <div lang="en" dir="ltr">
        <AppI18nProvider
          locale="en"
          locales={[{ locale: 'en', label: 'English', direction: 'ltr' }]}
          manageDocument={false}
        >
          <PreviewProbe />
        </AppI18nProvider>
      </div>
    </>
  );
}
function PreviewProbe() {
  return <output data-testid="preview-locale">{useAppIntl().locale}</output>;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Architect device language', () => {
  it('resolves browser regional Spanish before the first render and manages document attributes', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX']);
    render(
      <ArchitectI18nProvider>
        <Harness />
      </ArchitectI18nProvider>,
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    expect(screen.getByTestId('label')).toHaveTextContent('Número');
    expect(document.documentElement).toHaveAttribute('lang', 'es');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTestId('preview-locale')).toHaveTextContent('en');
  });

  it('switches existing labels and validation errors, preserves authored values, and persists through remount', async () => {
    const view = render(
      <ArchitectI18nProvider>
        <Harness />
      </ArchitectI18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(
      await screen.findByText('Too long. Enter at most 3 characters.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Spanish' }));
    expect(screen.getByTestId('label')).toHaveTextContent('Número');
    expect(
      await screen.findByText(
        'El texto es demasiado largo. Introduce como máximo 3 caracteres.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Too long. Enter at most 3 characters.'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Authored identifier')).toHaveValue(
      'Research_1',
    );
    expect(screen.getByTestId('preview-locale')).toHaveTextContent('en');
    expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBe('es');
    view.unmount();
    render(
      <ArchitectI18nProvider>
        <Harness />
      </ArchitectI18nProvider>,
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
  });

  it('returns to browser negotiation in automatic mode, following browser changes and cross-tab preferences', async () => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'en-GB');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-AR']);
    render(
      <ArchitectI18nProvider>
        <Harness />
      </ArchitectI18nProvider>,
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en-GB');
    fireEvent.click(screen.getByRole('button', { name: 'Automatic' }));
    expect(localStorage.getItem(ARCHITECT_LOCALE_KEY)).toBeNull();
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    fireEvent(window, new Event('languagechange'));
    await waitFor(() =>
      expect(screen.getByTestId('locale')).toHaveTextContent('en-GB'),
    );
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('locale')).toHaveTextContent('es'),
    );
  });

  it('applies a choice even when storage refuses the write and reports that it was not saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    render(
      <ArchitectI18nProvider>
        <Harness />
      </ArchitectI18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Spanish' }));
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    expect(screen.getByTestId('saved')).toHaveTextContent('false');
    expect(document.documentElement).toHaveAttribute('lang', 'es');
  });

  it.each(['xx-withdrawn', 'not_a_locale', 'qps-ploc', ''])(
    'ignores invalid or nonproduction stored preference %s',
    (stored) => {
      localStorage.setItem(ARCHITECT_LOCALE_KEY, stored);
      expect(readLocalePreference()).toBeNull();
      expect(resolveDeviceLocale(readLocalePreference())).toBe('en');
    },
  );
});

it('uses the switched researcher locale for a later thunk failure without changing authored protocol data', async () => {
  const { configureStore } = await import('@reduxjs/toolkit');
  const { rootReducer } = await import('~/ducks/modules/root');
  const { setActiveProtocol } = await import('~/ducks/modules/activeProtocol');
  const library = await import('~/utils/protocolLibrary');
  const { openLibraryProtocol } =
    await import('~/ducks/modules/userActions/userActions');
  const { getArchitectIntl } = await import('../imperative');
  vi.spyOn(library, 'getStoredProtocol').mockResolvedValue(undefined);
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(
    setActiveProtocol({
      name: 'Research_Name',
      schemaVersion: 8,
      stages: [],
      codebook: {},
    }),
  );
  const authoredBefore = JSON.stringify(
    store.getState().activeProtocol.present,
  );
  render(
    <ArchitectI18nProvider>
      <Harness />
    </ArchitectI18nProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Spanish' }));
  expect(screen.getByTestId('preview-locale')).toHaveTextContent('en');
  expect(getArchitectIntl().locale).toBe('es');
  const result = await store
    .dispatch(openLibraryProtocol({ id: 'missing_authored_id' }))
    .unwrap();
  expect(result.status).toBe('error');
  if (result.status !== 'error')
    throw new Error('Expected the missing-library-protocol refusal');
  expect(result.title).toBe('Protocolo no encontrado');
  expect(result.message).toBe(
    'No se encontró este protocolo en tu biblioteca.',
  );
  expect(JSON.stringify(store.getState().activeProtocol.present)).toBe(
    authoredBefore,
  );
});
