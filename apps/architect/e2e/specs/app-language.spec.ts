import type { Page } from '@playwright/test';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';
import { StagePreview } from '../pageobjects/preview.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

test.use({ locale: 'es-MX' });

/** The header's language pill, whatever language it is currently named in. */
function languageSwitcher(page: Page) {
  return page.getByRole('combobox', {
    name: /^(Idioma de la interfaz|Interface language):/,
  });
}

function languagePopover(page: Page) {
  return page.getByRole('dialog', {
    name: /^(Idioma de la interfaz|Interface language)$/,
  });
}

// Each option's accessible name is its autonym followed by its code.
const OPTION_NAMES: Record<string, RegExp> = {
  '__automatic': /^(Automático|Automatic)\b/,
  'en': /^English\s+EN$/,
  'en-GB': /^English \(UK\)/,
  'es': /^Español/,
};

async function selectLanguage(page: Page, locale: string) {
  await languageSwitcher(page).click();
  const popover = languagePopover(page);
  await popover.getByRole('option', { name: OPTION_NAMES[locale] }).click();
  await expect(popover.getByRole('status').last()).toHaveText(
    /Guardado en este dispositivo|Saved on this device/,
  );
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
}

test('negotiates regional Spanish before interaction, persists a choice, and restores automatic mode', async ({
  architectPage: page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  const switcher = languageSwitcher(page);
  await expect(switcher).toHaveText(/Auto · ES/);
  await expect(switcher).toHaveAccessibleName(
    'Idioma de la interfaz: Automático (Español)',
  );
  await switcher.click();
  const popover = languagePopover(page);
  const options = popover.getByRole('option');
  await expect(options).toHaveText([
    /^Automático \(Español\)\s*AUTO$/,
    /^English\s*EN$/,
    /^English \(UK\)\s*EN-GB$/,
    /^Español\s*ES$/,
  ]);
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(
    options.filter({ hasText: /^Español/ }).locator('[lang="es"]'),
  ).toHaveText('Español');
  await options.filter({ hasText: /^English \(UK\)/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  // The chrome follows the new language while the popover stays open.
  await expect(popover).toHaveAccessibleName('Interface language');
  await expect(popover.getByRole('status').last()).toHaveText(
    'Saved on this device.',
  );
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(switcher).toHaveText(/EN-GB/);
  await expect(switcher).toHaveAccessibleName(
    'Interface language: English (UK)',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  await selectLanguage(page, 'es');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await selectLanguage(page, '__automatic');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(languageSwitcher(page)).toHaveText(/Auto · ES/);
});

test('authors an Information stage in Spanish and changes built-in preview language without changing research data', async ({
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
  const dialog = page.getByRole('dialog', {
    name: 'Crear elemento',
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Texto', exact: true }).click();
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  const content = dialog.getByRole('textbox', {
    name: 'Contenido',
    exact: true,
  });
  await expect(content).toHaveAttribute('aria-invalid', 'true');
  // The text slot states its own requirement rather than falling back to the
  // form's generic sentence.
  await expect(
    dialog.getByText('Escribe el texto que muestra este bloque.'),
  ).toBeVisible();
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
    nextStep: 'Siguiente paso',
  }).open();
  await expect(preview).toHaveTitle('Vista previa de Architect');
  await expect(preview.locator('html')).toHaveAttribute('lang', 'es');
  await expect(
    preview.getByRole('heading', { name: 'Participant_Heading_EN' }),
  ).toBeVisible();
  await expect(
    preview.getByText('Participant_Content_EN', { exact: true }),
  ).toBeVisible();
  const nextStep = preview.getByTestId('next-button');
  await expect(nextStep).toHaveAccessibleName('Siguiente paso');
  await expect(nextStep).toBeVisible();
  await expect(nextStep.locator('xpath=ancestor::*[@lang][1]')).toHaveAttribute(
    'lang',
    'es',
  );

  // The interface menu is independently scoped: a British-English preview
  // can run inside the Spanish Architect document without rewriting authored
  // content, resetting the protocol, or persisting a different host choice.
  await preview
    .getByRole('button', { name: 'Configuración', exact: true })
    .click();
  const interfaceLanguage = preview.getByRole('combobox', {
    name: /^(Idioma de la interfaz|Interface language)$/,
  });
  await expect(interfaceLanguage).toHaveValue('__automatic');
  await interfaceLanguage.selectOption('en-GB');
  await expect(nextStep).toHaveAccessibleName('Next Step');
  await expect(nextStep.locator('xpath=ancestor::*[@lang][1]')).toHaveAttribute(
    'lang',
    'en-GB',
  );
  await expect(preview.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(
    preview.getByRole('heading', { name: 'Participant_Heading_EN' }),
  ).toBeVisible();
  await expect(
    preview.getByText('Participant_Content_EN', { exact: true }),
  ).toBeVisible();
  expect(await readProtocolJson(page)).toEqual(beforeSwitch);
  await interfaceLanguage.selectOption('__automatic');
  await expect(nextStep).toHaveAccessibleName('Siguiente paso');
  await expect(nextStep.locator('xpath=ancestor::*[@lang][1]')).toHaveAttribute(
    'lang',
    'es',
  );
  await preview.keyboard.press('Escape');
  await expect(interfaceLanguage).toBeHidden();
  await nextStep.click();
  await preview.getByRole('button', { name: 'Finalizar', exact: true }).click();
  const finish = preview.getByRole('dialog');
  await expect(finish).toContainText(
    'Esto es una vista previa, así que no se guarda nada. Al finalizar se cierra esta prueba del protocolo, y puedes iniciarla de nuevo después.',
  );
  const dialogId = await finish.getAttribute('id');
  expect(dialogId).toBeTruthy();

  // The already-open runtime confirmation must subscribe to host changes too;
  // the preview-only promise lives in Architect's catalog, outside Shell's.
  await selectLanguage(page, 'en');
  await expect(preview.locator('html')).toHaveAttribute('lang', 'en');
  await expect(finish).toHaveAttribute('id', dialogId!);
  await expect(finish).toContainText(
    'This is a preview, so nothing is saved. Finishing ends this run of the protocol, and you can start it again afterwards.',
  );
  await finish
    .getByRole('button', { name: 'Finish Interview', exact: true })
    .click();
  await expect(
    preview.getByRole('heading', { name: 'Preview finished' }),
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

test('formats printed attribute order and updates linked-list grammar live while preserving protocol data', async ({
  architectPage: page,
  seed,
  context,
}) => {
  // These authored names satisfy the protocol's ASCII NMTOKEN contract.
  // Underscore/hyphen/dot distinguish locale collation from codepoint order.
  const names = ['alpha_name', 'alpha.name', 'alpha-name', 'Isabel'];
  const protocol = CurrentProtocolSchema.parse({
    ...emptyProtocol(),
    codebook: {
      ego: {
        variables: Object.fromEntries(
          names.map((name, index) => [
            `attribute-${index}`,
            { name, type: 'text', component: 'Text' },
          ]),
        ),
      },
    },
    stages: [
      {
        id: 'sort',
        type: 'EgoForm',
        label: 'Authored_sort',
        introductionPanel: {
          title: 'Authored introduction',
          text: 'Authored content',
        },
        form: {
          fields: names.map((_, index) => ({
            variable: `attribute-${index}`,
            prompt: `Authored_prompt_${index}`,
          })),
        },
      },
      {
        id: 'conjunction',
        type: 'EgoForm',
        label: 'Authored_conjunction',
        introductionPanel: {
          title: 'Authored introduction',
          text: 'Authored content',
        },
        form: {
          fields: [0, 3].map((index) => ({
            variable: `attribute-${index}`,
            prompt: `Authored_prompt_${index}`,
          })),
        },
      },
    ],
  });
  await seed(protocol);
  await page.goto('/protocol/summary');
  const before = await readProtocolJson(page);
  const attributeRow = (stageId: string) =>
    page
      .locator(`#stage-${stageId}`)
      .getByRole('row')
      .filter({
        has: page.getByRole('cell', {
          name: /^(Atributos|Attributes)$/,
          exact: true,
        }),
      });
  await expect(attributeRow('sort')).toHaveCount(1);
  const links = attributeRow('sort').getByRole('link');
  const rows = page.locator('tr[id^="variable-attribute-"]');
  await expect(links).toHaveText([
    'alpha_name',
    'alpha-name',
    'alpha.name',
    'Isabel',
  ]);
  await expect(rows).toHaveCount(4);
  expect(
    await rows.evaluateAll((elements) => elements.map((element) => element.id)),
  ).toEqual([
    'variable-attribute-0',
    'variable-attribute-2',
    'variable-attribute-1',
    'variable-attribute-3',
  ]);
  await expect(attributeRow('conjunction')).toHaveCount(1);
  const conjunction = attributeRow('conjunction')
    .getByRole('cell')
    .filter({ has: page.getByRole('link', { name: 'Isabel', exact: true }) });
  await expect(conjunction).toHaveText('alpha_name e Isabel');
  const settings = await context.newPage();
  await settings.goto('/');
  await selectLanguage(settings, 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(links).toHaveText([
    'alpha_name',
    'alpha-name',
    'alpha.name',
    'Isabel',
  ]);
  expect(
    await links.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('href')),
    ),
  ).toEqual([
    '#variable-attribute-0',
    '#variable-attribute-2',
    '#variable-attribute-1',
    '#variable-attribute-3',
  ]);
  expect(
    await rows.evaluateAll((elements) => elements.map((element) => element.id)),
  ).toEqual([
    'variable-attribute-0',
    'variable-attribute-2',
    'variable-attribute-1',
    'variable-attribute-3',
  ]);
  await expect(conjunction).toHaveText('alpha_name and Isabel');
  expect(await readProtocolJson(page)).toEqual(before);
  await settings.close();
});

test('renders British spelling in the actual type dialog and in the stage editors', async ({
  architectPage: page,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { assets });
  await page.goto('/protocol/codebook');
  const before = await readProtocolJson(page);
  await selectLanguage(page, 'en-GB');
  await page
    .getByRole('button', { name: 'Create node type', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Create Node Type' });
  const name = dialog.getByRole('textbox', { name: 'Node type name' });
  await expect(name).toHaveAccessibleDescription(/"Organisation"/);
  await name.fill('Organization_authored');
  await expect(name).toHaveValue('Organization_authored');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Two stage editors, because the copy in them is the protocol-builder
  // package's and its British overrides are a catalog of its own: a stage
  // editor reading American English is the failure this catches.
  await page.goto('/protocol/stage/narrative-1');
  await expect(
    page.getByRole('heading', { name: 'Visualisation presets' }),
  ).toBeVisible();
  await page.goto('/protocol/stage/geospatial-1');
  await expect(
    page.getByRole('radiogroup', { name: 'Highlight colour' }),
  ).toBeVisible();
  expect(await readProtocolJson(page)).toEqual(before);
});
