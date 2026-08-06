import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { ValueGenerator } from '../../ValueGenerator';
import { analyseStageEffects } from '../analyse/stageEffects';
import { resolveGenerationConfig } from '../config';
import { buildEntityConstraints } from '../constraints/buildConstraints';
import { UniqueRegistry } from '../constraints/uniqueRegistry';
import type { GenerationContext } from '../context';
import { planNetwork } from '../plan/networkPlan';

const TODAY = '2026-07-27';

class LoggingRegistry extends UniqueRegistry {
  log: string[] = [];
  override isTaken(
    scope: string,
    variableId: string,
    value: VariableValue,
  ): boolean {
    const result = super.isTaken(scope, variableId, value);
    this.log.push(`isTaken ${variableId}=${String(value)} -> ${result}`);
    return result;
  }
  override claim(
    scope: string,
    variableId: string,
    value: VariableValue,
  ): void {
    this.log.push(`claim ${variableId}=${String(value)}`);
    super.claim(scope, variableId, value);
  }
}

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      synthetic: { count: { distribution: 'constant', value: 3 } },
      variables: {
        consented: {
          name: 'Consented',
          type: 'boolean',
          validation: { unique: true },
        },
      },
    },
  },
} as unknown as StructuralCodebook;

const rosterStage = {
  id: 'stage-roster',
  type: 'NameGeneratorRoster',
  label: 'Roster',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'roster-asset',
  prompts: [{ id: 'p1', text: 'Pick people' }],
  behaviours: { maxNodes: 3 },
} as unknown as Stage;

const row = (uid: string, consented: boolean) =>
  ({
    [entityPrimaryKeyProperty]: uid,
    type: 'person',
    [entityAttributesProperty]: { consented },
  }) as never;

describe('probe6', () => {
  it('Q15: registry log for seed 1', () => {
    const registry = new LoggingRegistry();
    const ctx: GenerationContext = {
      codebook,
      valueGen: new ValueGenerator(1, TODAY),
      config: resolveGenerationConfig({ today: TODAY }),
      usedRosterUids: new Set(),
      externalData: {
        'stage-roster': [row('a', true), row('b', false), row('c', true)],
      },
      respectSkipLogicAndFiltering: false,
      uniqueRegistry: registry,
      entityConstraints: {
        ego: new Map(),
        node: new Map([
          [
            'person',
            buildEntityConstraints(
              (codebook.node?.person?.variables ?? {}) as never,
              TODAY,
            ),
          ],
        ]),
        edge: new Map(),
      },
    };
    const plan = planNetwork(ctx, analyseStageEffects([rosterStage]));
    console.log(
      'Q15 nodes',
      JSON.stringify(
        plan.nodes.map((node) => [node.uid, node.attributes.consented]),
      ),
    );
    console.log('Q15 log', registry.log.join(' | '));
    expect(true).toBe(true);
  });
});
