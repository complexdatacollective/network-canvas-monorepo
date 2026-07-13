import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { buildSyntheticPayload } from './synthetic-payload.js';

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
});
