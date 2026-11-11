import type { Locator } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect, matrixTest } from '../../fixtures/matrix-test.js';
import { buildSyntheticPayload } from '../../helpers/synthetic-payload.js';

// The box around an input draws the focus ring for it.
const ringAround = (input: Locator) =>
  input.evaluate((element) => {
    const box = element.parentElement;
    if (!box) throw new Error('The input has no box around it');
    const { outlineStyle, outlineWidth, outlineOffset } = getComputedStyle(box);
    return { outlineStyle, outlineWidth, outlineOffset };
  });

// Tagged @smoke by hand, outside the scenario matrix, so that it runs in
// WebKit and Firefox as well as Chromium: Safari is the browser that lost this
// ring, and the matrix gives each interface a single smoke scenario.
matrixTest(
  'a date question shows the same focus ring as a text question when the keyboard reaches it @smoke',
  async ({ page, protocol }) => {
    const synth = new SyntheticInterview();
    const nameVariable = synth.addEgoVariable({
      name: 'name',
      type: 'text',
      component: 'Text',
    });
    const bornVariable = synth.addEgoVariable({
      name: 'born',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full' },
    });
    const stage = synth.addStage('EgoForm', {
      introductionPanel: { title: 'About you' },
    });
    stage.addFormField({
      variable: nameVariable.id,
      component: 'Text',
      prompt: 'What is your name?',
    });
    stage.addFormField({
      variable: bornVariable.id,
      component: 'DatePicker',
      prompt: 'When were you born?',
    });
    const built = buildSyntheticPayload(synth, {
      protocolName: 'date-field-focus-ring',
    });
    const { protocolId } = await protocol.installPayload(built);
    const interviewId = await protocol.createInterview(
      protocolId,
      'date-field-focus-ring',
    );
    await page.goto(`/?interviewId=${interviewId}&step=0`);

    const nameInput = page.getByLabel('What is your name?');
    const dateInput = page
      .locator('[data-field-name]', { hasText: 'When were you born?' })
      .locator('input[type="date"]');
    await expect(dateInput).toBeVisible();
    expect((await ringAround(dateInput)).outlineStyle).toBe('none');

    // The text question is the reference: its ring is what a focused field
    // looks like here. It eases in, so it is read once it has settled.
    await nameInput.focus();
    await expect
      .poll(() => ringAround(nameInput))
      .toMatchObject({ outlineStyle: 'solid', outlineWidth: '2px' });
    const textRing = await ringAround(nameInput);

    await page.keyboard.press('Tab');
    await expect(dateInput).toBeFocused();
    await expect.poll(() => ringAround(dateInput)).toEqual(textRing);
  },
);
