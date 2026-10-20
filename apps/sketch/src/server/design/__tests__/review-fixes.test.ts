// @vitest-environment node
//
// Regressions found in review: each design compiled to a protocol that
// validated (or failed in a way the model could not act on) but behaved wrongly
// in an interview.
import { describe, expect, it } from 'vitest';

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
    ['is_not', 'yes', 'NOT', true],
    ['is', 'yes', 'EXACTLY', true],
    ['is_not', 'no', 'NOT', false],
  ])(
    'compiles a form yes_no %s "%s" literally, so a blank answer is not no',
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
});
