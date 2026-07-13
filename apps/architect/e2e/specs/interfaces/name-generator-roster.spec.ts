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
// straight into IndexedDB (via `seed`'s `assets` option) lets the spec pick
// a real resource in the ResourceBrowser dialog without driving a file
// upload.
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
    assets: [{ assetId: 'roster_data', name: 'Roster', data: ROSTER_DATA }],
  });
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NameGeneratorRoster');
  await editor.setStageName('Select From Roster');

  // Same plain NodeType.tsx section as NameGenerator (`Section title="Node
  // Type"`). ExternalDataSource.tsx's OWN section is ALSO gated by
  // `withDisabledSubjectRequired` (unlike Form.tsx's Form section, this is
  // the section itself, not just its field array), so this must run first.
  await selectOrCreateNodeType(architectPage, 'person');

  // ExternalDataSource.tsx, `Section title="Data source for Roster"`. The
  // Prompts section below (NameGeneratorRosterPrompts.tsx) is gated by
  // `withDisabledAssetRequired` on `dataSource`, so this must run before it.
  await selectNetworkAsset(editor.section('Data source for Roster'), 'Roster');

  // ExternalDataSource.tsx's `handleChangeDataSource` resets `cardOptions`,
  // `sortOptions`, AND `searchOptions` to `{}` on every data-source change
  // (its `onChange` side effect, unconditional — not merely on replacing an
  // existing selection). `SearchOptions`'s own `hasSearchOptions` reads the
  // WHOLE `searchOptions` field (unlike `CardDisplayOptions`/`SortOptions`,
  // which read a specific subfield like `cardOptions.additionalProperties`
  // that stays falsy for `{}`), so this `{}` is truthy and the section
  // auto-expands with its two `required`/`minSelected` fields mounted —
  // confirmed live (Issues popover: "searchOptions.matchProperties" /
  // "searchOptions.fuzziness"). `searchOptions` itself is fully optional in
  // the schema (`nameGeneratorRosterStage`), so the realistic action here —
  // same as a real author would take — is to toggle Search Options back off
  // (`handleToggleSearchOptions(false)` nulls the field and unmounts its
  // now-unregistered, no-longer-validated fields), not to fill them in.
  await editor
    .section('Search Options')
    .getByRole('switch', { name: 'Turn this feature on or off' })
    .click();

  // NameGeneratorRosterPrompts.tsx also renders `Section title="Prompts"`
  // (same PromptText.tsx RichText field, accessible name "Prompt text" — see
  // name-generator.spec.ts for why, not the brief's guessed `'text'`).
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Choose someone from the roster');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('NameGeneratorRoster');
  expect(stage.dataSource).toBe('roster_data');
  expect(stageSnapshotJson(stage)).toMatchSnapshot(
    'name-generator-roster-stage.json',
  );
});
