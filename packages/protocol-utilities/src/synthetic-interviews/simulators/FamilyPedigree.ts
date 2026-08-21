import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  isFamilyPedigreeStageMetadata,
} from '@codaco/shared-consts';

import { claimFixedValues as claimOldFixedValues } from '../../generateNetwork/attributes';
import { resolveGenerationConfig } from '../../generateNetwork/config';
import { buildEntityConstraints } from '../../generateNetwork/constraints/buildConstraints';
import type { EntityConstraints } from '../../generateNetwork/constraints/types';
import { UniqueRegistry as OldUniqueRegistry } from '../../generateNetwork/constraints/uniqueRegistry';
import type {
  GenerationContext as OldGenerationContext,
  NetworkDraft,
} from '../../generateNetwork/context';
import { ValueGenerator as OldValueGenerator } from '../../ValueGenerator';
import { claimFixedValues } from '../constraints/reservations';
import { invariant } from '../utils/invariant';
import { materializeFamilyPedigree } from './familyPedigree/materializeFamilyPedigree';
import { resolveFamilyPedigreeGenerationOptions } from './familyPedigree/referencePopulation';
import { reserveFamilyPedigreeFixedValues } from './familyPedigree/reservations';
import { familyPedigreeSeed } from './familyPedigree/seed';
import { currentStepOf } from './shared/stageContext';
import type { SimulationContext, StageSimulator } from './types';

type FamilyPedigreeStage = Extract<Stage, { type: 'FamilyPedigree' }>;

/**
 * How a 32-bit family seed is taken from a uniform draw.
 *
 * Not a generation parameter: it is the width of the integer
 * `familyPedigreeSeed` hashes, in the same sense as the mask constants inside
 * the session's own generators.
 */
const SEED_WIDTH = 0x100000000;

/**
 * The pedigree's own generator, in the shape it was written against.
 *
 * `materializeFamilyPedigree` is the module that already knows how families are
 * shaped — which relatives a scenario implies, which lineages a dominant
 * inheritance pattern touches, which edges carry which gamete role — and its
 * internal logic is treated as correct rather than rewritten (this is the one
 * simulator that WRAPS an existing generator instead of replacing it). It reads
 * a `GenerationContext` from the engine it was born in, so one is assembled for
 * it here.
 *
 * What that context deliberately does NOT share with the session is the unique
 * registry and the constraint analysis: those are classes of the older engine,
 * and structurally distinct from the session's own. The two are reconciled
 * around the call instead — every `unique` value the network already holds is
 * claimed into the pedigree's registry before it draws, and every value the
 * pedigree wrote is claimed into the session's afterwards — so neither side can
 * issue a value the other already used.
 */
const pedigreeGenerationContext = (
  context: SimulationContext,
  familySeed: number,
): OldGenerationContext => {
  const codebook: StructuralCodebook = context.protocol.codebook;
  const config = resolveGenerationConfig({ today: context.today });

  const constraintsByType = (
    definitions: StructuralCodebook['node'] | StructuralCodebook['edge'],
  ): Map<string, EntityConstraints> =>
    new Map(
      Object.entries(definitions ?? {}).map(([type, definition]) => [
        type,
        buildEntityConstraints(definition.variables, context.today),
      ]),
    );

  return {
    codebook,
    valueGen: new OldValueGenerator(familySeed, context.today),
    config,
    usedRosterUids: new Set<string>(),
    externalData: undefined,
    respectSkipLogicAndFiltering: true,
    uniqueRegistry: new OldUniqueRegistry(),
    entityConstraints: {
      ego: buildEntityConstraints(codebook.ego?.variables, context.today),
      node: constraintsByType(codebook.node),
      edge: constraintsByType(codebook.edge),
    },
  };
};

/** A scratch network the wrapped generator can write into. */
const scratchDraft = (context: SimulationContext): NetworkDraft => {
  const { network } = context.engine.draft;
  return {
    egoUid: network.ego[entityPrimaryKeyProperty],
    egoAttributes: { ...network.ego[entityAttributesProperty] },
    nodes: network.nodes.map((node) => ({
      ...node,
      [entityAttributesProperty]: { ...node[entityAttributesProperty] },
    })),
    edges: network.edges.map((edge) => ({
      ...edge,
      [entityAttributesProperty]: { ...edge[entityAttributesProperty] },
    })),
    stageMetadata: { ...context.engine.draft.stageMetadata },
  };
};

/**
 * Simulate a participant building their family pedigree and committing it.
 *
 * The interface is a canvas rather than a prompt sequence: the participant
 * draws their family, and one commit writes the result into the session. The
 * commit is what this reproduces — every family member added with
 * `allowUnknownAttributes` (the pedigree carries a node form of the
 * researcher's design as well as its own structural slots), every relationship
 * added as a plain edge over one configured edge type, and the committed
 * membership recorded as the stage's metadata, which is what the interface
 * reads back when the participant returns to the screen.
 *
 * Identity is the one thing not taken from the wrapped generator: it mints
 * unseeded uuids, and a synthetic batch has to reproduce byte for byte
 * (rule 6), so every id it produced is replaced with one from the session's own
 * seeded id stream and every reference to it — an edge's endpoints, a metadata
 * row's node and edge ids — is rewritten to match.
 */
export const simulateFamilyPedigree: StageSimulator<FamilyPedigreeStage> = (
  stage,
  context,
  promptBound,
) => {
  // The pedigree commits in one act, so a bound of zero is a participant who
  // opened the screen and committed nothing.
  if (promptBound === 0) return;

  const { engine, streams } = context;
  const currentStep = currentStepOf(context, stage);

  const familySeed = familyPedigreeSeed(
    Math.floor(streams.draw('counts') * SEED_WIDTH),
    stage.id,
  );
  const options = resolveFamilyPedigreeGenerationOptions(
    context.familyPedigree,
    resolveGenerationConfig().familyPedigreeNodeCount.max,
  );

  const generation = pedigreeGenerationContext(context, familySeed);

  // The values the session has already issued are values this generator must
  // not issue again, and it keeps its own books — so they are claimed into them
  // before it draws.
  for (const node of engine.draft.network.nodes) {
    claimOldFixedValues(
      generation,
      { entity: 'node', type: node.type },
      node[entityAttributesProperty],
    );
  }
  for (const edge of engine.draft.network.edges) {
    claimOldFixedValues(
      generation,
      { entity: 'edge', type: edge.type },
      edge[entityAttributesProperty],
    );
  }
  // A pedigree's ego flag and its edges' relationship values are fixed by the
  // stage rather than drawn, and are held back for the same reason the walk
  // holds back a prompt's fixed values.
  reserveFamilyPedigreeFixedValues(generation, context.protocol.stages);

  const draft = scratchDraft(context);
  const knownNodes = new Set(
    draft.nodes.map((node) => node[entityPrimaryKeyProperty]),
  );
  const knownEdges = new Set(
    draft.edges.map((edge) => edge[entityPrimaryKeyProperty]),
  );

  materializeFamilyPedigree(
    generation,
    draft,
    stage,
    currentStep,
    context.protocol.stages,
    // Disease attributes come from the NarrativePedigree stages pointing at
    // this one. The whole protocol is offered rather than a reachability
    // subset: which of them the participant will reach is the walk's business,
    // and a disease this pedigree plants is one the later stage will narrate.
    context.protocol.stages,
    familySeed,
    options,
  );

  const idFor = new Map<string, string>();
  const mapped = (id: string): string => {
    const existing = idFor.get(id);
    if (existing !== undefined) return existing;
    const minted = streams.uuid();
    idFor.set(id, minted);
    return minted;
  };

  for (const node of draft.nodes) {
    const uid = node[entityPrimaryKeyProperty];
    const attributes = node[entityAttributesProperty];

    if (!knownNodes.has(uid)) {
      engine.addNode({
        nodeType: node.type,
        uid: mapped(uid),
        attributeData: attributes,
        // The pedigree collects a node form of the researcher's design
        // alongside its own structural slots, exactly as the live commit does.
        allowUnknownAttributes: true,
        currentStep,
      });
      continue;
    }

    // A node that existed before the pedigree keeps its shared-network
    // attributes untouched: the live commit walks `preexistingReduxNodeIds`
    // and dispatches nothing for them (FamilyPedigree `store.ts`
    // `finalizeNetwork`) — the store's normalised view of such a node lives
    // on in the committed METADATA snapshot alone, while the interview
    // network keeps what earlier stages recorded. Patching them here would
    // stamp `false` where a real session leaves "never asked" absent.
    idFor.set(uid, uid);
  }

  for (const edge of draft.edges) {
    const uid = edge[entityPrimaryKeyProperty];
    if (knownEdges.has(uid)) {
      idFor.set(uid, uid);
      continue;
    }
    engine.addEdge({
      edgeType: edge.type,
      uid: mapped(uid),
      from: mapped(edge.from),
      to: mapped(edge.to),
      attributeData: edge[entityAttributesProperty],
      currentStep,
    });
  }

  // Whatever the pedigree wrote is now in the session, so the session's own
  // registry records it: a later stage drawing a `unique` value must not land
  // on one a family member is already holding.
  const handles = {
    entityConstraints: context.entityConstraints,
    uniqueRegistry: context.uniqueRegistry,
  };
  for (const node of engine.draft.network.nodes) {
    claimFixedValues(
      handles,
      { entity: 'node', type: node.type },
      node[entityAttributesProperty],
    );
  }
  for (const edge of engine.draft.network.edges) {
    claimFixedValues(
      handles,
      { entity: 'edge', type: edge.type },
      edge[entityAttributesProperty],
    );
  }

  const committed = draft.stageMetadata[String(currentStep)];
  invariant(
    isFamilyPedigreeStageMetadata(committed),
    `stage "${stage.id}" committed a pedigree the session cannot store`,
  );
  engine.updateStageMetadata({
    currentStep,
    metadata: {
      ...committed,
      ...(committed.nodes
        ? {
            nodes: committed.nodes.map((row) => ({
              ...row,
              id: mapped(row.id),
            })),
          }
        : {}),
      ...(committed.edges
        ? {
            edges: committed.edges.map((row) => ({
              ...row,
              id: mapped(row.id),
              from: mapped(row.from),
              to: mapped(row.to),
            })),
          }
        : {}),
    },
  });
};
