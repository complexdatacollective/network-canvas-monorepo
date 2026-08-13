import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { SyntheticInterview } from '../SyntheticInterview';

/**
 * An open full-resolution DatePicker has no submission validator on its
 * missing side, so the ceiling `buildVariableConstraints` gives it is a
 * STAND-IN — today's date marking where an open window was cut off, not a rule
 * a value must satisfy. `maxDerived` is what says so, and `ValueGenerator`
 * reads it before treating a ceiling as authored.
 *
 * Folding two renderings of one variable resolved each side into a closed
 * window and re-emitted the result as plain `parameters.max`, dropping that
 * flag. The stand-in then read as a declared bound, and the same protocol
 * produced different data depending on which entry point built it: the builder
 * clamped every draw into today while `generateNetwork` honoured the declared
 * window. Two entry points, one protocol, two answers.
 */
describe('a folded rendering keeps a stand-in ceiling a stand-in', () => {
  it('draws inside the declared window, as generateNetwork does', () => {
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const plannedDate = person.addVariable({
      type: 'datetime',
      name: 'plannedDate',
      component: 'DatePicker',
      parameters: { type: 'full' },
      synthetic: {
        distribution: 'uniform',
        min: '2030-01-01',
        max: '2035-12-31',
      },
    });

    // Two ordinary forms rendering one variable is what makes the map fold; a
    // single contribution is stored verbatim and never resolved.
    for (let i = 0; i < 2; i += 1) {
      const stage = si.addStage('NameGenerator', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 3 },
        form: {
          fields: [{ variable: plannedDate.id, component: 'DatePicker' }],
        },
      });
      stage.addPrompt({ text: 'name someone' });
    }

    const values = si
      .getNetwork()
      .nodes.map((node) => node[entityAttributesProperty][plannedDate.id]);

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(typeof value).toBe('string');
      expect(String(value) >= '2030-01-01').toBe(true);
      expect(String(value) <= '2035-12-31').toBe(true);
    }
  });

  it('agrees with generateNetwork on the same protocol', () => {
    // The builder assembles a protocol; running that protocol through the
    // engine must describe the same window. Only the folded rendering could
    // make them disagree.
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const plannedDate = person.addVariable({
      type: 'datetime',
      name: 'plannedDate',
      component: 'DatePicker',
      parameters: { type: 'full' },
      synthetic: {
        distribution: 'uniform',
        min: '2030-01-01',
        max: '2035-12-31',
      },
    });
    for (let i = 0; i < 2; i += 1) {
      const stage = si.addStage('NameGenerator', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 3 },
        form: {
          fields: [{ variable: plannedDate.id, component: 'DatePicker' }],
        },
      });
      stage.addPrompt({ text: 'name someone' });
    }

    const protocol = si.getProtocol();
    const { network } = generateNetwork({
      seed: 1,
      codebook: protocol.codebook as never,
      stages: protocol.stages,
    });

    const engineValues = network.nodes
      .map((node) => node[entityAttributesProperty][plannedDate.id])
      .filter((value) => value !== undefined);

    expect(engineValues.length).toBeGreaterThan(0);
    for (const value of engineValues) {
      expect(String(value) >= '2030-01-01').toBe(true);
    }
  });
});
