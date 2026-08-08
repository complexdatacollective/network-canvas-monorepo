import { describe, expect, it } from 'vitest';

import { filter as getFilter } from '@codaco/network-query';
import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { ValueGenerator } from '../../../ValueGenerator';
import { analyseStageEffects } from '../../analyse/stageEffects';
import { resolveGenerationConfig } from '../../config';
import { buildEntityConstraints } from '../../constraints/buildConstraints';
import { UniqueRegistry } from '../../constraints/uniqueRegistry';
import type { GenerationContext } from '../../context';
import { planNetwork } from '../networkPlan';

const TODAY = '2026-08-07';

/**
 * Edges of one type are settled creation by creation, so a later creator's
 * filter is evaluated against the edges earlier creators already committed.
 * What it is NOT evaluated against is the pairs those earlier creators left
 * unselected — and the accumulated domain lets a later creator reach back and
 * take one, at the earlier creator's stage index.
 *
 * That is only sound if it leaves every stage's own filter true of the network
 * as that stage finds it. An edge inserted behind a `NOT_EXISTS` filter is the
 * case that would not: the endpoints it links were counted as unlinked when
 * the later filter chose them, and are linked by the time the session reaches
 * that stage.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        local: {
          name: 'Local',
          type: 'boolean',
          synthetic: { probabilityTrue: 0.5 },
        },
      },
    },
  },
  ego: { variables: {} },
  edge: {
    knows: {
      name: 'Knows',
      color: 'edge-color-seq-1',
      variables: {},
      synthetic: {
        topology: {
          metric: 'density',
          distribution: { distribution: 'constant', value: 0.3 },
        },
      },
    },
  },
} as unknown as StructuralCodebook;

const generator = (id: string, count: number): Stage =>
  ({
    id,
    type: 'NameGeneratorQuickAdd',
    label: id,
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'local',
    prompts: Array.from({ length: count }, (_, index) => ({
      id: `${id}-p${index}`,
      text: 'Who?',
    })),
  }) as unknown as Stage;

/** A sociogram that links people, optionally only the ones marked local. */
const sociogram = (id: string, localsOnly: boolean): Stage =>
  ({
    id,
    type: 'Sociogram',
    label: id,
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: `${id}-p`,
        text: 'Link people',
        edges: { create: 'knows' },
      },
    ],
    background: { concentricCircles: 3, skewedTowardCenter: true },
    behaviours: { freeDraw: true },
    ...(localsOnly
      ? {
          filter: {
            join: 'AND',
            rules: [
              {
                id: `${id}-rule`,
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'local',
                  operator: 'EXACTLY',
                  value: true,
                },
              },
            ],
          },
        }
      : {}),
  }) as unknown as Stage;

const stages: Stage[] = [
  generator('ng-a', 4),
  sociogram('soc-a', true),
  generator('ng-b', 2),
  sociogram('soc-b', false),
];

const makeCtx = (seed: number): GenerationContext =>
  ({
    codebook,
    valueGen: new ValueGenerator(seed, TODAY),
    config: resolveGenerationConfig({ today: TODAY }),
    uniqueRegistry: new UniqueRegistry(),
    usedRosterUids: new Set<string>(),
    respectSkipLogicAndFiltering: true,
    entityConstraints: {
      ego: buildEntityConstraints(codebook.ego?.variables, TODAY),
      node: new Map(
        Object.entries(codebook.node ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
      edge: new Map(
        Object.entries(codebook.edge ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
    },
  }) as unknown as GenerationContext;

describe('an edge backfilled into an earlier creator', () => {
  it('leaves every creating stage’s own filter true of it', () => {
    const effects = analyseStageEffects(stages);
    const filterOf = new Map(
      stages.map((entry, index) => [
        index,
        (entry as { filter?: unknown }).filter,
      ]),
    );
    let checked = 0;

    for (let seed = 1; seed <= 60; seed++) {
      const plan = planNetwork(makeCtx(seed), effects);

      for (const edge of plan.edges) {
        const stageFilter = filterOf.get(edge.creationStageIndex);
        if (stageFilter === undefined) continue;

        // The network as that stage finds it: everything created strictly
        // before it, which is what the runtime evaluates the filter against.
        const network = {
          ego: {
            [entityPrimaryKeyProperty]: plan.ego.uid,
            [entityAttributesProperty]: {},
          },
          nodes: plan.nodes
            .filter((node) => node.creationStageIndex < edge.creationStageIndex)
            .map((node) => ({
              [entityPrimaryKeyProperty]: node.uid,
              type: node.type,
              [entityAttributesProperty]: node.attributes,
            })),
          edges: plan.edges
            .filter(
              (other) => other.creationStageIndex < edge.creationStageIndex,
            )
            .map((other) => ({
              [entityPrimaryKeyProperty]: other.uid,
              type: other.type,
              from: other.from,
              to: other.to,
              [entityAttributesProperty]: {},
            })),
        } as unknown as NcNetwork;

        const admitted = new Set(
          getFilter(stageFilter as never)(network).nodes.map(
            (node) => node[entityPrimaryKeyProperty],
          ),
        );

        checked += 1;
        expect(
          admitted.has(edge.from) && admitted.has(edge.to),
          `seed ${seed}: an edge planned at stage ${edge.creationStageIndex} links endpoints that stage's own filter excludes`,
        ).toBe(true);
      }
    }

    // The guard is only worth anything if edges reached it.
    expect(checked).toBeGreaterThan(0);
  });
});
