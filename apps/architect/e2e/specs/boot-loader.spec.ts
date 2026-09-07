import { expect, test } from '../fixtures/architect-test.js';

test.use({ locale: 'es-MX' });

test('exposes the static loading status while the application module is still downloading', async ({
  architectPage: page,
}) => {
  let releaseModule: () => void = () => {
    throw new Error('The module gate was not initialized');
  };
  const moduleGate = new Promise<void>((resolve) => {
    releaseModule = resolve;
  });
  let heldModuleRequests = 0;
  await page.route('**/assets/main-*.js', async (route) => {
    heldModuleRequests += 1;
    await moduleGate;
    await route.continue();
  });

  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect.poll(() => heldModuleRequests).toBe(1);
    const loading = page.getByRole('status');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('aria-live', 'polite');
    await expect(loading).toHaveText('Architect');
    await expect(page.locator('#root')).toBeEmpty();
    expect(await page.locator('body').ariaSnapshot()).toContain('Architect');
  } finally {
    releaseModule();
    await page.unrouteAll({ behavior: 'wait' });
  }

  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#boot-loader')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Ajustes de idioma' }),
  ).toBeVisible();
});
