import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { NameGeneratorRosterFixture } from '../fixtures/name-generator-roster-fixture.js';
import type { SyntheticAssetSpec } from '../helpers/synthetic-payload.js';
import type { InterfaceScenarios } from './types.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../fixtures/data');
const DEV_PROTOCOL_ASSETS = path.resolve(
  import.meta.dirname,
  '../../../development-protocol/assets',
);

const rosterSmallAsset = (assetId: string): SyntheticAssetSpec => ({
  assetId,
  name: 'JSON Roster',
  type: 'network',
  source: 'roster-small.json',
  localPath: path.join(DATA_DIR, 'roster-small.json'),
});

// Refs captured in build() and read in run() (module-scope because each
// scenario is a plain object literal, per the run-scenario contract).
let basicJsonPersonTypeId = '';
let basicJsonAgeVarId = '';
let basicJsonLocationVarId = '';

let multiNameVarId = '';
let multiVerifiedVarId = '';

export const nameGeneratorRosterScenarios: InterfaceScenarios = {
  interfaceType: 'NameGeneratorRoster',
  scenarios: [
    {
      id: 'roster-add-basic-json',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'subject',
        'dataSource',
        'cardOptions',
        'cardOptions.additionalProperties',
        'prompts',
        'prompts[].id',
        'prompts[].text',
        'behaviours',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const ageVar = personType.addVariable({ name: 'age', type: 'number' });
        const locationVar = personType.addVariable({
          name: 'location',
          type: 'text',
        });
        basicJsonPersonTypeId = personType.id;
        basicJsonAgeVarId = ageVar.id;
        basicJsonLocationVarId = locationVar.id;

        synth.addAsset({
          id: 'jsonRosterBasic',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Add Roster Contacts Basic Smoke Stage',
          interviewScript: 'Smoke-test interview script marker text',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'jsonRosterBasic',
          cardOptions: {
            additionalProperties: [
              { label: 'Age', variable: 'age' },
              { label: 'Location', variable: 'location' },
            ],
          },
        });
        stage.addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRosterBasic')],
      run: async ({ page, interview, protocol }) => {
        const roster = new NameGeneratorRosterFixture(page);

        await expect(roster.sourceListbox.getByRole('option')).toHaveCount(6);

        const caraCard = roster.getRosterNode('Cara Chen');
        await expect(caraCard.getByText('40', { exact: true })).toBeVisible();
        await expect(
          caraCard.getByText('Denver', { exact: true }),
        ).toBeVisible();

        // Ben Brown's location is '' in roster-small.json — DataCard's
        // formatValue renders empty/undefined values as '—' (DataCard.tsx:18).
        const benCard = roster.getRosterNode('Ben Brown');
        await expect(benCard.getByText('—', { exact: true })).toBeVisible();

        // Stage label/interviewScript are authoring/navigation metadata, never
        // rendered as participant-visible copy.
        await expect(
          page.getByText('Add Roster Contacts Basic Smoke Stage', {
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          page.getByText('Smoke-test interview script marker text', {
            exact: true,
          }),
        ).toHaveCount(0);

        await expect(interview.nextButton).toBeEnabled();

        await roster.addNode('Cara Chen');

        const state = await protocol.getNetworkState(interview.interviewId);
        const cara = state!.nodes[0]!;
        expect(cara.type).toBe(basicJsonPersonTypeId);
        expect(cara[entityAttributesProperty][basicJsonAgeVarId]).toBe(40);
        expect(cara[entityAttributesProperty][basicJsonLocationVarId]).toBe(
          'Denver',
        );
        expect(cara.promptIDs).toHaveLength(1);
      },
    },

    {
      id: 'roster-csv-source-and-numeric-coercion',
      covers: [
        'dataSource=csv',
        'sortOptions',
        'sortOptions.sortableProperties',
      ],
      build: () => {
        const synth = new SyntheticInterview();

        // Stage A: general CSV load + add, using the shared development-protocol
        // fixture (previousInterview.csv: name,nickname,age — 98 data rows, all
        // two-digit ages, so it CANNOT prove numeric coercion by itself; that is
        // what Stage B's dedicated fixture is for).
        const personTypeA = synth.addNodeType({ name: 'Person' });
        personTypeA.addVariable({ name: 'nickname', type: 'text' });
        personTypeA.addVariable({ name: 'age', type: 'number' });
        synth.addAsset({
          id: 'csvRosterGeneral',
          name: 'Previous Interview CSV',
          type: 'network',
          source: 'previousInterview.csv',
        });
        const stageA = synth.addStage('NameGeneratorRoster', {
          label: 'CSV general load',
          subject: { entity: 'node', type: personTypeA.id },
          dataSource: 'csvRosterGeneral',
          searchOptions: { fuzziness: 0.1, matchProperties: ['name'] },
        });
        stageA.addPrompt({
          text: 'Stage A: please add a person from this list.',
        });

        // Stage B: dedicated coercion-proof CSV with mixed digit-length ages.
        const personTypeB = synth.addNodeType({ name: 'PersonB' });
        personTypeB.addVariable({ name: 'age', type: 'number' });
        personTypeB.addVariable({ name: 'location', type: 'text' });
        synth.addAsset({
          id: 'csvRosterCoercion',
          name: 'Coercion CSV',
          type: 'network',
          source: 'roster-coercion.csv',
        });
        const stageB = synth.addStage('NameGeneratorRoster', {
          label: 'CSV coercion',
          subject: { entity: 'node', type: personTypeB.id },
          dataSource: 'csvRosterCoercion',
          sortOptions: {
            sortableProperties: [{ label: 'Age', variable: 'age' }],
          },
        });
        stageB.addPrompt({ text: 'Stage B: please review these people.' });

        return synth;
      },
      assets: [
        {
          assetId: 'csvRosterGeneral',
          name: 'Previous Interview CSV',
          type: 'network',
          source: 'previousInterview.csv',
          localPath: path.join(DEV_PROTOCOL_ASSETS, 'previousInterview.csv'),
        },
        {
          assetId: 'csvRosterCoercion',
          name: 'Coercion CSV',
          type: 'network',
          source: 'roster-coercion.csv',
          localPath: path.join(DATA_DIR, 'roster-coercion.csv'),
        },
      ],
      run: async ({ page, stage, interview }) => {
        const roster = new NameGeneratorRosterFixture(page);

        // Stage A: narrow the 98-row CSV to one match via search, then add it —
        // avoids asserting exact counts against a virtualized list.
        await roster.search('Charles');
        await expect(roster.resultsBadge).toBeVisible();
        await roster.addNode('Charles');
        await expect(roster.getAddedNode('Charles')).toBeVisible();

        await interview.next();

        // Stage B: sort by Age. If the CSV strings "9"/"10"/"11"/"2" were
        // compared lexically instead of numerically, the order would read
        // 10, 11, 2, 9.
        await expect(stage.getPrompt(/Stage B/)).toBeVisible();
        await roster.sortBy('Age');
        await expect
          .poll(() => roster.sourceLabels())
          .toEqual(['Leo Two', 'Ivy Nine', 'Jax Ten', 'Kim Eleven']);

        await expect(roster.sortButton('Age')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      },
    },

    {
      id: 'roster-dataSource-missing-asset-error',
      covers: ['dataSource=error'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        personType.addVariable({ name: 'age', type: 'number' });
        personType.addVariable({ name: 'location', type: 'text' });

        // The schema (schema.ts:418) rejects a NameGeneratorRoster whose
        // dataSource is absent from the manifest, so a literally-unregistered
        // id cannot exercise the RUNTIME load-error UI. Instead register a real
        // network asset whose file is malformed JSON: it passes schema
        // validation but `loadExternalData` throws when it calls `.json()`,
        // driving `useExternalData` into its error state and rendering
        // NameGeneratorRoster's ErrorMessage.
        synth.addAsset({
          id: 'rosterBroken',
          name: 'Broken Roster',
          type: 'network',
          source: 'roster-broken.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Broken roster',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'rosterBroken',
        });
        stage.addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [
        {
          assetId: 'rosterBroken',
          name: 'Broken Roster',
          type: 'network',
          source: 'roster-broken.json',
          localPath: path.join(DATA_DIR, 'roster-broken.json'),
        },
      ],
      run: async ({ page, interview, protocol }) => {
        await expect(
          page.getByRole('heading', { name: 'Something went wrong' }),
        ).toBeVisible();
        await expect(
          page.getByText('External data could not be loaded.'),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        expect(state?.nodes).toEqual([]);
      },
    },

    {
      id: 'roster-sort-order-omitted-desc-and-insertion',
      covers: ['sortOptions.sortOrder', 'sortOptions.sortOrder=*'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        personType.addVariable({ name: 'age', type: 'number' });
        personType.addVariable({ name: 'location', type: 'text' });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        // Stage 1: no sortOptions → insertion (data-file) order preserved.
        synth
          .addStage('NameGeneratorRoster', {
            label: 'Insertion order',
            subject: { entity: 'node', type: personType.id },
            dataSource: 'jsonRoster',
          })
          .addPrompt({ text: 'Please add anyone you recognise.' });

        // Stage 2: name descending.
        synth
          .addStage('NameGeneratorRoster', {
            label: 'Name descending',
            subject: { entity: 'node', type: personType.id },
            dataSource: 'jsonRoster',
            sortOptions: {
              sortOrder: [{ property: 'name', direction: 'desc' }],
            },
          })
          .addPrompt({ text: 'Please add anyone you recognise.' });

        // Stage 3: '*' (insertion-order scalar) descending.
        synth
          .addStage('NameGeneratorRoster', {
            label: 'Insertion descending',
            subject: { entity: 'node', type: personType.id },
            dataSource: 'jsonRoster',
            sortOptions: {
              sortOrder: [{ property: '*', direction: 'desc' }],
            },
          })
          .addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page, interview }) => {
        const roster = new NameGeneratorRosterFixture(page);

        // Stage 1: data-file order.
        await expect
          .poll(() => roster.sourceLabels())
          .toEqual([
            'Cara Chen',
            'Amy Adams',
            'Finn Frost',
            'Ben Brown',
            'Drew Diaz',
            'Elle Evans',
          ]);

        await interview.next();

        // Stage 2: name descending.
        await expect
          .poll(() => roster.sourceLabels())
          .toEqual([
            'Finn Frost',
            'Elle Evans',
            'Drew Diaz',
            'Cara Chen',
            'Ben Brown',
            'Amy Adams',
          ]);

        await interview.next();

        // Stage 3: insertion order reversed ('*' descending).
        await expect
          .poll(() => roster.sourceLabels())
          .toEqual([
            'Elle Evans',
            'Drew Diaz',
            'Ben Brown',
            'Finn Frost',
            'Amy Adams',
            'Cara Chen',
          ]);
      },
    },

    {
      id: 'roster-sortable-properties-ordinal-hierarchy',
      covers: ['sortOptions.sortableProperties'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        personType.addVariable({
          name: 'closeness',
          type: 'ordinal',
          options: [
            { value: 'very-close', label: 'Very close' },
            { value: 'close', label: 'Close' },
            { value: 'not-close', label: 'Not close' },
          ],
        });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Sort by closeness hierarchy',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'jsonRoster',
          sortOptions: {
            sortableProperties: [
              { label: 'Closeness', variable: 'closeness' },
              { label: 'Name', variable: 'name' },
            ],
          },
        });
        stage.addPrompt({ text: 'Please add the people closest to you.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page }) => {
        const roster = new NameGeneratorRosterFixture(page);

        // Wait for the roster to finish loading before sorting.
        await expect(roster.sourceListbox.getByRole('option')).toHaveCount(6);

        // 1st click: ascending by hierarchy (very-close ranked first).
        await roster.sortBy('Closeness');
        await expect(roster.sortButton('Closeness')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(roster.sortButton('Closeness')).toHaveAccessibleName(
          /\(ascending\)/,
        );

        // The two 'very-close' people (Cara, Finn) sort ahead of the
        // alphabetically-first 'Amy Adams', proving the hierarchy (not
        // alphabetical) order is used.
        await expect
          .poll(async () => new Set((await roster.sourceLabels()).slice(0, 2)))
          .toEqual(new Set(['Cara Chen', 'Finn Frost']));

        // 2nd click: descending — the very-close pair now sorts last.
        await roster.sortBy('Closeness');
        await expect(roster.sortButton('Closeness')).toHaveAccessibleName(
          /\(descending\)/,
        );
        await expect
          .poll(async () => new Set((await roster.sourceLabels()).slice(-2)))
          .toEqual(new Set(['Cara Chen', 'Finn Frost']));
      },
    },

    {
      id: 'roster-search-presence-and-fuzziness',
      covers: ['searchOptions', 'searchOptions.fuzziness'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        personType.addVariable({ name: 'location', type: 'text' });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        // Stage A: search enabled with fuzziness.
        synth
          .addStage('NameGeneratorRoster', {
            label: 'Search enabled',
            subject: { entity: 'node', type: personType.id },
            dataSource: 'jsonRoster',
            searchOptions: {
              fuzziness: 0.4,
              matchProperties: ['name', 'location'],
            },
          })
          .addPrompt({ text: 'Please add anyone you recognise.' });

        // Stage B: no searchOptions → no searchbox rendered at all.
        synth
          .addStage('NameGeneratorRoster', {
            label: 'Search absent',
            subject: { entity: 'node', type: personType.id },
            dataSource: 'jsonRoster',
          })
          .addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page, interview }) => {
        const roster = new NameGeneratorRosterFixture(page);

        // Stage A: a name query narrows the roster (some, not all, match).
        await expect(roster.sourceListbox.getByRole('option')).toHaveCount(6);
        await roster.search('Cara Chen');
        await expect(roster.resultsBadge).toBeVisible();
        const badgeText = (await roster.resultsBadge.textContent()) ?? '';
        const count = Number(/(\d+)/.exec(badgeText)?.[1]);
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(6);
        await expect
          .poll(async () => (await roster.sourceLabels())[0])
          .toBe('Cara Chen');

        await interview.next();

        // Stage B: without searchOptions the CollectionFilterInput never renders.
        await expect(roster.sourceListbox.getByRole('option')).toHaveCount(6);
        await expect(roster.filterInput).toHaveCount(0);
      },
    },

    {
      id: 'roster-search-matchProperties-scoping-and-empty',
      covers: [
        'searchOptions.matchProperties',
        'searchOptions.matchProperties=empty',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        personType.addVariable({ name: 'location', type: 'text' });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        // Stage A: search scoped to 'location' only.
        synth
          .addStage('NameGeneratorRoster', {
            label: 'Match location only',
            subject: { entity: 'node', type: personType.id },
            dataSource: 'jsonRoster',
            searchOptions: { fuzziness: 0.2, matchProperties: ['location'] },
          })
          .addPrompt({ text: 'Please add anyone you recognise.' });

        // Stage B: empty matchProperties → searchbox renders but nothing matches.
        synth
          .addStage('NameGeneratorRoster', {
            label: 'Match nothing',
            subject: { entity: 'node', type: personType.id },
            dataSource: 'jsonRoster',
            searchOptions: { fuzziness: 0.2, matchProperties: [] },
          })
          .addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page, interview }) => {
        const roster = new NameGeneratorRosterFixture(page);

        // Stage A: 'Drew' exists only in the name column, so a location-scoped
        // search finds nothing.
        await expect(roster.sourceListbox.getByRole('option')).toHaveCount(6);
        await roster.search('Drew');
        await expect(roster.emptyState).toBeVisible();

        await interview.next();

        // Stage B: an empty matchProperties array resolves to zero filter keys.
        // Observed behaviour (useFilterState.ts:44 gates filtering on
        // `filterKeys.length > 0`): with no keys, Collection filtering is
        // disabled entirely and CollectionFilterInput renders nothing, so NO
        // search input appears even though `searchOptions` is configured. This
        // is the observable proof that empty matchProperties yields no filter
        // keys. (The plan expected a rendered searchbox + empty results; pinned
        // to the real behaviour instead.)
        await expect(roster.sourceListbox.getByRole('option')).toHaveCount(6);
        await expect(roster.filterInput).toHaveCount(0);
      },
    },

    {
      id: 'roster-behaviours-min-nodes',
      covers: ['behaviours.minNodes'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Minimum two',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'jsonRoster',
          behaviours: { minNodes: 2 },
        });
        stage.addPrompt({ text: 'Please add at least two people you know.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page, interview }) => {
        const roster = new NameGeneratorRosterFixture(page);
        const rosterPanel = page.getByText('Available to add');

        await roster.addNode('Cara Chen');

        // With only one node, forward navigation is blocked and a destructive
        // toast appears; the roster panel is still on screen.
        await interview.nextButton.click();
        await expect(
          page.getByText(
            /You must create at least\s*2\s*items? before you can continue\./,
          ),
        ).toBeVisible();
        await expect(rosterPanel).toBeVisible();

        await roster.addNode('Amy Adams');

        // Two nodes satisfy minNodes → navigation advances (to the implicit
        // Finish stage) and the roster panel unmounts.
        await interview.next();
        await expect(rosterPanel).toBeHidden();
      },
    },

    {
      id: 'roster-behaviours-max-nodes',
      covers: ['behaviours.maxNodes'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Maximum two',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'jsonRoster',
          behaviours: { maxNodes: 2 },
        });
        stage.addPrompt({ text: 'Please add up to two people you know.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page }) => {
        const roster = new NameGeneratorRosterFixture(page);
        const successToast = page.getByText(
          'You have completed this task. Click the next arrow to continue.',
        );

        await roster.addNode('Cara Chen');
        await roster.addNode('Amy Adams');

        // Reaching maxNodes surfaces the success toast and disables every
        // remaining source card so no more can be added.
        await expect(successToast).toBeVisible();
        await expect(
          roster.sourceListbox.locator(
            '[role="option"]:not([aria-disabled="true"])',
          ),
        ).toHaveCount(0);

        // Removing a node drops back below the limit: the success toast clears
        // (driven by the recomputed node count) AND the source cards re-enable
        // so more can be added again. Both signals exercise the disabledKeys
        // fix in fresco-ui's useSelectionState, which now calls setDisabledKeys
        // on every prop change — including back to an empty set — so the stale
        // disabled Set no longer persists after the limit is released.
        await roster.removeNode('Cara Chen');
        await expect(successToast).toBeHidden();
        await expect(
          roster.sourceListbox.locator(
            '[role="option"]:not([aria-disabled="true"])',
          ),
        ).not.toHaveCount(0);
      },
    },

    {
      id: 'roster-multiple-prompts-additional-attributes',
      covers: ['prompts', 'prompts[].text', 'prompts[].additionalAttributes'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        // Dedupes to the auto-seeded "name" text variable — captures its id for
        // assertions below without creating a duplicate variable.
        const nameVar = personType.addVariable({ name: 'name' });
        const verifiedVar = personType.addVariable({
          name: 'verified',
          type: 'boolean',
        });
        multiNameVarId = nameVar.id;
        multiVerifiedVarId = verifiedVar.id;

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Multi-prompt roster',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'jsonRoster',
        });
        stage.addPrompt({
          text: 'Prompt 1 of 2: people you have met in person.',
          additionalAttributes: [{ variable: verifiedVar.id, value: true }],
        });
        stage.addPrompt({
          text: 'Prompt 2 of 2: people you only know online.',
        });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page, stage, interview, protocol }) => {
        const roster = new NameGeneratorRosterFixture(page);

        await expect(stage.getPrompt(/Prompt 1 of 2/)).toBeVisible();
        // Pips: one per prompt (aria-hidden, read via the data attribute).
        await expect(page.locator('[data-active]')).toHaveCount(2);

        // Add under prompt 1: its additionalAttributes (verified:true) are
        // written at creation, and the node is scoped to prompt 1.
        await roster.addNode('Cara Chen');

        const state = await protocol.getNetworkState(interview.interviewId);
        expect(state?.nodes).toHaveLength(1);
        const cara = state!.nodes[0]!;
        expect(cara[entityAttributesProperty][multiNameVarId]).toBe(
          'Cara Chen',
        );
        expect(cara[entityAttributesProperty][multiVerifiedVarId]).toBe(true);
        expect(cara.promptIDs).toHaveLength(1);

        // nextButton advances the PROMPT (not the stage) while more prompts
        // remain — the URL step is unchanged, so click directly rather than
        // interview.next() (which waits for a step change that never comes).
        await interview.nextButton.click();

        await expect(stage.getPrompt(/Prompt 2 of 2/)).toBeVisible();
        // Prompt 2 has no additionalAttributes. Its per-prompt Added-Nodes list
        // is empty (promptIDs filter) even though Cara exists network-wide —
        // proving the Added list is prompt-scoped.
        await expect(roster.addedListbox.getByRole('option')).toHaveCount(0);

        // The source panel repopulates on the prompt change — the
        // useMeasureItems reset-effect now re-measures the fresh collection
        // instead of wedging at zero rows — so a node can be added under
        // prompt 2. Amy is still available (only Cara was added).
        await roster.addNode('Amy Adams');

        const finalState = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(finalState?.nodes).toHaveLength(2);
        const byName = (name: string) =>
          finalState!.nodes.find(
            (n) => n[entityAttributesProperty][multiNameVarId] === name,
          )!;
        const caraFinal = byName('Cara Chen');
        const amy = byName('Amy Adams');

        // additionalAttributes are per-prompt: the prompt-1 node keeps
        // verified:true (written from prompt 1's additionalAttributes) while the
        // prompt-2 node never receives it — prompt 2 declares none.
        expect(caraFinal[entityAttributesProperty][multiVerifiedVarId]).toBe(
          true,
        );
        expect(
          amy[entityAttributesProperty][multiVerifiedVarId],
        ).not.toBe(true);

        // Each node is scoped to exactly its own prompt.
        expect(amy.promptIDs).toHaveLength(1);
        expect(caraFinal.promptIDs).not.toEqual(amy.promptIDs);
      },
    },

    {
      id: 'roster-remove-node-round-trip',
      covers: ['remove-node-round-trip'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Remove round trip',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'jsonRoster',
        });
        stage.addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page, interview, protocol }) => {
        const roster = new NameGeneratorRosterFixture(page);

        await roster.addNode('Cara Chen');

        // Pick the added node up and hover the source panel WITHOUT dropping so
        // the "Drop here to remove" overlay can be caught mid-drag.
        await roster.beginRemoveDrag('Cara Chen');
        await expect(roster.dropOverlay).toBeVisible();

        // Complete the drop: the node is removed from the network and its card
        // reappears in the source listbox under its original label.
        await roster.dropInFlight();
        await expect(roster.getRosterNode('Cara Chen')).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        expect(state?.nodes).toEqual([]);
      },
    },

    {
      id: 'roster-encrypted-variable-passphrase-gate',
      covers: ['encrypted-variable-passphrase-gate'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        // Redeclaring the auto-seeded "name" variable with encrypted:true
        // mutates its existing codebook entry (addVariableToNodeType dedupe).
        personType.addVariable({
          name: 'name',
          type: 'text',
          encrypted: true,
        });
        synth.setExperiments({ encryptedVariables: true });

        synth.addAsset({
          id: 'jsonRoster',
          name: 'JSON Roster',
          type: 'network',
          source: 'roster-small.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Encrypted names',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'jsonRoster',
        });
        stage.addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [rosterSmallAsset('jsonRoster')],
      run: async ({ page }) => {
        const roster = new NameGeneratorRosterFixture(page);
        const firstOption = roster.sourceListbox.getByRole('option').first();

        // The encrypted "name" variable gates the roster: every card is
        // disabled until a passphrase is provided
        // (NameGeneratorRoster.tsx:254-267, `!passphrase && useEncryption`).
        await expect(firstOption).toHaveAttribute('aria-disabled', 'true');

        // The 🔑 prompter opens a dialog to collect the passphrase.
        const lockButton = page.getByRole('button').filter({ hasText: '🔑' });
        await expect(lockButton).toBeVisible();
        await lockButton.click();

        await page
          .getByRole('textbox', { name: 'Passphrase' })
          .fill('correct horse battery staple');
        await page.getByRole('button', { name: 'Submit passphrase' }).click();

        // The passphrase is accepted: the prompter (🔑) is dismissed.
        await expect(lockButton).toBeHidden();

        // With a valid passphrase the roster cards re-enable: the disabledKeys
        // fix in useSelectionState clears the stale disabled Set once
        // NameGeneratorRoster stops gating (it passes an empty disabledKeys
        // rather than leaving a populated one behind). An encrypted node can
        // then be added, and its name round-trips through decryption to the
        // Added list under the original label.
        await expect(firstOption).not.toHaveAttribute('aria-disabled', 'true');
        await roster.addNode('Cara Chen');
        await expect(roster.getAddedNode('Cara Chen')).toBeVisible();
      },
    },

    {
      id: 'roster-label-fallback-heuristic',
      covers: ['label-fallback-heuristic'],
      build: () => {
        const synth = new SyntheticInterview();
        // addNodeType seeds a "name" variable, but the roster rows below are
        // keyed under codebook-absent UUIDs, so the "name" heuristic cannot
        // match and the fallback (first usable value, then placeholder) runs.
        const personType = synth.addNodeType({ name: 'Person' });

        synth.addAsset({
          id: 'rosterUuidMismatch',
          name: 'UUID Mismatch Roster',
          type: 'network',
          source: 'roster-uuid-mismatch.json',
        });

        const stage = synth.addStage('NameGeneratorRoster', {
          label: 'Label fallback',
          subject: { entity: 'node', type: personType.id },
          dataSource: 'rosterUuidMismatch',
        });
        stage.addPrompt({ text: 'Please add anyone you recognise.' });

        return synth;
      },
      assets: [
        {
          assetId: 'rosterUuidMismatch',
          name: 'UUID Mismatch Roster',
          type: 'network',
          source: 'roster-uuid-mismatch.json',
          localPath: path.join(DATA_DIR, 'roster-uuid-mismatch.json'),
        },
      ],
      run: async ({ page }) => {
        const roster = new NameGeneratorRosterFixture(page);

        await expect(roster.sourceListbox.getByRole('option')).toHaveCount(3);

        // First-usable-value heuristic surfaces the names even though their
        // attribute keys are absent from the codebook...
        const labels = await roster.sourceLabels();
        expect(labels).toContain('Alice Smith');
        expect(labels).toContain('Bob Jones');
        // ...and the value-less row falls back to a stable placeholder rather
        // than exposing its content-hash _uid.
        expect(labels).toContain('Unnamed Person 3');
      },
    },
  ],
};
