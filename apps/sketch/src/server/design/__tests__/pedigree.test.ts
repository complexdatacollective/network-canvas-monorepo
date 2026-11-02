// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { preflight } from '../build.ts';
import { estimateBurden } from '../burden.ts';
import type { StudyDesign } from '../schema.ts';
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
          },
          {
            text: 'Who in your family has had **ovarian cancer**?',
            attributeId: 'ovarian_cancer',
            onlyFor: 'female',
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
            inheritancePattern: 'autosomalDominant',
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
