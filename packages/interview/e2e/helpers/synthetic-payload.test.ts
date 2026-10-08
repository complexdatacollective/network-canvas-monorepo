import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { buildSyntheticPayload } from './synthetic-payload.js';

/** The smallest schema-valid EgoForm: an intro panel and one text field. */
function egoFormWithTextField(
  synth: SyntheticInterview,
  variableName: string,
): string {
  const variable = synth.addEgoVariable({
    type: 'text',
    component: 'Text',
    name: variableName,
  });
  const stage = synth.addStage('EgoForm', {
    introductionPanel: { title: 'About you', text: 'Please answer.' },
  });
  stage.addFormField({
    variable: variable.id,
    component: 'Text',
    prompt: 'What is your name?',
  });
  return variable.id;
}

describe('buildSyntheticPayload', () => {
  it('produces a schema-valid ProtocolPayload with hash and ResolvedAsset[]', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const stage = synth.addStage('NameGeneratorQuickAdd', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPrompt();
    const { protocol, session, currentStep } = buildSyntheticPayload(synth, {
      protocolName: 'adapter-test',
    });
    // hashProtocol emits base64; assert a stable non-empty digest, not hex
    expect(protocol.hash).toMatch(/^[A-Za-z0-9+/_-]+=*$/);
    expect(protocol.hash.length).toBeGreaterThan(16);
    expect(protocol.id).toBeTruthy();
    expect(Array.isArray(protocol.assets)).toBe(true);
    expect(protocol).not.toHaveProperty('isPreview');
    expect(protocol).not.toHaveProperty('isPending');
    expect(protocol).not.toHaveProperty('assetManifest');
    expect(currentStep).toBe(0);
    expect(typeof session.startTime).toBe('string');
  });

  it('seeds the session network when seedNetwork is set', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const stage = synth.addStage('Sociogram', {
      subject: { entity: 'node', type: person.id },
      initialNodes: { count: 3 },
    });
    stage.addPrompt();
    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'seeded',
      seedNetwork: true,
      currentStep: 0,
    });
    expect(session.network.nodes).toHaveLength(3);
  });

  it('seeds the generated ego attributes when seedNetwork is set', () => {
    const synth = new SyntheticInterview();
    const name = egoFormWithTextField(synth, 'fullName');
    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'seeded-ego',
      seedNetwork: true,
    });

    expect(session.network.ego[entityAttributesProperty][name]).toEqual(
      synth.getNetwork().ego[entityAttributesProperty][name],
    );
  });

  it('starts from an empty network when seedNetwork is not set', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const stage = synth.addStage('Sociogram', {
      subject: { entity: 'node', type: person.id },
      initialNodes: { count: 3 },
    });
    stage.addPrompt();
    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'unseeded',
    });
    expect(session.network.nodes).toHaveLength(0);
    expect(session.network.edges).toHaveLength(0);
  });

  it('empties the ego attributes too when seedNetwork is not set', () => {
    // `getNetwork()` answers every ego variable, so an unseeded run that kept
    // them would open each EgoForm scenario on a form already filled in.
    const synth = new SyntheticInterview();
    egoFormWithTextField(synth, 'fullName');
    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'unseeded-ego',
    });

    expect(synth.getNetwork().ego[entityAttributesProperty]).not.toEqual({});
    expect(session.network.ego[entityAttributesProperty]).toEqual({});
  });

  it('rejects a protocol that fails CurrentProtocolSchema', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const stage = synth.addStage('NameGeneratorRoster', {
      subject: { entity: 'node', type: person.id },
      // roster dataSource must reference a network asset in the manifest
      dataSource: 'no-such-asset',
    });
    stage.addPrompt();
    expect(() =>
      buildSyntheticPayload(synth, { protocolName: 'invalid' }),
    ).toThrow(/CurrentProtocolSchema|dataSource|asset/i);
  });

  describe('with schema8Encryption', () => {
    function interviewWithAnEncryptedName() {
      const synth = new SyntheticInterview();
      const person = synth.addNodeType({ name: 'Person' });
      const name = person.addVariable({
        name: 'name',
        type: 'text',
        encrypted: true,
      });
      const nickname = person.addVariable({ name: 'nickname', type: 'text' });
      const stage = synth.addStage('NameGeneratorQuickAdd', {
        subject: { entity: 'node', type: person.id },
        quickAdd: name.id,
      });
      stage.addPrompt();
      synth.addManualNode(stage.id, person.id, 'alice', {
        [name.id]: 'Alice',
        [nickname.id]: 'Al',
      });
      return { synth, name: name.id, nickname: nickname.id };
    }

    it('stores each encrypted answer as schema 8 ciphertext, beside an IV and a salt of its own, with no header', () => {
      const { synth, name, nickname } = interviewWithAnEncryptedName();
      const { session } = buildSyntheticPayload(synth, {
        protocolName: 'schema-8-encryption',
        seedNetwork: true,
        schema8Encryption: true,
      });

      const [alice] = session.network.nodes;
      expect(session.network.nodes).toHaveLength(1);
      expect(session.network).not.toHaveProperty('encryption');
      expect(alice?.[entityAttributesProperty][name]).toEqual(
        expect.arrayContaining([expect.any(Number)]),
      );
      expect(JSON.stringify(session.network)).not.toContain('Alice');
      expect(alice?.[entityAttributesProperty][nickname]).toBe('Al');
      expect(alice?.[entitySecureAttributesMeta]).toEqual({
        [name]: {
          iv: expect.arrayContaining([expect.any(Number)]),
          salt: expect.arrayContaining([expect.any(Number)]),
        },
      });
      expect(
        alice?.[entitySecureAttributesMeta]?.[name]?.iv ?? [],
      ).toHaveLength(12);
    });

    it('refuses to run without seedNetwork, which leaves no answers to encrypt', () => {
      const { synth } = interviewWithAnEncryptedName();
      expect(() =>
        buildSyntheticPayload(synth, {
          protocolName: 'schema-8-unseeded',
          schema8Encryption: true,
        }),
      ).toThrow(/without seedNetwork/);
    });
  });
});
