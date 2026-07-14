import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { SyntheticAssetSpec } from '../helpers/synthetic-payload.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

const CHICAGO_GEOJSON_PATH = path.resolve(
  import.meta.dirname,
  '../../.storybook/static/storybook/chicago.geojson',
);
const TWO_TRACTS_GEOJSON_PATH = path.resolve(
  import.meta.dirname,
  '../fixtures/data/two-tracts.geojson',
);

const FAKE_TOKEN = 'pk.test-token-e2e';
const TOKEN_ASSET_ID = 'mapbox-token';
const CHICAGO_ASSET_ID = 'geojson-chicago';
const TWO_TRACTS_ASSET_ID = 'two-tracts';

// The raw constant Geospatial paints when a colour cannot be resolved
// (useMapbox.ts DEFAULT_FALLBACK). Scenarios assert the resolved colour is
// NOT this, proving the theme variable was actually applied.
const DEFAULT_FALLBACK_COLOR = 'rgb(226, 33, 91)';

// buildSyntheticPayload builds the asset manifest (and the resolved-asset list
// the interview reads its token/data URL from) exclusively from a scenario's
// `assets` array; `synth.addAsset` output is dropped. So BOTH the apikey and
// the geojson must be declared here, and the schema's Geospatial cross-check
// (schema.ts) rejects a mapOptions asset id that is missing from the manifest.
const TOKEN_ASSET: SyntheticAssetSpec = {
  assetId: TOKEN_ASSET_ID,
  name: 'Mapbox Token',
  type: 'apikey',
  value: FAKE_TOKEN,
};
const CHICAGO_ASSET: SyntheticAssetSpec = {
  assetId: CHICAGO_ASSET_ID,
  name: 'Chicago Tracts',
  type: 'geojson',
  source: 'chicago.geojson',
  localPath: CHICAGO_GEOJSON_PATH,
};
const TWO_TRACTS_ASSET: SyntheticAssetSpec = {
  assetId: TWO_TRACTS_ASSET_ID,
  name: 'Two Test Tracts',
  type: 'geojson',
  source: 'two-tracts.geojson',
  localPath: TWO_TRACTS_GEOJSON_PATH,
};

type GeoMapOptions = {
  tokenAssetId: string;
  style: string;
  center: [number, number];
  initialZoom: number;
  dataSourceAssetId: string;
  color: string;
  targetFeatureProperty: string;
  showTransit?: boolean;
  allowSearch?: boolean;
};

/** Standard Chicago-tracts map options; override any field per scenario. */
function chicagoMapOptions(
  overrides: Partial<GeoMapOptions> = {},
): GeoMapOptions {
  return {
    tokenAssetId: TOKEN_ASSET_ID,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-87.6298, 41.8781],
    initialZoom: 11,
    dataSourceAssetId: CHICAGO_ASSET_ID,
    color: 'ord-color-seq-1',
    targetFeatureProperty: 'census_tra',
    ...overrides,
  };
}

/**
 * A fresh builder with a Person node type whose auto-seeded "name" variable is
 * re-declared so its id is available for deterministic node labels.
 */
function newPersonInterview(typeName = 'Person') {
  const synth = new SyntheticInterview();
  const person = synth.addNodeType({ name: typeName });
  const nameVarId = person.addVariable({
    id: 'name',
    type: 'text',
    name: 'name',
  }).id;
  return { synth, person, nameVarId };
}

/**
 * Auto-seeded nodes receive random values for every codebook variable,
 * including a `{ x, y }` object for `location` types. That both lights the
 * next-button pulse before any interaction and feeds a non-string value into
 * map.setFilter on mount. Explicitly clearing the location variable(s) makes
 * seeded nodes arrive genuinely unanswered.
 */
function clearNodeLocations(
  synth: SyntheticInterview,
  nodeIndices: number[],
  locationVarIds: string[],
): void {
  for (const index of nodeIndices) {
    for (const varId of locationVarIds) {
      synth.setNodeAttribute(index, varId, undefined);
    }
  }
}

function buildCoreClickScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'core-click-select-and-prompt-panel',
    covers: [
      'id',
      'label',
      'interviewScript',
      'prompts',
      'prompts[].text',
      'prompts[].variable',
      'mapOptions.allowSearch=false',
      'stub-mode-contract',
    ],
    smoke: true,
    visual: true,
    slow: true,
    build: () => {
      const { synth, person, nameVarId } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      const geo = synth.addStage('Geospatial', {
        label: 'Home location capture (internal)',
        interviewScript: 'Ask about primary residence.',
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      synth.setNodeAttribute(0, nameVarId, 'Node 1');
      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      await stage.geospatial.waitForMapIdle();

      await expect(
        page.getByText('Where does this person currently live?'),
      ).toBeVisible();
      // Non-collapsible prompt: no toggle chevron ever renders.
      await expect(page.getByTestId('prompts-toggle')).toHaveCount(0);
      // Author-only fields are never rendered to the participant.
      await expect(
        page.getByText('Home location capture (internal)'),
      ).toHaveCount(0);
      await expect(page.getByText('Ask about primary residence.')).toHaveCount(
        0,
      );
      // allowSearch omitted: no search affordance.
      await expect(stage.geospatial.searchToggle).toHaveCount(0);

      const isStub =
        (await stage.geospatial.mapContainer.getAttribute(
          'data-geospatial-stub',
        )) === 'true';
      const browserName = page.context().browser()?.browserType().name();
      expect(isStub).toBe(browserName !== 'chromium');

      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const state = await protocol.getNetworkState(interview.interviewId);
      const value = state!.nodes[0]![entityAttributesProperty][variableId];
      expect(typeof value).toBe('string');
      expect(value).not.toBe('');
    },
  };
}

function buildTargetFeaturePropertyScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'target-feature-property-and-outside-click',
    covers: [
      'mapOptions.targetFeatureProperty',
      'mapOptions.dataSourceAssetId',
      'map-click-outside-features',
    ],
    chromiumOnly: true,
    visual: true,
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: {
          tokenAssetId: TOKEN_ASSET_ID,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [0, 0],
          initialZoom: 2,
          dataSourceAssetId: TWO_TRACTS_ASSET_ID,
          color: 'ord-color-seq-1',
          targetFeatureProperty: 'tract_id',
        },
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Select the test tract for this person.',
      });

      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, TWO_TRACTS_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      await stage.geospatial.waitForGeoJsonRendered();

      // Right-of-centre click (x=0.75) always lands in tract-east: the map is
      // centred on [0, 0], so screen x=0.5 is longitude 0 by construction.
      await stage.geospatial.clickOnMap(0.75, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const stateAfterClick = await protocol.getNetworkState(
        interview.interviewId,
      );
      expect(
        stateAfterClick!.nodes[0]![entityAttributesProperty][variableId],
      ).toBe('tract-east');

      const sourceLoaded = await page.evaluate(() => {
        const map = window.__e2eMap;
        if (!map) return false;
        return (
          map.isSourceLoaded('geojson-data') &&
          map.querySourceFeatures('geojson-data').length > 0
        );
      });
      expect(sourceLoaded).toBe(true);

      // Click far north of both tracts' +/-10 degree latitude band: a distinct
      // code path from the "Outside Selectable Areas" button.
      await stage.geospatial.clickOnMap(0.5, 0.05);
      await expect(stage.geospatial.outsideSelectableOverlay).toBeVisible();

      const stateAfterOutsideClick = await protocol.getNetworkState(
        interview.interviewId,
      );
      expect(
        stateAfterOutsideClick!.nodes[0]![entityAttributesProperty][variableId],
      ).toBe('outside-selectable-areas');
    },
  };
}

function buildOutsideSelectableAreasScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'outside-selectable-areas-button-and-deselect',
    covers: ['outside-selectable-areas'],
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ interview, stage, protocol }) => {
      await stage.geospatial.waitForMapIdle();

      await stage.geospatial.selectOutsideSelectableAreas();
      await expect(stage.geospatial.outsideSelectableOverlay).toBeVisible();
      await expect(
        stage.geospatial.outsideSelectableAreasButton,
      ).toBeDisabled();
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const stateSelected = await protocol.getNetworkState(
        interview.interviewId,
      );
      expect(
        stateSelected!.nodes[0]![entityAttributesProperty][variableId],
      ).toBe('outside-selectable-areas');

      await stage.geospatial.deselectOutsideArea();
      await expect(stage.geospatial.outsideSelectableOverlay).not.toBeVisible();
      await expect(stage.geospatial.outsideSelectableAreasButton).toBeEnabled();
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(false);

      await expect
        .poll(async () => {
          const state = await protocol.getNetworkState(interview.interviewId);
          return state!.nodes[0]![entityAttributesProperty][variableId];
        })
        .toBeNull();
    },
  };
}

function buildNodeSteppingScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'node-stepping-and-navigation-boundaries',
    covers: ['node-stepping-beforeNext'],
    slow: true,
    build: () => {
      const { synth, person, nameVarId } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      synth.addInformationStage({ title: 'Before the map' });
      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 3 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });
      synth.addInformationStage({ title: 'After the map' });

      synth.setNodeAttribute(0, nameVarId, 'Node 1');
      synth.setNodeAttribute(1, nameVarId, 'Node 2');
      synth.setNodeAttribute(2, nameVarId, 'Node 3');
      clearNodeLocations(synth, [0, 1, 2], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 1,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      await stage.geospatial.waitForMapIdle();

      // Step forward through the three nodes. Each intra-stage advance leaves
      // the URL step unchanged, so interview.next() would hang — click the raw
      // next button and settle on the new node badge instead.
      await expect(stage.geospatial.getNode('Node 1')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.nextButton.click();

      await expect(stage.geospatial.getNode('Node 2')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.nextButton.click();

      await expect(stage.geospatial.getNode('Node 3')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const state = await protocol.getNetworkState(interview.interviewId);
      expect(state!.nodes).toHaveLength(3);
      for (const node of state!.nodes) {
        expect(typeof node[entityAttributesProperty][variableId]).toBe(
          'string',
        );
      }

      // The last node's forward advance leaves the stage (URL step changes).
      await interview.next();
      await expect(
        page.getByRole('heading', { name: 'After the map' }),
      ).toBeVisible();

      // Back re-mounts Geospatial at the first node.
      await page.getByTestId('previous-button').click();
      await expect(stage.geospatial.getNode('Node 1')).toBeVisible();

      // A further back from the first node leaves the stage backwards.
      await page.getByTestId('previous-button').click();
      await expect(
        page.getByRole('heading', { name: 'Before the map' }),
      ).toBeVisible();
    },
  };
}

function buildMultiPromptScenario(): ScenarioDefinition {
  let homeVarId = '';
  let workVarId = '';

  return {
    id: 'multi-prompt-cycling-and-node-cursor-reset',
    covers: ['prompts', 'prompts[].id'],
    slow: true,
    build: () => {
      const { synth, person, nameVarId } = newPersonInterview();
      const homeVar = person.addVariable({
        type: 'location',
        name: 'HomeLocation',
      });
      const workVar = person.addVariable({
        type: 'location',
        name: 'WorkLocation',
      });
      homeVarId = homeVar.id;
      workVarId = workVar.id;

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 2 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: homeVar.id,
        text: 'Where is the home location?',
      });
      geo.addPrompt({
        variable: workVar.id,
        text: 'Where is the work location?',
      });

      synth.setNodeAttribute(0, nameVarId, 'Node 1');
      synth.setNodeAttribute(1, nameVarId, 'Node 2');
      clearNodeLocations(synth, [0, 1], [homeVar.id, workVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      await stage.geospatial.waitForMapIdle();

      // Prompt 1 for both nodes.
      await expect(page.getByText('Where is the home location?')).toBeVisible();
      await expect(stage.geospatial.getNode('Node 1')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.nextButton.click();

      await expect(stage.geospatial.getNode('Node 2')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.nextButton.click();

      // Prompt boundary crossed: text switches and the node cursor resets.
      await expect(page.getByText('Where is the work location?')).toBeVisible();
      await expect(stage.geospatial.getNode('Node 1')).toBeVisible();

      // Prompt 2 for both nodes.
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.nextButton.click();

      await expect(stage.geospatial.getNode('Node 2')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const state = await protocol.getNetworkState(interview.interviewId);
      expect(state!.nodes).toHaveLength(2);
      for (const node of state!.nodes) {
        const home = node[entityAttributesProperty][homeVarId];
        const work = node[entityAttributesProperty][workVarId];
        expect(typeof home).toBe('string');
        expect(home).not.toBe('');
        expect(typeof work).toBe('string');
        expect(work).not.toBe('');
      }
    },
  };
}

function buildSelectionRestoreScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'selection-restore-on-back-navigation',
    covers: ['selection-restore'],
    slow: true,
    build: () => {
      const { synth, person, nameVarId } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 2 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      synth.setNodeAttribute(0, nameVarId, 'Node 1');
      synth.setNodeAttribute(1, nameVarId, 'Node 2');
      clearNodeLocations(synth, [0, 1], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      await stage.geospatial.waitForGeoJsonRendered();

      await expect(stage.geospatial.getNode('Node 1')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const stateNode1 = await protocol.getNetworkState(interview.interviewId);
      const node1Value =
        stateNode1!.nodes[0]![entityAttributesProperty][variableId];
      expect(typeof node1Value).toBe('string');

      // Advance to Node 2 (intra-stage) and select a different tract.
      await interview.nextButton.click();
      await expect(stage.geospatial.getNode('Node 2')).toBeVisible();
      await stage.geospatial.clickOnMap(0.35, 0.35);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      // Back to Node 1: its stored value is unchanged and the button pulses on
      // arrival with no re-selection.
      await page.getByTestId('previous-button').click();
      await expect(stage.geospatial.getNode('Node 1')).toBeVisible();
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const stateAfterBack = await protocol.getNetworkState(
        interview.interviewId,
      );
      expect(
        stateAfterBack!.nodes[0]![entityAttributesProperty][variableId],
      ).toBe(node1Value);

      const isStub =
        (await stage.geospatial.mapContainer.getAttribute(
          'data-geospatial-stub',
        )) === 'true';
      if (!isStub) {
        // The restored selection re-applies Node 1's value to the map filter.
        await expect
          .poll(() =>
            page.evaluate(() => window.__e2eMap?.getFilter('selection')),
          )
          .toEqual(['==', 'census_tra', node1Value]);
      }
    },
  };
}

function buildSubjectFiltersScenario(): ScenarioDefinition {
  let personTypeId = '';
  let venueTypeId = '';
  let variableId = '';

  return {
    id: 'subject-filters-by-node-type',
    covers: ['subject'],
    slow: true,
    build: () => {
      const { synth, person, nameVarId } = newPersonInterview('Person');
      personTypeId = person.id;
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      const venue = synth.addNodeType({ name: 'Venue' });
      venueTypeId = venue.id;
      const venueNameId = venue.addVariable({
        id: 'name',
        type: 'text',
        name: 'name',
      }).id;

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 2 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      synth.setNodeAttribute(0, nameVarId, 'Node 1');
      synth.setNodeAttribute(1, nameVarId, 'Node 2');
      clearNodeLocations(synth, [0, 1], [locationVar.id]);
      synth.addManualNode(geo.id, venue.id, 'venue-1', {
        [venueNameId]: 'Venue 1',
      });
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ interview, stage, protocol }) => {
      await stage.geospatial.waitForMapIdle();

      // The Venue node is never a stage node.
      await expect(stage.geospatial.getNode('Venue 1')).toHaveCount(0);

      await expect(stage.geospatial.getNode('Node 1')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.nextButton.click();

      await expect(stage.geospatial.getNode('Node 2')).toBeVisible();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      await expect(stage.geospatial.getNode('Venue 1')).toHaveCount(0);

      const state = await protocol.getNetworkState(interview.interviewId);
      const persons = state!.nodes.filter((n) => n.type === personTypeId);
      expect(persons).toHaveLength(2);
      for (const p of persons) {
        expect(typeof p[entityAttributesProperty][variableId]).toBe('string');
      }
      const venueNode = state!.nodes.find((n) => n.type === venueTypeId);
      expect(venueNode).toBeDefined();
      expect(venueNode![entityAttributesProperty][variableId]).toBeUndefined();
    },
  };
}

function buildEmptySubjectScenario(): ScenarioDefinition {
  return {
    id: 'empty-subject-passthrough',
    covers: ['empty-stage-passthrough'],
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });
      synth.addInformationStage({ title: 'Done' });
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage }) => {
      await stage.geospatial.waitForMapIdle();

      // No node exists, so no node badge renders.
      await expect(page.getByRole('button', { name: /^Node/ })).toHaveCount(0);

      // beforeNext returns true immediately, so the single Next leaves the
      // stage directly.
      await interview.next();
      await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
    },
  };
}

function buildZoomControlsScenario(): ScenarioDefinition {
  return {
    id: 'zoom-controls-and-recenter',
    covers: [
      'mapOptions.initialZoom',
      'mapOptions.center',
      'mapOptions.showTransit=false',
    ],
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions({ initialZoom: 10 }),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, stage }) => {
      await stage.geospatial.waitForMapIdle();

      expect(await stage.geospatial.getZoomLevel()).toBe(10);

      await stage.geospatial.zoomIn();
      const zoomAfterIn = await stage.geospatial.getZoomLevel();
      expect(zoomAfterIn).toBeGreaterThan(10);

      await stage.geospatial.zoomOut();
      const zoomAfterOut = await stage.geospatial.getZoomLevel();
      expect(zoomAfterOut).toBeLessThan(zoomAfterIn!);

      await stage.geospatial.recenter();
      await expect.poll(() => stage.geospatial.getZoomLevel()).toBe(10);

      const isStub =
        (await stage.geospatial.mapContainer.getAttribute(
          'data-geospatial-stub',
        )) === 'true';
      if (!isStub) {
        // showTransit omitted: the transit layer exists but stays hidden.
        const transitVisibility = await page.evaluate(() =>
          window.__e2eMap?.getLayoutProperty('transit-lines', 'visibility'),
        );
        expect(transitVisibility).toBe('none');
      }
    },
  };
}

function buildMapStyleColorTransitScenario(): ScenarioDefinition {
  return {
    id: 'map-style-color-token-and-transit',
    covers: [
      'mapOptions.tokenAssetId',
      'mapOptions.style',
      'mapOptions.color',
      'mapOptions.showTransit',
    ],
    chromiumOnly: true,
    visual: true,
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      synth.addInformationStage({ title: 'Before the map' });
      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions({
          style: 'mapbox://styles/mapbox/dark-v11',
          color: 'ord-color-seq-4',
          showTransit: true,
        }),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage }) => {
      const stylePromise = page.waitForRequest(/styles\/v1\/mapbox\/dark-v11/, {
        timeout: 30_000,
      });
      const tileJsonPromise = page.waitForRequest(
        /mapbox\.mapbox-streets-v8\.json/,
        { timeout: 30_000 },
      );

      await interview.next(); // Information -> Geospatial; map initialises.

      const styleRequest = await stylePromise;
      await tileJsonPromise;
      expect(styleRequest.url()).toContain('dark-v11');
      // Proves tokenAssetId resolved to a real token appended to the request.
      expect(styleRequest.url()).toContain('access_token=');

      await stage.geospatial.waitForMapIdle();

      const transitVisibility = await page.evaluate(() =>
        window.__e2eMap?.getLayoutProperty('transit-lines', 'visibility'),
      );
      expect(transitVisibility).toBe('visible');

      // ord-color-seq-4 was applied, not the raw fallback constant.
      const fillColor = await page.evaluate(() =>
        window.__e2eMap?.getPaintProperty('selection', 'fill-color'),
      );
      expect(fillColor).not.toBe(DEFAULT_FALLBACK_COLOR);
    },
  };
}

function buildColorFallbackScenario(): ScenarioDefinition {
  return {
    id: 'color-unknown-name-falls-back',
    covers: ['mapOptions.color=default'],
    chromiumOnly: true,
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions({ color: 'not-a-real-palette-color' }),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, stage }) => {
      await stage.geospatial.waitForMapIdle();

      // Independently compute the colour the unknown name must fall back to
      // (DEFAULT_COLOR_VAR = --node-1), using the same canvas conversion the
      // app applies in useMapbox.ts.
      const expectedColor = await page.evaluate(() => {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue('--node-1')
          .trim();
        if (!raw) return 'rgb(226, 33, 91)';
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return 'rgb(226, 33, 91)';
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = raw;
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        if (data[3] === 0) return 'rgb(226, 33, 91)';
        const hex = (v: number) => v.toString(16).padStart(2, '0');
        return `#${hex(data[0]!)}${hex(data[1]!)}${hex(data[2]!)}`;
      });

      const fillColor = await page.evaluate(() =>
        window.__e2eMap?.getPaintProperty('selection', 'fill-color'),
      );
      expect(fillColor).toBe(expectedColor);
    },
  };
}

function buildSearchFlowScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'search-flow-select-suggestion-and-ux',
    covers: ['mapOptions.allowSearch', 'analytics-events'],
    slow: true,
    build: () => {
      const { synth, person, nameVarId } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions({ allowSearch: true }),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Search for or select this person’s neighbourhood.',
      });

      synth.setNodeAttribute(0, nameVarId, 'Node 1');
      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await stage.geospatial.waitForMapIdle();

      // Search renders (allowSearch true) and returns the mocked suggestion.
      await stage.geospatial.search('Sidetrack');
      await expect(stage.geospatial.getSuggestions()).toHaveCount(1);

      // Selecting a suggestion flies the camera to FLY_TO_ZOOM (14) but never
      // writes the location variable — only a map click does. The mocked
      // retrieve resolves instantly and reduced-motion makes the fly-to jump,
      // so assert the zoom outcome directly rather than observing the transient
      // move (which selectSuggestion's fixed idle wait would miss).
      await stage.geospatial.getSuggestions().first().click();
      await expect.poll(() => stage.geospatial.getZoomLevel()).toBe(14);
      await stage.geospatial.recenter();
      await expect.poll(() => stage.geospatial.getZoomLevel()).toBe(11);

      const stateAfterSearch = await protocol.getNetworkState(
        interview.interviewId,
      );
      expect(
        stateAfterSearch!.nodes[0]![entityAttributesProperty][variableId],
      ).toBeUndefined();

      // Clear button empties the query.
      await stage.geospatial.search('Sidetrack');
      await stage.geospatial.clearSearch();
      await expect(stage.geospatial.searchInput).toHaveValue('');

      // Escape closes the panel and restores focus to the toggle.
      await stage.geospatial.searchInput.fill('Sidetrack');
      await page.keyboard.press('Escape');
      await expect(stage.geospatial.searchInput).not.toBeVisible();
      expect(await stage.geospatial.isSearchOpen()).toBe(false);
      await expect(stage.geospatial.searchToggle).toBeFocused();

      // Analytics tracking during search/selection must not throw.
      expect(pageErrors).toEqual([]);
    },
  };
}

function buildMapErrorOverlayScenario(): ScenarioDefinition {
  return {
    id: 'map-error-overlay-webgl-failure',
    covers: ['map-error-overlay'],
    chromiumOnly: true,
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      synth.addInformationStage({ title: 'Before the map' });
      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage }) => {
      // The scenario starts on the Information stage, so the map has not been
      // constructed yet. Make WebGL context acquisition fail before navigating
      // so `new mapboxgl.Map()` throws synchronously inside useMapbox's
      // try/catch. The interview is a SPA, so this page-level patch persists
      // across the client-side navigation to the Geospatial stage.
      await page.evaluate(() => {
        const proto = HTMLCanvasElement.prototype;
        const original = proto.getContext;
        Object.defineProperty(proto, 'getContext', {
          configurable: true,
          writable: true,
          value(
            this: HTMLCanvasElement,
            contextId: string,
            options?: unknown,
          ): RenderingContext | null {
            if (
              contextId === 'webgl' ||
              contextId === 'webgl2' ||
              contextId === 'experimental-webgl'
            ) {
              return null;
            }
            return original.apply(this, [contextId, options]);
          },
        });
      });

      await interview.next(); // Information -> Geospatial; map construction fails.

      await expect(stage.geospatial.mapContainer).toBeVisible();
      await expect(page.getByTestId('map-error-overlay')).toBeVisible();
      await expect(
        page.getByText('The map could not be displayed'),
      ).toBeVisible();

      // The stage did not crash to the error boundary and stays navigable.
      await expect(interview.nextButton).toBeEnabled();
    },
  };
}

function buildOfflineIndicatorScenario(): ScenarioDefinition {
  return {
    id: 'offline-indicator-geospatial-only',
    covers: ['offline-indicator'],
    slow: true,
    build: () => {
      const { synth, person } = newPersonInterview();
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: chicagoMapOptions(),
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });
      synth.addInformationStage({ title: 'Other stage' });

      clearNodeLocations(synth, [0], [locationVar.id]);
      return synth;
    },
    assets: [TOKEN_ASSET, CHICAGO_ASSET],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage }) => {
      await stage.geospatial.waitForMapIdle();

      const offlineBanner = page.getByText(
        'You are offline — the map will not load until you reconnect.',
      );
      await expect(offlineBanner).toHaveCount(0);

      await page.context().setOffline(true);
      await expect(offlineBanner).toBeVisible();

      await page.context().setOffline(false);
      await expect(offlineBanner).toHaveCount(0);

      // Move to the following Information stage, where the indicator must never
      // mount.
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.next();
      await expect(
        page.getByRole('heading', { name: 'Other stage' }),
      ).toBeVisible();

      await page.context().setOffline(true);
      // Confirm the page observed the offline transition before asserting the
      // banner's absence.
      await expect
        .poll(() => page.evaluate(() => !window.navigator.onLine))
        .toBe(true);
      await expect(offlineBanner).toHaveCount(0);

      await page.context().setOffline(false);
    },
  };
}

export const geospatialScenarios: InterfaceScenarios = {
  interfaceType: 'Geospatial',
  scenarios: [
    buildCoreClickScenario(),
    buildTargetFeaturePropertyScenario(),
    buildOutsideSelectableAreasScenario(),
    buildNodeSteppingScenario(),
    buildMultiPromptScenario(),
    buildSelectionRestoreScenario(),
    buildSubjectFiltersScenario(),
    buildEmptySubjectScenario(),
    buildZoomControlsScenario(),
    buildMapStyleColorTransitScenario(),
    buildColorFallbackScenario(),
    buildSearchFlowScenario(),
    buildMapErrorOverlayScenario(),
    buildOfflineIndicatorScenario(),
  ],
};
