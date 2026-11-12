// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { preflight } from '../build.ts';
import { estimateBurden } from '../burden.ts';
import type { DesignStage, StudyDesign } from '../schema.ts';
import { NOW, parseDesign } from './helpers.ts';

const always = {
  mode: 'always_show',
  whenSkipped: 'next_stage',
  match: 'all',
  conditions: [],
} as const;
const yesNo = (id: string, label: string, question = '') => ({
  id,
  label,
  question,
  kind: 'yes_no',
  options: [],
  optionScores: [],
  numberRange: [],
  required: false,
});
const common = (id: string, purpose: string) => ({
  id,
  purpose,
  interviewerNote: '',
  skipLogic: always,
});

// A hereditary cancer study: the family tree, two conditions, a form about
// living relatives, and the tree shown back with the conditions marked.
const design = (overrides: Partial<StudyDesign> = {}): StudyDesign =>
  parseDesign({
    workingTitle: 'Family history of breast and ovarian cancer',
    summary:
      'Women attending a familial cancer clinic draw their family tree and mark relatives with breast or ovarian cancer.',
    rationale:
      'A family pedigree records biological relationships; nomination prompts mark affected relatives.',
    administration: 'face_to_face',
    language: 'en',
    qualitative: false,
    includeConsent: true,
    consentText: 'You will draw your family tree.',
    endings: [],
    egoAttributes: [],
    nodeTypes: [
      {
        id: 'relative',
        singular: 'Relative',
        plural: 'Relatives',
        represents: 'people',
        nameQuestion: 'What do you call this relative?',
        attributes: [
          yesNo('breast_cancer', 'Breast cancer'),
          yesNo('ovarian_cancer', 'Ovarian cancer'),
          yesNo('alive', 'Alive', 'Is this person alive?'),
          {
            id: 'contact',
            label: 'Contact',
            question: 'How often are you in touch with this person?',
            kind: 'ordered',
            options: ['Never', 'Yearly', 'Monthly', 'Weekly'],
            optionScores: [],
            numberRange: [],
            required: false,
          },
        ],
      },
    ],
    relationships: [],
    stages: [
      {
        kind: 'information',
        ...common('welcome', 'Welcome'),
        role: 'welcome',
        content: '# Welcome',
      },
      {
        kind: 'familyPedigree',
        ...common('family', 'The family tree'),
        nodeTypeId: 'relative',
        prompt: 'Add the members of your **biological family**.',
        askGenderIdentity: false,
        completeness: 'firstDegree',
        attributeIds: ['alive'],
        nominationPrompts: [
          {
            text: 'Who in your family has had **breast cancer**?',
            attributeId: 'breast_cancer',
            onlyFor: 'anyone',
            records: 'condition',
          },
          {
            text: 'Who in your family has had **ovarian cancer**?',
            attributeId: 'ovarian_cancer',
            onlyFor: 'female',
            records: 'condition',
          },
        ],
      },
      {
        kind: 'alterForm',
        ...common('contact_form', 'Contact with each relative'),
        nodeTypeId: 'relative',
        filter: {
          match: 'all',
          conditions: [{ attributeId: 'alive', operator: 'is', value: 'yes' }],
        },
        attributeIds: ['contact'],
      },
      {
        kind: 'narrativePedigree',
        ...common('tree', 'The tree with cancers marked'),
        sourceStageId: 'family',
        showAtRiskStatuses: true,
        conditions: [
          {
            attributeId: 'breast_cancer',
            label: 'Breast cancer',
            inheritancePattern: 'autosomalDominant',
          },
          {
            attributeId: 'ovarian_cancer',
            label: 'Ovarian cancer',
            inheritancePattern: 'unknown',
          },
        ],
      },
      {
        kind: 'information',
        ...common('thanks', 'Thanks'),
        role: 'closing',
        content: '# Thank you',
      },
    ],
    burdenEstimate: {
      expectedPeople: 15,
      screens: 25,
      itemsPerPerson: 3,
      minutes: 20,
    },
    ...overrides,
  });

type Stage = {
  id: string;
  type: string;
  sourceStageId?: string;
  showAtRiskStatuses?: boolean;
  nodeConfiguration?: Record<string, unknown>;
  nominationPrompts?: { onlyForSexAssignedAtBirth?: string }[];
  completeness?: { scope: string };
  filter?: { join?: string; rules: { options: Record<string, unknown> }[] };
  skipLogic?: unknown;
};
type Protocol = {
  stages: Stage[];
  codebook: {
    node: Record<string, { variables: Record<string, { name: string }> }>;
    edge: Record<string, { name: string; variables: Record<string, unknown> }>;
  };
};

describe('family and narrative pedigrees', () => {
  it('compiles a valid family tree, its questions and the tree shown back', async () => {
    const result = await preflight(design(), { now: NOW });
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'degraded')).toEqual([]);
    const protocol = result.protocol as unknown as Protocol;
    const pedigree = protocol.stages.find((s) => s.type === 'FamilyPedigree');
    expect(pedigree?.completeness?.scope).toBe('firstDegree');
    expect(
      pedigree?.nominationPrompts?.map((p) => p.onlyForSexAssignedAtBirth),
    ).toEqual([undefined, 'female']);
    const narrative = protocol.stages.find(
      (s) => s.type === 'NarrativePedigree',
    );
    expect(narrative?.sourceStageId).toBe(pedigree?.id);
    expect(narrative?.showAtRiskStatuses).toBe(true);
    const names = Object.values(protocol.codebook.node.relative!.variables).map(
      (v) => v.name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'name',
        'sex_assigned_at_birth',
        'is_participant',
        'relatives_not_recorded',
      ]),
    );
    expect(Object.values(protocol.codebook.edge)[0]?.name).toBe(
      'Family relationship',
    );
  });

  it('never skips the family tree, which starts with no relatives', async () => {
    const result = await preflight(design(), { now: NOW });
    const protocol = result.protocol as unknown as Protocol;
    const pedigree = protocol.stages.find((s) => s.type === 'FamilyPedigree');
    expect(pedigree?.skipLogic).toBeUndefined();
  });

  it('leaves the participant out of later stages about the family', async () => {
    const result = await preflight(design(), { now: NOW });
    const protocol = result.protocol as unknown as Protocol;
    const form = protocol.stages.find((s) => s.type === 'AlterForm');
    expect(form?.filter?.join).toBe('AND');
    expect(form?.filter?.rules[0]?.options).toMatchObject({
      operator: 'NOT',
      value: true,
    });
  });

  it('lists only the conditions given a known inheritance pattern', async () => {
    const result = await preflight(design(), { now: NOW });
    const notes = JSON.stringify(result.protocol.stages[0]);
    expect(notes).toContain('Breast cancer (autosomal dominant)');
    expect(notes).not.toContain('Ovarian cancer (');
  });

  it('asks a family tree question once when a later form repeats it', async () => {
    const base = design();
    const repeat: DesignStage = {
      kind: 'alterForm',
      ...common('again', 'Asks again'),
      skipLogic: { ...always, conditions: [] },
      nodeTypeId: 'relative',
      filter: { match: 'all', conditions: [] },
      attributeIds: ['alive', 'contact'],
    };
    const result = await preflight(
      {
        ...base,
        stages: [...base.stages.slice(0, -1), repeat, base.stages.at(-1)!],
      },
      { now: NOW },
    );
    expect(result.validation.success).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('FORM_FIELD_REPEATED');
    const protocol = result.protocol as unknown as Protocol;
    const again = protocol.stages.filter((s) => s.type === 'AlterForm').at(-1);
    expect(JSON.stringify(again)).not.toContain('"alive"');
  });

  it('keeps a nomination the tree shows when a later form asks it of everyone', async () => {
    const base = design();
    const [welcome, family, , tree, thanks] = base.stages;
    const conditional = {
      ...family!,
      skipLogic: {
        mode: 'show_only_if',
        whenSkipped: 'next_stage',
        match: 'all',
        conditions: [
          {
            about: 'participant',
            typeId: '',
            attributeId: 'has_family',
            operator: 'is',
            value: 'yes',
          },
        ],
      },
    } as const;
    const askAll = {
      kind: 'alterForm',
      ...common('cancers', 'Cancers'),
      nodeTypeId: 'relative',
      filter: { match: 'all', conditions: [] },
      attributeIds: ['breast_cancer', 'contact'],
    } as const;
    const result = await preflight(
      parseDesign({
        ...base,
        egoAttributes: [
          yesNo('has_family', 'Has family', 'Do you know your family?'),
        ],
        stages: [
          welcome!,
          {
            kind: 'egoForm',
            ...common('about', 'About you'),
            attributeIds: ['has_family'],
          },
          conditional,
          tree!,
          askAll,
          thanks!,
        ],
      }),
      { now: NOW },
    );
    expect(result.validation.success).toBe(true);
    const protocol = result.protocol as unknown as Protocol;
    const narrative = JSON.stringify(
      protocol.stages.find((s) => s.type === 'NarrativePedigree'),
    );
    const pedigree = JSON.stringify(
      protocol.stages.find((s) => s.type === 'FamilyPedigree'),
    );
    expect(pedigree).toContain('breast cancer');
    expect(narrative).toBeTruthy();
    expect(result.issues.map((i) => i.code)).not.toContain('WRITTEN_BY_FORM');
  });

  it('never shows a nomination that is not a condition on the tree', async () => {
    const base = design();
    const stages = base.stages.map((s) => {
      if (s.kind === 'familyPedigree')
        return {
          ...s,
          nominationPrompts: [
            ...s.nominationPrompts,
            {
              text: "Whose **health history** don't you know?",
              attributeId: 'history_unknown',
              onlyFor: 'anyone' as const,
              records: 'other' as const,
            },
          ],
        };
      if (s.kind === 'narrativePedigree')
        return {
          ...s,
          conditions: [
            ...s.conditions,
            {
              attributeId: 'history_unknown',
              label: 'History not known',
              inheritancePattern: 'unknown' as const,
            },
          ],
        };
      return s;
    });
    const result = await preflight(
      parseDesign({
        ...base,
        nodeTypes: base.nodeTypes.map((t) => ({
          ...t,
          attributes: [
            ...t.attributes,
            yesNo('history_unknown', 'History unknown'),
          ],
        })),
        stages,
      }),
      { now: NOW },
    );
    expect(result.validation.success).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('NOT_A_CONDITION');
    const narrative = JSON.stringify(
      result.protocol.stages.find((s) => s.type === 'NarrativePedigree'),
    );
    expect(narrative).not.toContain('History not known');
    expect(narrative).toContain('Breast cancer');
  });

  it('turns at-risk statuses off without a professional present', async () => {
    const result = await preflight(
      design({ administration: 'self_administered' }),
      { now: NOW },
    );
    expect(result.validation.success).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain(
      'AT_RISK_SELF_ADMINISTERED',
    );
    const protocol = result.protocol as unknown as Protocol;
    expect(
      protocol.stages.find((s) => s.type === 'NarrativePedigree')
        ?.showAtRiskStatuses,
    ).toBe(false);
  });

  it('keeps the family node type to the pedigree', async () => {
    const d = design();
    const result = await preflight(
      parseDesign({
        ...d,
        stages: [
          ...d.stages.slice(0, 2),
          {
            kind: 'nameGenerator',
            ...common('more', 'More relatives'),
            nodeTypeId: 'relative',
            method: 'quick_add',
            attributeIds: [],
            prompts: [{ text: 'Who else?', tagAttributeId: '' }],
            minNodes: 0,
            maxNodes: 0,
          },
          ...d.stages.slice(2),
        ],
      }),
      { now: NOW },
    );
    expect(result.validation.success).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('PEDIGREE_TYPE_SHARED');
    expect(result.retry).toBe(true);
  });

  it('counts the family tree in the burden estimate', async () => {
    const result = await preflight(design(), { now: NOW });
    const burden = estimateBurden(result.protocol as unknown as Protocol, 10);
    expect(burden.itemsPerPerson).toBeGreaterThanOrEqual(2);
  });

  it('declares a language Network Canvas has no text for, and notes the English it adds', async () => {
    const result = await preflight(design({ language: 'zh-TW' }), {
      now: NOW,
    });
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    expect(JSON.stringify(result.protocol.stages[0])).toContain(
      'Text Sketch adds in English.',
    );
  });

  it('declares Spanish with Network Canvas labels for the family answers', async () => {
    const result = await preflight(design({ language: 'es' }), { now: NOW });
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
  });
});
