import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import {
  DEFAULT_RESPONSE_BURDEN,
  MAX_SYNTHETIC_POPULATION,
  type StageType,
} from '@codaco/protocol-validation';
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';
import { setActiveProtocolScope } from '~/utils/activeProtocolScope';

import SyntheticData from '../SyntheticData';

/**
 * The stage editor's Synthetic data section, over the real stage form and the
 * real schema.
 *
 * What is asserted here is the contract the spec names: one collapsed line
 * carrying the RESOLVED parameters, an authored/default badge that follows the
 * presence of the key, a reset that removes it, controls that exist only where
 * the stage's own descriptor admits them, and a window no entry can leave.
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
const StageFields = ({ stage }: { stage: Record<string, unknown> }) => (
  <>
    {Object.entries(stage)
      // The identity belongs to no field, and the block below is this
      // section's own to register.
      .filter(([key]) => !['id', 'type', 'synthetic'].includes(key))
      .map(([key, value]) => (
        <HiddenFieldValue
          key={key}
          name={key}
          initialValue={value as FieldValue}
        />
      ))}
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

/** The disclosure row: the one button carrying `aria-expanded`. */
const disclosure = () => {
  const triggers = screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-expanded'));
  expect(triggers).toHaveLength(1);
  return triggers[0]!;
};

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
    expect(within(row).getByText('Default')).toBeInTheDocument();
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

  it('writes only the burden where the descriptor accepts a burden alone', () => {
    const { getFormValues } = setup(SOCIOGRAM);
    expand();

    fireEvent.change(screen.getByLabelText('Response burden'), {
      target: { value: '1.5' },
    });

    expect(syntheticValue(getFormValues)).toEqual({ responseBurden: 1.5 });
    expect(within(disclosure()).getByText('Authored')).toBeInTheDocument();
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
    expect(within(disclosure()).getByText('Default')).toBeInTheDocument();
    expect(disclosure()).toHaveTextContent(
      `Burden: ${DEFAULT_RESPONSE_BURDEN.Sociogram}`,
    );
  });

  it('shows a committed block as authored without touching it', () => {
    const { getFormValues } = setup({
      ...SOCIOGRAM,
      synthetic: { responseBurden: 2 },
    });

    expect(within(disclosure()).getByText('Authored')).toBeInTheDocument();
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

  it('leaves a refusal no stage owns to the protocol-level verdict', async () => {
    // A `unique` slot too small for the people the protocol can create is the
    // sum of every stage that draws it, so no stage editor is the place to
    // fix it — the overview's verdict lists it instead. Showing it here would
    // put the same refusal on every stage that writes the type.
    setup(NAME_GENERATOR, infeasibleCodebook);

    // Long enough for the verdict to have arrived and rendered had this stage
    // claimed it; the engine's own analysis of this fixture is pinned by
    // `Synthetic/__tests__/conflicts.test.ts`.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(
      screen.queryByText(/only 2 distinct values are possible/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Synthetic data cannot be generated for this stage'),
    ).not.toBeInTheDocument();
  });

  it('shows nothing while the protocol is feasible', async () => {
    setup(NAME_GENERATOR);

    // Long enough for a verdict to have arrived and rendered had there been
    // one to render.
    await new Promise((resolve) => setTimeout(resolve, 1500));

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
