import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect, matrixTest } from '../../fixtures/matrix-test.js';
import { buildSyntheticPayload } from '../../helpers/synthetic-payload.js';

matrixTest(
  'built-in language follows the host and offline menu without changing protocol or responses @smoke',
  async ({ page, protocol, context }, testInfo) => {
    const synth = new SyntheticInterview();
    const authoredTitle = 'Una pregunta escrita por el estudio';
    const authoredLabel = 'Tu respuesta original';
    const answer = 'Málaga & <respuesta>';
    const field = synth.addEgoVariable({
      name: 'originalAnswer',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    });
    const stage = synth.addStage('EgoForm', {
      label: 'Authored screen label',
      introductionPanel: {
        title: authoredTitle,
        text: 'Contenido original del protocolo.',
      },
    });
    stage.addFormField({
      variable: field.id,
      component: 'Text',
      prompt: authoredLabel,
    });
    const built = buildSyntheticPayload(synth, {
      protocolName: 'Literal protocol name',
    });
    const { protocolId } = await protocol.installPayload(built);
    const interviewId = await protocol.createInterview(
      protocolId,
      'locale-test',
    );
    await page.goto(`/?interviewId=${interviewId}&step=0`);
    await page.evaluate(() => {
      document.documentElement.lang = 'fr';
      window.__test.setRequestedLocale('es-MX');
    });
    const main = page.locator('main[data-theme-interview]');
    await expect(main).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('heading', { name: authoredTitle }),
    ).toBeVisible();
    const input = page.getByRole('textbox', {
      name: authoredLabel,
      exact: true,
    });
    await expect(input).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente paso' }).click();
    await expect(
      page.getByText('Debes responder a esta pregunta antes de continuar.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(input).toBeFocused();
    await page.evaluate(() => window.__test.setRequestedLocale('en-GB'));
    await expect(main).toHaveAttribute('lang', 'en-GB');
    await expect(
      page.getByText('You must answer this question before continuing.', {
        exact: true,
      }),
    ).toBeVisible();
    await input.fill(answer);
    const handle = await input.elementHandle();
    if (!handle) throw new Error('The authored input is missing');
    const before = await page.evaluate(() => {
      const state = window.__interviewStore?.getState();
      if (!state)
        throw new Error('The mounted Shell did not expose its real store');
      return { protocol: state.protocol, network: state.session.network };
    });
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page
      .getByRole('combobox', { name: 'Interface language' })
      .selectOption('es');
    await expect(main).toHaveAttribute('lang', 'es');
    await expect(
      page.getByRole('combobox', { name: 'Idioma de la interfaz' }),
    ).toHaveValue('es');
    await expect(input).toHaveValue(answer);
    expect(await handle.evaluate((element) => element.isConnected)).toBe(true);
    const after = await page.evaluate(() => {
      const state = window.__interviewStore?.getState();
      if (!state)
        throw new Error('The real store disappeared during the locale switch');
      return { protocol: state.protocol, network: state.session.network };
    });
    expect(after).toEqual(before);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('combobox', { name: 'Idioma de la interfaz' }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('spanish-built-in-controls.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Siguiente paso' }).click();
    await expect(
      page.getByRole('heading', { name: 'Finalizar entrevista', exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const network = await protocol.getNetworkState(interviewId);
        if (!network) throw new Error('The completed form has no network');
        return network.ego[entityAttributesProperty][field.id];
      })
      .toBe(answer);
    await page.evaluate(() =>
      window.__test.setRequestedLocale('malformed_locale'),
    );
    await expect(main).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', { name: 'Finish Interview', exact: true }),
    ).toBeVisible();
  },
);
