import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';
import type { NcNetwork, NcNode, VariableValue } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { createEntityConstraintCache } from '../../constraints/entityConstraintCache';
import {
  reservePromptFixedValues,
  reserveRosterValues,
} from '../../constraints/reservations';
import { UniqueRegistry } from '../../constraints/uniqueRegistry';
import { ValueGenerator } from '../../constraints/ValueGenerator';
import { createSessionClock } from '../../session-engine/clock';
import { SessionEngine } from '../../session-engine/engine';
import { createSessionStreams } from '../../session-engine/streams';
import type { AssetData, SimulationContext } from '../types';

/**
 * One simulator, driven exactly as the walk drives it.
 *
 * Fixtures go through `CurrentProtocolSchema.parse` rather than being cast,
 * because generation READS the `synthetic` descriptors parsing supplies: a
 * hand-built stage would prove a simulator works on protocols no host can
 * produce, and would not notice a schema default going missing.
 *
 * The session engine is the real one, so every assertion below is made about
 * what a simulator managed to WRITE through the engine's primitives — a
 * simulator that mutated the network directly would be writing into a draft
 * the engine also owns, and the fold's own guards (unknown attribute keys,
 * duplicate ids, prompt stamping) would never see it.
 */

export const TEST_SEED = 1234;

/**
 * A pinned end of the start window, so a harness run is byte-reproducible.
 * The session's own date still moves with the seed — that is the model — so
 * nothing here depends on a particular calendar day.
 */
const START_WINDOW = '2026-08-14T12:00:00.000Z';

export const parseProtocol = (
  codebook: unknown,
  stages: unknown[],
): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Simulator test protocol',
    description: 'Drives one simulator the way the walk does.',
    schemaVersion: 8,
    codebook,
    stages,
  });

export type Harness = {
  engine: SessionEngine;
  context: SimulationContext;
  network: NcNetwork;
  nodes: () => NcNode[];
  ego: () => Record<string, VariableValue>;
  /**
   * Put alters into the network the way an earlier stage would have: through
   * the engine, stamped with the stage at `currentStep`.
   */
  seedAlters: (
    count: number,
    options?: {
      currentStep?: number;
      nodeType?: string;
      uid?: (index: number) => string;
      attributes?: (index: number) => Record<string, VariableValue>;
      allowUnknownAttributes?: boolean;
    },
  ) => void;
};

export const harnessFor = (
  protocol: CurrentProtocol,
  {
    seed = TEST_SEED,
    index = 0,
    assetData = {},
  }: { seed?: number; index?: number; assetData?: AssetData } = {},
): Harness => {
  const streams = createSessionStreams(seed, index);
  const clock = createSessionClock(START_WINDOW, streams);
  const engine = new SessionEngine({
    codebook: protocol.codebook,
    stages: protocol.stages,
    clock,
    egoUid: streams.uuid(),
    captureTrace: false,
  });

  const today = clock.startTime.slice(0, 10);
  const interfaceRules = collectInterfaceImpliedRules(protocol);
  const valueGen = new ValueGenerator(seed, today);
  const uniqueRegistry = new UniqueRegistry();
  const entityConstraints = createEntityConstraintCache({
    codebook: protocol.codebook,
    today,
    interfaceRules,
  });

  const handles = { entityConstraints, uniqueRegistry };
  reservePromptFixedValues(handles, protocol.stages);
  reserveRosterValues(handles, protocol.stages, assetData);

  const context: SimulationContext = {
    engine,
    streams,
    protocol,
    assetData,
    today,
    interfaceRules,
    valueGen,
    uniqueRegistry,
    entityConstraints,
  };

  return {
    engine,
    context,
    network: engine.draft.network,
    nodes: () => engine.draft.network.nodes,
    ego: () => engine.draft.network.ego[entityAttributesProperty],
    seedAlters: (count, options = {}) => {
      const {
        currentStep = 0,
        nodeType = 'person',
        uid = (position: number) => `alter-${position}`,
        attributes = (position: number) => ({ name: `Alter ${position}` }),
        allowUnknownAttributes,
      } = options;

      for (let position = 0; position < count; position += 1) {
        engine.addNode({
          nodeType,
          uid: uid(position),
          attributeData: attributes(position),
          currentStep,
          ...(allowUnknownAttributes === undefined
            ? {}
            : { allowUnknownAttributes }),
        });
      }
    },
  };
};

/** A roster row, shaped as the runtime's external-data parse produces one. */
export const rosterRow = (
  uid: string,
  attributes: Record<string, VariableValue>,
  type = 'person',
): NcNode => ({
  [entityPrimaryKeyProperty]: uid,
  type,
  [entityAttributesProperty]: attributes,
});
