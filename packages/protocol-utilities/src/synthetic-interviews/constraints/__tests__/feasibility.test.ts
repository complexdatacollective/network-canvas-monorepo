import { describe, expect, it } from 'vitest';

import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
  CurrentProtocolSchema,
  MAX_SYNTHETIC_PAIRS,
  MAX_SYNTHETIC_POPULATION,
} from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  GAMETE_ROLE_OPTIONS,
  type NcNode,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import type { AssetData } from '../../simulators/types';
import { analyseFeasibility } from '../feasibility';

/**
 * The pre-seed gate, asked directly.
 *
 * Every protocol here goes through the real schema, because the analysis reads
 * the `synthetic` descriptors parsing supplies: a hand-built fixture would
 * describe a protocol no host can produce, and would not notice the schema's
 * own count resolution changing underneath it.
 *
 * The gate's verdict is asserted as CONFLICTS rather than as a thrown error, so
 * a test can say which of the three refusals fired and over what. That
 * `generateInterviews` turns a non-empty verdict into a
 * `SyntheticDataConstraintError` before any session is drawn is asserted in
 * `refusalInvariance.test.ts` (C12), together with the invariance itself.
 */

const TODAY = '2026-08-14';

const CLOSENESS = [
  { label: 'Distant', value: 1 },
  { label: 'Close', value: 2 },
];

const personVariables = {
  name: { name: 'name', type: 'text', component: 'Text' },
  /** Two values, and nothing about the codebook says which people hold them. */
  close: {
    name: 'close',
    type: 'boolean',
    component: 'Toggle',
    validation: { unique: true },
  },
  band: {
    name: 'band',
    type: 'ordinal',
    component: 'LikertScale',
    options: CLOSENESS,
    validation: { unique: true },
  },
  nickname: {
    name: 'nickname',
    type: 'text',
    component: 'Text',
    validation: { unique: true },
  },
};

const codebook = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: personVariables,
    },
  },
  edge: {
    friend: {
      name: 'Friend',
      color: 'edge-color-seq-1',
      variables: {
        strength: {
          name: 'strength',
          type: 'ordinal',
          component: 'LikertScale',
          options: CLOSENESS,
          validation: { unique: true },
        },
      },
    },
  },
  ...overrides,
});

const ASSET_MANIFEST = {
  colleagues: {
    id: 'colleagues',
    name: 'Colleagues',
    type: 'network',
    source: 'colleagues.json',
  },
};

const parse = (
  stages: Record<string, unknown>[],
  codebookOverrides?: Record<string, unknown>,
): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Feasibility test protocol',
    description: 'Exercises the pre-seed refusal gate.',
    schemaVersion: 8,
    codebook: codebook(codebookOverrides),
    assetManifest: ASSET_MANIFEST,
    stages,
  });

const analyse = (
  protocol: CurrentProtocol,
  assetData: AssetData = {},
): ReturnType<typeof analyseFeasibility> =>
  analyseFeasibility({
    protocol,
    assetData,
    today: TODAY,
    interfaceRules: collectInterfaceImpliedRules(protocol),
  });

/** A name generator collecting `variables` on the `count` people it elicits. */
const collects = (
  variables: string[],
  count: number,
  id = 'ng',
): Record<string, unknown> => ({
  id,
  type: 'NameGenerator',
  label: `Name generator ${id}`,
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'About them',
    fields: variables.map((variable) => ({ variable, prompt: 'Tell us' })),
  },
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: `${id}-p1`, text: 'Who do you know?' }],
});

/** A name generator that elicits people and collects nothing about them. */
const elicits = (count: number, id = 'quick'): Record<string, unknown> => ({
  id,
  type: 'NameGeneratorQuickAdd',
  label: `Quick add ${id}`,
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: `${id}-p1`, text: 'Who else?' }],
});

/**
 * A roster stage. Its count is pinned to `minNodes` where one is declared,
 * because the schema's own containment rule requires it: a count that could
 * draw fewer than the interface will accept is refused at parse.
 */
const rosterStage = (
  minNodes?: number,
  count = minNodes ?? 2,
): Record<string, unknown> => ({
  id: 'roster',
  type: 'NameGeneratorRoster',
  label: 'Colleagues',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'colleagues',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: 'roster-p1', text: 'Who do you work with?' }],
  ...(minNodes === undefined ? {} : { behaviours: { minNodes } }),
});

const rows = (howMany: number): NcNode[] =>
  Array.from({ length: howMany }, (_unused, index) => ({
    [entityPrimaryKeyProperty]: `row-${index}`,
    type: 'person',
    [entityAttributesProperty]: { name: `Row ${index}` },
  }));

const dyadCensus = (id = 'census'): Record<string, unknown> => ({
  id,
  type: 'DyadCensus',
  label: 'Dyad census',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'Pairs', text: 'About each pair.' },
  prompts: [
    {
      id: `${id}-p1`,
      text: 'Do these two know each other?',
      createEdge: 'friend',
    },
  ],
});

const tieStrengthCensus = (): Record<string, unknown> => ({
  id: 'tie-strength',
  type: 'TieStrengthCensus',
  label: 'Tie strength',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'Pairs', text: 'About each pair.' },
  prompts: [
    {
      id: 'ts-p1',
      text: 'How close are these two?',
      createEdge: 'friend',
      edgeVariable: 'strength',
      negativeLabel: 'They do not know each other',
    },
  ],
});

/** The one interface whose population the schema publishes no support for. */
const PEDIGREE_CODEBOOK = {
  node: {
    'family-member': {
      name: 'Family member',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: {
          name: 'name',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        },
        isEgo: { name: 'isEgo', type: 'boolean' },
        relationship: { name: 'relationship', type: 'text' },
        biologicalSex: {
          name: 'biologicalSex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
        // Two values, and every family member the pedigree builds carries one.
        condition: {
          name: 'condition',
          type: 'boolean',
          validation: { unique: true },
        },
      },
    },
  },
  edge: {
    'family-edge': {
      name: 'Family edge',
      color: 'edge-color-seq-1',
      variables: {
        relationshipType: {
          name: 'relationshipType',
          type: 'categorical',
          options: RELATIONSHIP_TYPE_OPTIONS,
        },
        isActive: { name: 'isActive', type: 'boolean' },
        isGestationalCarrier: {
          name: 'isGestationalCarrier',
          type: 'boolean',
        },
        gameteRole: {
          name: 'gameteRole',
          type: 'categorical',
          options: GAMETE_ROLE_OPTIONS,
        },
      },
    },
  },
};

const PEDIGREE_STAGE = {
  id: 'family-stage',
  type: 'FamilyPedigree',
  label: 'Your family',
  nodeConfig: {
    type: 'family-member',
    nodeLabelVariable: 'name',
    egoVariable: 'isEgo',
    relationshipVariable: 'relationship',
    biologicalSexVariable: 'biologicalSex',
  },
  edgeConfig: {
    type: 'family-edge',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGestationalCarrier',
    gameteRoleVariable: 'gameteRole',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'required',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Build your family.',
  nominationPrompts: [
    { id: 'condition-prompt', text: 'Who has this?', variable: 'condition' },
  ],
};

const reasons = (protocol: CurrentProtocol, assetData?: AssetData): string[] =>
  analyse(protocol, assetData).map((conflict) => conflict.reason);

describe('the pre-seed gate', () => {
  it('accepts a protocol nothing is wrong with', () => {
    expect(analyse(parse([collects(['name'], 4), dyadCensus()]))).toEqual([]);
  });
});

describe('a roster stage the run cannot get past (decision 18)', () => {
  it('refuses a resolved pool below the stage’s own min-nodes gate', () => {
    const conflicts = analyse(parse([rosterStage(3)]), {
      rosterNodes: { roster: rows(2) },
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['behaviours.minNodes']);
    expect(conflicts[0]?.entityType).toBe('person');
    expect(conflicts[0]?.reason).toContain('Colleagues');
    expect(conflicts[0]?.reason).toContain('at least 3');
    expect(conflicts[0]?.reason).toContain('only 2 rows');
  });

  it('accepts a pool that meets the gate exactly', () => {
    expect(
      analyse(parse([rosterStage(2)]), {
        rosterNodes: { roster: rows(2) },
      }),
    ).toEqual([]);
  });

  it('refuses a source the host resolved to nothing', () => {
    // An empty array is the host saying the source is known empty. The gate
    // reads it exactly as it reads two rows where three are needed.
    expect(
      reasons(parse([rosterStage(1)]), {
        rosterNodes: { roster: [] },
      }),
    ).toEqual([
      'stage "Colleagues" must nominate at least 1 from its roster, and no rows were resolved for it',
    ]);
  });

  it('refuses a source the host could not resolve', () => {
    // A `rosterNodes` map that omits this stage's key: the caller takes part in
    // the roster contract and reports this source unresolved, which is a pool
    // of nobody (spec: the three-way key contract).
    expect(
      analyse(parse([rosterStage(1), elicits(1)]), {
        rosterNodes: { quick: rows(3) },
      }),
    ).toHaveLength(1);
  });

  it('refuses a gated roster when the host resolved no rosters at all', () => {
    // No `rosterNodes` map: the caller has not resolved rosters, which is a
    // property of the host rather than of the document — and the refusal says
    // exactly that. What it cannot be is a completed session: a roster stage
    // nominates nobody without a pool, and `behaviours.minNodes` is the gate
    // the live interface refuses to advance below, so an absent map plus a
    // gate is a run no faithful walk can finish.
    const conflicts = analyse(parse([rosterStage(3)]));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toMatch(/resolved no roster data/i);
  });

  it('leaves an ungated roster alone when the host resolved nothing', () => {
    // Without a min-nodes gate the empty stage is a participant who nominated
    // nobody, which the interface permits — the absent-map opt-out survives
    // exactly there.
    expect(analyse(parse([rosterStage(undefined)]))).toEqual([]);
  });

  it('leaves a roster with no min-nodes gate alone', () => {
    // Nothing stops a participant advancing, so an empty pool is a stage that
    // nominates nobody rather than one that strands them.
    expect(
      analyse(parse([rosterStage()]), { rosterNodes: { roster: [] } }),
    ).toEqual([]);
  });
});

describe('a `unique` slot with less room than the run needs', () => {
  it('refuses a two-valued variable drawn on more people than that', () => {
    const conflicts = analyse(parse([collects(['close'], 5)]));

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
    expect(conflicts[0]?.variableIds).toEqual(['close']);
    expect(conflicts[0]?.reason).toBe(
      'only 2 distinct values are possible, but up to 5 nodes of this type can be generated',
    );
  });

  it('accepts a space exactly as wide as the population', () => {
    expect(analyse(parse([collects(['close'], 2)]))).toEqual([]);
  });

  it('sums the people two stages collecting it bring', () => {
    expect(
      reasons(parse([collects(['band'], 1, 'a'), collects(['band'], 2, 'b')])),
    ).toEqual([
      'only 2 distinct values are possible, but up to 3 nodes of this type can be generated',
    ]);
  });

  it('leaves a variable no stage collects alone', () => {
    // Five people, and `close` has two values — but nothing puts the question
    // in front of the participant, so no value of it is ever drawn. Refusing
    // here would refuse a protocol over a question nobody is asked.
    expect(analyse(parse([elicits(5)]))).toEqual([]);
  });

  it('does not count roster rows as holders', () => {
    // Roster rows arrive carrying their own values, and a row whose value the
    // network already holds is passed over rather than redrawn — so a roster
    // never forces the generator to invent a value it does not have.
    expect(
      analyse(parse([rosterStage(undefined, 5)]), {
        rosterNodes: { roster: rows(5) },
      }),
    ).toEqual([]);
  });

  it('counts a form filled over the whole population', () => {
    // The alter form reaches everybody elicited before it, so its draw spends
    // one value per person however few of them the eliciting stage collected.
    const conflicts = analyse(
      parse([
        elicits(4),
        {
          id: 'about',
          type: 'AlterForm',
          label: 'About each person',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'About them', text: 'A few questions.' },
          form: { fields: [{ variable: 'close', prompt: 'Close?' }] },
        },
      ]),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toContain('up to 4 nodes');
  });

  it('does not add a whole-population form to the people it reached', () => {
    // The form fills the four people already there; counting its draw ON TOP of
    // the eliciting stage's would report eight holders where there are four.
    const conflicts = analyse(
      parse([
        collects(['close'], 4),
        {
          id: 'about',
          type: 'AlterForm',
          label: 'About each person',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'About them', text: 'A few questions.' },
          form: { fields: [{ variable: 'close', prompt: 'Close?' }] },
        },
      ]),
    );

    expect(conflicts[0]?.reason).toContain('up to 4 nodes');
  });

  it('measures a group held equal against its narrowest member', () => {
    // `nickname` is text and unbounded on its own; held equal to a two-valued
    // ordinal it reaches only what that ordinal reaches, which is what the
    // generator draws against.
    const conflicts = analyse(
      parse([collects(['band', 'nickname'], 3)], {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              ...personVariables,
              nickname: {
                name: 'nickname',
                type: 'ordinal',
                component: 'LikertScale',
                options: CLOSENESS,
                validation: { unique: true, sameAs: 'band' },
              },
            },
          },
        },
      }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableIds.toSorted()).toEqual(['band', 'nickname']);
    expect(conflicts[0]?.reason).toContain(
      'once these attributes are held equal',
    );
  });

  it('leaves an unbounded value space alone', () => {
    // A `unique` text variable reaches more values than any protocol can spend.
    expect(analyse(parse([collects(['nickname'], 40)]))).toEqual([]);
  });

  it('measures an edge variable against the pairs that can carry it', () => {
    // Four people are six pairs, and a tie-strength census draws its ordinal
    // onto every pair it links — two values cannot cover six edges.
    const conflicts = analyse(parse([elicits(4), tieStrengthCensus()]));

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('edge');
    expect(conflicts[0]?.entityTypeName).toBe('Friend');
    expect(conflicts[0]?.reason).toContain('up to 6 edges');
  });

  it('counts an edge form over the edges a census made', () => {
    // The form reaches every edge on the graph, so its draw spends one value
    // per pair the census could have linked — six, for four people.
    const conflicts = analyse(
      parse([
        elicits(4),
        dyadCensus(),
        {
          id: 'about-ties',
          type: 'AlterEdgeForm',
          label: 'About each tie',
          subject: { entity: 'edge', type: 'friend' },
          introductionPanel: { title: 'Ties', text: 'A few questions.' },
          form: { fields: [{ variable: 'strength', prompt: 'How strong?' }] },
        },
      ]),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('edge');
    expect(conflicts[0]?.reason).toContain('up to 6 edges');
  });

  it('leaves an edge type nothing draws onto alone', () => {
    // A plain dyad census creates edges carrying nothing at all, so the `unique`
    // ordinal on that edge type is never drawn.
    expect(analyse(parse([elicits(20), dyadCensus()]))).toEqual([]);
  });

  it('leaves a family pedigree’s own types unanalysed', () => {
    // A pedigree's size is a run-level population draw the schema publishes no
    // support for, so the gate says nothing about its node or edge type rather
    // than inventing a ceiling and refusing on the strength of it. `name` here
    // is `unique` text on a type the pedigree builds many of.
    const protocol = parse([PEDIGREE_STAGE], PEDIGREE_CODEBOOK);

    expect(analyse(protocol)).toEqual([]);
  });
});

describe('a stage asked to enumerate more pairs than one stage may', () => {
  /** Two guaranteed populations whose pairs clear the cap between them. */
  const overCap = parse([
    collects(['name'], 60, 'a'),
    collects(['name'], 60, 'b'),
    dyadCensus(),
  ]);

  it('refuses the guaranteed pair set above the cap', () => {
    const conflicts = analyse(overCap);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['synthetic.count']);
    expect(conflicts[0]?.reason).toContain('Dyad census');
    expect(conflicts[0]?.reason).toContain('120 people');
    expect(conflicts[0]?.reason).toContain('7,140 pairs');
    expect(conflicts[0]?.reason).toContain(
      MAX_SYNTHETIC_PAIRS.toLocaleString('en'),
    );
  });

  it('counts only the creators that run before it', () => {
    // The same two populations, with the census between them: only the first
    // sixty reach it, and sixty people are 1,770 pairs.
    expect(
      analyse(
        parse([
          collects(['name'], 60, 'a'),
          dyadCensus(),
          collects(['name'], 60, 'b'),
        ]),
      ),
    ).toEqual([]);
  });

  it('leaves a population only an unlikely seed could reach alone', () => {
    // Two open-tailed counts whose CEILINGS clear the cap between them and
    // whose floors do not. The protocol does not ask for that work; refusing it
    // would refuse every ordinary seed's behaviour on account of one.
    const openTailed = (id: string) => ({
      ...collects(['name'], 1, id),
      synthetic: {
        generatesData: true,
        count: { distribution: 'normal', mean: 8, sd: 3, min: 0, max: 100 },
      },
    });

    expect(
      analyse(parse([openTailed('a'), openTailed('b'), dyadCensus()])),
    ).toEqual([]);
  });

  it('says nothing about a stage that creates no edges', () => {
    const noEdges = parse(
      [
        collects(['name'], 60, 'a'),
        collects(['name'], 60, 'b'),
        {
          id: 'positions',
          type: 'Sociogram',
          label: 'Positions',
          subject: { entity: 'node', type: 'person' },
          background: { concentricCircles: 3, skewedTowardCenter: true },
          prompts: [
            {
              id: 'pos-1',
              text: 'Place everybody',
              layout: { layoutVariable: 'spot' },
            },
          ],
        },
      ],
      {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              ...personVariables,
              spot: { name: 'spot', type: 'layout' },
            },
          },
        },
      },
    );

    expect(analyse(noEdges)).toEqual([]);
  });
});

describe('the verdict is a function of its arguments', () => {
  it('returns the same conflicts however often it is asked', () => {
    const protocol = parse([collects(['close'], 5), dyadCensus()]);

    expect(analyse(protocol)).toEqual(analyse(protocol));
  });

  it('moves with the pools the caller resolved', () => {
    const protocol = parse([rosterStage(3)]);

    expect(
      analyse(protocol, { rosterNodes: { roster: rows(2) } }),
    ).toHaveLength(1);
    expect(analyse(protocol, { rosterNodes: { roster: rows(3) } })).toEqual([]);
  });
});

describe('known writes survive a pedigree over the same type', () => {
  it('still refuses a name generator the known counts alone condemn', () => {
    // Three family members drawing a two-value `unique` boolean is refused on
    // its own; adding a pedigree over the same node type must not suppress
    // that verdict. The pedigree's own contribution stays unmodelled — it can
    // only ADD holders, so a refusal the known writes earn stands regardless.
    const overfull = {
      id: 'family-ng',
      type: 'NameGenerator',
      label: 'More family',
      subject: { entity: 'node', type: 'family-member' },
      form: {
        title: 'About them',
        fields: [{ variable: 'condition', prompt: 'Condition?' }],
      },
      synthetic: {
        generatesData: true,
        count: { distribution: 'constant', value: 3 },
      },
      prompts: [{ id: 'family-ng-p1', text: 'Who else?' }],
    };
    // The pedigree codebook's `condition` carries no input control (the
    // pedigree needs none); this form does, so the test's codebook gives it
    // one.
    const familyCodebook = {
      ...PEDIGREE_CODEBOOK,
      node: {
        'family-member': {
          ...PEDIGREE_CODEBOOK.node['family-member'],
          variables: {
            ...PEDIGREE_CODEBOOK.node['family-member'].variables,
            condition: {
              name: 'condition',
              type: 'boolean',
              component: 'Toggle',
              validation: { unique: true },
            },
          },
        },
      },
    };
    const conflicts = analyse(
      parse([overfull, PEDIGREE_STAGE], familyCodebook),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
    expect(conflicts[0]?.variableIds).toEqual(['condition']);
  });
});

describe('a min-nodes gate no expressible count reaches', () => {
  it('keeps the protocol valid and refuses generation instead', () => {
    // `behaviours.minNodes` above MAX_SYNTHETIC_POPULATION was valid before
    // generation parameters existed and stays valid — the schema clamps the
    // derived count rather than rejecting the stage — so the refusal lands
    // here, naming the generation ceiling.
    const gated = {
      id: 'quick',
      type: 'NameGeneratorQuickAdd',
      label: 'Quick add quick',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      behaviours: { minNodes: MAX_SYNTHETIC_POPULATION + 50 },
      prompts: [{ id: 'quick-p1', text: 'Who else?' }],
    };
    const conflicts = analyse(parse([gated]));

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['behaviours.minNodes']);
    expect(conflicts[0]?.reason).toContain(
      `at most ${MAX_SYNTHETIC_POPULATION}`,
    );
  });
});

describe('feasibility across every possible session day', () => {
  const whenCodebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'name', type: 'text', component: 'Text' },
          when: {
            name: 'when',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'full', min: '2026-08-12' },
            validation: { unique: true },
          },
        },
      },
    },
  };

  const analyseWindow = (
    protocol: CurrentProtocol,
    windowDays: number,
  ): ReturnType<typeof analyseFeasibility> =>
    analyseFeasibility({
      protocol,
      assetData: {},
      today: TODAY,
      interfaceRules: collectInterfaceImpliedRules(protocol),
      windowDays,
    });

  it('refuses a window an earlier session day cannot hold', () => {
    // On the anchor day (2026-08-14) the window [2026-08-12, today] holds
    // three dates for two holders. A session starting a week earlier resolves
    // its open ceiling against ITS day, before the authored minimum, and
    // collapses to a single date — so the batch is refused before a seed
    // could land a session there and exhaust mid-walk.
    const protocol = parse([collects(['when'], 2)], whenCodebook);

    expect(analyseWindow(protocol, 0)).toEqual([]);
    const conflicts = analyseWindow(protocol, 7);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['unique']);
    expect(conflicts[0]?.variableIds).toEqual(['when']);
  });
});

describe('feasibility stops where the walk stops', () => {
  it('does not refuse a preview over a stage the walk never reaches', () => {
    // `collects(['band'], 3)` is refused outright: three holders, two values.
    // A stopAt run that halts on arrival at that stage never draws there, so
    // the earlier stage previews.
    const protocol = parse([elicits(2), collects(['band'], 3, 'late')]);
    const analyseStopped = (stopAt?: {
      stageIndex: number;
      promptIndex?: number;
    }): ReturnType<typeof analyseFeasibility> =>
      analyseFeasibility({
        protocol,
        assetData: {},
        today: TODAY,
        interfaceRules: collectInterfaceImpliedRules(protocol),
        ...(stopAt ? { stopAt } : {}),
      });

    expect(analyseStopped()).toHaveLength(1);
    expect(analyseStopped({ stageIndex: 1 })).toEqual([]);
    expect(analyseStopped({ stageIndex: 1, promptIndex: 1 })).toHaveLength(1);
  });
});
