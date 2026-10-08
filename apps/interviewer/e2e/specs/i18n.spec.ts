import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';
import JSZip from 'jszip';

import { expect, test } from '../fixtures/test.js';
import { clickWhenDeckSettles } from '../helpers/deck.js';
import {
  DEVELOPMENT_PROTOCOL_DIR,
  DEVELOPMENT_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

// The development protocol is the only seeded protocol that opens with a
// language chooser and declares a second language, so the test packs it into
// a .netcanvas: protocol.json at the root, each asset under assets/.
async function writeDevelopmentProtocolArchive(target: string) {
  const zip = new JSZip();
  zip.file(
    'protocol.json',
    readFileSync(path.join(DEVELOPMENT_PROTOCOL_DIR, 'protocol.json'), 'utf8'),
  );
  const assetDir = path.join(DEVELOPMENT_PROTOCOL_DIR, 'assets');
  for (const file of readdirSync(assetDir)) {
    zip.file(`assets/${file}`, readFileSync(path.join(assetDir, file)));
  }
  writeFileSync(target, await zip.generateAsync({ type: 'nodebuffer' }));
}

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

// Measure the entire row before focusing a digit: focus can horizontally
// scroll a clipped container and falsely make each individual box look usable.
async function expectCompletePinRow(page: Page, field: Locator) {
  const inputs = field.locator('input');
  await expect(inputs).toHaveCount(8);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('PIN bounds require an explicit viewport');
  const bounds = await inputs.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  );
  for (const [index, rect] of bounds.entries()) {
    expect(rect.width, `digit ${index + 1} width`).toBeGreaterThanOrEqual(30);
    expect(rect.x, `digit ${index + 1} left edge`).toBeGreaterThanOrEqual(0);
    expect(rect.right, `digit ${index + 1} right edge`).toBeLessThanOrEqual(
      viewport.width,
    );
  }
  for (const input of await inputs.all()) {
    await input.focus();
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
  }
}

async function typePin(field: Locator, code: string) {
  const inputs = field.locator('input');
  await expect(inputs).toHaveCount(8);
  for (const [index, digit] of code.split('').entries()) {
    await inputs.nth(index).fill(digit);
  }
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

test.describe('a Spanish browser', () => {
  test.use({ locale: 'es' });

  test('shows the built-in interview controls in Spanish whatever the app language, preserving authored content and data', async ({
    page,
    protocol,
    interviewNav,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await chooseLanguage(page, 'en', 'es');
    await interviewNav.startNewSession('Caso Á-17');
    // The interview carries the protocol's language (it declares only en-US);
    // the built-in controls alone follow the browser.
    const interview = page.locator('main[data-theme-interview]');
    await expect(interview).toHaveAttribute('lang', 'en-US');
    await expect(interview).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('button', { name: 'Configuración', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Thanks for taking part.', { exact: true }),
    ).toBeVisible();
    // The protocol declares only en-US, so its content stays in en-US while
    // the built-in controls follow the browser.
    await expect
      .poll(async () => (await storedResearch(page)).sessions)
      .toEqual([
        expect.objectContaining({
          caseId: 'Caso Á-17',
          localePreference: null,
          locale: 'en-US',
        }),
      ]);
    await interviewNav.exitInterview('es');
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
      page.getByRole('button', {
        name: 'Iniciar nueva entrevista',
        exact: true,
      }),
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
    await expect(interview).toHaveAttribute('lang', 'en-US');
    await expect(interview).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('button', { name: 'Configuración', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Thanks for taking part.', { exact: true }),
    ).toBeVisible();
    await interviewNav.exitInterview('es');
    await page.getByRole('button', { name: 'Datos', exact: true }).click();
    await expect(
      page.getByRole('columnheader', { name: /ID del caso/ }),
    ).toBeVisible();
    await expect(page.getByText('Caso Á-17', { exact: true })).toBeVisible();
    await page
      .getByRole('checkbox', { name: 'Seleccionar Caso Á-17', exact: true })
      .check();
    await page
      .getByRole('button', { name: 'Eliminar seleccionadas (1)', exact: true })
      .click();
    const deletion = page.getByRole('dialog', {
      name: '¿Eliminar 1 entrevista?',
    });
    await expect(deletion).toContainText('Esta acción no se puede deshacer.');
    await deletion
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    expect((await storedResearch(page)).sessions).toHaveLength(1);
  });

  test("an open finish confirmation is shown in the interview's language, not the app's, without finishing or changing responses", async ({
    page,
    protocol,
    interviewNav,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await chooseLanguage(page, 'en', 'es');
    await interviewNav.startNewSession('Finish-locale-17');
    await interviewNav.next();
    await interviewNav.fillEgoName('Ángela Ñ-21');
    await interviewNav.next();
    await interviewNav.quickAddNode('Irene');
    await interviewNav.next();
    await interviewNav.next();
    const finishHeading = page.getByRole('heading', {
      name: 'Finalizar entrevista',
      exact: true,
    });
    await expect(finishHeading).toBeVisible();
    await expect
      .poll(async () => (await storedResearch(page)).sessions)
      .toEqual([expect.objectContaining({ currentStep: 4, finishedAt: null })]);
    const before = await storedResearch(page);
    expect(before.protocols).toHaveLength(1);
    expect(before.sessions).toHaveLength(1);
    await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toHaveAccessibleName(
      '¿Seguro que quieres finalizar la entrevista?',
    );
    // Interviewer supplies this description, yet it follows the interview's
    // language rather than Interviewer's own.
    const description = confirmation.getByText(
      'Al finalizar, se cierra esta entrevista. Si es necesario hacer cambios, la persona responsable de la investigación puede volver a marcarla como sin finalizar más adelante.',
      { exact: true },
    );
    await expect(description).toBeVisible();
    await expect(description).toHaveAttribute('lang', 'es');
    await expect(description).toHaveAttribute('dir', 'ltr');
    await expect(
      confirmation.getByRole('button', {
        name: 'Finalizar entrevista',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await storedResearch(page)).toEqual(before);

    await confirmation
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    await expect(confirmation).toBeHidden();
    await expect(finishHeading).toBeVisible();
    expect(await storedResearch(page)).toEqual(before);
    await interviewNav.back();
    await expect(page.getByRole('button', { name: /^Irene/ })).toBeVisible();
  });
});

test.describe('the language chooser stage', () => {
  test.use({ locale: 'en-US' });

  test('a chosen language switches the interview at once and stays with the session across a reload', async ({
    page,
    protocol,
    interviewNav,
  }, testInfo) => {
    // Packing and importing the development protocol's 24 MB of media.
    test.slow();
    const archive = testInfo.outputPath('development-protocol.netcanvas');
    await writeDevelopmentProtocolArchive(archive);
    await protocol.import(archive, DEVELOPMENT_PROTOCOL_NAME);
    await expect(
      page.getByText('Protocol imported', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await interviewNav.startNewSession('Idioma-17');

    const interview = page.locator('main[data-theme-interview]');
    await expect(interview).toHaveAttribute('lang', 'en-US');
    await expect(
      page.getByRole('heading', { name: 'Choose a language', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(2);
    const spanish = page.getByRole('option', { name: 'español', exact: true });
    await expect(spanish).toHaveAttribute('aria-selected', 'false');
    await expect
      .poll(async () => (await storedResearch(page)).sessions)
      .toEqual([
        expect.objectContaining({ localePreference: null, locale: 'en-US' }),
      ]);

    await spanish.click();
    await expect(spanish).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { name: 'Elige un idioma', exact: true }),
    ).toBeVisible();
    await expect(interview).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('button', { name: 'Configuración', exact: true }),
    ).toBeVisible();
    // The participant's choice never changes Interviewer's own language.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect
      .poll(async () => (await storedResearch(page)).sessions)
      .toEqual([
        expect.objectContaining({ localePreference: 'es', locale: 'es' }),
      ]);

    await page.reload();
    await interviewNav.waitForStage();
    await expect(
      page.getByRole('heading', { name: 'Elige un idioma', exact: true }),
    ).toBeVisible();
    await expect(spanish).toHaveAttribute('aria-selected', 'true');
    await expect(interview).toHaveAttribute('lang', 'es');
    expect((await storedResearch(page)).sessions).toEqual([
      expect.objectContaining({ localePreference: 'es', locale: 'es' }),
    ]);
  });
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
  // The interview takes its language from the browser, never from the app.
  test.use({ serviceWorkers: 'allow', locale: 'en-GB' });
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
    // The interview carries the protocol's language, not the browser's.
    await expect(page.locator('main[data-theme-interview]')).toHaveAttribute(
      'lang',
      'en-US',
    );
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
  await page
    .getByRole('option', {
      name: 'No security (not recommended) Skip app security. Your data will not be protected by the app.',
      exact: true,
    })
    .click();
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

test('welcome and setup language selectors retain the complete PIN form on a phone', async ({
  page,
  vault,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/welcome');
  await page
    .getByRole('combobox', { name: 'App language', exact: true })
    .selectOption('es');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  const wizard = page.getByRole('dialog');
  await expect(wizard).toHaveAccessibleName('Configuración de tu dispositivo');
  await wizard.getByTestId('wizard-next').click();
  await wizard.getByTestId('wizard-next').click();
  await wizard.getByRole('option', { name: /Código PIN/ }).click();
  await wizard.getByTestId('wizard-next').click();
  const pin = wizard.getByTestId('segmented-code-pin');
  const confirmation = wizard.getByTestId('segmented-code-pin-confirm');
  await expectCompletePinRow(page, pin);
  await expectCompletePinRow(page, confirmation);
  await typePin(pin, '12345678');
  await typePin(confirmation, '12345678');
  await wizard
    .getByRole('checkbox', {
      name: 'Entiendo que no hay posibilidad de recuperación',
      exact: true,
    })
    .check();
  const before = await vault.readPersistedVaultRaw();
  await wizard
    .getByRole('combobox', { name: 'Idioma de la aplicación', exact: true })
    .selectOption('en-GB');
  await expect(
    wizard.getByRole('checkbox', {
      name: 'I understand there is no recovery',
      exact: true,
    }),
  ).toBeChecked();
  for (const field of [pin, confirmation]) {
    for (let index = 0; index < 8; index++)
      await expect(field.locator('input').nth(index)).toHaveValue(
        String(index + 1),
      );
  }
  expect(await vault.readPersistedVaultRaw()).toBe(before);
  await wizard
    .getByRole('combobox', { name: 'App language', exact: true })
    .selectOption('es');
  await pin.locator('input').first().focus();
  await expect(pin.locator('input').first()).toBeFocused();
  await testInfo.attach('spanish-phone-complete-pin-setup', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const acknowledgment = wizard.getByRole('checkbox', {
    name: 'Entiendo que no hay posibilidad de recuperación',
    exact: true,
  });
  // Traverse naturally so a clipped lower section cannot pass through an
  // unconditional focus()/scrollIntoView() call.
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press('Tab');
    if (
      await acknowledgment.evaluate(
        (element) => element === document.activeElement,
      )
    )
      break;
  }
  await expect(acknowledgment).toBeFocused();
  await expect(acknowledgment).toBeInViewport();
  await expect(acknowledgment).toBeChecked();
  await testInfo.attach('spanish-phone-pin-acknowledgment-keyboard', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const next = wizard.getByTestId('wizard-next');
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    if (await next.evaluate((element) => element === document.activeElement))
      break;
  }
  await expect(next).toBeFocused();
  await expect(next).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(wizard).toHaveAccessibleName('Opciones de bloqueo');
  await wizard.getByTestId('wizard-next').click();
  await wizard.getByTestId('wizard-next').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('combobox', { name: /^Idioma de la interfaz:/ }),
  ).toBeVisible();
  expect(await vault.readPersistedVaultRaw()).not.toBe(before);
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Te damos la bienvenida de nuevo',
      exact: true,
    }),
  ).toBeVisible();
  await expectCompletePinRow(page, page.getByTestId('segmented-code-pin'));
  await typePin(page.getByTestId('segmented-code-pin'), '12345678');
  await expect(
    page.getByRole('combobox', { name: /^Idioma de la interfaz:/ }),
  ).toBeVisible();
});

test('a submitted PIN failure follows language changes in the built app and still permits retry', async ({
  page,
  context,
  vault,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await vault.enrolPin('12345678');
  const storedVault = await vault.readPersistedVaultRaw();
  expect(storedVault).not.toBeNull();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome back', exact: true }),
  ).toBeVisible();
  await expectCompletePinRow(page, page.getByTestId('segmented-code-pin'));
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
  await expectCompletePinRow(page, page.getByTestId('segmented-code-pin'));
  await page.getByTestId('segmented-code-pin').locator('input').first().focus();
  await testInfo.attach('spanish-submitted-pin-error', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await otherTab.evaluate(() =>
    localStorage.setItem('interviewer.locale', 'en-GB'),
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  await expect(page.getByText('Incorrect PIN', { exact: true })).toBeVisible();
  await vault.unlockPin('12345678');
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeVisible();
  expect(await vault.readPersistedVaultRaw()).toBe(storedVault);
  await otherTab.close();
});
