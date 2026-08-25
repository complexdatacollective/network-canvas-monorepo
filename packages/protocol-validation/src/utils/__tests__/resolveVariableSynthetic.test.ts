import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Variable } from '../../schemas/8/variables/variable.ts';
import { VariableSchema } from '../../schemas/8/variables/variable.ts';
import { CurrentProtocolSchema } from '../../schemas/index.ts';
import {
  collectInterfaceImpliedRules,
  type EffectiveVariableRules,
  narrowVariableRules,
  type ResolvedVariableSynthetic,
  resolveVariableSynthetic,
  type SyntheticResolvableVariable,
  syntheticSubjectKey,
} from '../resolveVariableSynthetic.ts';

/**
 * The single definition of every variable-level synthetic default.
 *
 * The claim under test is one thing throughout: a default is DERIVED from the
 * rules the variable is actually held to, never looked up in a table. That is
 * what lets a derived value satisfy every refinement the schema applies to an
 * authored one by construction, and it is what makes a CategoricalBin's single
 * selection fall out of the same derivation as everything else rather than
 * being special-cased.
 */

const resolve = (
  variable: SyntheticResolvableVariable,
  rules: EffectiveVariableRules = {},
): ResolvedVariableSynthetic => {
  const descriptor = resolveVariableSynthetic(variable, rules);
  if (descriptor === undefined) {
    throw new Error(`${variable.name} resolved no descriptor`);
  }
  return descriptor;
};

const OPTIONS = [
  { label: 'Reading', value: 'reading' },
  { label: 'Running', value: 'running' },
  { label: 'Cooking', value: 'cooking' },
  { label: 'Climbing', value: 'climbing' },
];

const sizesOf = (descriptor: ResolvedVariableSynthetic): number[] => {
  if (descriptor.type !== 'categorical') throw new Error('not a categorical');
  return descriptor.selectionCount.probabilities.map((entry) => entry.count);
};

describe('a default derives from the effective window', () => {
  describe('number', () => {
    it('spans a realistic range where the rules leave both sides open', () => {
      expect(resolve({ name: 'age', type: 'number' })).toEqual({
        type: 'number',
        distribution: 'uniform',
        min: 18,
        max: 80,
        missingProbability: 0,
      });
    });

    it('takes the floor the validation declares', () => {
      expect(
        resolve({ name: 'age', type: 'number' }, { minValue: 30 }),
      ).toEqual(expect.objectContaining({ min: 30, max: 80 }));
    });

    it('takes both bounds the validation declares', () => {
      expect(
        resolve({ name: 'age', type: 'number' }, { minValue: 0, maxValue: 5 }),
      ).toEqual(expect.objectContaining({ min: 0, max: 5 }));
    });

    it('slides the whole span below a ceiling the realistic floor exceeds', () => {
      // A value above a declared maximum is one the participant's own form
      // rejects, so the window moves rather than inverting.
      expect(
        resolve({ name: 'siblings', type: 'number' }, { maxValue: 4 }),
      ).toEqual(expect.objectContaining({ min: 4 - 62, max: 4 }));
    });
  });

  describe('scalar', () => {
    it('spans the normalised scale a scalar is recorded on', () => {
      expect(resolve({ name: 'ease', type: 'scalar' })).toEqual({
        type: 'scalar',
        distribution: 'uniform',
        min: 0,
        max: 1,
        missingProbability: 0,
      });
    });

    it('narrows to a range a comparison left it, never wider than the scale', () => {
      expect(
        resolve(
          { name: 'ease', type: 'scalar' },
          { minValue: 0.25, maxValue: 2 },
        ),
      ).toEqual(expect.objectContaining({ min: 0.25, max: 1 }));
    });
  });

  describe('boolean', () => {
    it('answers either way when nothing says which way it leans', () => {
      expect(resolve({ name: 'close', type: 'boolean' })).toEqual({
        type: 'boolean',
        probabilityTrue: 0.5,
        missingProbability: 0,
      });
    });

    it('takes the one answer a one-sided Boolean control offers', () => {
      expect(
        resolve({
          name: 'consented',
          type: 'boolean',
          component: 'Boolean',
          options: [{ value: true }],
        }),
      ).toEqual(expect.objectContaining({ probabilityTrue: 1 }));

      expect(
        resolve({
          name: 'refused',
          type: 'boolean',
          component: 'Boolean',
          options: [{ value: false }],
        }),
      ).toEqual(expect.objectContaining({ probabilityTrue: 0 }));
    });

    it('keeps the even split for a Toggle, which ignores the option list', () => {
      expect(
        resolve({
          name: 'consented',
          type: 'boolean',
          component: 'Toggle',
          options: [{ value: true }],
        }),
      ).toEqual(expect.objectContaining({ probabilityTrue: 0.5 }));
    });
  });

  describe('ordinal', () => {
    it('weights every option the list offers evenly', () => {
      expect(
        resolve({ name: 'closeness', type: 'ordinal', options: OPTIONS }),
      ).toEqual({
        type: 'ordinal',
        optionWeights: OPTIONS.map((option) => ({
          value: option.value,
          weight: 1,
        })),
        missingProbability: 0,
      });
    });

    it('weights a value carried by two labels once', () => {
      const descriptor = resolve({
        name: 'closeness',
        type: 'ordinal',
        options: [{ value: 'a' }, { value: 'a' }, { value: 'b' }],
      });
      expect(descriptor).toEqual(
        expect.objectContaining({
          optionWeights: [
            { value: 'a', weight: 1 },
            { value: 'b', weight: 1 },
          ],
        }),
      );
    });
  });

  describe('categorical', () => {
    const hobbies: SyntheticResolvableVariable = {
      name: 'hobbies',
      type: 'categorical',
      options: OPTIONS,
    };

    it('keeps selections small where nothing states a ceiling', () => {
      expect(sizesOf(resolve(hobbies))).toEqual([1, 2]);
    });

    it('reaches every size the option list holds where the rules allow it', () => {
      expect(sizesOf(resolve(hobbies, { maxSelected: 10 }))).toEqual([
        1, 2, 3, 4,
      ]);
    });

    it('takes the floor the validation declares', () => {
      expect(sizesOf(resolve(hobbies, { minSelected: 3 }))).toEqual([3]);
    });

    it('selects nothing where a ceiling of zero is all the rules allow', () => {
      expect(sizesOf(resolve(hobbies, { maxSelected: 0 }))).toEqual([0]);
    });

    it('selects exactly one where a CategoricalBin bins it', () => {
      // The claim the whole design turns on: a bin drop places an alter in
      // exactly one bin, so the interface contributes `maxSelected: 1` and the
      // ordinary derivation produces the single selection. Nothing here knows
      // what a CategoricalBin is.
      const descriptor = resolve(hobbies, { maxSelected: 1 });
      expect(sizesOf(descriptor)).toEqual([1]);
      expect(descriptor).toEqual(
        expect.objectContaining({
          optionWeights: OPTIONS.map((option) => ({
            value: option.value,
            weight: 1,
          })),
        }),
      );
    });

    it('states probabilities that sum to one', () => {
      for (const rules of [{}, { maxSelected: 4 }, { minSelected: 2 }]) {
        const descriptor = resolve(hobbies, rules);
        if (descriptor.type !== 'categorical') throw new Error('wrong type');
        const total = descriptor.selectionCount.probabilities.reduce(
          (sum, entry) => sum + entry.probability,
          0,
        );
        expect(Math.abs(total - 1)).toBeLessThan(1e-6);
      }
    });
  });

  describe('datetime', () => {
    it('reaches back over a relative window where the field leaves its floor open', () => {
      // Relative and not absolute, because the window is a reach back from a
      // session date neither a parse nor Architect can know.
      expect(
        resolve({ name: 'met', type: 'datetime', component: 'DatePicker' }),
      ).toEqual({
        type: 'datetime',
        distribution: 'uniform',
        relative: { before: 3650, after: 0 },
        missingProbability: 0,
      });
    });

    it('needs no window of its own where a coarse picker closes one', () => {
      // A month or year picker renders a closed dropdown; both of its ends
      // are the control's, so the descriptor has nothing to add.
      expect(
        resolve({
          name: 'met',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year' },
        }),
      ).toEqual({
        type: 'datetime',
        distribution: 'uniform',
        missingProbability: 0,
      });
    });

    it('needs no window of its own where the author declared a floor', () => {
      expect(
        resolve({
          name: 'met',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '1990-01-01' },
        }),
      ).toEqual(expect.not.objectContaining({ relative: expect.anything() }));
    });

    it('needs no window of its own on a RelativeDatePicker', () => {
      // Its own anchor/before/after already describe a session-relative
      // window, so a second one here would be free to disagree with it.
      expect(
        resolve({
          name: 'met',
          type: 'datetime',
          component: 'RelativeDatePicker',
        }),
      ).toEqual({
        type: 'datetime',
        distribution: 'uniform',
        missingProbability: 0,
      });
    });
  });

  describe('text', () => {
    it('draws a person for a name-shaped variable', () => {
      expect(resolve({ name: 'name', type: 'text' })).toEqual({
        type: 'text',
        generator: 'personName',
        missingProbability: 0,
      });
    });

    it('draws neutral words for anything else', () => {
      expect(resolve({ name: 'note', type: 'text' })).toEqual(
        expect.objectContaining({ generator: 'neutralWords' }),
      );
    });
  });

  it('resolves nothing for a variable that has no descriptor', () => {
    expect(
      resolveVariableSynthetic({ name: 'pos', type: 'layout' }, {}),
    ).toBeUndefined();
    expect(
      resolveVariableSynthetic({ name: 'where', type: 'location' }, {}),
    ).toBeUndefined();
  });
});

describe('a declaration is produced unmodified', () => {
  it('keeps a constant outside the window an undeclared number takes', () => {
    expect(
      resolve({
        name: 'income',
        type: 'number',
        synthetic: { distribution: 'constant', value: 250 },
      }),
    ).toEqual({
      type: 'number',
      distribution: 'constant',
      value: 250,
      missingProbability: 0,
    });
  });

  it('keeps a selection count above the ceiling an undeclared one takes', () => {
    const descriptor = resolve({
      name: 'hobbies',
      type: 'categorical',
      options: OPTIONS,
      synthetic: {
        selectionCount: { probabilities: [{ count: 4, probability: 1 }] },
      },
    });
    expect(sizesOf(descriptor)).toEqual([4]);
  });

  it('keeps a date range decades before the reach an undeclared one takes', () => {
    expect(
      resolve({
        name: 'met',
        type: 'datetime',
        component: 'DatePicker',
        synthetic: {
          distribution: 'uniform',
          min: '1990-01-01',
          max: '1995-12-31',
        },
      }),
    ).toEqual({
      type: 'datetime',
      distribution: 'uniform',
      min: '1990-01-01',
      max: '1995-12-31',
      missingProbability: 0,
    });
  });

  it('keeps a generator that contradicts the naming convention', () => {
    expect(
      resolve({
        name: 'name',
        type: 'text',
        synthetic: { generator: 'neutralWords' },
      }),
    ).toEqual(expect.objectContaining({ generator: 'neutralWords' }));
  });

  it('fills in only what a partial declaration left out', () => {
    // A `missingProbability`-only descriptor says how often the question goes
    // unanswered and nothing about the values, so the values are still derived.
    expect(
      resolve({
        name: 'age',
        type: 'number',
        synthetic: { missingProbability: 0.4 },
      }),
    ).toEqual({
      type: 'number',
      distribution: 'uniform',
      min: 18,
      max: 80,
      missingProbability: 0.4,
    });
  });
});

describe('resolution is a pure function of its inputs', () => {
  it('returns the same descriptor for the same variable and rules', () => {
    const variable: SyntheticResolvableVariable = {
      name: 'hobbies',
      type: 'categorical',
      options: OPTIONS,
    };
    expect(resolve(variable, { maxSelected: 3 })).toEqual(
      resolve(variable, { maxSelected: 3 }),
    );
  });

  it('leaves the variable it was given untouched', () => {
    const variable: SyntheticResolvableVariable = {
      name: 'age',
      type: 'number',
    };
    const before = structuredClone(variable);
    resolve(variable, { minValue: 21 });
    expect(variable).toEqual(before);
  });
});

describe('the rules a protocol’s interfaces impose', () => {
  const binProtocol = (
    prompts: { id: string; variable: string; otherVariable?: string }[],
  ) => ({
    stages: [
      {
        id: 'bin',
        type: 'CategoricalBin',
        label: 'Bin',
        subject: { entity: 'node', type: 'person' },
        prompts: prompts.map((prompt) => ({
          ...prompt,
          text: 'Sort them',
          bucketSortOrder: [],
          binSortOrder: [],
        })),
      },
    ],
  });

  const rulesFor = (protocol: unknown, variableId: string) =>
    collectInterfaceImpliedRules(protocol)
      .get(syntheticSubjectKey({ entity: 'node', type: 'person' }))
      ?.get(variableId);

  it('holds a binned variable to one selection, answered on every node', () => {
    // maxSelected: a bin drop places an alter in exactly one bin.
    // required: a bin affords no way to SKIP a node while placing the others
    // — total placement is the interaction's design (maintainer ruling,
    // 2026-08-21), so missingness resolves to zero exactly as quick-add's.
    expect(
      rulesFor(binProtocol([{ id: 'p1', variable: 'hobbies' }]), 'hobbies'),
    ).toEqual({ maxSelected: 1, required: true });
  });

  it('requires an ordinal bin prompt variable the same way', () => {
    const protocol = {
      stages: [
        {
          id: 'obin',
          type: 'OrdinalBin',
          label: 'Rank',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'p1',
              text: 'Rank them',
              variable: 'rank',
              color: 'ord-color-seq-1',
            },
          ],
        },
      ],
    };
    expect(rulesFor(protocol, 'rank')).toEqual({ required: true });
  });

  it('imposes nothing on a prompt’s other variable, which is a form field', () => {
    const protocol = binProtocol([
      { id: 'p1', variable: 'hobbies', otherVariable: 'otherHobby' },
    ]);
    expect(rulesFor(protocol, 'otherHobby')).toBeUndefined();
  });

  it('imposes nothing where no interface writes the variable', () => {
    expect(
      rulesFor(binProtocol([{ id: 'p1', variable: 'hobbies' }]), 'religion'),
    ).toBeUndefined();
  });

  it('keeps the bin’s rule where a form writes the same variable', () => {
    // The intersection over every writer, which is what makes the derivation
    // total: a writer imposing nothing narrows nothing.
    const protocol = {
      stages: [
        {
          id: 'form',
          type: 'AlterForm',
          label: 'About them',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [{ variable: 'hobbies' }] },
        },
        ...binProtocol([{ id: 'p1', variable: 'hobbies' }]).stages,
      ],
    };
    expect(rulesFor(protocol, 'hobbies')).toEqual({
      maxSelected: 1,
      required: true,
    });
  });

  it('requires a composer’s quick-add variable, like the quick-add generator’s', () => {
    // Both palettes refuse to create a node from an empty name field
    // (`AddNodeInput`), so a `missingProbability` on the variable behind
    // either would describe nodes neither interface can make.
    const composerProtocol = {
      stages: [
        {
          id: 'composer',
          type: 'NetworkComposer',
          label: 'Compose',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          layoutVariable: 'position',
        },
      ],
    };
    expect(rulesFor(composerProtocol, 'name')).toEqual({ required: true });
  });
});

describe('the variables only a bin drop writes', () => {
  const personKey = syntheticSubjectKey({ entity: 'node', type: 'person' });

  const binStage = (
    type: 'CategoricalBin' | 'OrdinalBin',
    variable: string,
  ) => ({
    id: `${type}-stage`,
    type,
    label: 'Sort them',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: `${type}-p1`,
        variable,
        text: 'Sort them',
        bucketSortOrder: [],
        binSortOrder: [],
      },
    ],
  });

  const formStage = (variable: string) => ({
    id: 'form',
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    form: { fields: [{ variable }] },
  });

  const binOnlyFor = (protocol: unknown, subjectKey = personKey) =>
    collectInterfaceImpliedRules(protocol).binOnlyVariables.get(subjectKey);

  it.each(['CategoricalBin', 'OrdinalBin'] as const)(
    'flags a variable only a %s prompt writes',
    (type) => {
      const flagged = binOnlyFor({ stages: [binStage(type, 'hobbies')] });
      expect(flagged && [...flagged]).toEqual(['hobbies']);
    },
  );

  it('does not flag the same variable where a form also collects it', () => {
    // The interview DOES enforce this variable's rules — the form field is
    // where the participant is shown the error — so it is not bin-only.
    const flagged = binOnlyFor({
      stages: [formStage('hobbies'), binStage('CategoricalBin', 'hobbies')],
    });
    expect(flagged?.has('hobbies') ?? false).toBe(false);
  });

  it('does not flag a prompt’s other variable, which is a form field', () => {
    const protocol = {
      stages: [
        {
          id: 'bin',
          type: 'CategoricalBin',
          label: 'Sort them',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'p1',
              variable: 'hobbies',
              otherVariable: 'otherHobby',
              otherVariablePrompt: 'Which?',
              otherOptionLabel: 'Other',
              text: 'Sort them',
              bucketSortOrder: [],
              binSortOrder: [],
            },
          ],
        },
      ],
    };
    const flagged = binOnlyFor(protocol);
    expect(flagged && [...flagged]).toEqual(['hobbies']);
  });

  it('is per subject: the same variable id on two node types is two variables', () => {
    const colleagueKey = syntheticSubjectKey({
      entity: 'node',
      type: 'colleague',
    });
    const colleagueForm = {
      ...formStage('hobbies'),
      subject: { entity: 'node', type: 'colleague' },
    };
    const protocol = {
      stages: [binStage('CategoricalBin', 'hobbies'), colleagueForm],
    };

    expect(binOnlyFor(protocol) && [...binOnlyFor(protocol)!]).toEqual([
      'hobbies',
    ]);
    expect(binOnlyFor(protocol, colleagueKey)).toBeUndefined();
  });

  it('records nothing where no bin writes anything', () => {
    expect(
      collectInterfaceImpliedRules({ stages: [formStage('hobbies')] })
        .binOnlyVariables.size,
    ).toBe(0);
  });
});

describe('which stage implies each rule', () => {
  const personKey = syntheticSubjectKey({ entity: 'node', type: 'person' });

  const quickAddStage = (id: string, variable: string) => ({
    id,
    type: 'NameGeneratorQuickAdd',
    label: id,
    subject: { entity: 'node', type: 'person' },
    quickAdd: variable,
  });

  const categoricalBinStage = (id: string, variable: string) => ({
    id,
    type: 'CategoricalBin',
    label: id,
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: `${id}-p1`,
        variable,
        text: 'Sort them',
        bucketSortOrder: [],
        binSortOrder: [],
      },
    ],
  });

  const formStage = (id: string, variable: string) => ({
    id,
    type: 'AlterForm',
    label: id,
    subject: { entity: 'node', type: 'person' },
    form: { fields: [{ variable }] },
  });

  const sourcesFor = (protocol: unknown, variableId: string) =>
    collectInterfaceImpliedRules(protocol)
      .impliedRuleSources.get(personKey)
      ?.get(variableId);

  it('names the one stage behind a rule, by its position', () => {
    const protocol = {
      stages: [formStage('about', 'age'), quickAddStage('quick', 'name')],
    };

    expect(sourcesFor(protocol, 'name')).toEqual([
      { stageIndex: 1, rules: { required: true } },
    ]);
  });

  it('separates the rules two stages each contribute', () => {
    // The bin contributes both rules; the quick-add field contributes only
    // the one. A reading that folded them first could not tell them apart.
    const protocol = {
      stages: [
        categoricalBinStage('bin', 'hobbies'),
        quickAddStage('quick', 'hobbies'),
      ],
    };

    expect(sourcesFor(protocol, 'hobbies')).toEqual([
      { stageIndex: 0, rules: { maxSelected: 1, required: true } },
      { stageIndex: 1, rules: { required: true } },
    ]);
  });

  it('lists the sources in timeline order whatever the walk order', () => {
    const protocol = {
      stages: [
        formStage('about', 'hobbies'),
        quickAddStage('quick', 'hobbies'),
        categoricalBinStage('bin', 'hobbies'),
      ],
    };

    expect(sourcesFor(protocol, 'hobbies')?.map((s) => s.stageIndex)).toEqual([
      1, 2,
    ]);
  });

  it('is exactly what the subject’s own rules are folded from', () => {
    const protocol = {
      stages: [
        categoricalBinStage('bin', 'hobbies'),
        formStage('about', 'hobbies'),
      ],
    };
    const collected = collectInterfaceImpliedRules(protocol);
    const sources = collected.impliedRuleSources.get(personKey)?.get('hobbies');

    expect(
      sources?.reduce(
        (narrowed, source) => narrowVariableRules(narrowed, source.rules),
        {},
      ),
    ).toEqual(collected.get(personKey)?.get('hobbies'));
  });

  it('records no source for a variable no interface constrains', () => {
    const protocol = { stages: [formStage('about', 'hobbies')] };

    expect(sourcesFor(protocol, 'hobbies')).toBeUndefined();
    expect(collectInterfaceImpliedRules(protocol).impliedRuleSources.size).toBe(
      0,
    );
  });
});

/**
 * The measurement the design rests on, re-run as a test.
 *
 * `sample/protocol.json` is the canary: it bins categorical variables, and a
 * selection-count default of "1 or 2" resolved for one of them would be
 * metadata `rejectIllegalSelectionCounts` refuses — a valid protocol turned
 * invalid by a value no author wrote. Deriving from the effective window
 * cannot produce one, and this proves it over everything the product ships.
 */
const protocolsRoot = path.resolve(
  import.meta.dirname,
  '../../../../protocols',
);

const protocolFiles = readdirSync(protocolsRoot, { recursive: true })
  .filter((entry): entry is string => typeof entry === 'string')
  .filter((entry) => path.basename(entry) === 'protocol.json')
  .map((entry) => path.join(protocolsRoot, entry))
  .toSorted();

type EntityVariables = { entity: 'node' | 'edge' | 'ego'; type?: string };

/** Every codebook variable, with the subject it belongs to. */
const codebookVariables = (
  protocol: ReturnType<typeof CurrentProtocolSchema.parse>,
): { subject: EntityVariables; id: string; variable: Variable }[] => {
  const owners: [EntityVariables, Record<string, Variable> | undefined][] = [
    ...Object.entries(protocol.codebook.node ?? {}).map(
      ([type, definition]): [EntityVariables, typeof definition.variables] => [
        { entity: 'node', type },
        definition.variables,
      ],
    ),
    ...Object.entries(protocol.codebook.edge ?? {}).map(
      ([type, definition]): [EntityVariables, typeof definition.variables] => [
        { entity: 'edge', type },
        definition.variables,
      ],
    ),
    [{ entity: 'ego' }, protocol.codebook.ego?.variables],
  ];

  return owners.flatMap(([subject, variables]) =>
    Object.entries(variables ?? {}).map(([id, variable]) => ({
      subject,
      id,
      variable,
    })),
  );
};

describe('a derived default cannot invalidate a valid protocol', () => {
  it('discovered at least one bundled protocol.json', () => {
    expect(protocolFiles.length).toBeGreaterThan(0);
  });

  it.each(protocolFiles)(
    '%s accepts every descriptor resolution derives for it',
    (protocolFile) => {
      const parsed = CurrentProtocolSchema.parse(
        JSON.parse(readFileSync(protocolFile, 'utf8')),
      );
      const implied = collectInterfaceImpliedRules(parsed);

      const refused: unknown[] = [];
      for (const { subject, id, variable } of codebookVariables(parsed)) {
        const rules: EffectiveVariableRules = {
          ...('validation' in variable ? variable.validation : {}),
          ...implied.get(syntheticSubjectKey(subject))?.get(id),
        };
        const descriptor = resolveVariableSynthetic(variable, rules);
        if (descriptor === undefined) continue;

        // The descriptor is never written to a protocol — that is the whole
        // design — so this asks the counterfactual the refinements exist to
        // answer: WERE it authored, would the schema accept it? A fixed table
        // could not promise that; a value derived from the effective window
        // satisfies every one of them by construction.
        const { type: _type, ...authored } = descriptor;
        const result = VariableSchema.safeParse({
          ...variable,
          synthetic: authored,
        });
        if (!result.success) {
          refused.push({ subject, id, authored, issues: result.error.issues });
        }
      }

      expect(refused, JSON.stringify(refused, null, 2)).toEqual([]);
    },
  );

  it('resolves every binned categorical to a single selection', () => {
    // The spec's own measurement, re-run: 14 categorical variables across the
    // bundled protocols are binned by a CategoricalBin, `sample/protocol.json`
    // and `development/protocol.json` among them. The exact figure is a
    // property of packages/protocols rather than of this derivation, so a
    // deliberate change to those protocols is expected to move it — but it
    // moving on its own means a writer stopped being recognised as one. It was
    // 13 until `e2e/synthetic-showcase/protocol.json` joined the corpus,
    // contributing its `support_types` bin.
    let binned = 0;
    for (const protocolFile of protocolFiles) {
      const parsed = CurrentProtocolSchema.parse(
        JSON.parse(readFileSync(protocolFile, 'utf8')),
      );
      const implied = collectInterfaceImpliedRules(parsed);

      for (const { subject, id, variable } of codebookVariables(parsed)) {
        const rules = implied.get(syntheticSubjectKey(subject))?.get(id);
        // The map carries every interface-implied rule, not only the bin's —
        // a quick-add field contributes `required` to the same entry — so this
        // selects the writers it is about rather than asserting the map holds
        // nothing else.
        if (rules?.maxSelected === undefined) continue;
        expect(rules.maxSelected).toBe(1);
        binned += 1;

        const descriptor = resolveVariableSynthetic(variable, {
          ...('validation' in variable ? variable.validation : {}),
          ...rules,
        });
        expect(descriptor && sizesOf(descriptor)).toEqual([1]);
      }
    }

    expect(binned).toBe(14);
  });

  it('resolves every quick-added variable as always answered', () => {
    // The other half of the same map. A NameGeneratorQuickAdd will not create
    // a node from an empty field, so the variable it collects is answered
    // whenever the stage produces anybody — and an authored
    // `missingProbability` on it describes a node no participant could make.
    let quickAdded = 0;
    for (const protocolFile of protocolFiles) {
      const parsed = CurrentProtocolSchema.parse(
        JSON.parse(readFileSync(protocolFile, 'utf8')),
      );
      const implied = collectInterfaceImpliedRules(parsed);

      for (const { subject, id, variable } of codebookVariables(parsed)) {
        const rules = implied.get(syntheticSubjectKey(subject))?.get(id);
        if (rules?.required !== true) continue;
        quickAdded += 1;

        const descriptor = resolveVariableSynthetic(variable, {
          ...('validation' in variable ? variable.validation : {}),
          ...rules,
        });
        expect(descriptor?.missingProbability).toBe(0);
      }
    }

    expect(quickAdded).toBeGreaterThan(0);
  });
});
