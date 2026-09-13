import type { CurrentProtocol } from '@codaco/protocol-validation';

import { TESTING_MAPBOX_TOKEN } from '../../../src/templates/testingMapboxToken.js';
import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import {
  addApiKey,
  selectResource,
} from '../../pageobjects/editor-sections/data-source.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { createAttribute } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// A minimal two-feature FeatureCollection, each with a `name` property —
// mirrors `packages/protocols/e2e/all-interfaces/assets/regions.geojson`
// (inlined rather than read from disk: the e2e project has no established
// cross-package file-read pattern, and a literal here keeps the seeded asset
// self-contained). "Recorded property" needs at least one feature property to
// choose from: the control reads them out of the chosen layer's own
// `features[0].properties`.
const REGIONS_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Downtown' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-74.02, 40.7],
            [-73.98, 40.7],
            [-73.98, 40.73],
            [-74.02, 40.73],
            [-74.02, 40.7],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Uptown' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-73.98, 40.75],
            [-73.94, 40.75],
            [-73.94, 40.78],
            [-73.98, 40.78],
            [-73.98, 40.75],
          ],
        ],
      },
    },
  ],
});

// Only the map layer is seeded into the protocol. Both halves of the map are
// stored resources chosen through the package's own `AssetPickerField`, and
// the two differ in what the browser it opens can ADD: a map layer is a file
// to import, so one has to exist already for a spec that does not drive a file
// import; an API key is typed in ("Name", "Key", "Add API key"), so this spec
// drives that live add-and-select exactly as a researcher configuring the
// stage for the first time would.
function protocolWithGeoDataAsset(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    assetManifest: {
      geo_data: {
        name: 'Regions',
        type: 'geojson',
        source: 'regions.geojson',
      },
    },
  };
}

test('creates a valid Geospatial stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithGeoDataAsset(), {
    assets: [
      { assetId: 'geo_data', name: 'regions.geojson', data: REGIONS_GEOJSON },
    ],
  });
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Geospatial');
  await editor.setStageName('Where Do You Live?');

  // `geospatialStageEditor` is [stage heading, subject picker, map source,
  // prompts, map appearance, skip logic, interviewer guidance], where "map
  // source" is two sections — "Map access" and "Map layer" — and "map
  // appearance" is another two, "Map appearance" and "Starting map view".
  await selectOrCreateNodeType(architectPage, 'person');

  // "Map access" holds `mapOptions.tokenAssetId`. The field stores an asset id
  // and nothing else: the key's value is consumed by the host's resource
  // gateway and never reaches the editor, which is why the map preview asks
  // the host to resolve a map for the id rather than asking for the key.
  const apiKeyField = editor.field('mapOptions.tokenAssetId');
  await addApiKey(architectPage, apiKeyField, {
    name: 'E2E Mapbox Key',
    value: TESTING_MAPBOX_TOKEN,
  });
  // The field's own live region has to describe what it holds NOW: adding a
  // key selects it, and it is announced as a selection rather than as an
  // addition, so a later change to the same field cannot leave an older
  // sentence standing over it.
  await expect(
    apiKeyField.locator('[aria-live="polite"][aria-atomic="true"]'),
  ).toHaveText('E2E Mapbox Key is now selected.');

  // "Map layer" holds `mapOptions.dataSourceAssetId` — the same resource
  // picker, asking for a GeoJSON layer — and, beneath it, the property every
  // prompt's answer is recorded as. That property list is read from the layer
  // just chosen, so it only has anything in it once the layer is set.
  await selectResource(
    architectPage,
    editor.field('mapOptions.dataSourceAssetId'),
    'geojson',
    'Regions',
  );
  await editor
    .field('mapOptions.targetFeatureProperty')
    .locator('select')
    .selectOption({ label: 'name' });

  // One prompt: the question, and the location attribute the participant's
  // chosen area is stored in. The empty codebook is filled from the picker's
  // own create row — a `location` attribute is a point, which its name
  // finishes, so the row writes it and binds it with no editor in between.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Where do you live?');
    await createAttribute(editor.field('variable'), 'location');
    // And it really is a location: the slot binds one kind and nothing else,
    // so the pill's own type is what says the row created what was asked for.
    await expect(
      editor.field('variable').locator('[data-attribute-type]'),
    ).toHaveAttribute('data-attribute-type', 'location');
  });

  // "Map appearance": the basemap is a native select over Mapbox's own style
  // URLs, and the highlight colour a radio per gradient in the theme's ordinal
  // palette, each named for its hue so it can be said aloud.
  await editor
    .field('mapOptions.style')
    .locator('select')
    .selectOption({ label: 'Streets' });
  await editor
    .field('mapOptions.color')
    .getByRole('radio', { name: 'Sea Green', exact: true })
    .click();

  // "Starting map view" is two numbers and a zoom, typed. The map behind
  // "Set the starting view on a map" sets the same three by panning, for a
  // researcher who knows the place rather than its coordinates — but a pan is
  // not reproducible to the last decimal degree (mapbox-gl's own drag inertia
  // and its projection's round trip both move the centre between otherwise
  // identical runs), and the typed controls are the only way to state an exact
  // one. A half-entered pair is no centre at all, so both coordinates are
  // filled before the field holds anything.
  const startingView = editor.field('mapOptions.center');
  await startingView
    .getByRole('spinbutton', { name: 'Longitude', exact: true })
    .fill('0');
  await startingView
    .getByRole('spinbutton', { name: 'Latitude', exact: true })
    .fill('0');
  await editor
    .field('mapOptions.initialZoom')
    .getByRole('spinbutton')
    .fill('2');

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Geospatial');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'geospatial-stage.json',
  );
});
