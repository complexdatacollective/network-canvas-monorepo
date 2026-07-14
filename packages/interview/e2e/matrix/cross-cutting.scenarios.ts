import type { FilterOperator } from '@codaco/protocol-validation';
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

// --- skip-logic behaviour -----------------------------------------------------
//
// Skip logic and stage filters are engine-level: the Shell decides whether to
// render a stage from its `skipLogic`, and shared selectors apply a stage
// `filter` to the network before the interface renders. These scenarios prove
// the mechanism against Information stages (trivial to skip/show) and every
// Filter operator, then the per-interface wiring block proves each interface
// stage honours the same machinery — backing the `<Interface>:skipLogic` /
// `<Interface>:filter` shared claims with real coverage rather than blanket
// declarations.
//
// `skipLogic` is set through `addInformationStage({ skipLogic })` and, for the
// wiring block, through the stage handle's mutable `stageEntry.skipLogic` /
// `stageEntry.filter` (the builder stores the entry it returns, so post-hoc
// mutation flows into `getInterviewPayload`).

const CAT_OPTIONS = [
  { label: 'A', value: 'a' },
  { label: 'B', value: 'b' },
  { label: 'C', value: 'c' },
];

type OperatorCase = {
  op: FilterOperator;
  /** attribute variable type; omitted = type-level EXISTS/NOT_EXISTS (no attribute) */
  varType?: 'number' | 'text' | 'categorical';
  /** whether to seed a node (false only for NOT_EXISTS: the empty network matches) */
  seedNode: boolean;
  /** explicit attribute value seeded on the node (never left unset — getNetwork
   * randomises unset attributes on manual nodes, which would break the operator) */
  seedValue?: unknown;
  /** filter rule value; omitted for EXISTS/NOT_EXISTS */
  filterValue?: string | number;
};

// One case per Filter operator, each chosen so the operator evaluates TRUE
// against the seeded node — action SKIP then skips the target stage.
const OPERATOR_CASES: readonly OperatorCase[] = [
  { op: 'EXISTS', seedNode: true },
  { op: 'NOT_EXISTS', seedNode: false },
  { op: 'EXACTLY', varType: 'number', seedNode: true, seedValue: 5, filterValue: 5 },
  { op: 'NOT', varType: 'number', seedNode: true, seedValue: 3, filterValue: 5 },
  { op: 'GREATER_THAN', varType: 'number', seedNode: true, seedValue: 10, filterValue: 5 },
  { op: 'GREATER_THAN_OR_EQUAL', varType: 'number', seedNode: true, seedValue: 5, filterValue: 5 },
  { op: 'LESS_THAN', varType: 'number', seedNode: true, seedValue: 3, filterValue: 5 },
  { op: 'LESS_THAN_OR_EQUAL', varType: 'number', seedNode: true, seedValue: 5, filterValue: 5 },
  { op: 'INCLUDES', varType: 'categorical', seedNode: true, seedValue: ['a', 'b'], filterValue: 'a' },
  { op: 'EXCLUDES', varType: 'categorical', seedNode: true, seedValue: ['a'], filterValue: 'b' },
  { op: 'OPTIONS_GREATER_THAN', varType: 'categorical', seedNode: true, seedValue: ['a', 'b', 'c'], filterValue: 2 },
  { op: 'OPTIONS_LESS_THAN', varType: 'categorical', seedNode: true, seedValue: ['a'], filterValue: 2 },
  { op: 'OPTIONS_EQUALS', varType: 'categorical', seedNode: true, seedValue: ['a', 'b'], filterValue: 2 },
  { op: 'OPTIONS_NOT_EQUALS', varType: 'categorical', seedNode: true, seedValue: ['a'], filterValue: 2 },
  { op: 'CONTAINS', varType: 'text', seedNode: true, seedValue: 'hello world', filterValue: 'world' },
  { op: 'DOES_NOT_CONTAIN', varType: 'text', seedNode: true, seedValue: 'hello', filterValue: 'xyz' },
];

function kebab(s: string): string {
  return s.toLowerCase().replace(/_/g, '-');
}

/**
 * Fresh interview whose middle Information stage carries `skipLogic` built from
 * an operator case. Stage 0 (intro) → Stage 1 (target, skipped when the filter
 * matches) → Stage 2 (terminal). A matching node is seeded so the operator is
 * TRUE, so `next()` from stage 0 skips stage 1 and lands on stage 2.
 */
function buildOperatorInterview(tc: OperatorCase): SyntheticInterview {
  const synth = new SyntheticInterview();
  const nodeType = synth.addNodeType({ name: 'Person' });
  let attributeId: string | undefined;
  if (tc.varType) {
    const variable = nodeType.addVariable({
      name: 'probe',
      type: tc.varType,
      ...(tc.varType === 'categorical' ? { options: CAT_OPTIONS } : {}),
    });
    attributeId = variable.id;
  }

  const intro = synth.addInformationStage({ title: 'Start', text: 'Begin.' });
  synth.addInformationStage({
    title: 'Target',
    text: 'This stage is skipped when the operator matches.',
    skipLogic: {
      action: 'SKIP',
      filter: {
        join: 'OR',
        rules: [
          {
            id: 'probe-rule',
            type: 'node',
            options: {
              type: nodeType.id,
              ...(attributeId ? { attribute: attributeId } : {}),
              operator: tc.op,
              ...(tc.filterValue !== undefined ? { value: tc.filterValue } : {}),
            },
          },
        ],
      },
    },
  });
  synth.addInformationStage({ title: 'End', text: 'You reached the end.' });

  if (tc.seedNode) {
    synth.addManualNode(
      intro.id,
      nodeType.id,
      'probe-node',
      attributeId ? { [attributeId]: tc.seedValue } : {},
    );
  }
  return synth;
}

const operatorScenarios: ScenarioDefinition[] = OPERATOR_CASES.map((tc) => ({
  id: `skip-logic-operator-${kebab(tc.op)}`,
  covers: [],
  seedNetwork: true,
  build: () => buildOperatorInterview(tc),
  run: async ({ page, interview }) => {
    // Stage 1 (Target) is skipped when the operator matches, so advancing from
    // stage 0 lands on stage 2 (End), never rendering the Target heading. The
    // Information stage renders its `title` as the h1.
    await interview.next();
    await expect(page).toHaveURL(/step=2/);
    await expect(page.getByRole('heading', { name: 'End' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Target' }),
    ).toHaveCount(0);
  },
}));

// --- skip-logic action semantics ---------------------------------------------

const behaviourScenarios: ScenarioDefinition[] = [
  {
    id: 'skip-logic-skip-when-match',
    covers: [],
    smoke: true,
    seedNetwork: true,
    build: () => buildOperatorInterview({ op: 'EXISTS', seedNode: true }),
    run: async ({ page, interview }) => {
      // action:'SKIP' + a matching filter (a node EXISTS) hides the target
      // stage: next() from stage 0 lands on the terminal (step 2).
      await interview.next();
      await expect(page).toHaveURL(/step=2/);
    },
  },
  {
    id: 'skip-logic-show-when-match',
    covers: [],
    seedNetwork: true,
    build: () => {
      // action:'SHOW' renders the stage only when the filter matches. A node is
      // seeded, so the middle stage IS shown and next() lands on it (step 1).
      const synth = new SyntheticInterview();
      const nodeType = synth.addNodeType({ name: 'Person' });
      const intro = synth.addInformationStage({ title: 'Start', text: 'Begin.' });
      synth.addInformationStage({
        title: 'Conditional',
        text: 'Shown only when a node exists.',
        skipLogic: {
          action: 'SHOW',
          filter: {
            join: 'OR',
            rules: [
              {
                id: 'show-rule',
                type: 'node',
                options: { type: nodeType.id, operator: 'EXISTS' },
              },
            ],
          },
        },
      });
      synth.addInformationStage({ title: 'End', text: 'You reached the end.' });
      synth.addManualNode(intro.id, nodeType.id, 'show-node', {});
      return synth;
    },
    run: async ({ page, interview }) => {
      await interview.next();
      await expect(page).toHaveURL(/step=1/);
      await expect(
        page.getByRole('heading', { name: 'Conditional' }),
      ).toBeVisible();
    },
  },
];

// --- stage-level filter -------------------------------------------------------
//
// A stage `filter` narrows the network the stage renders WITHOUT mutating the
// stored network. Unlike skipLogic (a pure Shell decision), the interface must
// read the filtered node set — so this exercises the interface, not just the
// engine.

const filterScenarios: ScenarioDefinition[] = [
  {
    id: 'stage-filter-scopes-nodes',
    covers: [],
    seedNetwork: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const groupVar = personType.addVariable({
        type: 'categorical',
        name: 'group',
        options: CAT_OPTIONS,
      });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'sociogramLayout',
      });
      const stage = synth.addStage('Sociogram', {
        label: 'Filtered map',
        // Only group-A people reach this stage's view.
        filter: {
          join: 'OR',
          rules: [
            {
              id: 'group-a',
              type: 'node',
              options: {
                type: personType.id,
                attribute: groupVar.id,
                operator: 'INCLUDES',
                value: 'a',
              },
            },
          ],
        },
      });
      stage.addPrompt({
        text: 'Position each person.',
        layout: { layoutVariable: layoutVar.id },
      });
      const seed = (uid: string, name: string, group: string, x: number) => {
        synth.addManualNode(stage.id, personType.id, uid, {
          [nameVar.id]: name,
          [groupVar.id]: [group],
          [layoutVar.id]: { x, y: 0.5 },
        });
      };
      seed('a1', 'Ada', 'a', 0.2);
      seed('a2', 'Ari', 'a', 0.4);
      seed('b1', 'Ben', 'b', 0.6);
      seed('b2', 'Bea', 'b', 0.8);
      return synth;
    },
    run: async ({ page, interview, protocol }) => {
      const sociogram = page.getByTestId('sociogram');
      // Only the two group-A nodes pass the stage filter and render on canvas.
      await expect(
        sociogram.locator(
          '[data-zone-id="sociogram-canvas"] button[aria-label]',
        ),
      ).toHaveCount(2);
      // The filter is a view, not a mutation: the stored network still has all 4.
      const state = await protocol.getNetworkState(interview.interviewId);
      expect(state?.nodes).toHaveLength(4);
    },
  },
];

export const crossCuttingScenarios: InterfaceScenarios = {
  interfaceType: 'CrossCutting',
  scenarios: [...behaviourScenarios, ...operatorScenarios, ...filterScenarios],
};
