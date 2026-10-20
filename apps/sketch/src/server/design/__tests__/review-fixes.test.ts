import { describe, expect, it } from 'vitest';

// @vitest-environment node
//
// Regressions found in review: each design compiled to a protocol that
// validated (or failed in a way the model could not act on) but behaved wrongly
// in an interview.
import { findVariableRoleConflicts } from '@codaco/protocol-validation';

import { analyse } from '../analyse.ts';
import { buildProtocol } from '../build.ts';
import { NOW, parseDesign } from './helpers.ts';

type Json = Record<string, unknown>;
type Stage = Json & {
  id: string;
  type: string;
  panels?: { dataSource: string }[];
  prompts?: { text: string }[];
  filter?: { rules: { options: Json }[] };
  skipLogic?: {
    action: string;
    filter: { join?: string; rules: { type: string; options: Json }[] };
    destination?: { type: string };
  };
};

const always = {
  mode: 'always_show',
  whenSkipped: 'next_stage',
  match: 'all',
  conditions: [],
};
const noFilter = { match: 'all', conditions: [] };
const A = (id: string, kind: string, question = 'Q?', rest: Json = {}) => ({
  id,
  label: id,
  kind,
  question,
  options: [],
  optionScores: [],
  numberRange: [],
  required: false,
  ...rest,
});
const c = (id: string) => ({
  id,
  purpose: 'p',
  interviewerNote: '',
  skipLogic: always,
});
const person = (attributes: Json[] = []) => ({
  id: 'person',
  singular: 'Person',
  plural: 'People',
  represents: 'people',
  nameQuestion: 'Name?',
  attributes,
});
const design = (over: Json) => ({
  workingTitle: 'T',
  summary: 'S.',
  rationale: 'R',
  administration: 'face_to_face',
  qualitative: true,
  burdenEstimate: {
    expectedPeople: 12,
    screens: 30,
    itemsPerPerson: 4,
    minutes: 20,
  },
  includeConsent: false,
  consentText: '',
  egoAttributes: [],
  nodeTypes: [person()],
  relationships: [],
  stages: [],
  ...over,
});
const ng = (id = 'ng', extra: Json = {}) => ({
  kind: 'nameGenerator',
  ...c(id),
  nodeTypeId: 'person',
  method: 'quick_add',
  attributeIds: [],
  prompts: [{ text: 'Who?', tagAttributeId: '' }],
  minNodes: 0,
  maxNodes: 0,
  ...extra,
});

const build = async (d: Json) => {
  const r = await buildProtocol(parseDesign(d), null, { now: NOW });
  return {
    ...r,
    stages: r.protocol.stages as unknown as Stage[],
    codes: r.issues.map((i) => i.code),
  };
};
const stageById = (stages: Stage[], id: string) => {
  const s = stages.find((x) => x.id === id);
  if (!s) throw new Error(`stage ${id} missing`);
  return s;
};
const varNames = (protocol: unknown, type: string) =>
  Object.values(
    (
      protocol as {
        codebook: { node: Record<string, { variables: Json }> };
      }
    ).codebook.node[type]!.variables,
  ).map((v) => (v as { name: string }).name);

describe('compiler review fixes', () => {
  it.each(['quick_add', 'form'])(
    'gives a %s generator with several prompts an "already mentioned" panel',
    async (method) => {
      const r = await build(
        design({
          nodeTypes: [person([A('age', 'number', 'Age?')])],
          stages: [
            ng('ng', {
              method,
              attributeIds: method === 'form' ? ['age'] : [],
              prompts: [
                {
                  text: 'Who do you drink with?',
                  tagAttributeId: 'drinks_with',
                },
                {
                  text: 'Who do you study with?',
                  tagAttributeId: 'studies_with',
                },
              ],
            }),
          ],
        }),
      );
      expect(r.validation.success).toBe(true);
      expect(stageById(r.stages, 'ng').panels?.[0]?.dataSource).toBe(
        'existing',
      );
    },
  );

  it('never merges the no-nodes auto-skip into a skip that ends the interview', async () => {
    const r = await build(
      design({
        egoAttributes: [A('drinks', 'yes_no', 'Do you drink?')],
        nodeTypes: [
          person([
            A('freq', 'ordered', 'How often?', {
              options: ['never', 'sometimes', 'often'],
            }),
          ]),
        ],
        stages: [
          { kind: 'egoForm', ...c('e'), attributeIds: ['drinks'] },
          ng(),
          {
            kind: 'bins',
            ...c('b'),
            nodeTypeId: 'person',
            filter: noFilter,
            skipLogic: {
              mode: 'skip_if',
              whenSkipped: 'end_interview',
              match: 'all',
              conditions: [
                {
                  about: 'participant',
                  typeId: '',
                  attributeId: 'drinks',
                  operator: 'is',
                  value: 'no',
                },
              ],
            },
            prompts: [
              {
                text: 'How often do they drink?',
                attributeId: 'freq',
                allowOther: false,
              },
            ],
          },
          { kind: 'egoForm', ...c('e2'), attributeIds: ['drinks'] },
          {
            kind: 'information',
            ...c('bye'),
            role: 'closing',
            content: 'Thanks',
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    for (const s of r.stages)
      if (s.skipLogic?.destination?.type === 'finish')
        expect(
          s.skipLogic.filter.rules.map((x) => x.options.operator),
        ).not.toContain('NOT_EXISTS');
    const sk = stageById(r.stages, 'b').skipLogic;
    expect(sk?.destination).toEqual({ type: 'finish' });
    expect(sk?.filter.rules).toHaveLength(1);
  });

  it('adds the no-nodes guard to a "show only if" condition on the participant', async () => {
    const r = await build(
      design({
        egoAttributes: [A('drinks', 'yes_no', 'Do you drink?')],
        nodeTypes: [person([A('age', 'number', 'Age?')])],
        stages: [
          { kind: 'egoForm', ...c('e'), attributeIds: ['drinks'] },
          ng(),
          {
            kind: 'alterForm',
            ...c('af'),
            nodeTypeId: 'person',
            filter: noFilter,
            attributeIds: ['age'],
            skipLogic: {
              mode: 'show_only_if',
              whenSkipped: 'next_stage',
              match: 'all',
              conditions: [
                {
                  about: 'participant',
                  typeId: '',
                  attributeId: 'drinks',
                  operator: 'is',
                  value: 'yes',
                },
              ],
            },
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    const sk = stageById(r.stages, 'af').skipLogic;
    expect(sk?.action).toBe('SHOW');
    expect(sk?.filter.join).toBe('AND');
    expect(sk?.filter.rules.map((x) => [x.type, x.options.operator])).toEqual([
      ['ego', 'EXACTLY'],
      ['node', 'EXISTS'],
    ]);
  });

  it('keeps a yes_no attribute that only mentions consent as ordinary data', async () => {
    const r = await build(
      design({
        egoAttributes: [
          A(
            'recontact_consent',
            'yes_no',
            'May we contact you for a follow-up study?',
          ),
        ],
        stages: [
          { kind: 'egoForm', ...c('e'), attributeIds: ['recontact_consent'] },
          ng(),
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(r.design.includeConsent).toBe(false);
    expect(r.codes).not.toContain('CONSENT_FOLDED');
    expect(r.codes).not.toContain('CONSENT_FORM_REMOVED');
    expect(r.stages.map((s) => s.type)).toContain('EgoForm');
  });

  it('folds a true consent attribute as degraded, so attempt 1 retries', async () => {
    const r = await build(
      design({
        egoAttributes: [A('consent', 'yes_no', 'Do you agree?')],
        stages: [ng()],
      }),
    );
    expect(r.design.includeConsent).toBe(true);
    expect(r.issues.find((i) => i.code === 'CONSENT_FOLDED')?.severity).toBe(
      'degraded',
    );
    expect(r.retry).toBe(true);
  });

  it('names an Other variable around a declared "<attr>_other" attribute', async () => {
    const r = await build(
      design({
        nodeTypes: [
          person([
            A('role', 'single_choice', 'Role?', {
              options: ['friend', 'family'],
            }),
            A('role_other', 'text', 'Other role?'),
          ]),
        ],
        stages: [
          ng(),
          {
            kind: 'bins',
            ...c('b'),
            nodeTypeId: 'person',
            filter: noFilter,
            prompts: [{ text: 'Role?', attributeId: 'role', allowOther: true }],
          },
        ],
      }),
    );
    expect(
      r.validation.success,
      JSON.stringify(r.validation.error?.issues),
    ).toBe(true);
    expect(varNames(r.protocol, 'person')).toEqual(
      expect.arrayContaining(['role', 'role_other', 'role_other_2']),
    );
  });

  it('flags a form generator that follows an earlier generator of the same type', async () => {
    const r = await build(
      design({
        nodeTypes: [person([A('age', 'number', 'Age?')])],
        stages: [ng(), ng('later', { method: 'form', attributeIds: ['age'] })],
      }),
    );
    expect(r.codes).toContain('FORM_AFTER_NAMES');
    expect(r.retry).toBe(true);
  });

  it('keeps multi_choice attributes out of bins, which record one choice', async () => {
    const r = await build(
      design({
        nodeTypes: [
          person([
            A('roles', 'multi_choice', 'Roles?', {
              options: ['friend', 'family'],
            }),
          ]),
        ],
        stages: [
          ng(),
          {
            kind: 'bins',
            ...c('b'),
            nodeTypeId: 'person',
            filter: noFilter,
            prompts: [
              { text: 'Roles?', attributeId: 'roles', allowOther: false },
            ],
          },
        ],
      }),
    );
    expect(r.codes).toContain('WRONG_KIND');
    expect(r.stages.some((s) => s.type === 'CategoricalBin')).toBe(false);
  });

  it('drops a tag whose id has no usable characters instead of emitting an empty variable', async () => {
    const r = await build(
      design({
        stages: [
          ng('ng', { prompts: [{ text: '谁?', tagAttributeId: '朋友' }] }),
        ],
      }),
    );
    expect(
      r.validation.success,
      JSON.stringify(r.validation.error?.issues),
    ).toBe(true);
    expect(varNames(r.protocol, 'person')).not.toContain('');
    expect(r.codes).toContain('MISSING_ATTRIBUTE');
    expect(stageById(r.stages, 'ng').prompts).toHaveLength(1);
  });

  it('reports a filter condition on an un-sluggable attribute id', async () => {
    const r = await build(
      design({
        stages: [
          ng(),
          {
            kind: 'alterForm',
            ...c('af'),
            nodeTypeId: 'person',
            filter: {
              match: 'all',
              conditions: [
                { attributeId: '—', operator: 'answered', value: '' },
              ],
            },
            attributeIds: ['name'],
          },
        ],
      }),
    );
    expect(r.codes).toContain('UNKNOWN_ATTRIBUTE');
  });

  it.each([
    [
      'alterForm',
      { kind: 'alterForm', ...c('f'), nodeTypeId: 'person', filter: noFilter },
    ],
    ['form nameGenerator', ng('f', { method: 'form' })],
  ])(
    'rejects the geospatial location attribute in a %s in design terms',
    async (_, form) => {
      const r = await build(
        design({
          nodeTypes: [person([A('age', 'number', 'Age?')])],
          stages: [
            ng(),
            {
              kind: 'geospatial',
              ...c('g'),
              nodeTypeId: 'person',
              filter: noFilter,
              mapRegion: 'world',
              prompts: [{ text: 'Where?', locationAttributeId: 'country' }],
            },
            { ...form, attributeIds: ['country', 'age'] },
          ],
        }),
      );
      expect(
        r.validation.success,
        JSON.stringify(r.validation.error?.issues),
      ).toBe(true);
      expect(r.codes).toContain('WRONG_KIND');
      expect(JSON.stringify(stageById(r.stages, 'f'))).not.toContain(
        'person_country',
      );
    },
  );

  it('removes an "all" condition on a second node type, which no single node could meet', async () => {
    const nt = (id: string) => ({ ...person(), id, singular: id, plural: id });
    const r = await build(
      design({
        nodeTypes: [nt('a'), nt('b')],
        stages: [
          ng('n1', { nodeTypeId: 'a' }),
          ng('n2', { nodeTypeId: 'b' }),
          {
            kind: 'information',
            ...c('i'),
            role: 'transition',
            content: 'x',
            skipLogic: {
              mode: 'show_only_if',
              whenSkipped: 'next_stage',
              match: 'all',
              conditions: ['a', 'b'].map((typeId) => ({
                about: 'nodes',
                typeId,
                attributeId: '',
                operator: 'any_exist',
                value: '',
              })),
            },
          },
        ],
      }),
    );
    expect(r.codes).toContain('MIXED_ALL_CONDITION');
    const types = stageById(r.stages, 'i').skipLogic?.filter.rules.map(
      (x) => x.options.type,
    );
    expect(types).toEqual(['a']);
  });

  it.each([
    ['is', 'no', 'NOT'],
    ['is_not', 'yes', 'NOT'],
    ['is', 'yes', 'EXACTLY'],
    ['is_not', 'no', 'EXACTLY'],
  ])(
    'compiles yes_no %s "%s" against true, so a never-set tag counts as no',
    async (operator, value, compiled) => {
      const r = await build(
        design({
          nodeTypes: [person([A('age', 'number', 'Age?')])],
          stages: [
            ng('ng', {
              prompts: [
                { text: 'Who drinks with you?', tagAttributeId: 'drinks_with' },
              ],
            }),
            {
              kind: 'alterForm',
              ...c('af'),
              nodeTypeId: 'person',
              filter: {
                match: 'all',
                conditions: [{ attributeId: 'drinks_with', operator, value }],
              },
              attributeIds: ['age'],
            },
          ],
        }),
      );
      expect(r.validation.success).toBe(true);
      expect(stageById(r.stages, 'af').filter?.rules[0]?.options).toMatchObject(
        { operator: compiled, value: true },
      );
    },
  );

  it.each([
    ['is', 'no', 'EXACTLY', false],
    ['is_not', 'yes', 'EXACTLY', false],
    ['is', 'yes', 'EXACTLY', true],
    ['is_not', 'no', 'EXACTLY', true],
  ])(
    'compiles a form yes_no %s "%s" exactly, so a blank answer matches neither',
    async (operator, value, compiled, compiledValue) => {
      const r = await build(
        design({
          egoAttributes: [A('drinks', 'yes_no', 'Do you drink?')],
          stages: [
            { kind: 'egoForm', ...c('e'), attributeIds: ['drinks'] },
            {
              kind: 'information',
              ...c('i'),
              role: 'transition',
              content: 'Thanks.',
              skipLogic: {
                mode: 'show_only_if',
                whenSkipped: 'next_stage',
                match: 'all',
                conditions: [
                  {
                    about: 'participant',
                    typeId: '',
                    attributeId: 'drinks',
                    operator,
                    value,
                  },
                ],
              },
            },
          ],
        }),
      );
      expect(r.validation.success).toBe(true);
      expect(
        stageById(r.stages, 'i').skipLogic?.filter.rules[0]?.options,
      ).toMatchObject({ operator: compiled, value: compiledValue });
    },
  );

  it('removes a narrative whose only map has skip conditions or a filter', async () => {
    const map = (id: string, skipLogic: Json, filter: Json) => ({
      kind: 'sociogram',
      ...c(id),
      skipLogic,
      nodeTypeId: 'person',
      filter,
      prompts: [
        {
          task: 'position',
          text: 'Place them.',
          relationshipId: '',
          attributeId: '',
        },
      ],
    });
    const story = {
      kind: 'narrative',
      ...c('story'),
      nodeTypeId: 'person',
      filter: noFilter,
      views: [
        {
          label: 'Everyone',
          groupByAttributeId: '',
          relationshipIds: [],
          highlightAttributeIds: [],
        },
      ],
    };
    const conditional = {
      mode: 'skip_if',
      whenSkipped: 'next_stage',
      match: 'all',
      conditions: [
        {
          about: 'participant',
          typeId: '',
          attributeId: 'drinks',
          operator: 'is',
          value: 'no',
        },
      ],
    };
    const adults = {
      match: 'all',
      conditions: [{ attributeId: 'age', operator: 'at_least', value: '18' }],
    };
    const withMap = (mapSkip: Json, mapFilter: Json = noFilter) =>
      build(
        design({
          egoAttributes: [A('drinks', 'yes_no', 'Do you drink?')],
          nodeTypes: [person([A('age', 'number', 'Age?')])],
          stages: [
            { kind: 'egoForm', ...c('e'), attributeIds: ['drinks'] },
            ng('ng', { method: 'form', attributeIds: ['age'] }),
            map('map', mapSkip, mapFilter),
            story,
          ],
        }),
      );

    const skipped = await withMap(conditional);
    expect(skipped.codes).toContain('NARRATIVE_WITHOUT_MAP');
    expect(skipped.stages.some((s) => s.id === 'story')).toBe(false);

    const filtered = await withMap(always, adults);
    expect(filtered.codes).not.toContain('BAD_FILTER');
    expect(filtered.codes).toContain('NARRATIVE_WITHOUT_MAP');
    expect(filtered.stages.some((s) => s.id === 'story')).toBe(false);

    const shown = await withMap(always);
    expect(shown.codes).not.toContain('NARRATIVE_WITHOUT_MAP');
    expect(shown.stages.some((s) => s.id === 'story')).toBe(true);
  });

  it('reports a strengthless prompt removed from a mixed with_strength census', async () => {
    const r = await build(
      design({
        relationships: [
          {
            id: 'knows',
            name: 'Know each other',
            attributes: [
              A('strength', 'ordered', '', {
                options: ['weak', 'medium', 'strong'],
              }),
            ],
          },
          { id: 'dates', name: 'Date', attributes: [] },
        ],
        stages: [
          ng(),
          {
            kind: 'relationshipCensus',
            ...c('rc'),
            nodeTypeId: 'person',
            filter: noFilter,
            method: 'with_strength',
            prompts: [
              {
                text: 'How strong?',
                relationshipId: 'knows',
                strengthAttributeId: 'strength',
                noTieLabel: '',
              },
              {
                text: 'Dating?',
                relationshipId: 'dates',
                strengthAttributeId: '',
                noTieLabel: '',
              },
            ],
          },
          {
            kind: 'information',
            ...c('i'),
            role: 'transition',
            content: 'x',
            skipLogic: {
              mode: 'show_only_if',
              whenSkipped: 'next_stage',
              match: 'any',
              conditions: [
                {
                  about: 'relationships',
                  typeId: 'dates',
                  attributeId: '',
                  operator: 'any_exist',
                  value: '',
                },
              ],
            },
          },
        ],
      }),
    );
    expect(stageById(r.stages, 'rc').prompts?.map((p) => p.text)).toEqual([
      'How strong?',
    ]);
    const removed = r.issues.find((i) => i.code === 'NO_STRENGTH_REMOVED');
    expect(removed?.message).toContain('"Dating?" was removed');
    expect(r.issues.map((i) => i.message).join('\n')).not.toContain(
      'asked as a yes/no',
    );
    // "dates" ties are never created, so a later condition on them is reported
    expect(r.codes).toContain('CONDITION_BEFORE_COLLECTED');
  });

  it('picks a free id for a map attribute when "<id>_map" is also taken', async () => {
    const r = await build(
      design({
        nodeTypes: [
          person([
            A('country', 'text', 'Country?'),
            A('country_map', 'text', 'Map note?'),
          ]),
        ],
        stages: [
          ng('ng', {
            method: 'form',
            attributeIds: ['country', 'country_map'],
          }),
          {
            kind: 'geospatial',
            ...c('g'),
            nodeTypeId: 'person',
            filter: noFilter,
            mapRegion: 'world',
            prompts: [{ text: 'Where?', locationAttributeId: 'country' }],
          },
        ],
      }),
    );
    expect(
      r.validation.success,
      JSON.stringify(r.validation.error?.issues),
    ).toBe(true);
    expect(r.codes).toContain('LOCATION_RENAMED');
    expect(varNames(r.protocol, 'person')).toContain('country_map_2');
  });

  it('asks for consent before an opening screen that is not a welcome', async () => {
    const opening = (role: string) =>
      design({
        administration: 'face_to_face',
        qualitative: true,
        burdenEstimate: {
          expectedPeople: 12,
          screens: 30,
          itemsPerPerson: 4,
          minutes: 20,
        },
        includeConsent: true,
        consentText: 'Do you agree?',
        stages: [
          { kind: 'information', ...c('intro'), role, content: 'Hello' },
          ng(),
        ],
      });
    const order = async (role: string) => {
      const { stages } = await build(opening(role));
      const ids = stages.map((s) => s.id);
      return ids.findIndex((id) => id.includes('consent')) <
        ids.indexOf('intro')
        ? 'consent first'
        : 'consent after';
    };
    expect(await order('welcome')).toBe('consent after');
    expect(await order('instructions')).toBe('consent first');
  });

  it('asks every roster prompt about each person picked, so overlaps are kept', async () => {
    const r = await build(
      design({
        nodeTypes: [
          person([A('close', 'yes_no', ''), A('advice', 'yes_no', '')]),
        ],
        stages: [
          ng('roster', {
            method: 'roster',
            prompts: [
              { text: 'Who are you **close** to?', tagAttributeId: 'close' },
              {
                text: 'Who do you ask for **advice**?',
                tagAttributeId: 'advice',
              },
            ],
          }),
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    const ids = r.stages.map((s) => s.id);
    expect(ids.indexOf('roster_overlap')).toBe(ids.indexOf('roster') + 1);
    const form = stageById(r.stages, 'roster_overlap') as Stage & {
      form: { fields: { prompt: string }[] };
    };
    expect(form.type).toBe('AlterForm');
    expect(form.form.fields.map((f) => f.prompt)).toEqual([
      'Who are you **close** to?',
      'Who do you ask for **advice**?',
    ]);
    // the form is the only writer, so its validation is never bypassed
    expect(findVariableRoleConflicts(r.protocol)).toEqual([]);
    expect(JSON.stringify(stageById(r.stages, 'roster'))).not.toContain(
      'additionalAttributes',
    );
  });

  it('keeps a tag named before a form, and drops it from the form', async () => {
    const r = await build(
      design({
        nodeTypes: [
          person([
            A('advice', 'yes_no', 'Do you ask them?'),
            A('age', 'number', 'Age?'),
          ]),
        ],
        stages: [
          ng('ng', {
            prompts: [
              { text: 'Who do you ask for advice?', tagAttributeId: 'advice' },
            ],
          }),
          {
            kind: 'alterForm',
            ...c('details'),
            nodeTypeId: 'person',
            filter: noFilter,
            attributeIds: ['advice', 'age'],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(findVariableRoleConflicts(r.protocol)).toEqual([]);
    expect(r.codes).toContain('FORM_FIELD_WRITTEN_ELSEWHERE');
    expect(r.codes).not.toContain('WRITTEN_WITHOUT_VALIDATION');
  });

  it('keeps a form answer that a stage before a later bins reads', async () => {
    const closeness = A('close', 'ordered', 'How close?', {
      options: ['Not', 'Somewhat', 'Very'],
    });
    const r = await build(
      design({
        nodeTypes: [person([closeness, A('age', 'number', 'Age?')])],
        stages: [
          ng('ng'),
          {
            kind: 'alterForm',
            ...c('early'),
            nodeTypeId: 'person',
            filter: noFilter,
            attributeIds: ['close'],
          },
          {
            kind: 'alterForm',
            ...c('reader'),
            nodeTypeId: 'person',
            filter: {
              match: 'all',
              conditions: [
                { attributeId: 'close', operator: 'is', value: 'Very' },
              ],
            },
            attributeIds: ['age'],
          },
          {
            kind: 'bins',
            ...c('late'),
            nodeTypeId: 'person',
            filter: noFilter,
            prompts: [
              { text: 'How close?', attributeId: 'close', allowOther: false },
            ],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(findVariableRoleConflicts(r.protocol)).toEqual([]);
    const ids = r.stages.map((x) => x.id);
    expect(ids).toContain('early');
    expect(ids).not.toContain('late');
    expect(r.codes).toContain('WRITTEN_BY_FORM');
  });

  it('reads a tag as unset until the form that asks it has run', async () => {
    const r = await build(
      design({
        nodeTypes: [
          person([A('age', 'number', 'Age?'), A('close', 'yes_no', 'Close?')]),
        ],
        stages: [
          ng('ng', {
            prompts: [
              { text: 'Who are you close to?', tagAttributeId: 'close' },
            ],
          }),
          {
            kind: 'alterForm',
            ...c('early'),
            nodeTypeId: 'person',
            filter: {
              match: 'all',
              conditions: [
                { attributeId: 'close', operator: 'is', value: 'no' },
              ],
            },
            attributeIds: ['age'],
          },
          {
            kind: 'alterForm',
            ...c('ask'),
            nodeTypeId: 'person',
            filter: noFilter,
            attributeIds: ['close'],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(
      stageById(r.stages, 'early').filter?.rules[0]?.options,
    ).toMatchObject({ operator: 'NOT', value: true });
  });

  it('removes a narrative view attribute that no earlier stage collects', async () => {
    const r = await build(
      design({
        nodeTypes: [
          person([
            A('close', 'yes_no', 'Close?'),
            A('group', 'single_choice', 'Group?', {
              options: ['A', 'B'],
            }),
          ]),
        ],
        stages: [
          ng(),
          {
            kind: 'sociogram',
            ...c('map'),
            nodeTypeId: 'person',
            filter: noFilter,
            prompts: [
              {
                task: 'position',
                text: 'Place them.',
                relationshipId: '',
                attributeId: '',
              },
            ],
          },
          {
            kind: 'narrative',
            ...c('story'),
            nodeTypeId: 'person',
            filter: noFilter,
            views: [
              {
                label: 'Groups',
                groupByAttributeId: 'group',
                relationshipIds: [],
                highlightAttributeIds: ['close'],
              },
            ],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(
      r.codes.filter((x) => x === 'VIEW_ATTRIBUTE_NOT_COLLECTED'),
    ).toHaveLength(2);
  });

  it('renames a reserved attribute to an id nothing else uses', async () => {
    const r = await build(
      design({
        egoAttributes: [
          A('name_value', 'text', 'Nickname?'),
          A('name', 'text', 'Full name?'),
        ],
        stages: [
          { kind: 'egoForm', ...c('e'), attributeIds: ['name_value', 'name'] },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    const fields = (
      stageById(r.stages, 'e') as Stage & {
        form: { fields: { prompt: string }[] };
      }
    ).form.fields.map((f) => f.prompt);
    expect(fields).toEqual(['Nickname?', 'Full name?']);
  });

  it('gives a second map question on the same location its own answer', async () => {
    const r = await build(
      design({
        stages: [
          ng('ng'),
          {
            kind: 'geospatial',
            ...c('g'),
            nodeTypeId: 'person',
            filter: noFilter,
            mapRegion: 'world',
            prompts: [
              { text: 'Where were they born?', locationAttributeId: 'country' },
              { text: 'Where do they live?', locationAttributeId: 'country' },
            ],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(r.codes).toContain('LOCATION_DUPLICATE');
    expect(varNames(r.protocol, 'person')).toEqual(
      expect.arrayContaining(['country', 'country_2']),
    );
  });

  it('keeps two map questions apart when the location id is taken by another attribute', async () => {
    const r = await build(
      design({
        nodeTypes: [person([A('country', 'text', 'Which country?')])],
        stages: [
          ng('ng'),
          {
            kind: 'geospatial',
            ...c('g'),
            nodeTypeId: 'person',
            filter: noFilter,
            mapRegion: 'world',
            prompts: [
              { text: 'Where were they born?', locationAttributeId: 'country' },
              { text: 'Where do they live?', locationAttributeId: 'country' },
            ],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    const map = stageById(r.stages, 'g') as unknown as {
      prompts: { variable: string }[];
    };
    const vars = map.prompts.map((p) => p.variable);
    expect(new Set(vars).size).toBe(2);
  });

  it('keeps a map a narrative reuses when its only highlight moves to a form', async () => {
    const r = await build(
      design({
        nodeTypes: [person([A('close', 'yes_no', 'Are you close?')])],
        stages: [
          ng('ng'),
          {
            kind: 'alterForm',
            ...c('f'),
            nodeTypeId: 'person',
            filter: noFilter,
            attributeIds: ['close'],
          },
          {
            kind: 'sociogram',
            ...c('map'),
            nodeTypeId: 'person',
            filter: noFilter,
            prompts: [
              {
                task: 'highlight',
                text: 'Tap the people you are close to.',
                relationshipId: '',
                attributeId: 'close',
              },
            ],
          },
          {
            kind: 'narrative',
            ...c('story'),
            nodeTypeId: 'person',
            filter: noFilter,
            views: [
              {
                label: 'Everyone',
                groupByAttributeId: '',
                relationshipIds: [],
                highlightAttributeIds: [],
              },
            ],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(findVariableRoleConflicts(r.protocol)).toEqual([]);
    const ids = r.stages.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['map', 'story']));
  });

  it('caps a roster minimum before generating its rows', async () => {
    const r = await build(
      design({
        stages: [ng('roster', { method: 'roster', minNodes: 5_000_000 })],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(r.codes).toContain('MIN_LOWERED');
    expect(JSON.stringify(r.protocol)).toContain('50 example rows');
  });

  it('generates enough placeholder rows for a roster minimum', async () => {
    const r = await build(
      design({
        stages: [ng('roster', { method: 'roster', minNodes: 15 })],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(JSON.stringify(r.protocol)).toContain('15 example rows');
  });
});

describe('instrument attributes', () => {
  it('records a scored attribute under the id it ends up with', () => {
    const scored = {
      options: ['Never', 'Sometimes', 'Often'],
      optionScores: [0, 1, 2],
    };
    const { design: d } = analyse(
      parseDesign(
        design({
          egoAttributes: [
            A('stress', 'ordered', 'How often stressed?', scored),
            A('stress', 'ordered', 'How often tired?', scored),
          ],
          stages: [{ kind: 'egoForm', ...c('e'), attributeIds: ['stress'] }],
        }),
      ),
    );
    expect(d.instrumentAttributes).toEqual(['ego/stress', 'ego/stress_2']);
  });

  const mapStages = (prompts: Json[]) => [
    ng(),
    {
      kind: 'sociogram',
      ...c('map'),
      nodeTypeId: 'person',
      filter: noFilter,
      prompts,
    },
  ];
  const connect = (relationshipId: string) => ({
    task: 'connect',
    text: `Who ${relationshipId}?`,
    relationshipId,
    attributeId: '',
  });

  it('shows only the relationship being drawn on a connect prompt', async () => {
    const r = await build(
      design({
        relationships: [
          { id: 'knows', name: 'Know each other', attributes: [] },
          { id: 'conflict', name: 'In conflict', attributes: [] },
        ],
        stages: mapStages([connect('knows'), connect('conflict')]),
      }),
    );
    expect(r.validation.success).toBe(true);
    const prompts = stageById(r.stages, 'map').prompts as unknown as {
      edges: { create: string; display: string[] };
    }[];
    expect(prompts.map((p) => p.edges)).toEqual([
      { create: 'knows', display: ['knows'] },
      { create: 'conflict', display: ['conflict'] },
    ]);
  });

  const composer = {
    kind: 'networkComposer',
    ...c('canvas'),
    interviewerNote: 'Talk it through.',
    nodeTypeId: 'person',
    attributeIds: ['role'],
    groupAttributeId: 'circles',
    relationships: [{ relationshipId: 'knows', attributeIds: [] }],
  };
  const narrative = {
    kind: 'narrative',
    ...c('story'),
    nodeTypeId: 'person',
    filter: noFilter,
    views: [
      {
        label: 'Your circles',
        groupByAttributeId: 'circles',
        relationshipIds: ['knows'],
        highlightAttributeIds: [],
      },
    ],
  };
  const composerDesign = (over: Json = {}) =>
    design({
      nodeTypes: [
        person([
          A('role', 'text', 'What is their role?'),
          A('circles', 'multi_choice', '', { options: ['Work', 'Family'] }),
        ]),
      ],
      relationships: [{ id: 'knows', name: 'Know each other', attributes: [] }],
      stages: [composer, narrative],
      ...over,
    });

  it('builds a network composer that a narrative can reuse', async () => {
    const r = await build(composerDesign());
    expect(
      r.validation.success,
      JSON.stringify(r.validation.error?.issues),
    ).toBe(true);
    expect(r.retry).toBe(false);
    const canvas = stageById(r.stages, 'canvas');
    expect(canvas).toMatchObject({
      type: 'NetworkComposer',
      quickAdd: 'person_name',
      layoutVariable: 'person_layout',
      convexHullVariable: 'person_circles',
      nodeForm: { fields: [{ variable: 'person_role', component: 'Text' }] },
      edges: [{ subject: { entity: 'edge', type: 'knows' } }],
    });
    // it creates the people, so it is never skipped for want of them
    expect(canvas.skipLogic).toBeUndefined();
    expect(stageById(r.stages, 'story').type).toBe('Narrative');
    // the participant may have arranged the composer by hand
    expect(stageById(r.stages, 'story').behaviours).toMatchObject({
      automaticLayout: false,
    });
  });

  it.each([
    ['self_administered', true],
    ['face_to_face', false],
  ])(
    'removes narrative and composer stages when administration is %s and qualitative is %s',
    async (administration, qualitative) => {
      const r = await build(
        composerDesign({
          administration,
          qualitative,
          stages: [
            ng(),
            {
              kind: 'sociogram',
              ...c('map'),
              nodeTypeId: 'person',
              filter: noFilter,
              prompts: [connect('knows')],
            },
            narrative,
            composer,
          ],
        }),
      );
      expect(r.validation.success).toBe(true);
      expect(r.stages.map((s) => s.type)).not.toContain('Narrative');
      expect(r.stages.map((s) => s.type)).not.toContain('NetworkComposer');
      expect(
        r.issues.filter((i) => i.code === 'NEEDS_FACE_TO_FACE_QUALITATIVE'),
      ).toHaveLength(2);
    },
  );

  it('keeps a composer group that a later form also asks out of that form', async () => {
    const r = await build(
      composerDesign({
        stages: [
          composer,
          {
            kind: 'alterForm',
            ...c('form'),
            nodeTypeId: 'person',
            filter: noFilter,
            attributeIds: ['circles', 'role'],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(findVariableRoleConflicts(r.protocol as never)).toEqual([]);
    expect(stageById(r.stages, 'canvas').convexHullVariable).toBe(
      'person_circles',
    );
  });

  it('drops a narrative when a generator after its map adds people with no position', async () => {
    const r = await build(
      design({
        relationships: [
          { id: 'knows', name: 'Know each other', attributes: [] },
        ],
        stages: [
          ...mapStages([connect('knows')]),
          ng('ng_more'),
          {
            ...narrative,
            views: [{ ...narrative.views[0], groupByAttributeId: '' }],
          },
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(r.stages.map((s) => s.type)).not.toContain('Narrative');
    expect(
      r.issues.find((i) => i.code === 'NARRATIVE_WITHOUT_MAP')?.message,
    ).toMatch(/after that sociogram adds/);
  });

  it('keeps an earlier relationship form answer that a later strength census also asks', async () => {
    const strength = A('strength', 'ordered', 'How close are they?', {
      options: ['Not close', 'Close', 'Very close'],
    });
    const census = (id: string, method: string) => ({
      kind: 'relationshipCensus',
      ...c(id),
      nodeTypeId: 'person',
      filter: noFilter,
      method,
      prompts: [
        {
          text: 'Do these two know each other?',
          relationshipId: 'knows',
          strengthAttributeId: method === 'with_strength' ? 'strength' : '',
          noTieLabel: method === 'with_strength' ? 'Not at all' : '',
        },
      ],
    });
    const r = await build(
      design({
        relationships: [
          { id: 'knows', name: 'Know each other', attributes: [strength] },
        ],
        stages: [
          ng(),
          census('pairs', 'every_pair'),
          {
            kind: 'relationshipForm',
            ...c('tie_form'),
            relationshipId: 'knows',
            attributeIds: ['strength'],
          },
          census('strength_census', 'with_strength'),
        ],
      }),
    );
    expect(r.validation.success).toBe(true);
    expect(findVariableRoleConflicts(r.protocol as never)).toEqual([]);
    expect(r.stages.map((s) => s.id)).toContain('tie_form');
    expect(r.stages.map((s) => s.id)).not.toContain('strength_census');
  });

  it('drops a second bins question that would overwrite the same attribute', async () => {
    const bins = (id: string, text: string) => ({
      kind: 'bins',
      ...c(id),
      nodeTypeId: 'person',
      filter: noFilter,
      prompts: [{ text, attributeId: 'freq', allowOther: false }],
    });
    const r = await build(
      design({
        nodeTypes: [
          person([
            A('freq', 'ordered', 'How often?', {
              options: ['never', 'sometimes', 'often'],
            }),
          ]),
        ],
        stages: [
          ng(),
          bins('b1', 'How often do you see them?'),
          bins('b2', 'How often do you call them?'),
        ],
      }),
    );
    expect(r.codes).toContain('DUPLICATE_BINS_WRITER');
    expect(r.stages.map((s) => s.id)).toContain('b1');
    expect(r.stages.map((s) => s.id)).not.toContain('b2');
  });

  it('drops a census question on a relationship an earlier question creates', async () => {
    const census = (id: string, text: string) => ({
      kind: 'relationshipCensus',
      ...c(id),
      nodeTypeId: 'person',
      filter: noFilter,
      method: 'every_pair',
      prompts: [
        {
          text,
          relationshipId: 'knows',
          strengthAttributeId: '',
          noTieLabel: '',
        },
      ],
    });
    const r = await build(
      design({
        relationships: [
          { id: 'knows', name: 'Know each other', attributes: [] },
        ],
        stages: [
          ng(),
          census('rc1', 'Do they know each other?'),
          census('rc2', 'Do they work together?'),
        ],
      }),
    );
    expect(r.codes).toContain('DUPLICATE_RELATIONSHIP_CREATOR');
    expect(r.stages.map((s) => s.id)).toContain('rc1');
    expect(r.stages.map((s) => s.id)).not.toContain('rc2');
  });

  it.each([
    ['unfiltered', noFilter, true],
    [
      'filtered to close people',
      {
        match: 'all',
        conditions: [
          {
            about: 'nodes',
            typeId: 'person',
            attributeId: 'close',
            operator: 'is',
            value: 'yes',
          },
        ],
      },
      false,
    ],
  ])(
    'sends back a large %s every_pair census only when it is unfiltered',
    async (_label, filter, flagged) => {
      const r = await build(
        design({
          nodeTypes: [person([A('close', 'yes_no', 'Close?')])],
          relationships: [
            { id: 'knows', name: 'Know each other', attributes: [] },
          ],
          stages: [
            ng(),
            {
              kind: 'alterForm',
              ...c('af'),
              nodeTypeId: 'person',
              filter: noFilter,
              attributeIds: ['close'],
            },
            {
              kind: 'relationshipCensus',
              ...c('rc'),
              nodeTypeId: 'person',
              filter,
              method: 'every_pair',
              prompts: [
                {
                  text: 'Do they know each other?',
                  relationshipId: 'knows',
                  strengthAttributeId: '',
                  noTieLabel: '',
                },
              ],
            },
          ],
        }),
      );
      expect(r.codes.includes('UNFILTERED_CENSUS')).toBe(flagged);
      expect(r.retry).toBe(flagged);
    },
  );
});
