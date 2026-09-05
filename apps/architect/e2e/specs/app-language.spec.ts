import type { Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';
import { StagePreview } from '../pageobjects/preview.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

test.use({ locale: 'es-MX' });

async function selectLanguage(page: Page, locale: string) {
  await page
    .getByRole('button', { name: /^(Ajustes de idioma|Language settings)$/ })
    .click();
  const selector = page.getByRole('combobox', {
    name: /^(Idioma de Architect|Architect language)$/,
  });
  await selector.selectOption(locale);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Idioma guardado|Language saved/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /^(Cerrar|Close)$/, exact: true })
    .filter({ hasText: /^(Cerrar|Close)$/ })
    .click();
}

test('negotiates regional Spanish before interaction, persists a choice, and restores automatic mode', async ({
  architectPage: page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'Ajustes de idioma' }).click();
  const selector = page.getByRole('combobox', { name: 'Idioma de Architect' });
  await expect(selector).toHaveValue('__automatic');
  await expect(selector.locator('option')).toHaveText([
    'Automático (idioma del navegador)',
    'English',
    'English (UK)',
    'Español',
  ]);
  await expect(selector.locator('option[value="es"]')).toHaveAttribute(
    'lang',
    'es',
  );
  await selector.selectOption('en-GB');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  await expect(
    page.getByRole('heading', { name: 'Language settings' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Close', exact: true })
    .filter({ hasText: /^Close$/ })
    .click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  await selectLanguage(page, 'es');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await selectLanguage(page, '__automatic');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByRole('button', { name: 'Ajustes de idioma' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Idioma de Architect' }),
  ).toHaveValue('__automatic');
});

test('authors an Information stage in Spanish, preserves research data, and keeps the participant preview in English', async ({
  architectPage: page,
  seed,
}) => {
  await seed(emptyProtocol(), { name: 'Research_Name_Á1' });
  await gotoProtocol(page);
  await page.getByRole('button', { name: 'Añadir nueva etapa' }).click();
  await page.getByRole('button', { name: 'Información', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Nombre de la etapa' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Nombre de la etapa' })
    .fill('Stage_Research_1');
  await page
    .getByRole('textbox', { name: 'Encabezado de página' })
    .fill('Participant_Heading_EN');
  await page
    .getByRole('button', { name: 'Crear nuevo elemento de contenido' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Editar elemento' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Texto', exact: true }).click();
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  const content = dialog.getByRole('textbox', {
    name: 'Contenido',
    exact: true,
  });
  await expect(content).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Este campo es obligatorio.')).toBeVisible();
  await expect(content).toBeFocused();
  await new StageEditor(page).fillRichText(
    'Contenido',
    'Participant_Content_EN',
  );
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Finalizar edición' }).click();
  await page.waitForURL('**/protocol');
  const stage = await readStageJson(page, 0);
  expect(stage).toMatchObject({
    type: 'Information',
    label: 'Stage_Research_1',
    title: 'Participant_Heading_EN',
    // The existing Markdown serializer escapes literal underscores.
    items: [{ type: 'text', content: 'Participant\\_Content\\_EN' }],
  });
  const beforeSwitch = await readProtocolJson(page);
  await selectLanguage(page, 'en-GB');
  await expect(
    page.getByRole('list', { name: 'Protocol stages' }),
  ).toBeVisible();
  await selectLanguage(page, 'es');
  await expect(
    page.getByRole('list', { name: 'Etapas del protocolo' }),
  ).toBeVisible();
  expect(await readProtocolJson(page)).toEqual(beforeSwitch);
  await page
    .getByRole('heading', { name: 'Stage_Research_1', exact: true })
    .click();
  const preview = await new StagePreview(page, {
    launch: 'Vista previa',
    settings: 'Ajustes de vista previa',
  }).open();
  await expect(preview).toHaveTitle('Vista previa de Architect');
  await expect(preview.locator('html')).toHaveAttribute('lang', 'es');
  await expect(
    preview.getByRole('heading', { name: 'Participant_Heading_EN' }),
  ).toBeVisible();
  await expect(
    preview.getByText('Participant_Content_EN', { exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByRole('button', { name: 'Next Step' }),
  ).toBeVisible();
  await expect(
    preview
      .getByRole('button', { name: 'Next Step' })
      .locator('xpath=ancestor::*[@lang][1]'),
  ).toHaveAttribute('lang', 'en');
  await preview.getByRole('button', { name: 'Next Step' }).click();
  await preview.getByRole('button', { name: 'Finish', exact: true }).click();
  const finish = preview.getByRole('dialog');
  await expect(finish).toContainText('This is a preview, so nothing is saved.');
  await finish
    .getByRole('button', { name: 'Finish Interview', exact: true })
    .click();
  await expect(
    preview.getByRole('heading', { name: 'Vista previa finalizada' }),
  ).toBeVisible();
  expect(await readProtocolJson(page)).toEqual(beforeSwitch);
  await preview.close();
});

test('uploads and inspects a resource in Spanish with an unchanged authored filename', async ({
  architectPage: page,
  seed,
}) => {
  await seed(emptyProtocol(), { name: 'Resource_Study_Á1' });
  await page.goto('/protocol/assets');
  await page
    .getByRole('button', { name: 'Subir archivo' })
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'Research_Map_Á1.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#6ecae8"/></svg>',
      ),
    });
  const library = page.getByRole('listbox', { name: 'Biblioteca de recursos' });
  await expect(
    library.getByRole('heading', { name: 'Research_Map_Á1.svg', exact: true }),
  ).toBeVisible();
  await expect(library.getByText('Imagen', { exact: true })).toBeVisible();
  const beforeSwitch = await readProtocolJson(page);
  expect(beforeSwitch.assetManifest).toEqual(
    expect.objectContaining({
      [Object.keys(beforeSwitch.assetManifest ?? {})[0] ?? 'missing']:
        expect.objectContaining({ name: 'Research_Map_Á1.svg', type: 'image' }),
    }),
  );
  await selectLanguage(page, 'en');
  await expect(
    page
      .getByRole('listbox', { name: 'Resource library' })
      .getByText('Image', { exact: true }),
  ).toBeVisible();
  expect(await readProtocolJson(page)).toEqual(beforeSwitch);
});

test('updates an open protocol-info table when another tab changes the device language', async ({
  architectPage: page,
  seed,
  context,
}) => {
  await seed(emptyProtocol(), { name: 'Metadata_Study_Á1' });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Acciones de Metadata_Study_Á1' })
    .click();
  await page.getByRole('menuitem', { name: 'Ver más información' }).click();
  const info = page.getByRole('dialog', { name: 'Metadata_Study_Á1' });
  await expect(
    info.getByRole('columnheader', { name: 'Propiedad' }),
  ).toBeVisible();
  await expect(
    info.getByRole('cell', { name: 'Etapas', exact: true }),
  ).toBeVisible();
  const settings = await context.newPage();
  await settings.goto('/');
  await selectLanguage(settings, 'en');
  await expect(
    info.getByRole('columnheader', { name: 'Property' }),
  ).toBeVisible();
  await expect(
    info.getByRole('cell', { name: 'Stages', exact: true }),
  ).toBeVisible();
  await expect(
    info.getByRole('cell', { name: 'Node types', exact: true }),
  ).toBeVisible();
  await expect(
    info.getByRole('heading', { name: 'Metadata_Study_Á1' }),
  ).toBeVisible();
  await settings.close();
});
