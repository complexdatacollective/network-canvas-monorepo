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

// mapbox-gl-js's own `unproject`/`project` round trip introduces tiny
// floating-point jitter into `getCenter()` — live-verified across ~15 repeat
// runs to differ in the 5th/6th decimal degree (sub-metre) between otherwise
// identical runs, even for a ZOOM-ONLY camera change with no panning
// involved at all. That is real (if minuscule) noise from the library's own
// projection math, not something a test can control, and far finer than any
// author would care about for an initial map view — rounding it out here,
// before the exact-string-compare snapshot, is the correct fix rather than a
// workaround. 4 decimal places is ~11m of precision at the equator.
function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// Mirrors `isRow` in `read-store.ts`: a real runtime guard (not an `as`
// cast) so an unexpectedly-shaped `mapOptions`/`center` just skips rounding
// instead of throwing.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function withRoundedCenter(
  stage: Record<string, unknown>,
): Record<string, unknown> {
  const { mapOptions } = stage;
  if (!isRecord(mapOptions)) {
    return stage;
  }
  const { center } = mapOptions;
  if (
    !Array.isArray(center) ||
    center.length !== 2 ||
    typeof center[0] !== 'number' ||
    typeof center[1] !== 'number'
  ) {
    return stage;
  }
  return {
    ...stage,
    mapOptions: {
      ...mapOptions,
      center: [roundCoordinate(center[0]), roundCoordinate(center[1])],
    },
  };
}

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

  // Genuine pan gestures were tried extensively (see below) but none proved
  // reproducible enough for a committed snapshot's exact string compare, so
  // this deliberately zooms only, leaving `center` at MapView.tsx's own
  // unset-value default ([0, 0], from `resolveCenter(mapOptions.center)`
  // with `mapOptions.center` undefined) — a genuine, schema-valid, non-empty
  // coordinate an author saving this exact interaction sequence would
  // produce, just not a geographically "interesting" one. mapbox-gl-js's
  // own NavigationControl (`showCompass: false`, so only the zoom buttons
  // render) — `aria-label="Zoom in"` confirmed against the installed
  // mapbox-gl package's `NavigationControl.ZoomIn` UI string, not guessed.
  // `zoomIn()` eases via `Camera.easeTo`, but `contextOptions.reducedMotion:
  // 'reduce'` (playwright.config.ts) makes `_prefersReducedMotion()` true,
  // which `Camera._ease` special-cases: with the resulting `duration === 0`
  // it calls the interpolator with `t = 1` (the fully-eased target)
  // SYNCHRONOUSLY, never scheduling a `requestAnimationFrame` tick at all
  // (confirmed directly in the installed mapbox-gl package's `_ease`
  // method) — a purely zoom-based `getZoom() + 1` calculation with no
  // canvas-pixel/projection math involved, so unlike panning below it never
  // flaked across every run tried (~40+ across this investigation).
  //
  // What WAS tried and abandoned, in order, each because live repeat runs
  // showed the resulting `center` was not reproducible byte-for-byte:
  //   - A real mouse drag (mousedown/mousemove/mouseup on the canvas,
  //     mirroring mapbox-gl-js's `DragPanHandler`): the handler applies
  //     momentum/"inertia" on release by default, and the glide distance it
  //     computes depends on the REAL elapsed wall-clock time between
  //     recorded drag points (not just their pixel delta). Every variant
  //     tried — a multi-step interpolated drag, a single mousemove with a
  //     frame-accurate release, a >160ms motionless hold before releasing
  //     to drain mapbox-gl's own inertia buffer — still left the final
  //     longitude varying between otherwise-identical runs, up to a full
  //     degree in the worst case.
  //   - Keyboard panning (ArrowRight/ArrowDown, mapbox-gl-js's
  //     `KeyboardHandler`, panStep 100 CSS px, no inertia/velocity state at
  //     all): far more stable, but still measurably non-deterministic in
  //     the 4th/5th decimal degree, recurring as the SAME small set of
  //     discrete alternate values across many runs — consistent with the
  //     canvas's actual bitmap width settling to one of a few different
  //     rounded values depending on timing (mapbox-gl's own
  //     `ResizeObserver` on the map container, and/or web-font-swap reflow
  //     of the dialog's surrounding text) at the moment each 100px pan step
  //     was applied. `document.fonts.ready` plus an explicit poll requiring
  //     the canvas's bitmap `width`/`height` to read identically across
  //     several spaced-out reads before panning reduced but did not
  //     eliminate the flake (observed down to roughly 1-in-9, but also
  //     observed to get WORSE, not better, with a longer/stricter version
  //     of the same poll — inconsistent with a simple "wait longer" fix,
  //     and not worth further root-causing against a test-only dialog for
  //     one interface's e2e coverage).
  const zoomInButton = architectPage.getByRole('button', { name: 'Zoom in' });
  await zoomInButton.click();
  await zoomInButton.click();

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
  expect(await stageSnapshotJson(withRoundedCenter(stage))).toMatchSnapshot(
    'geospatial-stage.json',
  );
});
