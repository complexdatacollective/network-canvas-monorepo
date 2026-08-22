import { describe, expect, it } from 'vitest';

import { ProtocolBuilder } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { buildSyntheticPayload } from './synthetic-payload.js';

/** The smallest schema-valid EgoForm: an intro panel and one text field. */
function egoFormWithTextField(
  synth: ProtocolBuilder,
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
    const synth = new ProtocolBuilder();
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
    const synth = new ProtocolBuilder();
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
    const synth = new ProtocolBuilder();
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
    const synth = new ProtocolBuilder();
    const person = synth.addNodeType({ name: 'Person' });
    const stage = synth.addStage('Sociogram', {
      subject: { entity: 'node', type: person.id },
      initialNodes: { count: 3 },
    });
    stage.addPrompt();
    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'unseeded',
    });
    // The stage seeds three people, so this is only empty because the walk
    // never reached it.
    expect(session.network.nodes).toHaveLength(0);
    expect(session.network.edges).toHaveLength(0);
  });

  it('leaves the ego unanswered when seedNetwork is not set', () => {
    // Every EgoForm scenario would otherwise open on a form already filled
    // in, and one about what an unanswered form does could not express
    // itself.
    const synth = new ProtocolBuilder();
    egoFormWithTextField(synth, 'fullName');
    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'unseeded-ego',
    });

    expect(synth.getNetwork().ego[entityAttributesProperty]).not.toEqual({});
    expect(session.network.ego[entityAttributesProperty]).toEqual({});
  });

  it('takes the unseeded network from the delegate stopped at stage 0', () => {
    // Not an emptied network but the interview before it started: whatever
    // the generator learns to put in a session, an unseeded fixture keeps
    // showing the untouched one without this adapter being told about it.
    const synth = new ProtocolBuilder();
    const person = synth.addNodeType({ name: 'Person' });
    egoFormWithTextField(synth, 'fullName');
    const stage = synth.addStage('Sociogram', {
      subject: { entity: 'node', type: person.id },
      initialNodes: { count: 3 },
    });
    stage.addPrompt();

    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'unseeded-is-the-delegate',
    });

    expect(session.network).toEqual(
      synth.getInterviewPayload({ stopAt: { stageIndex: 0 } }).network,
    );
  });

  it('rejects a protocol that fails CurrentProtocolSchema', () => {
    const synth = new ProtocolBuilder();
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
});
