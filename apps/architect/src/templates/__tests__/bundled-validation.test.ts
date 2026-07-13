import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
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
    consentStageId: 'information-intro',
    consentVariableId: 'participant_consent',
    postConsentStageId: 'ego-form-background',
  },
  {
    name: 'Transnational Networks',
    protocol: getBundledTemplateProtocol('transnational-networks'),
    consentStageId: 'information-intro',
    consentVariableId: 'participant_consent',
    postConsentStageId: 'ego-form-background',
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

describe('bundled consent flows', () => {
  for (const {
    name,
    protocol,
    consentStageId,
    consentVariableId,
    postConsentStageId,
  } of consentFlows) {
    it(`${name} ends the interview when consent is declined`, () => {
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
        destination: { type: 'finish' },
      });
    });
  }
});
