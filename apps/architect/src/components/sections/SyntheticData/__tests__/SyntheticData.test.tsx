import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import {
  DEFAULT_PANEL_NOMINATION_PROBABILITY,
  DEFAULT_RESPONSE_BURDEN,
  defaultNodeCount,
  MAX_SYNTHETIC_POPULATION,
  stageSchema,
  type StageType,
} from '@codaco/protocol-validation';
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';
import { setActiveProtocolScope } from '~/utils/activeProtocolScope';

import { DISTRIBUTION_DESCRIPTIONS, PARAMETER_HINTS } from '../distributions';
import {
  ATTRIBUTES_HEADING,
  PANELS_HEADING,
  PARAMETERS_COUNT_AND_TOPOLOGY,
  PARAMETERS_COUNT_ONLY,
  PARAMETERS_NO_DATA,
  PARAMETERS_TOPOLOGY_ONLY,
  PARAMETERS_VALUES_ONLY,
  SECTION_PURPOSE,
} from '../sectionCopy';
import SyntheticData from '../SyntheticData';

/**
 * The stage editor's Synthetic data section, over the real stage form and the
 * real schema.
 *
 * What is asserted here is the contract the spec names: one collapsed line
 * carrying the RESOLVED parameters, a reset that removes the key and renders
 * exactly while it is there, controls that exist only where the stage's own
 * descriptor admits them, a window no entry can leave — and, from revision 2,
 * the intro prose, the per-panel nomination odds, and the in-situ sub-editor
 * for the attributes the stage writes.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'Name', type: 'text', component: 'Text' },
        layout: { name: 'Layout', type: 'layout' },
      },
    },
  },
  edge: { friend: { name: 'Friend', color: 'edge-color-seq-1' } },
  ego: { variables: {} },
};

/**
 * The same codebook with a `unique` slot too small for the people the stage
 * can create — two values for up to a hundred nodes — which is one of the
 * three things the engine's pre-seed gate refuses.
 */
const infeasibleCodebook = {
  ...codebook,
  node: {
    person: {
      ...codebook.node.person,
      variables: {
        ...codebook.node.person.variables,
        name: {
          name: 'Name',
          type: 'boolean',
          component: 'Toggle',
          validation: { unique: true },
        },
      },
    },
  },
};

const NAME_GENERATOR = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name some people',
  subject: { entity: 'node', type: 'person' },
  form: { title: 'Add person', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
};

const SOCIOGRAM = {
  id: 'stage-2',
  type: 'Sociogram',
  label: 'Position people',
  subject: { entity: 'node', type: 'person' },
  background: { concentricCircles: 4, skewedTowardCenter: true },
  prompts: [
    {
      id: 'prompt-1',
      text: 'Position them',
      layout: { layoutVariable: 'layout' },
      edges: { display: ['friend'] },
    },
  ],
};

const INFORMATION = {
  id: 'stage-3',
  type: 'Information',
  label: 'Read this',
  title: 'Welcome',
  items: [],
};

const NETWORK_COMPOSER = {
  id: 'stage-4',
  type: 'NetworkComposer',
  label: 'Build the network',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layout',
  edges: [{ subject: { entity: 'edge', type: 'friend' } }],
};

/**
 * A roster stage whose own floor its pool cannot reach: one of the two
 * refusals the engine lays at a single STAGE's door (the other is the pair
 * ceiling). Nothing resolves `roster-asset` in this environment, which is the
 * host reporting a source it could not resolve — an empty pool under the
 * engine's three-way contract, and a floor of three that no seed can meet.
 */
const ROSTER = {
  id: 'stage-1',
  type: 'NameGeneratorRoster',
  label: 'Pick from the roster',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'roster-asset',
  behaviours: { minNodes: 3 },
  prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
};

/**
 * A name generator with one existing-network panel, which is the only stage
 * shape that reaches the per-panel nomination odds (spec revision 2, item 5).
 */
const NAME_GENERATOR_WITH_PANEL = {
  ...NAME_GENERATOR,
  panels: [
    {
      id: 'panel-1',
      title: 'People you named',
      dataSource: 'existing',
    } as Record<string, unknown>,
  ],
};

/**
 * A codebook whose person type carries an ordinal attribute with options — the
 * shape the bin stage below binds, and the one whose sub-editor draws an option
 * weight column.
 */
const binCodebook = {
  ...codebook,
  node: {
    person: {
      ...codebook.node.person,
      variables: {
        ...codebook.node.person.variables,
        closeness: {
          name: 'Closeness',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Close', value: 'close' },
            { label: 'Distant', value: 'distant' },
          ],
        },
      },
    },
  },
};

/**
 * A bin stage, whose prompt BINDS the attribute above. Its parameters are
 * values-only at the stage level; the attribute it assigns is what a
 * researcher came here to shape.
 */
const ORDINAL_BIN = {
  id: 'stage-5',
  type: 'OrdinalBin',
  label: 'How close?',
  subject: { entity: 'node', type: 'person' },
  prompts: [
    {
      id: 'prompt-1',
      text: 'How close are they?',
      variable: 'closeness',
      color: 'ord-color-seq-1',
      bucketSortOrder: [],
      binSortOrder: [],
    },
  ],
};

/** Declared so the draft PARSES; still nothing resolves it. */
const ROSTER_MANIFEST = {
  'roster-asset': {
    id: 'roster-asset',
    type: 'network',
    name: 'roster.csv',
    source: 'roster.csv',
  },
};

/**
 * Stands in for the sections beside this one, each of which registers the keys
 * it edits.
 *
 * The section reads its stage from the form's own values — which is what makes
 * a key the researcher removed actually disappear — so a harness that
 * registered nothing would be handing it a stage with no subject, no prompts
 * and no behaviours, and testing a shape no editor ever holds.
 */
/** The leaves `NodePanels`/`NodePanel` register for every panel slot. */
const PANEL_LEAVES = ['id', 'title', 'dataSource', 'filter', 'synthetic'];

const StageFields = ({ stage }: { stage: Record<string, unknown> }) => (
  <>
    {Object.entries(stage)
      // The identity belongs to no field, and the block below is this
      // section's own to register.
      .filter(([key]) => !['id', 'type', 'synthetic'].includes(key))
      .flatMap(([key, value]) => {
        // Panels are registered LEAF BY LEAF in the real editor — `NodePanels`
        // owns `panels[N].id`/`.synthetic`, `NodePanel` the rest — because a
        // container registration would race them. A single `panels` field here
        // would let a write to `panels[0].synthetic` land somewhere no editor
        // ever puts it.
        if (key === 'panels' && Array.isArray(value)) {
          return value.flatMap((panel: Record<string, unknown>, index) =>
            // The fixed leaf set `writePanelAt` reads and writes, registered
            // whether or not the fixture states it — `synthetic` above all,
            // since `getFormValues()` reports registered fields only and a
            // write to an unregistered name parks somewhere the save cannot
            // see. That is exactly why `NodePanels` registers it eagerly.
            PANEL_LEAVES.map((leaf) => (
              <HiddenFieldValue
                key={`panels[${index}].${leaf}`}
                name={`panels[${index}].${leaf}`}
                initialValue={panel[leaf] as FieldValue}
              />
            )),
          );
        }
        return [
          <HiddenFieldValue
            key={key}
            name={key}
            initialValue={value as FieldValue}
          />,
        ];
      })}
  </>
);

const setup = (
  stage: Record<string, unknown>,
  protocolCodebook: unknown = codebook,
  assetManifest: unknown = {},
) => {
  const committedStage = asStage(stage);

  return renderStageForm({
    committedStage,
    extraReducers: {
      activeProtocol: () => ({
        present: {
          name: 'Test protocol',
          schemaVersion: 8,
          codebook: protocolCodebook,
          assetManifest,
          stages: [committedStage],
        },
      }),
    },
    children: (
      <>
        <StageFields stage={stage} />
        <SyntheticData
          stagePath="stages[0]"
          stagePosition={0}
          interfaceType={stage.type as StageType}
        />
      </>
    ),
  });
};

/**
 * The STAGE's disclosure row.
 *
 * Named rather than "the one button with aria-expanded": the section also
 * hosts a disclosure per attribute the stage writes (spec revision 2, item 4),
 * each titled by its attribute, so the stage's own row is the one that carries
 * the section title.
 */
const disclosure = () =>
  screen.getByRole('button', { name: /^Synthetic data/ });

/** The disclosure of the sub-editor for one attribute this stage writes. */
const variableDisclosure = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

const expand = () => fireEvent.click(disclosure());

const syntheticValue = (getFormValues: () => Record<string, unknown>) =>
  getFormValues().synthetic as Record<string, unknown> | undefined;

describe('the collapsed row', () => {
  it('summarises the resolved count and burden of an unauthored name generator', () => {
    setup(NAME_GENERATOR);

    const row = disclosure();
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveTextContent('Nodes: normal(mean 8, sd 3)');
    expect(row).toHaveTextContent(
      `Burden: ${DEFAULT_RESPONSE_BURDEN.NameGenerator}`,
    );
    // No authored/default badge anywhere (spec revision 2, item 3).
    expect(within(row).queryByText('Default')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Reset to default/i }),
    ).not.toBeInTheDocument();
  });

  it('summarises the resolved topology of an unauthored edge stage', () => {
    setup({
      ...SOCIOGRAM,
      prompts: [
        {
          id: 'prompt-1',
          text: 'Link them',
          layout: { layoutVariable: 'layout' },
          edges: { create: 'friend' },
        },
      ],
    });

    expect(disclosure()).toHaveTextContent(
      'Edges: mean degree normal(mean 3, sd 1)',
    );
  });

  it('says a non-generating stage creates nothing, and prices it anyway', () => {
    setup(INFORMATION);

    const row = disclosure();
    expect(row).toHaveTextContent('Creates no data');
    expect(row).toHaveTextContent(
      `Burden: ${DEFAULT_RESPONSE_BURDEN.Information}`,
    );
  });

  it('does not carry a summary the schema never resolved', () => {
    // The negative half of the two above: a values-only stage has neither a
    // count nor a topology, and the row must not invent one.
    setup(INFORMATION);

    expect(disclosure()).not.toHaveTextContent('Nodes:');
    expect(disclosure()).not.toHaveTextContent('Edges:');
  });
});

describe('which controls a stage type gets', () => {
  it('gives a node-creating stage a count editor and a burden field', () => {
    setup(NAME_GENERATOR);
    expand();

    expect(screen.getByLabelText('Response burden')).toBeInTheDocument();
    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(screen.queryByText('Topology measure')).not.toBeInTheDocument();
  });

  it('gives a values-only stage the burden field alone', () => {
    setup(INFORMATION);
    expand();

    expect(screen.getByLabelText('Response burden')).toBeInTheDocument();
    expect(screen.queryByText('Distribution')).not.toBeInTheDocument();
    expect(screen.queryByText('Topology measure')).not.toBeInTheDocument();
  });

  it('gives the composer both a count and a topology', () => {
    setup(NETWORK_COMPOSER);
    expand();

    expect(screen.getByText('Topology measure')).toBeInTheDocument();
    expect(screen.getAllByText('Distribution')).toHaveLength(2);
  });
});

describe('the sociogram edge-prompt gate', () => {
  it('hides the topology editor while no prompt creates an edge, and says so', () => {
    setup(SOCIOGRAM);

    expect(disclosure()).toHaveTextContent('Edges: none created by this stage');
    expand();
    expect(screen.queryByText('Topology measure')).not.toBeInTheDocument();
    expect(screen.getByText('This stage creates no edges')).toBeInTheDocument();
  });

  it('reveals it once a prompt does', () => {
    setup({
      ...SOCIOGRAM,
      prompts: [
        {
          id: 'prompt-1',
          text: 'Link them',
          layout: { layoutVariable: 'layout' },
          edges: { create: 'friend' },
        },
      ],
    });
    expand();

    expect(screen.getByText('Topology measure')).toBeInTheDocument();
    expect(
      screen.queryByText('This stage creates no edges'),
    ).not.toBeInTheDocument();
  });
});

describe('authoring and reset', () => {
  it('starts with no key in the form values', () => {
    const { getFormValues } = setup(SOCIOGRAM);

    expect(syntheticValue(getFormValues)).toBeUndefined();
  });

  it('returns the burden alone to its default, keeping what else was authored', () => {
    // The section's reset removes the whole block, so a researcher who wanted
    // the default burden back would have lost the count they authored beside
    // it. Clearing the box removes that one key; the box then shows what a run
    // would use, which is the schema's own default.
    const { getFormValues } = setup({
      ...NAME_GENERATOR,
      synthetic: {
        count: { distribution: 'constant', value: 4 },
        responseBurden: 3,
      },
    });
    expand();

    const burden = screen.getByLabelText('Response burden');
    fireEvent.change(burden, { target: { value: '' } });
    fireEvent.blur(burden);

    expect(syntheticValue(getFormValues)).toEqual({
      count: { distribution: 'constant', value: 4 },
    });
    expect(burden).toHaveValue(
      DEFAULT_RESPONSE_BURDEN.NameGenerator as unknown as number,
    );
  });

  it('writes only the burden where the descriptor accepts a burden alone', () => {
    const { getFormValues } = setup(SOCIOGRAM);
    expand();

    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '1.5' },
    });

    expect(syntheticValue(getFormValues)).toEqual({ responseBurden: 1.5 });
    // Authoring earns the reset affordance, which is the only thing left that
    // says the block is authored (spec revision 2, item 3).
    expect(
      screen.getByRole('button', { name: /Reset to default/i }),
    ).toBeInTheDocument();
    expect(disclosure()).toHaveTextContent('Burden: 1.5');
  });

  it('writes the count its descriptor requires alongside the burden', () => {
    const { getFormValues } = setup(NAME_GENERATOR);
    expand();

    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '0.9' },
    });

    expect(syntheticValue(getFormValues)).toEqual({
      responseBurden: 0.9,
      count: {
        distribution: 'normal',
        mean: 8,
        sd: 3,
        min: 0,
        max: MAX_SYNTHETIC_POPULATION,
      },
    });
  });

  it('removes the key entirely on reset', () => {
    const { getFormValues } = setup(SOCIOGRAM);
    expand();
    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '1.5' },
    });
    expect(syntheticValue(getFormValues)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Reset to default/i }));

    expect(syntheticValue(getFormValues)).toBeUndefined();
    expect(
      screen.queryByRole('button', { name: /Reset to default/i }),
    ).not.toBeInTheDocument();
    expect(disclosure()).toHaveTextContent(
      `Burden: ${DEFAULT_RESPONSE_BURDEN.Sociogram}`,
    );
  });

  it('offers to reset a committed block without touching it', () => {
    const { getFormValues } = setup({
      ...SOCIOGRAM,
      synthetic: { responseBurden: 2 },
    });

    expect(
      screen.getByRole('button', { name: /Reset to default/i }),
    ).toBeInTheDocument();
    expect(syntheticValue(getFormValues)).toEqual({ responseBurden: 2 });
  });
});

describe('a change the schema refuses', () => {
  const OVER_CAPPED = {
    ...NAME_GENERATOR,
    behaviours: { maxNodes: 3 },
    // A hand-authored protocol can carry a count its own stage cannot hold;
    // the editor's controls cannot produce one, which is what makes this the
    // case worth covering.
    synthetic: {
      responseBurden: 0.5,
      count: { distribution: 'constant', value: 20 },
    },
  };

  it('shows the schema’s refusal and writes nothing', () => {
    const { getFormValues } = setup(OVER_CAPPED);
    expand();

    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '0.8' },
    });

    // The schema's own sentence, not a paraphrase of it.
    expect(
      screen.getByText(/behaviours\.maxNodes caps this stage at 3/),
    ).toBeInTheDocument();
    // The block is left exactly as committed: a refused candidate is not a
    // partial write.
    expect(syntheticValue(getFormValues)).toEqual(OVER_CAPPED.synthetic);
  });

  it('clears the refusal once a change is accepted', () => {
    const { getFormValues } = setup(OVER_CAPPED);
    expand();
    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '0.8' },
    });

    // Bringing the count inside the window is a change the schema takes.
    fireEvent.change(screen.getByLabelText('Value'), {
      target: { value: '2' },
    });

    expect(
      screen.queryByText(/behaviours\.maxNodes caps this stage at 3/),
    ).not.toBeInTheDocument();
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { distribution: 'constant', value: 2 },
    });
  });
});

describe('an alter limit narrowed under an authored count', () => {
  const AUTHORED_COUNT = {
    ...NAME_GENERATOR,
    behaviours: { maxNodes: 10 },
    synthetic: { count: { distribution: 'uniform', min: 0, max: 10 } },
  };

  /**
   * What the SCHEMA says about this stage — computed here rather than written
   * down, so the assertion cannot pass against a paraphrase of it.
   */
  const schemaRefusalFor = (stage: Record<string, unknown>): string => {
    const result = stageSchema.safeParse(stage);
    if (result.success) {
      throw new Error('expected the schema to refuse this stage');
    }
    const issue = result.error.issues.find(
      (candidate) => candidate.path[0] === 'synthetic',
    );
    if (!issue) {
      throw new Error('expected a refusal about the synthetic block');
    }
    return issue.message;
  };

  const narrowMaxNodes = (view: ReturnType<typeof setup>, maxNodes: number) => {
    act(() => {
      view.getStoreApi().getState().setFieldValue('behaviours', { maxNodes });
    });
  };

  it('shows the schema’s own refusal against the count, unprompted', () => {
    const view = setup(AUTHORED_COUNT);
    expand();
    // Nothing wrong yet: the authored count fits the limit it was written
    // under, so the section is quiet.
    const expected = schemaRefusalFor({
      ...AUTHORED_COUNT,
      behaviours: { maxNodes: 5 },
    });
    expect(screen.queryByText(expected)).not.toBeInTheDocument();

    narrowMaxNodes(view, 5);

    // Inside the count's own fieldset — the refusal is about the count as a
    // whole, which no single parameter field can carry.
    expect(
      within(
        screen.getByRole('group', { name: 'Number of nodes created' }),
      ).getByText(expected),
    ).toBeInTheDocument();
  });

  it('blocks the save while the stage stands refused', async () => {
    const view = setup(AUTHORED_COUNT);
    // Before: the same stage validates, so the assertion below is about the
    // narrowing rather than about a form that never validated.
    expect(await view.getStoreApi().getState().validateForm()).toBe(true);

    narrowMaxNodes(view, 5);

    expect(await view.getStoreApi().getState().validateForm()).toBe(false);
    expect(view.getStoreApi().getState().getFieldErrors('synthetic')).toContain(
      schemaRefusalFor({ ...AUTHORED_COUNT, behaviours: { maxNodes: 5 } }),
    );
  });

  it('lets the save through once the count is brought back inside', async () => {
    const view = setup(AUTHORED_COUNT);
    expand();
    narrowMaxNodes(view, 5);
    expect(await view.getStoreApi().getState().validateForm()).toBe(false);

    fireEvent.change(screen.getByLabelText('Maximum'), {
      target: { value: '5' },
    });

    expect(await view.getStoreApi().getState().validateForm()).toBe(true);
  });
});

describe('live feasibility', () => {
  // The pools a roster stage draws from are namespaced by protocol, and the
  // hook resolves none at all without a scope — which the engine reads as a
  // host that never looked, and refuses nothing on.
  beforeEach(() => setActiveProtocolScope('test-protocol'));
  afterEach(() => setActiveProtocolScope(null));

  it('shows the engine’s own refusal, unparaphrased, without expanding', async () => {
    setup(ROSTER, codebook, ROSTER_MANIFEST);

    // The analysis is debounced and asynchronous, so the verdict arrives after
    // the first render — which is the point of running it off the draft.
    const refusal = await screen.findByText(
      /must nominate at least 3 from its roster/,
      undefined,
      { timeout: 5000 },
    );

    expect(refusal).toBeInTheDocument();
    // Above the disclosure, so a collapsed section still shows it.
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * A settled verdict, WITNESSED rather than waited for.
   *
   * The two tests below assert that something is absent, and an absence proves
   * nothing while the analysis might still be running — or might never have
   * run at all. A delay followed by negative queries passes just as happily
   * against a hook that never fires. The announcer publishes every verdict
   * into the page's live region, so waiting for the sentence THIS verdict
   * produces is what makes the absence beneath it mean something: the analysis
   * reached a verdict, it is the verdict expected, and the stage still showed
   * nothing.
   */
  const settledVerdict = (announcement: string) =>
    screen.findByText(announcement, undefined, { timeout: 5000 });

  it('leaves a refusal no stage owns to the protocol-level verdict', async () => {
    // A `unique` slot too small for the people the protocol can create is the
    // sum of every stage that draws it, so no stage editor is the place to
    // fix it — the Codebook's verdict lists it instead. Showing it here would
    // put the same refusal on every stage that writes the type.
    setup(NAME_GENERATOR, infeasibleCodebook);

    // The analysis ran and found the conflict; the engine's own reading of
    // this fixture is pinned by `Synthetic/__tests__/conflicts.test.ts`.
    expect(
      await settledVerdict(
        'Synthetic data cannot be generated. 1 conflict was found.',
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(/only 2 distinct values are possible/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Synthetic data cannot be generated for this stage'),
    ).not.toBeInTheDocument();
  });

  it('shows nothing while the protocol is feasible', async () => {
    setup(NAME_GENERATOR);

    expect(
      await settledVerdict(
        'Synthetic data can be generated for this protocol.',
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText('Synthetic data cannot be generated for this stage'),
    ).not.toBeInTheDocument();
  });
});

describe('windows the schema owns', () => {
  /**
   * Each field is held to the window ITS OWN schema states, which is not one
   * window per editor: a count's `value` and truncation bounds are whole
   * numbers inside the population ceiling (`populationInt`), while its `mean`
   * is a plain number bounded only above. One blanket claim about "the count
   * field" made `normal(mean 5.5, sd 2.5)` — a count the schema accepts —
   * untypeable, and floored a mean the schema leaves open below.
   */
  it('holds a count’s own value to the stage’s window, in whole people', () => {
    const { getFormValues } = setup({
      ...NAME_GENERATOR,
      behaviours: { minNodes: 1, maxNodes: 6 },
      synthetic: { count: { distribution: 'constant', value: 2 } },
    });
    expand();

    const value = screen.getByLabelText('Value');
    expect(value).toHaveAttribute('max', '6');
    expect(value).toHaveAttribute('min', '1');
    expect(value).toHaveAttribute('step', '1');

    fireEvent.change(value, { target: { value: '40' } });

    // Refused rather than clamped. Clamping would write 6 — a number the
    // researcher did not type — and leave the box agreeing with it, so the
    // substitution would be invisible. The entry stays on screen instead, and
    // nothing is written until it is one the window admits.
    expect(value).toHaveValue(40);
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { value: 2 },
    });

    fireEvent.change(value, { target: { value: '2.5' } });
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { value: 2 },
    });

    fireEvent.change(value, { target: { value: '5' } });
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { value: 5 },
    });
  });

  it('accepts the fractional mean and spread a normal count admits', () => {
    const { getFormValues } = setup(NAME_GENERATOR);
    expand();

    const mean = screen.getByLabelText('Mean');
    expect(mean).toHaveAttribute('step', 'any');

    fireEvent.change(mean, { target: { value: '5.5' } });
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { mean: 5.5 },
    });

    fireEvent.change(screen.getByLabelText('Standard deviation'), {
      target: { value: '2.5' },
    });
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { mean: 5.5, sd: 2.5 },
    });
  });

  it('lets a mean go below zero, where the count schema does', () => {
    // "Usually none, occasionally a few" is a sanctioned declaration: the
    // schema bounds a normal count's mean above and not below, and the floor
    // belongs to the truncation bounds instead.
    const { getFormValues } = setup(NAME_GENERATOR);
    expand();

    const mean = screen.getByLabelText('Mean');
    expect(mean).not.toHaveAttribute('min');

    fireEvent.change(mean, { target: { value: '-2' } });

    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { mean: -2 },
    });
  });

  it('surfaces the schema’s own refusal for a mean the stage cannot hold', () => {
    // Field-local windows come from the field's schema; a rule relating the
    // mean to the stage's window is a CROSS-field rule, and is caught by
    // asking the schema and rendering what it said (spec rule 3).
    const { getFormValues } = setup({
      ...NAME_GENERATOR,
      behaviours: { minNodes: 1, maxNodes: 6 },
    });
    expand();

    fireEvent.change(screen.getByLabelText('Mean'), {
      target: { value: '40' },
    });

    expect(
      screen.getByText(/A mean of 40 lies above the 6 nodes/),
    ).toBeInTheDocument();
    expect(syntheticValue(getFormValues)).toBeUndefined();
  });

  it('refuses a fraction on the bounds a uniform count counts people with', () => {
    const { getFormValues } = setup({
      ...NAME_GENERATOR,
      synthetic: { count: { distribution: 'uniform', min: 2, max: 6 } },
    });
    expand();

    const minimum = screen.getByLabelText('Minimum');
    expect(minimum).toHaveAttribute('step', '1');

    fireEvent.change(minimum, { target: { value: '2.5' } });

    // Refused rather than rounded: 3 is not what was typed. The entry stays
    // visible, and blur restores the value that was.
    expect(minimum).toHaveValue(2.5);
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { min: 2, max: 6 },
    });

    fireEvent.blur(minimum);
    expect(minimum).toHaveValue(2);
  });

  it('accepts a fractional burden, which is a rate rather than a count', () => {
    const { getFormValues } = setup(INFORMATION);
    expand();

    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '0.35' },
    });

    expect(syntheticValue(getFormValues)).toEqual({
      generatesData: false,
      responseBurden: 0.35,
    });
  });
});

describe('the families a field offers', () => {
  const familyOptions = (group: HTMLElement) => {
    fireEvent.click(
      within(group).getByRole('combobox', { name: 'Distribution' }),
    );
    const options = screen
      .getAllByRole('option')
      .map((option) => option.textContent);
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    return options;
  };

  it('offers a count only the families a count admits', () => {
    setup(NAME_GENERATOR);
    expand();

    const offered = familyOptions(
      screen.getByRole('group', { name: 'Number of nodes created' }),
    );

    expect(offered).toEqual(['Constant', 'Uniform', 'Poisson', 'Normal']);
    // Neither is in the count union, and choosing one produced a refusal that
    // rendered nowhere.
    expect(offered).not.toContain('Beta');
    expect(offered).not.toContain('Log-normal');
  });

  it('offers a mean-degree topology no beta', () => {
    setup({
      ...SOCIOGRAM,
      prompts: [
        {
          id: 'prompt-1',
          text: 'Link them',
          layout: { layoutVariable: 'layout' },
          edges: { create: 'friend' },
        },
      ],
    });
    expand();

    const offered = familyOptions(
      screen.getAllByRole('group', { name: 'Edge topology' })[0]!,
    );

    expect(offered).toEqual(['Constant', 'Uniform', 'Normal']);
  });
});

describe('a composer’s two halves', () => {
  const countGroup = () =>
    screen.getByRole('group', { name: 'Number of nodes created' });
  const topologyGroup = () =>
    screen.getAllByRole('group', { name: 'Edge topology' })[0]!;

  it('writes both halves when only the topology was edited, and keeps offering both', () => {
    // A block naming only a topology parses — and creates no nodes at all.
    const { getFormValues } = setup(NETWORK_COMPOSER);
    expand();

    fireEvent.change(within(topologyGroup()).getByLabelText('Mean'), {
      target: { value: '2' },
    });

    const written = syntheticValue(getFormValues);
    expect(written).toHaveProperty('topology');
    expect(written).toHaveProperty('count');
    // And the editor still offers the half that was not touched, rather than
    // the row disappearing with no way back to it short of a full reset.
    expect(countGroup()).toBeInTheDocument();
    expect(disclosure()).toHaveTextContent('Nodes:');
  });

  it('writes both halves when only the count was edited', () => {
    const { getFormValues } = setup(NETWORK_COMPOSER);
    expand();

    fireEvent.change(within(countGroup()).getByLabelText('Mean'), {
      target: { value: '4' },
    });

    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { mean: 4 },
      topology: { metric: 'meanDegree' },
    });
    expect(topologyGroup()).toBeInTheDocument();
  });

  it('still removes the whole key on reset', () => {
    const { getFormValues } = setup(NETWORK_COMPOSER);
    expand();
    fireEvent.change(within(countGroup()).getByLabelText('Mean'), {
      target: { value: '4' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset to default/i }));

    expect(syntheticValue(getFormValues)).toBeUndefined();
  });

  it('says a stated half that names no count creates none', () => {
    // The one shape this editor can no longer produce, and an imported
    // protocol still can: the summary describes the run, not the controls.
    setup({
      ...NETWORK_COMPOSER,
      synthetic: {
        topology: {
          metric: 'meanDegree',
          distribution: { distribution: 'normal', mean: 3, sd: 1 },
        },
      },
    });

    expect(disclosure()).toHaveTextContent('Nodes: none created by this stage');
  });

  /**
   * A composer whose block names a topology and no count: the one descriptor
   * where "creates none of those" is a state a block can be IN, and the state
   * an unrelated edit used to silently write its way out of.
   */
  const NODES_TURNED_OFF = {
    ...NETWORK_COMPOSER,
    synthetic: {
      topology: {
        metric: 'meanDegree',
        distribution: { distribution: 'normal', mean: 3, sd: 1 },
      },
    },
  };

  const halfSwitch = (name: string) => screen.getByRole('switch', { name });

  it('shows the node half as off, with no count editor behind it', () => {
    setup(NODES_TURNED_OFF);
    expand();

    expect(halfSwitch('This stage creates nodes')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // The control and the summary now say the same thing. A count editor here
    // showed a number that was not in effect, which is what made the write
    // below invisible.
    expect(
      screen.queryByRole('group', { name: 'Number of nodes created' }),
    ).not.toBeInTheDocument();
    expect(halfSwitch('This stage creates edges')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('does not re-enable node generation when another parameter is edited', () => {
    const { getFormValues } = setup(NODES_TURNED_OFF);
    expand();

    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '1.5' },
    });

    expect(syntheticValue(getFormValues)).toMatchObject({
      responseBurden: 1.5,
    });
    expect(syntheticValue(getFormValues)).not.toHaveProperty('count');
    expect(disclosure()).toHaveTextContent('Nodes: none created by this stage');
  });

  it('turns the half back on at the schema’s own default', () => {
    const { getFormValues } = setup(NODES_TURNED_OFF);
    expand();

    fireEvent.click(halfSwitch('This stage creates nodes'));

    // The value the schema resolves for an unstated count on this stage —
    // computed here rather than written down, so the control cannot drift from
    // what an absent block would have meant.
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: defaultNodeCount(undefined),
    });
    expect(
      screen.getByRole('group', { name: 'Number of nodes created' }),
    ).toBeInTheDocument();
  });

  it('turns a half off, and says so', () => {
    const { getFormValues } = setup(NETWORK_COMPOSER);
    expand();
    // Materialise the block first: an absent one prefaults both halves.
    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '1.5' },
    });
    expect(syntheticValue(getFormValues)).toHaveProperty('count');

    fireEvent.click(halfSwitch('This stage creates nodes'));

    expect(syntheticValue(getFormValues)).not.toHaveProperty('count');
    expect(syntheticValue(getFormValues)).toHaveProperty('topology');
    expect(disclosure()).toHaveTextContent('Nodes: none created by this stage');
  });

  it('lets the schema refuse turning the last half off', () => {
    const { getFormValues } = setup(NODES_TURNED_OFF);
    expand();

    fireEvent.click(halfSwitch('This stage creates edges'));

    // The schema's own sentence, rendered where no single parameter owns it.
    expect(
      screen.getByText(
        'A synthetic block must declare a count, a topology, or both',
      ),
    ).toBeInTheDocument();
    expect(syntheticValue(getFormValues)).toEqual(NODES_TURNED_OFF.synthetic);
  });

  it('offers no enable switch where the descriptor makes no half optional', () => {
    // A name generator's descriptor REQUIRES a count, so a switch to turn it
    // off would be a control the researcher could only be refused for using.
    setup(NAME_GENERATOR);
    expand();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('hides the topology on a composer with no drawable edge types', () => {
    const { edges: _edges, ...withoutEdgeTypes } = NETWORK_COMPOSER;
    const { getFormValues } = setup(withoutEdgeTypes);

    expect(disclosure()).toHaveTextContent('Edges: none created by this stage');
    expand();
    expect(screen.queryByText('Topology measure')).not.toBeInTheDocument();

    fireEvent.change(within(countGroup()).getByLabelText('Mean'), {
      target: { value: '4' },
    });

    // Nothing on screen shows a topology, so nothing authors one.
    expect(syntheticValue(getFormValues)).not.toHaveProperty('topology');
  });
});

describe('the section intro (spec revision 2, item 1)', () => {
  it('says what synthetic data is for on every stage', () => {
    setup(NAME_GENERATOR);
    expect(screen.getByText(SECTION_PURPOSE)).toBeInTheDocument();
  });

  it('describes a node-creating stage’s parameters', () => {
    setup(NAME_GENERATOR);
    expect(screen.getByText(PARAMETERS_COUNT_ONLY)).toBeInTheDocument();
  });

  it('describes an edge stage’s parameters', () => {
    setup(SOCIOGRAM);
    expect(screen.getByText(PARAMETERS_TOPOLOGY_ONLY)).toBeInTheDocument();
  });

  it('describes a stage that creates both', () => {
    setup(NETWORK_COMPOSER);
    expect(screen.getByText(PARAMETERS_COUNT_AND_TOPOLOGY)).toBeInTheDocument();
  });

  it('describes a values-only stage', () => {
    setup(ORDINAL_BIN);
    expect(screen.getByText(PARAMETERS_VALUES_ONLY)).toBeInTheDocument();
  });

  it('describes a stage that records nothing', () => {
    setup(INFORMATION);
    expect(screen.getByText(PARAMETERS_NO_DATA)).toBeInTheDocument();
  });

  it('describes the parameters the stage actually has, not its neighbours’', () => {
    // The negative half: the five alternatives are exclusive, so a stage that
    // creates no nodes must not claim to.
    setup(INFORMATION);
    expect(screen.queryByText(PARAMETERS_COUNT_ONLY)).not.toBeInTheDocument();
    expect(
      screen.queryByText(PARAMETERS_COUNT_AND_TOPOLOGY),
    ).not.toBeInTheDocument();
  });

  it('explains a distribution family beneath the select that chose it', () => {
    // "Poisson" says nothing to a researcher who does not already know.
    setup(NAME_GENERATOR);
    expand();

    expect(
      screen.getByText(DISTRIBUTION_DESCRIPTIONS.normal),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(DISTRIBUTION_DESCRIPTIONS.poisson),
    ).not.toBeInTheDocument();
  });

  it('explains the parameters whose label alone is not enough', () => {
    setup(NAME_GENERATOR);
    expand();

    expect(screen.getByText(PARAMETER_HINTS.mean)).toBeInTheDocument();
    expect(screen.getByText(PARAMETER_HINTS.sd)).toBeInTheDocument();
  });
});

describe('panel nomination odds (spec revision 2, item 5)', () => {
  const panelOdds = (getFormValues: () => Record<string, unknown>) => {
    const panels = getFormValues().panels as
      | { synthetic?: unknown }[]
      | undefined;
    return panels?.[0]?.synthetic;
  };

  it('shows a row per panel, named for the panel, without expanding anything', () => {
    setup(NAME_GENERATOR_WITH_PANEL);

    expect(screen.getByText(PANELS_HEADING)).toBeInTheDocument();
    expect(
      screen.getByLabelText('Nomination probability for ‘People you named’'),
    ).toBeInTheDocument();
    // The whole point of item 5: it is reachable without opening the stage's
    // own disclosure, and without opening the Side Panels section at all.
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false');
  });

  it('writes the panel’s block, and resets it', () => {
    const { getFormValues } = setup(NAME_GENERATOR_WITH_PANEL);

    const field = screen.getByLabelText(
      'Nomination probability for ‘People you named’',
    );
    // The schema's own default is what the box starts at.
    expect(field).toHaveValue(DEFAULT_PANEL_NOMINATION_PROBABILITY);

    fireEvent.change(field, { target: { value: '0.8' } });
    expect(panelOdds(getFormValues)).toEqual({ nominationProbability: 0.8 });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reset to default Nomination probability for ‘People you named’',
      }),
    );
    expect(panelOdds(getFormValues)).toBeUndefined();
  });

  it('names an untitled panel by its position', () => {
    const { title: _dropped, ...untitled } =
      NAME_GENERATOR_WITH_PANEL.panels[0]!;
    setup({ ...NAME_GENERATOR_WITH_PANEL, panels: [untitled] });

    expect(
      screen.getByLabelText('Nomination probability for panel 1'),
    ).toBeInTheDocument();
  });

  it('offers no odds for a panel the schema refuses them on', () => {
    // A roster panel's contribution is drawn once for the whole stage, so
    // `panelSchema` refuses per-person odds on it — asked of the schema rather
    // than restated here.
    setup(
      {
        ...NAME_GENERATOR_WITH_PANEL,
        panels: [
          {
            ...NAME_GENERATOR_WITH_PANEL.panels[0]!,
            dataSource: 'roster-asset',
          },
        ],
      },
      codebook,
      ROSTER_MANIFEST,
    );

    expect(screen.queryByText(PANELS_HEADING)).not.toBeInTheDocument();
  });

  it('shows nothing about panels on a stage that has none', () => {
    setup(NAME_GENERATOR);
    expect(screen.queryByText(PANELS_HEADING)).not.toBeInTheDocument();
  });
});

describe('the attributes this stage assigns (spec revision 2, item 4)', () => {
  const codebookVariable = (
    getPresentCodebook: () => unknown,
    id: string,
  ): Record<string, unknown> | undefined => {
    const codebookState = getPresentCodebook() as
      | {
          node?: Record<string, { variables?: Record<string, unknown> }>;
        }
      | null
      | undefined;
    const variable = codebookState?.node?.person?.variables?.[id];
    return typeof variable === 'object' && variable !== null
      ? (variable as Record<string, unknown>)
      : undefined;
  };

  it('embeds the sub-editor for a bin stage’s bound attribute', () => {
    setup(ORDINAL_BIN, binCodebook);

    expect(screen.getByText(ATTRIBUTES_HEADING)).toBeInTheDocument();
    expect(variableDisclosure('Closeness')).toBeInTheDocument();
  });

  it('embeds the sub-editor for a quick-add stage’s attribute', () => {
    setup(NETWORK_COMPOSER);
    expect(variableDisclosure('Name')).toBeInTheDocument();
  });

  it('leaves a stage whose attributes are all form fields alone', () => {
    // NAME_GENERATOR writes `name` through a FORM FIELD, which belongs to the
    // codebook screen rather than to this stage (see stageWrittenVariables).
    setup(NAME_GENERATOR);
    expect(screen.queryByText(ATTRIBUTES_HEADING)).not.toBeInTheDocument();
  });

  it('writes an authored weight into the CODEBOOK, not into the stage', () => {
    const { getFormValues, getPresentCodebook } = setup(
      ORDINAL_BIN,
      binCodebook,
    );

    fireEvent.click(variableDisclosure('Closeness'));
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Weight for close' }),
      { target: { value: '4' } },
    );

    // The stage editor's own codebook transaction is what carries it: the
    // dispatch lands on the draft copy the stage's save promotes.
    expect(
      codebookVariable(getPresentCodebook, 'closeness')?.synthetic,
    ).toEqual({ optionWeights: [{ value: 'close', weight: 4 }] });
    // And nothing about it reached the stage's own descriptor.
    expect(syntheticValue(getFormValues)).toBeUndefined();
  });

  it('removes the codebook key entirely on reset', () => {
    const { getPresentCodebook } = setup(ORDINAL_BIN, binCodebook);

    fireEvent.click(variableDisclosure('Closeness'));
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Weight for close' }),
      { target: { value: '4' } },
    );
    expect(
      codebookVariable(getPresentCodebook, 'closeness')?.synthetic,
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to default Closeness' }),
    );

    const variable = codebookVariable(getPresentCodebook, 'closeness');
    // Absent, not an empty block: `replaceProperties` drops the key.
    expect(variable).toBeDefined();
    expect(variable && 'synthetic' in variable).toBe(false);
  });

  it('disables missingness on a bin-written attribute, naming the stage', () => {
    // The implied rules are collected from the DRAFT protocol — this stage
    // with its current binding in place — so the note names this stage.
    setup(ORDINAL_BIN, binCodebook);

    fireEvent.click(variableDisclosure('Closeness'));

    expect(
      screen.getByText(/Always answered — ‘How close\?’/),
    ).toBeInTheDocument();
  });
});
