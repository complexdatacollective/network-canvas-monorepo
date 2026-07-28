import { describe, expect, it } from 'vitest';

import type { Protocol } from '../../index.ts';
import migrationV7toV8 from '../migration.ts';
import ProtocolSchemaV8 from '../schema.ts';

/**
 * Seeded property test: any v7 protocol within the generator's contract must
 * migrate to a protocol that passes v8 validation.
 *
 * Every new v8 strictness is paired with a migration repair, and every time a
 * pairing was missed a legacy protocol became unimportable (fractional
 * `.int()` bounds, unsupported DatePicker keys, below-floor count values,
 * invalid parameter shapes — four separate review findings). This test closes
 * that class mechanically: it fuzzes v7 protocols through the migration and
 * asserts the output parses under `ProtocolSchemaV8`.
 *
 * ## Generator contract
 *
 * Cases are seeded mutations of a fixed, valid v7 template — the shapes v7
 * tooling could produce PLUS hand-edits of values, not novel v8-only
 * constructs. In contract:
 *
 * - variable `validation` objects: fractional / negative / zero / huge /
 *   wrong-typed rule values, inverted min-max pairs, unknown rule keys, rules
 *   outside the variable type's v8 rule set, reference rules naming self or
 *   an existing cross-type target, `sameAs` + `differentFrom` on one target,
 *   comparator cycles (including odd boolean `differentFrom` cycles), and
 *   bound combinations the contradiction analyser rejects;
 * - `options` arrays: an explicitly empty boolean options array, legacy
 *   boolean and fractional-number option values, duplicate option values,
 *   numeric option labels, wrong-typed boolean option values;
 * - `component`: values legal only for another variable type, unknown or
 *   non-string values, and componentless variables (including a componentless
 *   datetime whose parameters are relative-shaped);
 * - DatePicker / RelativeDatePicker `parameters`: wrong resolution strings,
 *   coarse-floor-violating (sub-1000) years, five-digit years, year 0000,
 *   impossible calendar dates, garbage strings, finer-than-resolution bounds,
 *   inverted bounds, non-string bounds, stray keys from the other picker,
 *   invalid / small-year anchors, negative / fractional / wrong-typed
 *   offsets, wrong-typed `parameters` records, and absent records.
 *
 * ## Exclusions (out of contract, each with its evidence)
 *
 * - NetworkComposer (and any other v8-only stage type): v7 data cannot
 *   contain it, and this branch records the decision that hand-crafted cases
 *   fail closed (commit 7a95777f7 "drop composer paths from v7 migration").
 * - References to variables that do not exist (validation reference rules,
 *   form-field / prompt `variable`s): dangling references are deliberately
 *   left to the schema's reference pass — migration.ts's cross-type strip
 *   states "Dangling references are outside this step's scope; the reference
 *   pass reports them as it always has" — and that rejection predates this
 *   branch (`validateEntityAttributeReferences` at merge-base 35c501846).
 *   Such a protocol imports as invalid for the author to fix, by design.
 * - Categorical/ordinal `options` with fewer than two entries: rejected by
 *   the pre-existing `.min(2)` on `categoricalOptionsSchema` (also at
 *   merge-base 35c501846). No repair can invent participant-facing options,
 *   so the shape fails closed.
 * - Form fields over variables that define no `component`: the pre-existing
 *   schema check ("must define a component", merge-base 35c501846) rejects
 *   them; the migration notes record that such protocols crashed the v7
 *   interview when the form rendered, so they fail closed rather than get a
 *   fabricated control. (Componentless variables NOT referenced by a form
 *   are valid v8 and are fuzzed as such.)
 * - Values that cannot appear in a `.netcanvas` JSON document (NaN,
 *   Infinity, undefined-in-arrays, functions): protocols are JSON files.
 *
 * ## Determinism and debugging
 *
 * All randomness flows from mulberry32 seeded by (SEED, caseIndex, slot), so
 * every case is reproducible in isolation: each mutation slot draws from its
 * own PRNG stream, which also makes any SUBSET of a case's mutations
 * replayable for minimisation. To re-run one failing case while debugging,
 * add a temporary test:
 *
 *   it.only('repro', () => {
 *     const failure = runCase(SEED, CASE_INDEX);
 *     throw new Error(describeFailure(failure));
 *   });
 *
 * and to shrink its mutation list, `minimizeCase(SEED, CASE_INDEX)` returns
 * the smallest still-failing slot subset (greedy ddmin over slots).
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — Math.random/Date.now are forbidden here.
// ---------------------------------------------------------------------------

type Rng = () => number;

const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const mixSeed = (seed: number, caseIndex: number, slot: number): number =>
  ((seed * 73856093) ^
    ((caseIndex + 1) * 19349663) ^
    ((slot + 1) * 83492791)) >>>
  0;

const pick = <T>(rng: Rng, values: readonly T[]): T => {
  const index = Math.floor(rng() * values.length);
  const value = values[Math.min(index, values.length - 1)];
  if (value === undefined) throw new Error('pick from empty list');
  return value;
};

// ---------------------------------------------------------------------------
// Untyped-JSON navigation helpers (the template is mutated as raw JSON).
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecordOrThrow = (
  value: unknown,
  what: string,
): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`expected ${what} to be a record`);
  return value;
};

// ---------------------------------------------------------------------------
// The v7 template. A realistic, VALID v7 protocol: ego, node, and edge
// codebooks covering every v7 variable type, and form-bearing stages of
// v7-legal interface types. The unmutated template must migrate cleanly (see
// the first test below).
// ---------------------------------------------------------------------------

type EntityRef = { entity: 'ego' } | { entity: 'node' | 'edge'; type: string };

type VariableRef = {
  where: EntityRef;
  key: string;
  variableType: string;
};

const buildTemplate = (): Record<string, unknown> => ({
  schemaVersion: 7,
  description: 'Fuzz template',
  codebook: {
    ego: {
      variables: {
        egoName: {
          name: 'egoName',
          type: 'text',
          component: 'Text',
          validation: { required: true },
        },
        egoAge: { name: 'egoAge', type: 'number', component: 'Number' },
        egoYears: { name: 'egoYears', type: 'number', component: 'Number' },
        egoMood: {
          name: 'egoMood',
          type: 'scalar',
          component: 'VisualAnalogScale',
        },
        egoEmployed: {
          name: 'egoEmployed',
          type: 'boolean',
          component: 'Boolean',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
        egoInterests: {
          name: 'egoInterests',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Sports', value: 'sports' },
            { label: 'Music', value: 'music' },
            { label: 'Reading', value: 'reading' },
          ],
        },
        egoDob: {
          name: 'egoDob',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'full', min: '1900-01-01', max: '2030-12-31' },
        },
        egoStart: {
          name: 'egoStart',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-01-01', before: 365, after: 30 },
        },
      },
    },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        displayVariable: 'name',
        variables: {
          name: {
            name: 'name',
            type: 'text',
            component: 'Text',
            validation: { required: true },
          },
          nickname: {
            name: 'nickname',
            type: 'text',
            component: 'TextArea',
            validation: { minLength: 2 },
          },
          age: {
            name: 'age',
            type: 'number',
            component: 'Number',
            validation: { minValue: 0, maxValue: 120 },
          },
          income: { name: 'income', type: 'number', component: 'Number' },
          closeness: {
            name: 'closeness',
            type: 'scalar',
            component: 'VisualAnalogScale',
          },
          trust: {
            name: 'trust',
            type: 'scalar',
            component: 'VisualAnalogScale',
          },
          isActive: {
            name: 'isActive',
            type: 'boolean',
            component: 'Boolean',
            options: [
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ],
          },
          attended: {
            name: 'attended',
            type: 'boolean',
            component: 'Toggle',
            options: [
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ],
          },
          isMember: { name: 'isMember', type: 'boolean', component: 'Boolean' },
          freq: {
            name: 'freq',
            type: 'ordinal',
            component: 'RadioGroup',
            options: [
              { label: 'Never', value: 0 },
              { label: 'Sometimes', value: 1 },
              { label: 'Often', value: 2 },
            ],
          },
          role: {
            name: 'role',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: 'Friend', value: 'friend' },
              { label: 'Family', value: 'family' },
              { label: 'Colleague', value: 'colleague' },
            ],
            validation: { minSelected: 1 },
          },
          dob: {
            name: 'dob',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'full', min: '1900-01-01', max: '2030-12-31' },
          },
          metYear: {
            name: 'metYear',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'year', min: '1950', max: '2026' },
          },
          lastSeen: {
            name: 'lastSeen',
            type: 'datetime',
            component: 'RelativeDatePicker',
            parameters: { anchor: '2024-06-01', before: 180, after: 0 },
          },
          pos: { name: 'pos', type: 'layout' },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          strength: {
            name: 'strength',
            type: 'ordinal',
            component: 'RadioGroup',
            options: [
              { label: 'Weak', value: 1 },
              { label: 'Medium', value: 2 },
              { label: 'Strong', value: 3 },
            ],
          },
          note: { name: 'note', type: 'text', component: 'Text' },
          since: {
            name: 'since',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'month', min: '1990-01', max: '2026-06' },
          },
          catTag: {
            name: 'catTag',
            type: 'categorical',
            component: 'ToggleButtonGroup',
            options: [
              { label: 'Work', value: 'work' },
              { label: 'Social', value: 'social' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'ng',
      type: 'NameGenerator',
      label: 'Name people',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: 'name', prompt: 'Their name' }],
      },
      prompts: [{ id: 'ng-p1', text: 'Who do you know?' }],
      panels: [
        {
          id: 'ng-panel1',
          dataSource: 'existing',
          title: 'People',
          filter: {
            rules: [
              {
                type: 'alter',
                id: 'ng-r1',
                options: { type: 'person', operator: 'EXISTS' },
              },
            ],
          },
        },
      ],
      skipLogic: {
        action: 'SKIP',
        filter: {
          rules: [
            {
              type: 'alter',
              id: 'ng-r2',
              options: { type: 'person', operator: 'NOT_EXISTS' },
            },
          ],
        },
      },
    },
    {
      id: 'ego-form',
      type: 'EgoForm',
      label: 'About you',
      introductionPanel: {
        title: 'About you',
        text: 'Tell us about yourself.',
      },
      form: {
        title: 'Legacy title',
        fields: [
          { variable: 'egoName', prompt: 'Your name' },
          { variable: 'egoAge', prompt: 'Your age' },
          { variable: 'egoDob', prompt: 'Your date of birth' },
          { variable: 'egoEmployed', prompt: 'Are you employed?' },
        ],
      },
    },
    {
      id: 'alter-form',
      type: 'AlterForm',
      label: 'About them',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: 'About them',
        text: 'Tell us about each person.',
      },
      form: {
        fields: [
          { variable: 'nickname', prompt: 'Nickname' },
          { variable: 'age', prompt: 'Age' },
          { variable: 'dob', prompt: 'Date of birth' },
          { variable: 'freq', prompt: 'How often do you talk?' },
          { variable: 'role', prompt: 'Their role' },
          { variable: 'closeness', prompt: 'How close are you?' },
          { variable: 'isActive', prompt: 'Active contact?' },
        ],
      },
    },
    {
      id: 'edge-form',
      type: 'AlterEdgeForm',
      label: 'About the tie',
      subject: { entity: 'edge', type: 'knows' },
      introductionPanel: {
        title: 'About the tie',
        text: 'Tell us about each relationship.',
      },
      form: {
        fields: [
          { variable: 'strength', prompt: 'Strength' },
          { variable: 'note', prompt: 'Note' },
          { variable: 'since', prompt: 'Since when?' },
        ],
      },
    },
    {
      id: 'socio',
      type: 'Sociogram',
      label: 'Position people',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      prompts: [
        {
          id: 'socio-p1',
          text: 'Position the people you know',
          layout: { layoutVariable: 'pos' },
          edges: { create: 'knows', display: ['knows'] },
        },
        {
          id: 'socio-p2',
          text: 'Highlight active contacts',
          layout: { layoutVariable: 'pos' },
          highlight: { allowHighlighting: true, variable: 'isActive' },
        },
      ],
    },
    {
      id: 'obin',
      type: 'OrdinalBin',
      label: 'Contact frequency',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'obin-p1',
          text: 'How often do you talk?',
          variable: 'freq',
          color: 'ord-color-seq-3',
        },
      ],
    },
    {
      id: 'cbin',
      type: 'CategoricalBin',
      label: 'Group people',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'cbin-p1', text: 'Group the people you know', variable: 'role' },
      ],
    },
    {
      id: 'info',
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [
        {
          id: 'info-1',
          type: 'text',
          content: 'Welcome to the study.',
          size: 'MEDIUM',
        },
      ],
    },
    {
      id: 'story',
      type: 'Narrative',
      label: 'Narrative',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4 },
      presets: [{ id: 'preset-1', label: 'Overview', layoutVariable: 'pos' }],
      behaviours: { allowRepositioning: true },
    },
  ],
});

// Variables referenced by a form field somewhere in the template. A form
// field over a componentless variable is rejected by a pre-existing v8 check
// (see the exclusions above), so component-removing mutations avoid these.
const FORM_REFERENCED = new Set([
  'ego:egoName',
  'ego:egoAge',
  'ego:egoDob',
  'ego:egoEmployed',
  'node:person:name',
  'node:person:nickname',
  'node:person:age',
  'node:person:dob',
  'node:person:freq',
  'node:person:role',
  'node:person:closeness',
  'node:person:isActive',
  'edge:knows:strength',
  'edge:knows:note',
  'edge:knows:since',
]);

const refKey = (ref: VariableRef): string =>
  ref.where.entity === 'ego'
    ? `ego:${ref.key}`
    : `${ref.where.entity}:${ref.where.type}:${ref.key}`;

const entityKey = (where: EntityRef): string =>
  where.entity === 'ego' ? 'ego' : `${where.entity}:${where.type}`;

// The structural index of every template variable. Mutations select targets
// from this FIXED index (never from mutated state), so replaying any subset
// of a case's mutation slots reproduces each slot's exact effect — the
// property `minimizeCase` relies on.
const collectVariableRefs = (): VariableRef[] => {
  const template = buildTemplate();
  const codebook = asRecordOrThrow(template.codebook, 'codebook');
  const refs: VariableRef[] = [];
  const addAll = (where: EntityRef, variables: unknown) => {
    if (!isRecord(variables)) return;
    for (const [key, variable] of Object.entries(variables)) {
      if (!isRecord(variable) || typeof variable.type !== 'string') continue;
      refs.push({ where, key, variableType: variable.type });
    }
  };
  addAll({ entity: 'ego' }, asRecordOrThrow(codebook.ego, 'ego').variables);
  for (const [entity, entityName] of [
    ['node', 'node'],
    ['edge', 'edge'],
  ] as const) {
    const definitions = asRecordOrThrow(codebook[entityName], entityName);
    for (const [type, definition] of Object.entries(definitions)) {
      addAll(
        { entity, type },
        asRecordOrThrow(definition, `${entity}.${type}`).variables,
      );
    }
  }
  return refs;
};

const VARIABLE_REFS = collectVariableRefs();

const refsOfType = (...types: string[]): VariableRef[] =>
  VARIABLE_REFS.filter((ref) => types.includes(ref.variableType));

// Same-entity pairs of distinct variables, optionally constrained by type.
const sameEntityPairs = (
  ownerTypes: string[],
  targetTypes: string[],
  requireDifferentType: boolean,
): [VariableRef, VariableRef][] => {
  const pairs: [VariableRef, VariableRef][] = [];
  for (const owner of VARIABLE_REFS) {
    if (!ownerTypes.includes(owner.variableType)) continue;
    for (const target of VARIABLE_REFS) {
      if (target === owner) continue;
      if (entityKey(target.where) !== entityKey(owner.where)) continue;
      if (!targetTypes.includes(target.variableType)) continue;
      if (requireDifferentType && target.variableType === owner.variableType) {
        continue;
      }
      if (!requireDifferentType && target.variableType !== owner.variableType) {
        continue;
      }
      pairs.push([owner, target]);
    }
  }
  return pairs;
};

const variableAt = (
  protocol: Record<string, unknown>,
  ref: VariableRef,
): Record<string, unknown> => {
  const codebook = asRecordOrThrow(protocol.codebook, 'codebook');
  const variables =
    ref.where.entity === 'ego'
      ? asRecordOrThrow(codebook.ego, 'ego').variables
      : asRecordOrThrow(
          asRecordOrThrow(codebook[ref.where.entity], ref.where.entity)[
            ref.where.type
          ],
          'entity definition',
        ).variables;
  return asRecordOrThrow(
    asRecordOrThrow(variables, 'variables')[ref.key],
    `variable ${refKey(ref)}`,
  );
};

const validationOf = (
  variable: Record<string, unknown>,
): Record<string, unknown> => {
  if (!isRecord(variable.validation)) variable.validation = {};
  return asRecordOrThrow(variable.validation, 'validation');
};

const optionsOf = (variable: Record<string, unknown>): unknown[] => {
  if (!Array.isArray(variable.options)) {
    throw new Error('expected variable options array');
  }
  return variable.options;
};

// ---------------------------------------------------------------------------
// Mutation pool. Each mutation returns a trace string, or null when it has no
// applicable target (the runner then draws a different mutation).
// ---------------------------------------------------------------------------

type Mutation = {
  name: string;
  apply: (protocol: Record<string, unknown>, rng: Rng) => string | null;
};

const setValidation = (
  protocol: Record<string, unknown>,
  ref: VariableRef,
  entries: Record<string, unknown>,
): string => {
  const validation = validationOf(variableAt(protocol, ref));
  for (const [rule, value] of Object.entries(entries)) {
    validation[rule] = value;
  }
  return `${refKey(ref)} validation ${JSON.stringify(entries)}`;
};

const setParameters = (
  protocol: Record<string, unknown>,
  ref: VariableRef,
  entries: Record<string, unknown>,
): string => {
  const variable = variableAt(protocol, ref);
  if (!isRecord(variable.parameters)) variable.parameters = {};
  const parameters = asRecordOrThrow(variable.parameters, 'parameters');
  for (const [key, value] of Object.entries(entries)) {
    parameters[key] = value;
  }
  return `${refKey(ref)} parameters ${JSON.stringify(entries)}`;
};

const NUMBER_PAIRS = sameEntityPairs(['number'], ['number'], false);
const TEXT_PAIRS = sameEntityPairs(['text'], ['text'], false);
const SCALAR_PAIRS = sameEntityPairs(['scalar'], ['scalar'], false);
const CROSS_TYPE_SAMEAS_PAIRS = sameEntityPairs(
  ['text', 'number', 'boolean', 'ordinal', 'categorical', 'datetime'],
  ['text', 'number', 'boolean', 'ordinal', 'categorical', 'datetime'],
  true,
);
const NUMBER_TO_DATETIME_PAIRS = sameEntityPairs(
  ['number'],
  ['datetime'],
  true,
);
const DATE_PICKER_REFS = VARIABLE_REFS.filter(
  (ref) => ref.variableType === 'datetime',
).filter((ref) => {
  const variable = variableAt(buildTemplate(), ref);
  return variable.component === 'DatePicker';
});
const RELATIVE_REFS = VARIABLE_REFS.filter(
  (ref) => ref.variableType === 'datetime',
).filter((ref) => {
  const variable = variableAt(buildTemplate(), ref);
  return variable.component === 'RelativeDatePicker';
});
const NON_FORM_REFS = VARIABLE_REFS.filter(
  (ref) => !FORM_REFERENCED.has(refKey(ref)),
);
const BOOLEAN_TRIPLE_ENTITIES = (() => {
  const byEntity = new Map<string, VariableRef[]>();
  for (const ref of refsOfType('boolean')) {
    const list = byEntity.get(entityKey(ref.where)) ?? [];
    list.push(ref);
    byEntity.set(entityKey(ref.where), list);
  }
  return [...byEntity.values()].filter((list) => list.length >= 3);
})();

const MISMATCHED_COMPONENTS: Record<string, readonly string[]> = {
  text: ['Number', 'RadioGroup', 'DatePicker'],
  number: ['Text', 'DatePicker', 'CheckboxGroup'],
  scalar: ['Number', 'Text'],
  boolean: ['Text', 'CheckboxGroup', 'RadioGroup'],
  ordinal: ['CheckboxGroup', 'Text', 'Toggle'],
  categorical: ['RadioGroup', 'Toggle', 'Number'],
  datetime: ['Text', 'Toggle', 'Number'],
  layout: ['Text'],
};

const MUTATIONS: Mutation[] = [
  {
    name: 'fractionalBoundValue',
    apply: (protocol, rng) => {
      const targets: [VariableRef, string][] = [
        ...refsOfType('number').flatMap((ref): [VariableRef, string][] => [
          [ref, 'minValue'],
          [ref, 'maxValue'],
        ]),
        ...refsOfType('text').flatMap((ref): [VariableRef, string][] => [
          [ref, 'minLength'],
          [ref, 'maxLength'],
        ]),
        ...refsOfType('categorical').flatMap((ref): [VariableRef, string][] => [
          [ref, 'minSelected'],
          [ref, 'maxSelected'],
        ]),
      ];
      const [ref, rule] = pick(rng, targets);
      const value = pick(rng, [1.5, 2.25, 10.75, -0.5] as const);
      return setValidation(protocol, ref, { [rule]: value });
    },
  },
  {
    name: 'belowFloorCount',
    apply: (protocol, rng) => {
      const variants: [VariableRef[], string, number][] = [
        [refsOfType('text'), 'minLength', -2],
        [refsOfType('text'), 'maxLength', 0],
        [refsOfType('categorical'), 'minSelected', -1],
        [refsOfType('categorical'), 'maxSelected', 0],
      ];
      const [refs, rule, value] = pick(rng, variants);
      return setValidation(protocol, pick(rng, refs), { [rule]: value });
    },
  },
  {
    name: 'hugeIntegerBound',
    apply: (protocol, rng) => {
      const variants: [VariableRef[], string, number][] = [
        [refsOfType('number'), 'minValue', -999999999],
        [refsOfType('number'), 'maxValue', 999999999],
        [refsOfType('text'), 'maxLength', 1000000000],
      ];
      const [refs, rule, value] = pick(rng, variants);
      return setValidation(protocol, pick(rng, refs), { [rule]: value });
    },
  },
  {
    name: 'wrongTypedRuleValue',
    apply: (protocol, rng) => {
      const variants: [VariableRef[], Record<string, unknown>][] = [
        [refsOfType('text'), { minLength: '3' }],
        [refsOfType('number'), { maxValue: '10' }],
        [refsOfType('text', 'number', 'boolean'), { required: 'yes' }],
        [refsOfType('text', 'number'), { required: 1 }],
        [refsOfType('text', 'number'), { unique: 1 }],
        [refsOfType('categorical'), { minSelected: true }],
        [refsOfType('number'), { sameAs: 7 }],
      ];
      const [refs, entries] = pick(rng, variants);
      return setValidation(protocol, pick(rng, refs), entries);
    },
  },
  {
    name: 'invertedBoundPair',
    apply: (protocol, rng) => {
      const variants: [VariableRef[], Record<string, unknown>][] = [
        [refsOfType('number'), { minValue: 10, maxValue: 2 }],
        [refsOfType('text'), { minLength: 8, maxLength: 3 }],
        [refsOfType('categorical'), { minSelected: 3, maxSelected: 1 }],
      ];
      const [refs, entries] = pick(rng, variants);
      return setValidation(protocol, pick(rng, refs), entries);
    },
  },
  {
    name: 'unknownRuleKey',
    apply: (protocol, rng) => {
      const entries = pick(rng, [
        { minWords: 2 },
        { pattern: '^a' },
        { maxDate: '2020-01-01' },
        { allowBlank: true },
      ] as const);
      const ref = pick(rng, refsOfType('text', 'number', 'categorical'));
      return setValidation(protocol, ref, { ...entries });
    },
  },
  {
    name: 'outOfMaskRule',
    apply: (protocol, rng) => {
      const variants: (() => string | null)[] = [
        () =>
          setValidation(protocol, pick(rng, refsOfType('text')), {
            minValue: 5,
          }),
        () =>
          setValidation(protocol, pick(rng, refsOfType('number')), {
            minLength: 2,
          }),
        () =>
          setValidation(protocol, pick(rng, refsOfType('boolean')), {
            minSelected: 1,
          }),
        () =>
          setValidation(protocol, pick(rng, refsOfType('scalar')), {
            unique: true,
          }),
        () =>
          setValidation(protocol, pick(rng, refsOfType('datetime')), {
            maxLength: 10,
          }),
        () =>
          setValidation(protocol, pick(rng, refsOfType('categorical')), {
            minValue: 1,
          }),
        () =>
          setValidation(
            protocol,
            pick(
              rng,
              VARIABLE_REFS.filter((ref) => ref.variableType !== 'layout'),
            ),
            {
              requiredAcceptsNull: true,
            },
          ),
        () => {
          const pairs = SCALAR_PAIRS;
          if (pairs.length === 0) return null;
          const [owner, target] = pick(rng, pairs);
          return setValidation(protocol, owner, { sameAs: target.key });
        },
      ];
      return pick(rng, variants)();
    },
  },
  {
    name: 'layoutValidation',
    apply: (protocol, rng) => {
      const refs = refsOfType('layout');
      if (refs.length === 0) return null;
      return setValidation(protocol, pick(rng, refs), { required: true });
    },
  },
  {
    name: 'selfReference',
    apply: (protocol, rng) => {
      const variants: [VariableRef[], string][] = [
        [refsOfType('text', 'number'), 'differentFrom'],
        [refsOfType('number'), 'greaterThanVariable'],
        [refsOfType('text', 'number'), 'sameAs'],
      ];
      const [refs, rule] = pick(rng, variants);
      const ref = pick(rng, refs);
      return setValidation(protocol, ref, { [rule]: ref.key });
    },
  },
  {
    name: 'crossTypeReference',
    apply: (protocol, rng) => {
      const variants: (() => string | null)[] = [
        () => {
          if (CROSS_TYPE_SAMEAS_PAIRS.length === 0) return null;
          const [owner, target] = pick(rng, CROSS_TYPE_SAMEAS_PAIRS);
          const rule = pick(rng, ['sameAs', 'differentFrom'] as const);
          return setValidation(protocol, owner, { [rule]: target.key });
        },
        () => {
          if (NUMBER_TO_DATETIME_PAIRS.length === 0) return null;
          const [owner, target] = pick(rng, NUMBER_TO_DATETIME_PAIRS);
          return setValidation(protocol, owner, {
            greaterThanVariable: target.key,
          });
        },
      ];
      return pick(rng, variants)();
    },
  },
  {
    name: 'conflictingReferencePair',
    apply: (protocol, rng) => {
      const pairs = [...NUMBER_PAIRS, ...TEXT_PAIRS];
      if (pairs.length === 0) return null;
      const [owner, target] = pick(rng, pairs);
      return setValidation(protocol, owner, {
        sameAs: target.key,
        differentFrom: target.key,
      });
    },
  },
  {
    name: 'comparatorCycle',
    apply: (protocol, rng) => {
      if (NUMBER_PAIRS.length === 0) return null;
      const [a, b] = pick(rng, NUMBER_PAIRS);
      const first = setValidation(protocol, a, { greaterThanVariable: b.key });
      const second = setValidation(protocol, b, {
        greaterThanVariable: a.key,
      });
      return `${first}; ${second}`;
    },
  },
  {
    name: 'oddBooleanDifferentFromCycle',
    apply: (protocol, rng) => {
      if (BOOLEAN_TRIPLE_ENTITIES.length === 0) return null;
      const triple = pick(rng, BOOLEAN_TRIPLE_ENTITIES);
      const [a, b, c] = triple;
      if (!a || !b || !c) return null;
      const traces = [
        setValidation(protocol, a, { differentFrom: b.key }),
        setValidation(protocol, b, { differentFrom: c.key }),
        setValidation(protocol, c, { differentFrom: a.key }),
      ];
      return traces.join('; ');
    },
  },
  {
    name: 'sameAsDisjointBounds',
    apply: (protocol, rng) => {
      if (NUMBER_PAIRS.length === 0) return null;
      const [a, b] = pick(rng, NUMBER_PAIRS);
      const traces = [
        setValidation(protocol, a, {
          sameAs: b.key,
          minValue: 10,
          maxValue: 20,
        }),
        setValidation(protocol, b, { minValue: 30, maxValue: 40 }),
      ];
      return traces.join('; ');
    },
  },
  {
    name: 'minSelectedAboveOptionCount',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('categorical'));
      return setValidation(protocol, ref, { minSelected: 5 });
    },
  },
  {
    name: 'comparatorInsideSameAsGroup',
    apply: (protocol, rng) => {
      if (NUMBER_PAIRS.length === 0) return null;
      const [a, b] = pick(rng, NUMBER_PAIRS);
      return setValidation(protocol, a, {
        sameAs: b.key,
        greaterThanVariable: b.key,
      });
    },
  },
  {
    name: 'pinnedEqualDifferentFrom',
    apply: (protocol, rng) => {
      if (NUMBER_PAIRS.length === 0) return null;
      const [a, b] = pick(rng, NUMBER_PAIRS);
      const traces = [
        setValidation(protocol, a, {
          minValue: 7,
          maxValue: 7,
          differentFrom: b.key,
        }),
        setValidation(protocol, b, { minValue: 7, maxValue: 7 }),
      ];
      return traces.join('; ');
    },
  },
  {
    name: 'boolEmptyOptions',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('boolean'));
      variableAt(protocol, ref).options = [];
      return `${refKey(ref)} options []`;
    },
  },
  {
    name: 'legacyBooleanOptionValue',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('ordinal', 'categorical'));
      const options = optionsOf(variableAt(protocol, ref));
      const option = asRecordOrThrow(pick(rng, options), 'option');
      option.value = pick(rng, [true, false] as const);
      return `${refKey(ref)} option value ${String(option.value)}`;
    },
  },
  {
    name: 'fractionalOptionValue',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('ordinal', 'categorical'));
      const options = optionsOf(variableAt(protocol, ref));
      const option = asRecordOrThrow(pick(rng, options), 'option');
      option.value = pick(rng, [2.5, -0.75, 0.5] as const);
      return `${refKey(ref)} option value ${String(option.value)}`;
    },
  },
  {
    name: 'duplicateOptionValues',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('ordinal', 'categorical'));
      const options = optionsOf(variableAt(protocol, ref));
      const first = asRecordOrThrow(options[0], 'option');
      const second = asRecordOrThrow(options[1], 'option');
      second.value = first.value;
      return `${refKey(ref)} duplicate option value ${String(first.value)}`;
    },
  },
  {
    name: 'numericOptionLabel',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('ordinal', 'categorical'));
      const options = optionsOf(variableAt(protocol, ref));
      const option = asRecordOrThrow(pick(rng, options), 'option');
      option.label = 7;
      return `${refKey(ref)} option label 7`;
    },
  },
  {
    name: 'boolWrongTypedOptionValue',
    apply: (protocol, rng) => {
      const refs = refsOfType('boolean').filter((ref) =>
        Array.isArray(variableAt(buildTemplate(), ref).options),
      );
      if (refs.length === 0) return null;
      const ref = pick(rng, refs);
      const options = optionsOf(variableAt(protocol, ref));
      if (options.length === 0) return null;
      const option = asRecordOrThrow(options[0], 'option');
      option.value = pick(rng, ['true', 'yes', 1] as const);
      return `${refKey(ref)} boolean option value ${JSON.stringify(option.value)}`;
    },
  },
  {
    name: 'mismatchedComponent',
    apply: (protocol, rng) => {
      const refs = VARIABLE_REFS.filter(
        (ref) => MISMATCHED_COMPONENTS[ref.variableType] !== undefined,
      );
      const ref = pick(rng, refs);
      const components = MISMATCHED_COMPONENTS[ref.variableType];
      if (!components) return null;
      const component = pick(rng, components);
      variableAt(protocol, ref).component = component;
      return `${refKey(ref)} component ${component}`;
    },
  },
  {
    name: 'unknownComponent',
    apply: (protocol, rng) => {
      const ref = pick(rng, VARIABLE_REFS);
      const component = pick(rng, [
        'Slider',
        'Checkbox',
        'MarkdownLabel',
        5,
      ] as const);
      variableAt(protocol, ref).component = component;
      return `${refKey(ref)} component ${JSON.stringify(component)}`;
    },
  },
  {
    name: 'dropComponent',
    apply: (protocol, rng) => {
      const refs = NON_FORM_REFS.filter((ref) => ref.variableType !== 'layout');
      if (refs.length === 0) return null;
      const ref = pick(rng, refs);
      delete variableAt(protocol, ref).component;
      return `${refKey(ref)} component removed`;
    },
  },
  {
    name: 'datePickerWrongResolution',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const type = pick(rng, ['week', 'day', 'YEAR', ''] as const);
      return setParameters(protocol, ref, { type });
    },
  },
  {
    name: 'datePickerCoarseSmallYear',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const variant = pick(rng, [
        { type: 'year', min: '0500' },
        { type: 'month', min: '0850-04' },
        { type: 'year', max: '0999' },
      ] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'datePickerFiveDigitYear',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const variant = pick(rng, [
        { min: '12020-01-01' },
        { max: '12020-01-01' },
      ] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'datePickerYearZero',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      return setParameters(protocol, ref, {
        type: 'full',
        min: '0000-06-15',
      });
    },
  },
  {
    name: 'datePickerImpossibleDate',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const variant = pick(rng, [
        { type: 'full', max: '2021-02-31' },
        { type: 'full', min: '2020-13-05' },
      ] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'datePickerGarbageBound',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const variant = pick(rng, [
        { min: 'soon' },
        { min: '2020-01-01oops' },
        { max: '2020garbage' },
      ] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'datePickerFinerThanResolution',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      return setParameters(protocol, ref, { type: 'year', min: '2020-05-03' });
    },
  },
  {
    name: 'datePickerInvertedBounds',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const variant = pick(rng, [
        { type: 'full', min: '2030-01-01', max: '2001-01-01' },
        { type: 'year', min: '2030', max: '2001' },
      ] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'datePickerNonStringBound',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const variant = pick(rng, [{ min: 2020 }, { max: false }] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'datePickerStrayKey',
    apply: (protocol, rng) => {
      const ref = pick(rng, DATE_PICKER_REFS);
      const variant = pick(rng, [
        { anchor: '2020-01-01' },
        { resolution: 'year' },
        { foo: 1 },
      ] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'relStrayKey',
    apply: (protocol, rng) => {
      const ref = pick(rng, RELATIVE_REFS);
      const variant = pick(rng, [
        { type: 'full' },
        { min: '2020-01-01' },
        { foo: true },
      ] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'relAnchorInvalid',
    apply: (protocol, rng) => {
      const ref = pick(rng, RELATIVE_REFS);
      const anchor = pick(rng, [
        'not-a-date',
        '0050-01-01',
        '2020-2-2',
        '2021-02-30',
      ] as const);
      return setParameters(protocol, ref, { anchor });
    },
  },
  {
    name: 'relAnchorSmallYearKept',
    apply: (protocol, rng) => {
      const ref = pick(rng, RELATIVE_REFS);
      return setParameters(protocol, ref, { anchor: '0500-01-15' });
    },
  },
  {
    name: 'relNegativeOffset',
    apply: (protocol, rng) => {
      const ref = pick(rng, RELATIVE_REFS);
      const variant = pick(rng, [{ before: -5 }, { after: -1 }] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'relFractionalOffset',
    apply: (protocol, rng) => {
      const ref = pick(rng, RELATIVE_REFS);
      return setParameters(protocol, ref, { before: 2.5 });
    },
  },
  {
    name: 'relWrongTypedOffset',
    apply: (protocol, rng) => {
      const ref = pick(rng, RELATIVE_REFS);
      const variant = pick(rng, [{ after: '30' }, { before: true }] as const);
      return setParameters(protocol, ref, { ...variant });
    },
  },
  {
    name: 'wrongTypedParametersRecord',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('datetime'));
      const value = pick(rng, ['full', 7, [] as unknown[]] as const);
      variableAt(protocol, ref).parameters = value;
      return `${refKey(ref)} parameters ${JSON.stringify(value)}`;
    },
  },
  {
    name: 'deleteParameters',
    apply: (protocol, rng) => {
      const ref = pick(rng, refsOfType('datetime'));
      delete variableAt(protocol, ref).parameters;
      return `${refKey(ref)} parameters removed`;
    },
  },
];

// ---------------------------------------------------------------------------
// Case runner.
// ---------------------------------------------------------------------------

const SEEDS = [101, 202, 303, 404, 505, 606] as const;
const CASES_PER_SEED = 50;
const MAX_MUTATIONS_PER_CASE = 5;

type CaseResult = {
  seed: number;
  caseIndex: number;
  trace: string[];
  migrated?: unknown;
  error?: string;
  issues?: string;
};

const slotCount = (seed: number, caseIndex: number): number => {
  const rng = mulberry32(mixSeed(seed, caseIndex, 0xffff));
  return 1 + Math.floor(rng() * MAX_MUTATIONS_PER_CASE);
};

const applySlot = (
  protocol: Record<string, unknown>,
  seed: number,
  caseIndex: number,
  slot: number,
): string => {
  const rng = mulberry32(mixSeed(seed, caseIndex, slot));
  for (let attempt = 0; attempt < 20; attempt++) {
    const mutation = pick(rng, MUTATIONS);
    const trace = mutation.apply(protocol, rng);
    if (trace !== null) return `${mutation.name}(${trace})`;
  }
  return 'noop()';
};

const buildCaseProtocol = (
  seed: number,
  caseIndex: number,
  slots?: readonly number[],
): { protocol: Record<string, unknown>; trace: string[] } => {
  const protocol = buildTemplate();
  const trace: string[] = [];
  const allSlots =
    slots ?? Array.from({ length: slotCount(seed, caseIndex) }, (_, i) => i);
  for (const slot of allSlots) {
    trace.push(applySlot(protocol, seed, caseIndex, slot));
  }
  return { protocol, trace };
};

const migrate = (protocol: Record<string, unknown>): unknown =>
  migrationV7toV8.migrate(protocol as unknown as Protocol<7>, {
    name: 'Fuzz Protocol',
  });

/**
 * Runs one case: applies the slots' mutations, migrates, and validates
 * against the v8 schema. Returns the failure details (error or issues) when
 * the property does not hold.
 */
const runCase = (
  seed: number,
  caseIndex: number,
  slots?: readonly number[],
): CaseResult => {
  const { protocol, trace } = buildCaseProtocol(seed, caseIndex, slots);
  const result: CaseResult = { seed, caseIndex, trace };
  let migrated: unknown;
  try {
    migrated = migrate(structuredClone(protocol));
  } catch (thrown) {
    result.error = `migration threw: ${String(thrown)}`;
    return result;
  }
  result.migrated = migrated;
  const parsed = ProtocolSchemaV8.safeParse(migrated);
  if (!parsed.success) {
    result.issues = JSON.stringify(parsed.error.issues, null, 2);
  }
  return result;
};

const describeFailure = (result: CaseResult): string =>
  [
    `seed=${result.seed} case=${result.caseIndex}`,
    `mutations:\n  ${result.trace.join('\n  ')}`,
    result.error ?? '',
    result.issues ? `v8 validation issues:\n${result.issues}` : '',
  ]
    .filter(Boolean)
    .join('\n');

/**
 * Debugging helper (not called in CI): greedily removes mutation slots while
 * the case still fails, returning the minimal failing slot subset. Use with a
 * temporary `it.only` alongside `runCase(seed, caseIndex, slots)`.
 */
export const minimizeCase = (
  seed: number,
  caseIndex: number,
): { slots: number[]; failure: string } => {
  const failing = (slots: number[]): CaseResult | null => {
    const result = runCase(seed, caseIndex, slots);
    return result.error !== undefined || result.issues !== undefined
      ? result
      : null;
  };
  let slots = Array.from({ length: slotCount(seed, caseIndex) }, (_, i) => i);
  let last = failing(slots);
  if (!last) throw new Error('case does not fail');
  for (let i = slots.length - 1; i >= 0; i--) {
    const candidate = slots.filter((slot) => slot !== slots[i]);
    const result = failing(candidate);
    if (result) {
      slots = candidate;
      last = result;
    }
  }
  return { slots, failure: describeFailure(last) };
};

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('migration fuzz: v7 protocols in contract migrate to valid v8', () => {
  it('migrates the unmutated template to a valid v8 protocol', () => {
    const result = runCase(0, 0, []);
    expect(result.error ?? result.issues ?? '', describeFailure(result)).toBe(
      '',
    );
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: ${CASES_PER_SEED} mutated protocols migrate to valid v8`, () => {
      for (let caseIndex = 0; caseIndex < CASES_PER_SEED; caseIndex++) {
        const result = runCase(seed, caseIndex);
        expect(
          result.error ?? result.issues ?? '',
          describeFailure(result),
        ).toBe('');
      }
    });
  }

  it('migration is deterministic (two runs on the same input are deeply equal)', () => {
    for (const seed of SEEDS) {
      for (let caseIndex = 0; caseIndex < CASES_PER_SEED; caseIndex += 10) {
        const { protocol, trace } = buildCaseProtocol(seed, caseIndex);
        const first = migrate(structuredClone(protocol));
        const second = migrate(structuredClone(protocol));
        expect(
          second,
          `seed=${seed} case=${caseIndex} mutations: ${trace.join('; ')}`,
        ).toEqual(first);
      }
    }
  });
});
