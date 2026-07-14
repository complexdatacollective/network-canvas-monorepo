import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { matrixTest } from '../../fixtures/matrix-test.js';
import { NameGeneratorRosterFixture } from '../../fixtures/name-generator-roster-fixture.js';
import { buildSyntheticPayload } from '../../helpers/synthetic-payload.js';

// Throwaway diagnostic probe for the roster prompt-transition bug. Deleted
// once the fix lands.
matrixTest('BugProbe: roster prompt transition', async ({
  page,
  interview,
  protocol,
}) => {
  matrixTest.setTimeout(60_000);
  const synth = new SyntheticInterview();
  const personType = synth.addNodeType({ name: 'Person' });
  synth.addAsset({
    id: 'jsonRoster',
    name: 'JSON Roster',
    type: 'network',
    source: 'roster-small.json',
  });
  const stage = synth.addStage('NameGeneratorRoster', {
    label: 'Probe roster',
    subject: { entity: 'node', type: personType.id },
    dataSource: 'jsonRoster',
  });
  stage.addPrompt({ text: 'Prompt 1 of 2.' });
  stage.addPrompt({ text: 'Prompt 2 of 2.' });

  const result = buildSyntheticPayload(synth, {
    protocolName: 'probe-roster',
    assets: [
      {
        assetId: 'jsonRoster',
        name: 'JSON Roster',
        type: 'network',
        source: 'roster-small.json',
        localPath: path.resolve(
          import.meta.dirname,
          '../../fixtures/data/roster-small.json',
        ),
      },
    ],
  });

  let rosterFetches = 0;
  page.on('request', (req) => {
    if (req.url().includes('roster-small.json')) rosterFetches++;
  });
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });

  const { protocolId } = await protocol.installPayload(result);
  interview.interviewId = await protocol.createInterview(
    protocolId,
    'probe',
    { network: result.session.network },
  );
  await interview.goto(0);

  const roster = new NameGeneratorRosterFixture(page);
  const sourceOptions = roster.sourceListbox.getByRole('option');
  await sourceOptions.first().waitFor({ state: 'visible' });
  console.log(
    `[probe] prompt1 options=${await sourceOptions.count()} fetches=${rosterFetches}`,
  );

  await roster.addNode('Cara Chen');
  console.log(
    `[probe] after add: options=${await sourceOptions.count()} fetches=${rosterFetches}`,
  );

  await interview.nextButton.click();
  await page.getByText('Prompt 2 of 2.').waitFor({ state: 'visible' });

  await page.waitForTimeout(1500);
  const count = await sourceOptions.count();
  const listboxCount = await roster.sourceListbox.count();
  const box = listboxCount
    ? await roster.sourceListbox.boundingBox()
    : null;
  const emptyState = await page
    .getByText('Nothing matched your search term.')
    .count();
  const panelText = await page
    .locator('section, div')
    .filter({ hasText: 'Available to add' })
    .first()
    .innerText()
    .catch(() => 'N/A');
  console.log(
    `[probe] prompt2 options=${count} listboxes=${listboxCount} box=${JSON.stringify(box)} emptyState=${emptyState} fetches=${rosterFetches}`,
  );
  // Distinguish "rows never computed" (virtual container height 0 => the
  // isComplete wedge) from "virtualizer renders nothing despite height".
  const virtualState = await roster.sourceListbox.evaluate((el) => {
    const container = el.querySelector('div.relative.w-full');
    const style = container ? (container as HTMLElement).style.height : 'none';
    const staggerItems = el.querySelectorAll('[data-stagger-item]').length;
    return { totalHeight: style, staggerItems };
  });
  console.log(`[probe] virtual=${JSON.stringify(virtualState)}`);
  console.log(`[probe] panelText=${panelText.slice(0, 200).replace(/\n/g, '|')}`);

  // Does going back restore prompt 1's options?
  await page.getByTestId('previous-button').click();
  await page.getByText('Prompt 1 of 2.').waitFor({ state: 'visible' });
  await page.waitForTimeout(1500);
  console.log(
    `[probe] back-on-prompt1 options=${await sourceOptions.count()} fetches=${rosterFetches}`,
  );
  console.log(`[probe] consoleErrors=${JSON.stringify(consoleErrors.slice(0, 5))}`);
});
