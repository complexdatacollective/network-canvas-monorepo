import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { ruleSetIssues, ruleSetTargets } from '../../rules/ruleSet.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import NetworkFilterSection from '../NetworkFilterSection.tsx';

/** An `AlterForm` is the least-configured stage the schema gives a filter. */
const ALTER_FORM = loadFixtureStage('alter-form-1');
/** A stage whose prompts name an edge type, which a filter can then hide. */
const SOCIOGRAM = loadFixtureStage('sociogram-1');
const DYAD_CENSUS = loadFixtureStage('dyad-census-1');

const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

/**
 * The edge type the fixture's prompts create and display, and one they never
 * mention: the difference between a filter that lets the stage work and one
 * that empties it.
 */
const CONFIGURED_EDGE = 'knows';
const OTHER_EDGE = 'family_edge';

const nodeFilter = {
  rules: [
    {
      id: 'rule-a',
      type: 'node',
      options: { type: 'person', operator: 'EXISTS' },
    },
  ],
};

const edgeRule = (type: string, operator: string) => ({
  rules: [{ id: 'rule-a', type: 'edge', options: { type, operator } }],
});

const stageHolding = (
  base: ReturnType<typeof loadFixtureStage>,
  fields: SectionDoc,
) => ({ id: base.id, type: base.type, fields: { ...base.fields, ...fields } });

const alterForm = (fields: SectionDoc = {}) => stageHolding(ALTER_FORM, fields);
const sociogram = (filter: unknown, prompts?: unknown) =>
  stageHolding(SOCIOGRAM, {
    filter,
    ...(prompts === undefined ? {} : { prompts }),
  });
const dyadCensus = (filter: unknown) => stageHolding(DYAD_CENSUS, { filter });

/**
 * The section under test, told what the stage works on and nothing more: no
 * field name, no stage path, no codebook, no selector.
 */
const nodeFilterSection = <NetworkFilterSection subject="node" />;
const edgeFilterSection = <NetworkFilterSection subject="edge" />;

const filterSwitch = () => screen.getByRole('switch', { name: 'Stage filter' });

/**
 * Switch the section on, and wait for the panel that opens.
 *
 * Opening is asynchronous from end to end: `BuilderSection` answers Fresco's
 * `Section` with a promise, and the section sets its own open state only once
 * that promise has settled. So the click resolving is not the panel being on
 * screen — one macrotask anywhere in that chain, which is what a loaded CI
 * runner supplies, puts the whole panel after it. Waited for here rather than
 * at each call site, because a caller cannot read a control out of a panel
 * this has not returned from.
 */
const switchFilterOn = async (harness: StageEditorHarness) => {
  await harness.user.click(filterSwitch());
  await screen.findByRole('group', { name: /Filter rules/ });
};

/**
 * Switch the section off, and wait for the click to have been answered.
 *
 * Either answer will do, because which one arrives is what the test around
 * this asserts: a filter holding rules asks before it clears them, and one
 * holding nothing simply closes.
 */
const switchFilterOff = async (harness: StageEditorHarness) => {
  await harness.user.click(filterSwitch());
  await waitFor(() => {
    const asked =
      screen.queryByRole('button', { name: 'Clear filter' }) !== null;
    const closed =
      screen.queryByRole('group', { name: /Filter rules/ }) === null;
    expect(asked || closed).toBe(true);
  });
};

const filterOutline = (harness: StageEditorHarness) =>
  harness.outline().find((section) => section.title === 'Stage filter');

describe('what the section says it is for', () => {
  it('names the nodes a node stage filters', () => {
    renderStageEditor({ stage: alterForm(), sections: nodeFilterSection });

    expect(
      screen.getByText(
        'Create rules that limit which nodes are available on this stage.',
      ),
    ).toBeInTheDocument();
  });

  it('names the edges an edge stage filters', () => {
    renderStageEditor({ stage: alterForm(), sections: edgeFilterSection });

    expect(
      screen.getByText(
        'Create rules that limit which edges are available on this stage.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a codebook that changes underneath the filter', () => {
  it('renames a type in the rules without writing anything back to the stage', async () => {
    const harness = renderStageEditor({
      stage: alterForm({ filter: nodeFilter }),
      sections: nodeFilterSection,
    });

    expect(
      await screen.findByRole('button', { name: /^Edit rule:/ }),
    ).toHaveAccessibleName(/person exists/);

    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...harness.protocolSections()[personSection],
          name: 'Participant',
        },
      },
    });

    // Re-queried rather than held: the row is remounted around the new
    // description, so a reference taken before the rename is detached.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Edit rule:/ }),
      ).toHaveAccessibleName(/Participant exists/),
    );

    // Someone else's edit is not this editor's edit: following it must not
    // rewrite the rules this stage holds, which would save their change as
    // ours the next time anything here is saved.
    const written = await harness.submit();
    expect(written?.stageDocument.filter).toEqual(nodeFilter);
  });
});

describe('switching the filter off', () => {
  it('removes it from the stage entirely', async () => {
    const harness = renderStageEditor({
      stage: alterForm({ filter: nodeFilter }),
      sections: nodeFilterSection,
    });

    await switchFilterOff(harness);
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear filter' }),
    );

    const written = await harness.submit();
    expect(written).not.toBeNull();
    // Absent, not an empty rule set: absence is how the schema spells "this
    // stage is not filtered".
    expect(Object.hasOwn(written?.stageDocument ?? {}, 'filter')).toBe(false);
  });

  it('asks first, and keeps the rules when the answer is no', async () => {
    const harness = renderStageEditor({
      stage: alterForm({ filter: nodeFilter }),
      sections: nodeFilterSection,
    });

    await switchFilterOff(harness);
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: /^Edit rule:/ }),
    ).toHaveAccessibleName(/person exists/);
  });

  it('switches back on with an editable, empty rule set', async () => {
    const harness = renderStageEditor({
      stage: alterForm({ filter: nodeFilter }),
      sections: nodeFilterSection,
    });

    await switchFilterOff(harness);
    await harness.user.click(
      screen.getByRole('button', { name: 'Clear filter' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Filter rules/ })).toBeNull(),
    );

    await switchFilterOn(harness);

    expect(
      await screen.findByRole('group', { name: /Filter rules/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add new filter rule' }),
    ).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Delete rule:/ })).toBeNull();
  });
});

describe('rules that contradict the rest of the stage', () => {
  const warning = () =>
    screen.queryByText('Filter rules hide configured values');

  it('warns when the rules would hide an edge the prompts create', () => {
    renderStageEditor({
      stage: sociogram(edgeRule(OTHER_EDGE, 'EXISTS')),
      sections: nodeFilterSection,
    });

    expect(warning()).toBeInTheDocument();
  });

  it('stays quiet when the rules let the configured edge through', () => {
    renderStageEditor({
      stage: sociogram(edgeRule(CONFIGURED_EDGE, 'EXISTS')),
      sections: nodeFilterSection,
    });

    expect(warning()).toBeNull();
  });

  it('stays quiet when the stage configures no edges at all', () => {
    renderStageEditor({
      stage: alterForm({ filter: nodeFilter }),
      sections: nodeFilterSection,
    });

    expect(warning()).toBeNull();
  });

  it('warns when the rules name an edge the prompts create as one that must not exist', () => {
    renderStageEditor({
      // Nothing is required to exist here, so the only thing that keeps this
      // edge off the stage is being named by a rule that excludes it.
      stage: sociogram(edgeRule(CONFIGURED_EDGE, 'NOT_EXISTS')),
      sections: nodeFilterSection,
    });

    expect(warning()).toBeInTheDocument();
  });

  it('stays quiet when the only rules are about nodes', () => {
    renderStageEditor({
      // A rule about a node type says nothing about which edges reach the
      // stage. Folding its entity type into the edge comparison makes the
      // configured edge look like one no rule lets through.
      stage: sociogram(nodeFilter),
      sections: nodeFilterSection,
    });

    expect(warning()).toBeNull();
  });

  it('still warns about an edge rule standing beside a node rule', () => {
    renderStageEditor({
      stage: sociogram({
        join: 'AND',
        rules: [
          {
            id: 'rule-a',
            type: 'node',
            options: { type: 'person', operator: 'EXISTS' },
          },
          {
            id: 'rule-b',
            type: 'edge',
            options: { type: OTHER_EDGE, operator: 'EXISTS' },
          },
        ],
      }),
      sections: nodeFilterSection,
    });

    expect(warning()).toBeInTheDocument();
  });

  it('warns when rules that must ALL match require different edge types', () => {
    renderStageEditor({
      stage: sociogram({
        join: 'AND',
        rules: [
          {
            id: 'rule-a',
            type: 'edge',
            options: { type: CONFIGURED_EDGE, operator: 'EXISTS' },
          },
          {
            id: 'rule-b',
            type: 'edge',
            options: { type: OTHER_EDGE, operator: 'EXISTS' },
          },
        ],
      }),
      sections: nodeFilterSection,
    });

    // `AND` feeds each rule's result into the next, so an edge has to survive
    // both — and no edge is of two types at once. A check that merely unioned
    // the types the rules NAME saw the configured edge in the list and said
    // nothing, while the stage in fact shows no edges at all.
    expect(warning()).toBeInTheDocument();
  });

  it('stays quiet when either of those rules would match on its own', () => {
    renderStageEditor({
      stage: sociogram({
        join: 'OR',
        rules: [
          {
            id: 'rule-a',
            type: 'edge',
            options: { type: CONFIGURED_EDGE, operator: 'EXISTS' },
          },
          {
            id: 'rule-b',
            type: 'edge',
            options: { type: OTHER_EDGE, operator: 'EXISTS' },
          },
        ],
      }),
      sections: nodeFilterSection,
    });

    // The same two rules under `OR` run on the whole network and are merged,
    // so the configured edge comes through the first of them.
    expect(warning()).toBeNull();
  });

  it('stays quiet when a node rule can bring the edges back under OR', () => {
    renderStageEditor({
      stage: sociogram({
        join: 'OR',
        rules: [
          {
            id: 'rule-a',
            type: 'edge',
            options: { type: OTHER_EDGE, operator: 'EXISTS' },
          },
          {
            id: 'rule-b',
            type: 'node',
            options: { type: 'person', operator: 'EXISTS' },
          },
        ],
      }),
      sections: nodeFilterSection,
    });

    // Under `OR` the edges between the alters a node rule keeps are merged
    // back in whatever type they are, so no edge type is certainly hidden.
    expect(warning()).toBeNull();
  });

  it('counts the edges a prompt only displays, not just the ones it creates', () => {
    renderStageEditor({
      stage: sociogram(edgeRule(CONFIGURED_EDGE, 'EXISTS'), [
        {
          id: 'sociogram-prompt-1',
          text: 'Who do you know?',
          layout: { layoutVariable: 'layout' },
          // Displayed rather than created, and still hidden by rules that
          // require a different edge type to exist.
          edges: { display: [OTHER_EDGE] },
        },
      ]),
      sections: nodeFilterSection,
    });

    expect(warning()).toBeInTheDocument();
  });

  /**
   * The Sociogram's `edges.create` is not the only way a prompt names an edge
   * type. DyadCensus, TieStrengthCensus and OneToManyDyadCensus each carry a
   * required top-level `createEdge`, and the interfaces then read their edges
   * through `getNetworkEdges` — which is derived from the FILTERED network, so
   * an edge the stage filter hides reads as one that does not exist and the
   * participant is asked to create it again.
   */
  it('warns when the rules would hide an edge a DyadCensus prompt creates', () => {
    renderStageEditor({
      stage: dyadCensus(edgeRule(OTHER_EDGE, 'EXISTS')),
      sections: edgeFilterSection,
    });

    expect(warning()).toBeInTheDocument();
  });

  it('stays quiet when those rules let the created edge through', () => {
    renderStageEditor({
      stage: dyadCensus(edgeRule(CONFIGURED_EDGE, 'EXISTS')),
      sections: edgeFilterSection,
    });

    expect(warning()).toBeNull();
  });
});

/**
 * A stage's node/edge filter cannot ask about the ego: the protocol schema
 * refuses one there and accepts it in skip logic, because an ego rule inside a
 * filter either keeps every entity or none. The editor already declines to
 * OFFER an ego rule here, so a stored one arrived from a protocol authored
 * elsewhere — and until the rule set said which targets it may HOLD, nothing
 * on screen knew that the rule in front of the researcher was the problem.
 */
describe('a rule this filter cannot be about', () => {
  const egoFilter = {
    rules: [
      {
        id: 'rule-a',
        type: 'ego',
        options: {
          attribute: 'ego_name',
          operator: 'EXACTLY',
          value: 'Ada',
        },
      },
    ],
  };

  it('marks a stored ego rule on its own row and refuses the stage', async () => {
    const harness = renderStageEditor({
      stage: alterForm({ filter: egoFilter }),
      sections: nodeFilterSection,
    });

    expect(
      await screen.findByText(
        'This rule is about the ego, which these rules cannot ask about. Edit or delete the rule.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(filterOutline(harness)?.state).toBe('Has a problem'),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        'Rule 1 cannot be used as it stands. Open it to fix it, or delete it.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves the same rule alone in a rule set that may hold it', () => {
    // The rule is not broken; it is in the wrong kind of rule set. Skip logic
    // is the kind that may ask about the ego, and reporting it there would
    // send the researcher to fix a rule the schema accepts.
    const codebook: Codebook = {
      ego: { variables: { ego_name: { name: 'ego_name', type: 'text' } } },
    };

    expect(ruleSetIssues(egoFilter, codebook, ruleSetTargets('query'))).toEqual(
      [],
    );
  });
});

describe('a filter the researcher cannot save', () => {
  it('refuses a rule set emptied down to nothing', async () => {
    const harness = renderStageEditor({
      stage: alterForm({ filter: nodeFilter }),
      sections: nodeFilterSection,
    });

    await harness.user.click(
      screen.getByRole('button', { name: /^Delete rule:/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete' }),
    );

    expect(await harness.submit()).toBeNull();

    // A filter with an empty rule list is the shape the schema rejects with
    // "Too small: expected array to have >=1 items". Switching the capability
    // off is how a stage says it has no filter.
    expect(
      await screen.findByText('Please create at least one rule.'),
    ).toBeInTheDocument();
  });

  it('refuses a filter switched on and left empty', async () => {
    const harness = renderStageEditor({
      stage: alterForm(),
      sections: nodeFilterSection,
    });

    await switchFilterOn(harness);

    expect(await harness.submit()).toBeNull();

    // Switching the capability on writes nothing on its own, so an editor that
    // saved here would write a stage with no filter key — and the toggle would
    // be off again the next time the stage was opened, with nothing having
    // said so. The section stays on and unfinished until a rule is added or
    // the switch is turned off, and says which in the rule set's own words.
    expect(
      await screen.findByText('Please create at least one rule.'),
    ).toBeInTheDocument();
  });

  it('reports a filter switched on and left empty as unfinished, not switched off', async () => {
    const harness = renderStageEditor({
      stage: alterForm(),
      sections: nodeFilterSection,
    });
    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(filterOutline(harness)?.state).toBe('Switched off');

    await switchFilterOn(harness);

    await waitFor(() =>
      expect(filterOutline(harness)?.state).toBe('Not finished'),
    );
  });

  it('saves a stage with no filter key once the switch goes back off', async () => {
    const harness = renderStageEditor({
      stage: alterForm(),
      sections: nodeFilterSection,
    });

    await switchFilterOn(harness);
    // Nothing was entered, so there is nothing to lose and nothing to confirm.
    await switchFilterOff(harness);
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Filter rules/ })).toBeNull(),
    );

    const written = await harness.submit();
    expect(written).not.toBeNull();
    expect(Object.hasOwn(written?.stageDocument ?? {}, 'filter')).toBe(false);
  });
});
