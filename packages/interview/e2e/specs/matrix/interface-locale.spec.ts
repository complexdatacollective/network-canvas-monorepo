import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect, matrixTest } from '../../fixtures/matrix-test.js';
import { buildSyntheticPayload } from '../../helpers/synthetic-payload.js';

matrixTest(
  "the interview shows one of the protocol's languages, chosen from the browser's languages, offline and without changing protocol or responses @smoke",
  async ({ page, protocol, context }, testInfo) => {
    const synth = new SyntheticInterview();
    synth.setLocalization({ defaultLocale: 'en-US', locales: ['en-US', 'es'] });
    const title = {
      'en-US': 'A question the study wrote',
      'es': 'Una pregunta escrita por el estudio',
    };
    const label = {
      'en-US': 'Your original answer',
      'es': 'Tu respuesta original',
    };
    const required = {
      'en-US': 'You must answer this question before continuing.',
      'es': 'Debes responder a esta pregunta antes de continuar.',
    };
    const answer = 'Málaga & <respuesta>';
    const field = synth.addEgoVariable({
      name: 'originalAnswer',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    });
    const stage = synth.addStage('EgoForm', {
      label: 'Authored screen label',
      introductionPanel: { title },
    });
    stage.addFormField({
      variable: field.id,
      component: 'Text',
      prompt: label,
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
      // French comes first but the protocol has no French, so the interview
      // takes the next of the browser's languages it has, for all its text.
      window.__test.setRequestedLocales(['fr-FR', 'es']);
    });
    const main = page.locator('main[data-theme-interview]');
    await expect(main).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { name: title.es })).toBeVisible();
    const input = page.getByRole('textbox', { name: label.es, exact: true });
    await expect(input).toBeVisible();
    await page.getByRole('button', { name: 'Next Step' }).click();
    // The required-answer message is the protocol's interface text, so it is
    // shown in the same language as the question.
    await expect(page.getByText(required.es, { exact: true })).toBeVisible();
    await expect(input).toBeFocused();
    await page.evaluate(() => window.__test.setRequestedLocales(['en-GB']));
    await expect(main).toHaveAttribute('lang', 'en-US');
    await expect(
      page.getByRole('heading', { name: title['en-US'] }),
    ).toBeVisible();
    await expect(
      page.getByText(required['en-US'], { exact: true }),
    ).toBeVisible();
    const englishInput = page.getByRole('textbox', {
      name: label['en-US'],
      exact: true,
    });
    await englishInput.fill(answer);
    const handle = await englishInput.elementHandle();
    if (!handle) throw new Error('The authored input is missing');
    const before = await page.evaluate(() => {
      const state = window.__interviewStore?.getState();
      if (!state)
        throw new Error('The mounted Shell did not expose its real store');
      return { protocol: state.protocol, network: state.session.network };
    });
    await context.setOffline(true);
    await page.evaluate(() => window.__test.setRequestedLocales(['es']));
    await expect(main).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { name: title.es })).toBeVisible();
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
    await page.screenshot({
      path: testInfo.outputPath('spanish-interview.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Next Step' }).click();
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
    // A browser language that cannot be read leaves the protocol's default.
    await page.evaluate(() =>
      window.__test.setRequestedLocales(['malformed_locale']),
    );
    await expect(main).toHaveAttribute('lang', 'en-US');
    await expect(
      page.getByRole('heading', { name: 'Finish Interview', exact: true }),
    ).toBeVisible();
  },
);
