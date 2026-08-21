import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESPONSE_BURDEN,
  MAX_SYNTHETIC_POPULATION,
  type StageType,
} from '@codaco/protocol-validation';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

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

const setup = (
  stage: Record<string, unknown>,
  protocolCodebook: unknown = codebook,
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
          assetManifest: {},
          stages: [committedStage],
        },
      }),
    },
    children: (
      <SyntheticData
        stagePath="stages[0]"
        stagePosition={0}
        interfaceType={stage.type as StageType}
      />
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
  it('shows the engine’s own refusal, unparaphrased, without expanding', async () => {
    setup(NAME_GENERATOR, infeasibleCodebook);

    // The analysis is debounced and asynchronous, so the verdict arrives after
    // the first render — which is the point of running it off the draft.
    const refusal = await screen.findByText(
      /only 2 distinct values are possible/,
      undefined,
      { timeout: 5000 },
    );

    expect(refusal).toBeInTheDocument();
    // Above the disclosure, so a collapsed section still shows it.
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false');
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
  it('holds a count parameter inside the stage’s own behaviours window', () => {
    const { getFormValues } = setup({
      ...NAME_GENERATOR,
      behaviours: { minNodes: 1, maxNodes: 6 },
    });
    expand();

    const mean = screen.getByLabelText('Mean');
    expect(mean).toHaveAttribute('max', '6');
    expect(mean).toHaveAttribute('min', '1');

    fireEvent.change(mean, { target: { value: '40' } });

    // Clamped rather than refused: a mean of 40 above a maximum of 6 is a
    // count the schema would reject outright, so an unclamped entry would
    // write nothing at all.
    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { mean: 6 },
    });
  });

  it('rounds a count to the whole number its schema admits', () => {
    const { getFormValues } = setup(NAME_GENERATOR);
    expand();

    fireEvent.change(screen.getByLabelText('Mean'), {
      target: { value: '5.5' },
    });

    expect(syntheticValue(getFormValues)).toMatchObject({
      count: { mean: 6 },
    });
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
