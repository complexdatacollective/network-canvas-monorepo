import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateEntityAttributes } from '../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../constraints/types';
import { chooseLinkedPairs, unorderedPairs } from '../utils/edgeTopology';
import { invariant } from '../utils/invariant';
import { sampleCount, countUniform } from '../utils/sampleCount';
import {
  composerRenderedCodebook,
  renderedConstraintsFor,
} from './shared/composerValues';
import { nextGridPosition, readCanvasPosition } from './shared/gridPlacement';
import { currentStepOf, generationFor } from './shared/stageContext';
import type { SimulationContext, StageSimulator } from './types';

type ComposerStage = Extract<Stage, { type: 'NetworkComposer' }>;
type ComposerForm = ComposerStage['nodeForm'];

/** The variable ids one composer form collects. */
const formFields = (form: ComposerForm): Set<string> =>
  new Set((form?.fields ?? []).map((field) => String(field.variable)));

/**
 * The fields of a form the entity has not answered yet.
 *
 * The inspector initialises every field from the entity's current attributes
 * and autosaves what it was shown, so a field already carrying an answer keeps
 * it — re-drawing would report a participant who changed their mind between two
 * screens, and would ask the unique registry for a second value where the
 * session only ever held one. The same reading `EgoForm` takes of its form.
 */
const unanswered = (
  fields: ReadonlySet<string>,
  attributes: Readonly<Record<string, VariableValue>>,
): Set<string> =>
  new Set([...fields].filter((id) => attributes[id] === undefined));

/**
 * Membership of a convex hull, in the shape the interface stores it.
 *
 * Always an array of strings, whatever the categorical option's own value type
 * is: the group tools normalise through `String` before writing
 * (`useComposerActions.ts` `normalizeGroupValues`), because a node can belong to
 * several groups of one variable and the hull layer reads them back as labels.
 */
const asHullMembership = (value: VariableValue): string[] =>
  (Array.isArray(value) ? value : [value])
    .filter(
      (item): item is string | number =>
        typeof item === 'string' || typeof item === 'number',
    )
    .map(String);

/** The unordered pairs of a node list, in node-list order. */
/**
 * Simulate a Network Composer session.
 *
 * The composer is a canvas rather than a questionnaire: whoever is operating it
 * adds people from the tool palette, describes them in the inspector, groups
 * them into hulls, and draws ties between them. There are no prompts, so a
 * `stopAt` bound of zero is somebody who opened the canvas and did nothing.
 *
 * What it produces:
 *
 * - **People.** The stage's `count` says how many are added. Each arrives
 *   carrying exactly what the palette collects — the `quickAdd` text and the
 *   grid cell the interface would have dropped them into. A draw that leaves
 *   the quick-add field empty adds nobody: the interface refuses to create a
 *   node from a blank name, so a nameless node is not a state it can reach.
 * - **Attributes.** The inspector's node form is filled in for every node the
 *   canvas lists — which is every node of the subject type, not only the ones
 *   added here — and only for the fields that entity has not already answered.
 * - **Groups.** Where the stage names a `convexHullVariable`, membership is
 *   drawn from that variable's own categorical descriptor and stored as the
 *   `string[]` the group tools write.
 * - **Ties.** Each configured edge type gets its own realisation of the stage's
 *   topology over the pairs still unconnected in that type. Edges carry no
 *   attributes at creation, exactly as the interface's `connect` creates them;
 *   an edge form's fields are filled in afterwards through the inspector.
 *
 * What it deliberately does not produce is the stage's `{ automaticLayout }`
 * metadata: that records a display preference the operator toggled, not
 * anything the participant said.
 */
export const simulateNetworkComposer: StageSimulator<ComposerStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeDefinition = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeDefinition,
    `stage "${stage.id}" composes node type "${stage.subject.type}", which the codebook does not define`,
  );

  const quickAdd = String(stage.quickAdd);

  invariant(
    nodeDefinition.variables?.[quickAdd]?.type === 'text',
    `stage "${stage.id}" quick-adds "${quickAdd}", which is not a text variable on node type "${stage.subject.type}"`,
  );

  // A canvas has no prompts, so a bound of zero is somebody who arrived and
  // composed nothing.
  if (promptBound === 0) return;

  const currentStep = currentStepOf(context, stage);
  const codebook = composerRenderedCodebook(
    context.protocol.codebook,
    context.protocol.stages,
    context.today,
  );
  const pass = { stage, context, codebook, currentStep };

  addComposedNodes(pass);
  fillInspectorForms(pass);
  assignHullMembership(pass);
  drawComposedEdges(pass);
};

type ComposerPass = {
  stage: ComposerStage;
  context: SimulationContext;
  codebook: StructuralCodebook;
  currentStep: number;
};

/** The nodes the canvas lists: every node of the stage's subject type. */
const canvasNodes = (
  context: SimulationContext,
  stage: ComposerStage,
): NcNode[] =>
  context.engine.draft.network.nodes.filter(
    (node) => node.type === stage.subject.type,
  );

const nodeScopeOf = (stage: ComposerStage) =>
  ({ entity: 'node', type: stage.subject.type }) as const;

function addComposedNodes({
  stage,
  context,
  codebook,
  currentStep,
}: ComposerPass): void {
  const count = stage.synthetic.count;
  if (count === undefined) return;

  const { engine, streams } = context;
  const quickAdd = String(stage.quickAdd);
  const layoutVariable = String(stage.layoutVariable);
  const scope = nodeScopeOf(stage);
  const constraints = renderedConstraintsFor({
    codebook,
    scope,
    today: context.today,
    interfaceRules: context.interfaceRules,
  });
  const generation = generationFor(context);

  const wanted = sampleCount(count, countUniform(streams));

  for (let index = 0; index < wanted; index += 1) {
    const values = generateEntityAttributes(
      constraints,
      generation,
      scope,
      index,
      {
        only: new Set([quickAdd]),
        // The palette collects a person's name, and the node renders as whatever
        // it holds — so a variable called `alias` still draws a real name rather
        // than filler words, exactly as the quick-add name generator reads it.
        preferRealisticNameVariables: new Set([quickAdd]),
      },
    );
    const name = values[quickAdd];
    // The interface will not create a node from an empty quick-add field
    // (`AddNodeInput.tsx`), so neither does this: a nameless node is a state no
    // operator could produce.
    if (name === undefined) continue;

    const occupied = canvasNodes(context, stage)
      .map((node) =>
        readCanvasPosition(node[entityAttributesProperty][layoutVariable]),
      )
      .filter((position) => position !== undefined);

    engine.addNode({
      nodeType: stage.subject.type,
      uid: streams.uuid(),
      attributeData: {
        [quickAdd]: name,
        [layoutVariable]: nextGridPosition(occupied),
      },
      currentStep,
    });
  }
}

function fillInspectorForms({
  stage,
  context,
  codebook,
  currentStep,
}: ComposerPass): void {
  const fields = formFields(stage.nodeForm);
  if (fields.size === 0) return;

  const scope = nodeScopeOf(stage);
  const constraints = renderedConstraintsFor({
    codebook,
    scope,
    today: context.today,
    interfaceRules: context.interfaceRules,
  });
  const generation = generationFor(context);

  canvasNodes(context, stage).forEach((node, index) => {
    const answered = node[entityAttributesProperty];
    const only = unanswered(fields, answered);
    if (only.size === 0) return;

    const values = generateEntityAttributes(
      constraints,
      generation,
      scope,
      index,
      {
        only,
        existing: answered,
      },
    );
    if (Object.keys(values).length === 0) return;

    context.engine.updateNode({
      nodeId: node[entityPrimaryKeyProperty],
      attributePatch: { set: values, unset: [] },
      currentStep,
    });
  });
}

function assignHullMembership({
  stage,
  context,
  codebook,
  currentStep,
}: ComposerPass): void {
  const hullVariable = stage.convexHullVariable;
  if (hullVariable === undefined) return;

  const variableId = String(hullVariable);
  const scope = nodeScopeOf(stage);
  const definition = codebook.node?.[scope.type]?.variables?.[variableId];

  invariant(
    definition?.type === 'categorical',
    `stage "${stage.id}" draws hulls around "${variableId}", which is not a categorical variable on node type "${scope.type}"`,
  );

  const constraints = renderedConstraintsFor({
    codebook,
    scope,
    today: context.today,
    interfaceRules: context.interfaceRules,
  });
  const generation = generationFor(context);

  canvasNodes(context, stage).forEach((node, index) => {
    const answered = node[entityAttributesProperty];
    if (answered[variableId] !== undefined) return;

    const value = generateEntityAttributes(
      constraints,
      generation,
      scope,
      index,
      {
        only: new Set([variableId]),
        existing: answered,
      },
    )[variableId];
    // Nobody put this person in a group: the interface leaves an ungrouped node
    // carrying no value for the hull variable at all.
    if (value === undefined) return;

    context.engine.updateNode({
      nodeId: node[entityPrimaryKeyProperty],
      attributePatch: {
        set: { [variableId]: asHullMembership(value) },
        unset: [],
      },
      currentStep,
    });
  });
}

function drawComposedEdges({
  stage,
  context,
  codebook,
  currentStep,
}: ComposerPass): void {
  const topology = stage.synthetic.topology;
  if (topology === undefined) return;

  const { engine, streams } = context;
  const nodes = canvasNodes(context, stage);
  const generation = generationFor(context);

  for (const edgeEntry of stage.edges ?? []) {
    const edgeType = edgeEntry.subject.type;
    const connected = new Set(
      engine.draft.network.edges
        .filter((edge) => edge.type === edgeType)
        .map((edge) => [edge.from, edge.to].toSorted().join('\u0000')),
    );
    const available = unorderedPairs(nodes).filter(
      ([from, to]) => !connected.has([from, to].toSorted().join('\u0000')),
    );

    const linked = chooseLinkedPairs({
      topology,
      pairs: available,
      nodeCount: nodes.length,
      streams,
    });

    const scope = { entity: 'edge', type: edgeType } as const;
    const fields = formFields(edgeEntry.form);
    const constraints: EntityConstraints | undefined =
      fields.size === 0
        ? undefined
        : renderedConstraintsFor({
            codebook,
            scope,
            today: context.today,
            interfaceRules: context.interfaceRules,
          });

    let linkedIndex = 0;
    for (const [position, [from, to]] of available.entries()) {
      if (!linked.has(position)) continue;
      // Created bare, exactly as `connect` dispatches it: the inspector is a
      // separate act, and an edge nobody opened carries nothing.
      const edge = engine.addEdge({
        edgeType,
        uid: streams.uuid(),
        from,
        to,
        currentStep,
      });
      const index = linkedIndex;
      linkedIndex += 1;

      if (constraints === undefined) continue;
      const values = generateEntityAttributes(
        constraints,
        generation,
        scope,
        index,
        { only: fields },
      );
      if (Object.keys(values).length === 0) continue;

      engine.updateEdge({
        edgeId: edge[entityPrimaryKeyProperty],
        attributePatch: { set: values, unset: [] },
      });
    }
  }
}
