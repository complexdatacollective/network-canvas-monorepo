import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  findUnreachableLayoutReads,
  findVariableRoleConflicts,
  validateProtocol,
} from '@codaco/protocol-validation';
import { COLOR_PALETTES } from '~/config';
import { BUNDLED_TEMPLATES } from '~/templates';
import { developmentProtocol } from '~/templates/development-protocol';
import { sampleProtocol } from '~/templates/sample-protocol';

import { templateVariableId } from './templateCodebookIds';

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
    consentVariableId: templateVariableId(
      getBundledTemplateProtocol('mental-health-networks'),
      'ego',
      'participant_consent',
    ),
    postConsentStageId: 'fd9f5be8-b2b3-5726-85de-07389d271295',
  },
  {
    name: 'Transnational Networks',
    protocol: getBundledTemplateProtocol('transnational-networks'),
    consentStageId: '119d6fac-a86e-5d29-8cec-f45706c7dfab',
    consentVariableId: templateVariableId(
      getBundledTemplateProtocol('transnational-networks'),
      'ego',
      'participant_consent',
    ),
    postConsentStageId: 'fd4859da-00a0-539b-9859-e7d38390c7fd',
  },
  {
    name: 'Colored Eco-Genetic Relationship Map (CEGRM)',
    protocol: getBundledTemplateProtocol('eco-genetic-relationship-maps'),
    consentStageId: '26e4299a-7c2b-5c20-99ef-487a1df48ee6',
    consentVariableId: templateVariableId(
      getBundledTemplateProtocol('eco-genetic-relationship-maps'),
      'ego',
      'participant_consent',
    ),
    postConsentStageId: 'cc153ac8-ff58-512b-bc51-92d3d88cc215',
  },
  {
    name: 'Help-Seeking After Intimate Partner Violence',
    protocol: getBundledTemplateProtocol('ipv-help-seeking-networks'),
    consentStageId: 'a71bf3f6-c9e0-58bd-bec3-33bb206b3849',
    consentVariableId: templateVariableId(
      getBundledTemplateProtocol('ipv-help-seeking-networks'),
      'ego',
      'participant_consent',
    ),
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

// The same first impression, for the timeline warning from
// `UnreachableLayoutsAlert`: a stage that shows positions from a layout in
// which no stage places its nodes, so those nodes are shown there only if a
// roster gives them positions.
//
// Three bundled protocols still open with it, each with a Narrative that
// shows a layout no stage places its people in. Slice 12a of the schema 9
// plan repairs them. Each is listed with exactly the reads it has now, so a
// new read in a listed protocol fails as well as one in any other protocol,
// and a repaired read forces its entry to be removed.
type LayoutRead = ReturnType<typeof findUnreachableLayoutReads>[number];

const KNOWN_UNREACHABLE_LAYOUT_READS: ReadonlyMap<string, LayoutRead[]> =
  new Map([
    [
      // The Narrative's second preset shows anotherLayout for people.
      'Development Protocol',
      [
        {
          stageId: '1a38659b-f2ec-5fc1-9718-36a9de0b3ce8',
          presetId: '78af7c87-b4a0-5ecc-9255-f52de2c1e87f',
          layoutId: 'e13ca72d-aefe-4f48-841d-09f020e0e987',
          nodeTypes: ['02f0c3a5-008e-58e9-91ce-0cd152fbe22a'],
        },
      ],
    ],
    [
      // The Narrative's three presets show a layout that no stage places in.
      'Behavioural Influence Networks',
      [
        'a160fa07-0edc-5564-88cd-0a9c9b11ac83',
        'd3da7416-5989-5979-ad4e-cdcac3c46663',
        '59da2f24-3470-5c3a-8cfc-4c21783cb0af',
      ].map((presetId) => ({
        stageId: '7665dd8f-3669-5f75-b4ba-a67b43e06f5c',
        presetId,
        layoutId: 'a08b8051-1e97-5445-89a0-be9d247dbc0a',
        nodeTypes: ['d2196845-950a-5f79-a394-618fcb5028bf'],
      })),
    ],
    [
      // The Narrative shows a layout in which no stage places supporters.
      'Care & Support Networks',
      [
        {
          stageId: '792ae959-4ecb-5ce5-9d4b-f648e3563acc',
          presetId: 'aa7cbf0f-c1cd-55c4-9696-56d96be740e2',
          layoutId: '353f0d07-aa7a-5ccb-a899-7e079cfa5ba8',
          nodeTypes: ['55ab482e-6ed4-5905-bc48-37acdcc7871c'],
        },
      ],
    ],
  ]);

describe('bundled protocols open without unreachable layout reads', () => {
  for (const { name, protocol } of bundledProtocols) {
    const known = KNOWN_UNREACHABLE_LAYOUT_READS.get(name);
    it(`${name} ${known ? 'still shows only its known' : 'shows no'} layout that no stage places its nodes in`, () => {
      expect(findUnreachableLayoutReads(protocol)).toStrictEqual(known ?? []);
    });
  }

  it('names only bundled protocols in its list of known exceptions', () => {
    const names = new Set(bundledProtocols.map(({ name }) => name));
    expect(
      [...KNOWN_UNREACHABLE_LAYOUT_READS.keys()].filter(
        (name) => !names.has(name),
      ),
    ).toStrictEqual([]);
  });

  it('lists no protocol with no reads among its known exceptions', () => {
    expect(
      [...KNOWN_UNREACHABLE_LAYOUT_READS.entries()]
        .filter(([, reads]) => reads.length === 0)
        .map(([name]) => name),
    ).toStrictEqual([]);
  });
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
