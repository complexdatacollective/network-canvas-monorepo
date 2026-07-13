import type { CurrentProtocol } from '@codaco/protocol-validation';

import { TESTING_MAPBOX_TOKEN } from '../../../src/templates/testingMapboxToken.js';
import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { installMapboxMocks } from '../../fixtures/mapbox-mocks.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectNetworkAsset } from '../../pageobjects/editor-sections/data-source.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import {
  createVariableViaSpotlight,
  createVariableWithOptions,
} from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// A minimal two-feature FeatureCollection, each with a `name` property —
// mirrors `packages/protocols/e2e/all-interfaces/assets/regions.geojson`
// (inlined rather than read from disk: the e2e project has no established
// cross-package file-read pattern, and a literal here keeps the seeded asset
// self-contained). `mapOptions.targetFeatureProperty` needs at least one
// feature property to populate the "Which property..." select
// (useVariablesFromExternalData -> getGeoJsonVariables reads
// `features[0].properties`).
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

// Only the GeoJSON data source is seeded into the protocol: GeoDataSource.tsx
// (Form/Fields/Geospatial/GeoDataSource.tsx) is a plain `File` resource
// picker with no inline "create" flow — an author can only ever SELECT an
// existing library asset, so one has to already exist. The Mapbox API key is
// deliberately NOT pre-seeded: APIKeyBrowser.tsx (unlike GeoDataSource) has
// its own inline "Create New API Key" form wired straight to a synchronous
// `addApiKeyAsset` dispatch (no async IDB round trip — api-key assets store
// their value directly on the manifest entry, not as a blob; see
// `assetTools.ts`'s `saveProtocolAssets`, which explicitly skips
// string-valued/apikey assets), so this spec drives that live create-and-
// select flow instead, exactly as a real author configuring this stage for
// the first time would.
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

test.beforeEach(async ({ architectPage }) => {
  await installMapboxMocks(architectPage);
});

test('creates a valid Geospatial stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithGeoDataAsset(), {
    assets: [{ assetId: 'geo_data', name: 'Regions', data: REGIONS_GEOJSON }],
  });
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Geospatial');
  await editor.setStageName('Where Do You Live?');

  // StageEditor/Interfaces.tsx: `Geospatial.sections = [FilteredNodeType,
  // MapOptions, GeospatialPrompts, SkipLogic, InterviewScript]`.
  await selectOrCreateNodeType(architectPage, 'person');

  // MapOptions.tsx: `mapOptions.tokenAssetId` renders through GeoAPIKey.tsx
  // (same "receives raw WrappedFieldProps directly, wraps itself in
  // FrescoReduxField" pattern as VariablePicker/ColorPicker/MapSelection, so
  // `editor.field(...)` resolves it correctly). Its button reads "Select API
  // key" (GeoAPIKeyControl.tsx) and opens APIKeyBrowser.tsx — a DIFFERENT
  // dialog shape from `selectNetworkAsset`'s "Resource Browser" (title "API
  // Key Browser", with its own inline create form ahead of the "Resource
  // Library" listbox), so this drives it inline rather than reusing that
  // helper.
  await editor
    .field('mapOptions.tokenAssetId')
    .getByRole('button', { name: 'Select API key' })
    .click();
  const apiKeyDialog = architectPage.getByRole('dialog', {
    name: 'API Key Browser',
  });
  await apiKeyDialog
    .getByRole('textbox', { name: 'API Key Name' })
    .fill('E2E Mapbox Key');
  await apiKeyDialog
    .getByRole('textbox', { name: 'API Key Value' })
    .fill(TESTING_MAPBOX_TOKEN);
  await apiKeyDialog.getByRole('button', { name: 'Create Key' }).click();
  // `addApiKeyAsset` dispatches synchronously into redux (no async IDB
  // write), so the new card renders in the SAME dialog's "Resource Library"
  // (Assets.tsx, `aria-label="Resource library"`) immediately — no reload
  // needed. AssetCard headings are level-4 (data-source.ts's own comment).
  await apiKeyDialog
    .getByRole('listbox', { name: 'Resource library' })
    .getByRole('heading', { level: 4, name: 'E2E Mapbox Key', exact: true })
    .click();

  // `mapOptions.dataSourceAssetId` renders through GeoDataSource.tsx, which
  // wraps the same `File`/`ResourcePickerControl` + `AssetBrowserWindow`
  // ("Resource Browser") that `selectNetworkAsset` already drives for
  // NetworkComposer/name-generator-roster's network-file field — reused
  // unmodified.
  await selectNetworkAsset(
    editor.field('mapOptions.dataSourceAssetId'),
    'Regions',
  );

  // `mapOptions.targetFeatureProperty` only renders once
  // `useVariablesFromExternalData` resolves the seeded GeoJSON's feature
  // properties (a NativeSelectField via FrescoReduxField, so
  // `editor.field(...)` -> the real `<select>` inside it).
  await editor
    .field('mapOptions.targetFeatureProperty')
    .locator('select')
    .selectOption({ label: 'name' });

  // ColorPicker (`palette: 'ord-color-seq'`, `paletteRange: 8`) — same Base
  // UI radio-swatch pattern as NarrativePedigree's disease color.
  await editor.field('mapOptions.color').getByRole('radio').first().click();
  await editor
    .field('mapOptions.style')
    .locator('select')
    .selectOption({ label: 'Streets' });

  // MapSelection.tsx: button reads "Set map view" (lower-case "map view" —
  // `value.center ? 'Edit map view' : 'Set map view'`) and opens MapView.tsx,
  // a REAL `mapboxgl.Map` instance (title "Initial Map View", intercepted by
  // `installMapboxMocks` for deterministic tiles/style/search).
  await editor
    .field('mapOptions')
    .getByRole('button', { name: 'Set map view' })
    .click();

  // A brand-new stage's `mapOptions.center` is unset, so
  // `hasMapViewChanged` (MapView.tsx) is true from the moment the map
  // finishes loading — "Save Changes" only gates on `mapStatus === 'ready'`
  // (the map's own 'load' event), making it a genuine "map ready" signal,
  // more reliable than probing canvas visibility (which mounts well before
  // 'load' fires).
  const saveChangesButton = architectPage.getByRole('button', {
    name: 'Save Changes',
  });
  await expect(saveChangesButton).toBeVisible({ timeout: 20_000 });

  const canvas = architectPage.locator(
    'section[aria-label="Interactive map preview"] canvas.mapboxgl-canvas',
  );

  // `contextOptions.reducedMotion: 'reduce'` (playwright.config.ts) makes
  // mapbox-gl-js's `Camera._prefersReducedMotion()` true for every
  // non-"essential" transition below, forcing `easeTo`'s `duration` to 0 —
  // an (almost) immediate jump rather than a multi-frame animation. Each one
  // still resolves through mapbox-gl's own requestAnimationFrame-driven
  // render loop rather than synchronously inside the triggering handler, so
  // two real animation-frame round trips are awaited after each interaction
  // before triggering the next (or reading the settled state via "Save
  // Changes") — deterministic (frame-based, not a wall-clock sleep) and
  // avoids capturing a mid-transition intermediate value, which would make
  // the committed snapshot (an exact string compare) flaky.
  const nextTwoFrames = () =>
    architectPage.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );

  // Pan the map via the keyboard, NOT a mouse drag. A real mouse drag
  // (mousedown/mousemove/mouseup on the canvas, mirroring mapbox-gl-js's
  // `DragPanHandler`) was tried first, but live repeat runs showed the
  // resulting `center` was NOT reproducible: `DragPanHandler` applies
  // momentum/"inertia" on release by default, and the glide distance it
  // computes depends on the REAL elapsed wall-clock time between recorded
  // drag points (not just their pixel delta) — every variant tried (a
  // multi-step interpolated drag, a single mousemove with a frame-accurate
  // release, a >160ms motionless hold before releasing to drain mapbox-gl's
  // own inertia buffer) still left the final longitude varying between
  // otherwise-identical runs, up to a full degree in the worst case — fatal
  // for a committed snapshot that does an exact string compare.
  // mapbox-gl-js's built-in `KeyboardHandler` has none of that
  // history-dependent state: ArrowRight/ArrowDown pan by a fixed `panStep`
  // of 100 CSS pixels each (confirmed against the installed mapbox-gl
  // package), via the same reduced-motion-instant `easeTo` as the zoom
  // buttons below, with no drag buffer or velocity calculation involved at
  // all. It only needs a plain click to focus the map canvas first (no
  // movement, so `DragPanHandler` never activates) followed by discrete
  // keypresses — reproducible byte-for-byte across runs (re-verified with
  // several repeat local runs, both alone and interleaved with the other
  // two specs in this task).
  await canvas.click();
  for (let i = 0; i < 2; i += 1) {
    await architectPage.keyboard.press('ArrowRight');
    await nextTwoFrames();
  }
  for (let i = 0; i < 2; i += 1) {
    await architectPage.keyboard.press('ArrowDown');
    await nextTwoFrames();
  }

  // mapbox-gl-js's own NavigationControl (`showCompass: false`, so only the
  // zoom buttons render) — `aria-label="Zoom in"` confirmed against the
  // installed mapbox-gl package's `NavigationControl.ZoomIn` UI string, not
  // guessed. Same reduced-motion-instant `easeTo` + frame-wait pattern as
  // the keyboard panning above.
  const zoomInButton = architectPage.getByRole('button', { name: 'Zoom in' });
  await zoomInButton.click();
  await nextTwoFrames();
  await zoomInButton.click();
  await nextTwoFrames();

  await saveChangesButton.click();

  // GeospatialPrompts.tsx's PromptFields.tsx: shared `PromptText` ("Prompt
  // text", same as sociogram.spec.ts/name-generator.spec.ts) followed by a
  // "Selection Variable" `VariablePicker` whose `onCreateOption` opens
  // NewVariableWindow locked to `type: 'location'` — the
  // spotlight-then-window two-step already proven by tie-strength-census.spec.ts's
  // locked-ordinal `edgeVariable`.
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Where do you live?');
    await createVariableViaSpotlight(architectPage, {
      variableName: 'location',
    });
    await createVariableWithOptions(architectPage, {
      variableName: 'location',
      options: [],
    });
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Geospatial');
  expect(stageSnapshotJson(stage)).toMatchSnapshot('geospatial-stage.json');
});
