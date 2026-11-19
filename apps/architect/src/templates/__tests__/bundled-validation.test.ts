import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  findVariableRoleConflicts,
  validateProtocol,
} from '@codaco/protocol-validation';
import { COLOR_PALETTES } from '~/config';
import { BUNDLED_TEMPLATES } from '~/templates';
import { developmentProtocol } from '~/templates/development-protocol';
import { sampleProtocol } from '~/templates/sample-protocol';

// Architect opens these via `openBundledTemplate`, which deliberately skips the
// migration step (bundled protocols are assumed to already be at the current
// schema version). A protocol that drifts from the schema therefore fails the
// "Protocol Validation Failed" dialog before reaching the editor, so this test
// guards every bundled protocol against the live schema.
const bundledProtocols: { name: string; protocol: CurrentProtocol }[] = [
  { name: 'Sample Protocol', protocol: sampleProtocol },
  { name: 'Development Protocol', protocol: developmentProtocol },
  ...BUNDLED_TEMPLATES.map((template) => ({
    name: template.name,
    protocol: template.protocol,
  })),
];

const getBundledTemplateProtocol = (id: string): CurrentProtocol => {
  const protocol = BUNDLED_TEMPLATES.find(
    (template) => template.id === id,
  )?.protocol;

  if (!protocol) {
    throw new Error(`Missing bundled template protocol: ${id}`);
  }

  return protocol;
};

const consentFlows = [
  {
    name: 'Sample Protocol',
    protocol: sampleProtocol,
    consentStageId: '400b9810-9dc2-11eb-8192-d9f6b822b280',
    consentVariableId: '09306238-68e4-498c-8c12-923eb2eec760',
    postConsentStageId: 'e922f680-32ee-11eb-8503-3b4fa95b8bc6',
  },
  {
    name: 'Mental Health Networks',
    protocol: getBundledTemplateProtocol('mental-health-networks'),
    consentStageId: 'd05688a9-df55-5776-8349-36fc5bf5b17f',
    consentVariableId: 'participant_consent',
    postConsentStageId: 'fd9f5be8-b2b3-5726-85de-07389d271295',
  },
  {
    name: 'Transnational Networks',
    protocol: getBundledTemplateProtocol('transnational-networks'),
    consentStageId: '119d6fac-a86e-5d29-8cec-f45706c7dfab',
    consentVariableId: 'participant_consent',
    postConsentStageId: 'fd4859da-00a0-539b-9859-e7d38390c7fd',
  },
  {
    name: 'Colored Eco-Genetic Relationship Map (CEGRM)',
    protocol: getBundledTemplateProtocol('eco-genetic-relationship-maps'),
    consentStageId: '26e4299a-7c2b-5c20-99ef-487a1df48ee6',
    consentVariableId: 'participant_consent',
    postConsentStageId: 'cc153ac8-ff58-512b-bc51-92d3d88cc215',
  },
  {
    name: 'Help-Seeking After Intimate Partner Violence',
    protocol: getBundledTemplateProtocol('ipv-help-seeking-networks'),
    consentStageId: 'a71bf3f6-c9e0-58bd-bec3-33bb206b3849',
    consentVariableId: 'participant_consent',
    postConsentStageId: 'bafe8137-e019-52e7-afe5-219001d4c55b',
  },
] satisfies {
  name: string;
  protocol: CurrentProtocol;
  consentStageId: string;
  consentVariableId: string;
  postConsentStageId: string;
}[];

describe('bundled protocols validate against the current schema', () => {
  for (const { name, protocol } of bundledProtocols) {
    it(`${name} passes validateProtocol`, async () => {
      const result = await validateProtocol(protocol);
      const issues = result.success
        ? []
        : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      expect(issues).toStrictEqual([]);
    });
  }
});

// A protocol can satisfy the schema and still open with the timeline warning
// from `VariableRoleConflictsAlert` — a variable written both by a form and
// outside one. That is a poor first impression for something a user reaches by
// clicking "Use this template", so bundled protocols must open warning-free.
describe('bundled protocols open without variable role conflicts', () => {
  for (const { name, protocol } of bundledProtocols) {
    it(`${name} writes no variable both with and without validation`, () => {
      const conflicts = findVariableRoleConflicts(protocol).map(
        (conflict) => conflict.variableName,
      );
      expect(conflicts).toStrictEqual([]);
    });
  }
});

describe('bundled template Narrative Pedigree colors', () => {
  const offeredDiseaseColors = new Set(
    Array.from(
      { length: COLOR_PALETTES['node-color-seq'] },
      (_, index) => `node-color-seq-${index + 1}`,
    ),
  );

  it('uses only colors offered by the Architect disease picker', () => {
    const diseaseColors = BUNDLED_TEMPLATES.flatMap(({ name, protocol }) =>
      protocol.stages.flatMap((stage) =>
        stage.type === 'NarrativePedigree'
          ? stage.diseases.map((disease) => ({
              protocol: name,
              disease: disease.label,
              color: disease.color,
            }))
          : [],
      ),
    );

    // Guard the generated assertion: the bundled CEGRM template is expected
    // to exercise Narrative Pedigree, so an empty template list is a broken
    // fixture, not a passing color contract.
    expect(diseaseColors.length).toBeGreaterThan(0);
    expect(
      diseaseColors.filter(({ color }) => !offeredDiseaseColors.has(color)),
    ).toStrictEqual([]);
  });
});

describe('bundled consent flows', () => {
  for (const {
    name,
    protocol,
    consentStageId,
    consentVariableId,
    postConsentStageId,
  } of consentFlows) {
    it(`${name} ends the interview at its own ending when consent is declined`, () => {
      const consentStageIndex = protocol.stages.findIndex(
        (stage) => stage.id === consentStageId,
      );
      const firstPostConsentStageIndex = protocol.stages.findIndex(
        (stage) => stage.id === postConsentStageId,
      );
      const consentStage = protocol.stages[consentStageIndex];
      const firstPostConsentStage = protocol.stages[firstPostConsentStageIndex];

      expect(consentStageIndex).toBeGreaterThanOrEqual(0);
      expect(firstPostConsentStageIndex).toBe(consentStageIndex + 1);
      expect(consentStage?.type).toBe('EgoForm');
      if (consentStage?.type !== 'EgoForm') {
        throw new Error(`Missing consent Ego Form in ${name}`);
      }

      expect(consentStage.form.fields).toContainEqual(
        expect.objectContaining({ variable: consentVariableId }),
      );
      expect(
        protocol.codebook.ego?.variables?.[consentVariableId],
      ).toMatchObject({
        type: 'boolean',
        validation: { required: true },
      });
      expect(firstPostConsentStage?.skipLogic).toMatchObject({
        action: 'SKIP',
        filter: {
          rules: [
            {
              type: 'ego',
              options: {
                attribute: consentVariableId,
                operator: 'EXACTLY',
                value: false,
              },
            },
          ],
        },
        destination: { type: 'stage' },
      });
      // Declining sends the participant to an ending of its own, so their
      // interview is recorded as ended early rather than completed.
      const destination = firstPostConsentStage?.skipLogic?.destination;
      const ending = protocol.stages.find(
        (stage) =>
          destination?.type === 'stage' && stage.id === destination.stageId,
      );
      expect(ending).toMatchObject({
        type: 'FinishSession',
        outcome: 'terminated',
      });
    });
  }
});
