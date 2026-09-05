import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test.js';
import { clickWhenDeckSettles } from '../helpers/deck.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

async function chooseLanguage(
  page: Page,
  locale: string,
  current: 'en' | 'es' = 'en',
) {
  await page.getByTestId('settings-trigger').click();
  await page
    .getByRole('tab', {
      name: current === 'es' ? 'Idioma' : 'Language',
      exact: true,
    })
    .click();
  const picker = page.getByRole('combobox', {
    name: current === 'es' ? 'Idioma de la aplicación' : 'App language',
    exact: true,
  });
  await picker.focus();
  // Native select keyboard semantics, without a pointer-only custom widget.
  await picker.selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.keyboard.press('Escape');
}

async function storedResearch(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ protocols: unknown[]; sessions: unknown[] }>(
        (resolve, reject) => {
          const request = indexedDB.open('interviewer');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
              ['protocols', 'sessions'],
              'readonly',
            );
            const protocols = transaction.objectStore('protocols').getAll();
            const sessions = transaction.objectStore('sessions').getAll();
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
            transaction.oncomplete = () => {
              database.close();
              resolve({
                protocols: protocols.result,
                sessions: sessions.result,
              });
            };
          };
        },
      ),
  );
}

test('Spanish administration preserves authored content and participant language', async ({
  page,
  protocol,
  interviewNav,
}) => {
  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  await interviewNav.startNewSession('Caso Á-17');
  await interviewNav.exitInterview();
  const before = await storedResearch(page);
  expect(before.protocols).toHaveLength(1);
  expect(before.sessions).toHaveLength(1);
  await chooseLanguage(page, 'es');
  await expect(
    page.getByRole('button', { name: 'Configuración', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Iniciar nueva entrevista', exact: true }),
  ).toBeVisible();
  expect(await storedResearch(page)).toEqual(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(
    page.getByRole('button', { name: /Reanudar la última entrevista/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /Reanudar la última entrevista/ })
    .click();
  await interviewNav.waitForStage();
  await expect(
    page.getByTestId('participant-language-boundary'),
  ).toHaveAttribute('lang', 'en');
  await expect(
    page.getByTestId('participant-language-boundary'),
  ).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await interviewNav.exitInterview();
  await page.getByRole('button', { name: 'Datos', exact: true }).click();
  await expect(
    page.getByRole('columnheader', { name: /ID del caso/ }),
  ).toBeVisible();
  await expect(page.getByText('Caso Á-17', { exact: true })).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Seleccionar Caso Á-17', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Eliminar selección (1)', exact: true })
    .click();
  const deletion = page.getByRole('dialog', {
    name: '¿Eliminar 1 entrevista?',
  });
  await expect(deletion).toContainText('Esta acción no se puede deshacer.');
  await deletion.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await storedResearch(page)).sessions).toHaveLength(1);
});

test.describe('automatic language and setup', () => {
  test.use({ locale: 'es-MX' });
  test('uses the browser language before onboarding and keeps English an explicit choice', async ({
    page,
  }) => {
    await page.goto('/welcome');
    await expect(
      page.getByRole('button', { name: 'Empezar', exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'Configuración de tu dispositivo',
    );
    await expect(page.getByTestId('wizard-next')).toHaveText('Continuar');
    await page.getByTestId('wizard-next').click();
    await expect(page.getByRole('dialog')).toContainText(
      'Protección de tus datos',
    );
    await page.goto('/');
    await chooseLanguage(page, 'en', 'es');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true }),
    ).toBeVisible();
    await page.getByTestId('settings-trigger').click();
    await page.getByRole('tab', { name: 'Language', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'App language', exact: true })
      .selectOption('__automatic');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(
      await page.evaluate(() => localStorage.getItem('interviewer.locale')),
    ).toBeNull();
  });
});

test.describe('installed app catalog availability', () => {
  test.use({ serviceWorkers: 'allow' });
  test('first switches to Spanish offline, reloads, and imports without fetching a catalog', async ({
    page,
    context,
    interviewNav,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(() => navigator.serviceWorker.controller !== null),
      )
      .toBe(true);
    const catalogRequests: string[] = [];
    page.on('request', (request) => {
      if (/locales\/.*\.json|catalog/i.test(request.url()))
        catalogRequests.push(request.url());
    });
    await context.setOffline(true);
    await chooseLanguage(page, 'es');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Configuración', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Ir a la tarjeta 1', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Instalar protocolo de ejemplo',
        exact: true,
      }),
    ).toBeVisible();
    await clickWhenDeckSettles(
      page.getByRole('button', {
        name: 'Instalar protocolo de ejemplo',
        exact: true,
      }),
    );
    await expect(
      page.getByText('Protocolo importado', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('button', {
        name: 'Iniciar nueva entrevista',
        exact: true,
      }),
    ).toBeVisible();
    expect((await storedResearch(page)).protocols).toHaveLength(1);
    expect(catalogRequests).toEqual([]);
    await chooseLanguage(page, 'en-GB', 'es');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true }),
    ).toBeVisible();
    await interviewNav.startNewSession('GB-offline-17');
    await expect(
      page.getByTestId('participant-language-boundary'),
    ).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
    await interviewNav.exitInterview();
    expect((await storedResearch(page)).sessions).toHaveLength(1);
    expect(catalogRequests).toEqual([]);
  });
});

test('an open security wizard follows a language preference changed in another tab', async ({
  page,
  context,
}) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  const wizard = page.getByRole('dialog');
  await expect(wizard).toContainText('Setting up your device');
  const otherTab = await context.newPage();
  await otherTab.goto('/welcome');
  await otherTab.evaluate(() =>
    localStorage.setItem('interviewer.locale', 'es'),
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(wizard).toContainText('Configuración de tu dispositivo');
  await expect(wizard).toContainText('Configurar tu dispositivo es rápido');
  await expect(
    wizard.getByRole('button', { name: 'Continuar', exact: true }),
  ).toBeVisible();
  await wizard
    .getByRole('button', { name: 'Omitir asistente', exact: true })
    .click();
  const confirmation = page.getByRole('dialog', {
    name: '¿Omitir el asistente?',
  });
  await expect(confirmation).toContainText(
    'Tu dispositivo quedará sin protección',
  );
  await otherTab.evaluate(() =>
    localStorage.setItem('interviewer.locale', 'en'),
  );
  await expect(
    page.getByRole('dialog', { name: 'Skip the wizard?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Go back to wizard', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Go back to wizard', exact: true })
    .click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByText('No security', { exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Continue without security?' }),
  ).toBeVisible();
  await otherTab.evaluate(() =>
    localStorage.setItem('interviewer.locale', 'es'),
  );
  const noSecurity = page.getByRole('dialog', {
    name: '¿Continuar sin seguridad?',
  });
  await expect(noSecurity).toBeVisible();
  await expect(noSecurity).toContainText(
    'Cualquier persona con acceso a este dispositivo',
  );
  await expect(
    noSecurity.getByRole('button', {
      name: 'Continuar sin seguridad',
      exact: true,
    }),
  ).toBeVisible();
  await noSecurity
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  await otherTab.close();
});

test('all settings sections expose Spanish labels and usable controls', async ({
  page,
  protocol,
}) => {
  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  await chooseLanguage(page, 'es');
  await page.getByTestId('settings-trigger').click();
  const settings = page.getByRole('dialog', {
    name: 'Configuración',
    exact: true,
  });
  const sections = [
    ['Acerca de', 'Versión de la aplicación'],
    ['Idioma', 'Idioma de la aplicación'],
    ['Entrevista', 'Permitir la navegación entre etapas'],
    ['Exportación de datos', 'Exportar GraphML'],
    ['Privacidad', 'Activar estadísticas de uso'],
    ['Seguridad', 'Activar la seguridad de la aplicación'],
    ['Datos sintéticos', 'Número de sesiones'],
  ] as const;
  for (const [section, label] of sections) {
    await settings.getByRole('tab', { name: section, exact: true }).click();
    await expect(
      settings.getByRole('tab', { name: section, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(settings.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(
    settings.getByRole('button', { name: 'Generar', exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByRole('button', { name: 'Cerrar', exact: true }),
  ).toBeVisible();
});

test('narrow Spanish settings retain readable controls and keyboard tab navigation', async ({
  page,
  protocol,
}, testInfo) => {
  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  // The deck first previews the filename; the toast confirms its database write.
  await expect(
    page.getByText('Protocol imported', { exact: true }),
  ).toBeVisible();
  await chooseLanguage(page, 'es');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('settings-trigger').click();
  const settings = page.getByRole('dialog', {
    name: 'Configuración',
    exact: true,
  });
  const tabs = settings.getByRole('tablist', {
    name: 'Secciones de configuración',
  });
  await expect(tabs).toHaveAttribute('data-orientation', 'horizontal');
  const language = tabs.getByRole('tab', { name: 'Idioma', exact: true });
  await language.click();
  const picker = settings.getByRole('combobox', {
    name: 'Idioma de la aplicación',
  });
  await expect(picker).toBeVisible();
  const bounds = await picker.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThan(240);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await language.focus();
  await page.keyboard.press('ArrowRight');
  const interview = tabs.getByRole('tab', { name: 'Entrevista', exact: true });
  await expect(interview).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(interview).toHaveAttribute('aria-selected', 'true');
  await expect(
    settings.getByText('Permitir la navegación entre etapas', { exact: true }),
  ).toBeVisible();

  await page.keyboard.press('End');
  const synthetic = tabs.getByRole('tab', {
    name: 'Datos sintéticos',
    exact: true,
  });
  await expect(synthetic).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(synthetic).toHaveAttribute('aria-selected', 'true');
  const generate = settings.getByRole('button', {
    name: 'Generar',
    exact: true,
  });
  await expect(generate).toBeEnabled();
  // Native keyboard traversal must scroll the long panel to the action;
  // programmatically focusing or scrolling it would hide a clipped panel.
  for (let step = 0; step < 10; step++) {
    await page.keyboard.press('Tab');
    if (
      await generate.evaluate((element) => element === document.activeElement)
    ) {
      break;
    }
  }
  await expect(generate).toBeFocused();
  await expect(generate).toBeInViewport();
  await testInfo.attach('spanish-phone-keyboard-scrolled-action', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('a submitted PIN failure follows language changes in the built app and still permits retry', async ({
  page,
  context,
  vault,
}, testInfo) => {
  await vault.enrolPin('12345678');
  const storedVault = await vault.readPersistedVaultRaw();
  expect(storedVault).not.toBeNull();
  await page.reload();
  await vault.unlockPin('87654321');
  await expect(page.getByText('Incorrect PIN', { exact: true })).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.goto('/');
  await otherTab.evaluate(() =>
    localStorage.setItem('interviewer.locale', 'es'),
  );
  await expect(page.getByText('PIN incorrecto', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Te damos la bienvenida de nuevo' }),
  ).toBeVisible();
  expect(await vault.readPersistedVaultRaw()).toBe(storedVault);
  await testInfo.attach('spanish-submitted-pin-error', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await otherTab.evaluate(() =>
    localStorage.setItem('interviewer.locale', 'en'),
  );
  await expect(page.getByText('Incorrect PIN', { exact: true })).toBeVisible();
  await vault.unlockPin('12345678');
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeVisible();
  expect(await vault.readPersistedVaultRaw()).toBe(storedVault);
  await otherTab.close();
});
