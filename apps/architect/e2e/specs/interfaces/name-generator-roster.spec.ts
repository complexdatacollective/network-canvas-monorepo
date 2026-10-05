import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectNetworkAsset } from '../../pageobjects/editor-sections/data-source.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// A minimal schema-8 protocol carrying one `network`-type assetManifest
// entry, shaped exactly like `packages/protocols/e2e/all-interfaces/protocol.json`'s
// `roster_data` entry (`{ name, type: 'network', source }`). Seeding this
// straight into IndexedDB (via `seed`'s `assets` option) lets the spec pick a
// real resource out of the editor's own resource browser without driving a
// file import.
function rosterProtocol(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    assetManifest: {
      roster_data: { name: 'Roster', type: 'network', source: 'roster.json' },
    },
  };
}

const ROSTER_DATA = JSON.stringify({
  nodes: [
    { attributes: { name: 'Amara', age: 29 } },
    { attributes: { name: 'Beto', age: 34 } },
    { attributes: { name: 'Chidi', age: 41 } },
  ],
});

test('creates a valid NameGeneratorRoster stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(rosterProtocol(), {
    assets: [
      { assetId: 'roster_data', name: 'roster.json', data: ROSTER_DATA },
    ],
  });
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NameGeneratorRoster');
  await editor.setStageName('Select From Roster');

  // Same shared subject picker as NameGenerator ("Node type"). The data file
  // comes right after the type it creates, because everything after it names
  // one of that file's columns.
  await selectOrCreateNodeType(architectPage, 'person');

  // The "Roster source" section (`@codaco/protocol-builder`'s
  // `editors/name-generator-roster/sections/ExternalDataSourceSection.tsx`)
  // owns the `dataSource` field. The card, order and search sections are all
  // gated on its value, so this runs before anything that reads it.
  await selectNetworkAsset(editor.field('dataSource'), 'Roster');

  // The same shared `prompts` list as the other two name generators —
  // accessible name "Prompt text", see name-generator.spec.ts.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Choose someone from the roster');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'NameGeneratorRoster') {
    throw new Error(`expected NameGeneratorRoster stage, got ${stage.type}`);
  }
  expect(stage.dataSource).toBe('roster_data');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'name-generator-roster-stage.json',
  );
});
