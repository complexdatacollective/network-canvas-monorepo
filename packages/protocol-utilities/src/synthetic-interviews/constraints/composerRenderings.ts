import type {
  ComponentType,
  Stage,
  StructuralCodebook,
  Variable,
  Variables,
} from '@codaco/protocol-validation';
import { collectEntityAttributeReferences } from '@codaco/protocol-validation';

import { buildVariableConstraints } from './buildConstraints';
import type { DateWindow } from './dateWindow';
import type { ConstraintConflict } from './error';
import type { VariableEntry } from './variableEntry';

/**
 * One NetworkComposer field's control, as its stage declares it.
 *
 * `parameters` absent is not the same as declared empty. `createFieldMetadata`
 * resolves a field's parameters as `field.parameters ?? codebookEntry
 * .parameters` (interview's `selectors/forms.ts`), so a field that changes only
 * the control reads the codebook variable's own parameters through it.
 */
export type ComposerField = {
  entity: 'node' | 'edge';
  type: string;
  variable: string;
  component: ComponentType;
  parameters?: Record<string, unknown>;
};

/**
 * A date control a composer field renders, with the parameters that control
 * actually reads.
 *
 * Date pickers are modelled because their parameters bound the value a field
 * accepts. Boolean and Toggle are also modelled below because they can expose
 * different Boolean domains; other controls do not change a generated
 * variable's value space.
 */
export type ComposerDateRendering =
  | {
      component: 'DatePicker';
      parameters: {
        type?: 'full' | 'month' | 'year';
        min?: string;
        max?: string;
      };
    }
  | {
      component: 'RelativeDatePicker';
      parameters: { anchor?: string; before?: number; after?: number };
    };

export type ComposerBooleanRendering = {
  component: 'Boolean' | 'Toggle';
};

export type ComposerRendering =
  | ComposerDateRendering
  | ComposerBooleanRendering;

/** A variable reachable forms render with incompatible date controls. */
export type ComposerRenderingDisagreement = {
  entity: 'node' | 'edge';
  type: string;
  variable: string;
};

/**
 * How a disagreement reads to whoever configured the protocol, in one place so
 * that every entry point into this machinery refuses it in the same words.
 */
export const COMPOSER_RENDERING_CONFLICT = {
  summary:
    'this protocol renders one attribute with incompatible date controls',
  rules: ['component', 'parameters'],
  reason:
    'reachable forms render this attribute with date controls that have no common window at one resolution, ' +
    'and the one value it holds is submitted through both',
} as const;

/** One rendering per variable, by entity type. */
export type ComposerRenderings = {
  node: Map<string, Map<string, ComposerRendering>>;
  edge: Map<string, Map<string, ComposerRendering>>;
};

function readString(
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Every attribute field a protocol's NetworkComposer stages render, with the
 * entity scope each one writes onto.
 *
 * A composer's node form resolves its variables against the stage subject and
 * each edge entry's form against that entry's own edge subject — the same split
 * the schema's `entityAttributeReference` tags describe, and the same one the
 * runtime's drawer applies when it picks which form to show for a selection.
 */
function composerFields(stages: Stage[]): ComposerField[] {
  const fields: ComposerField[] = [];

  for (const stage of stages) {
    if (stage.type !== 'NetworkComposer') continue;

    const nodeType = stage.subject.type;
    for (const field of stage.nodeForm?.fields ?? []) {
      fields.push({ entity: 'node', type: nodeType, ...field });
    }

    for (const edge of stage.edges ?? []) {
      const edgeType = edge.subject.type;
      for (const field of edge.form?.fields ?? []) {
        fields.push({ entity: 'edge', type: edgeType, ...field });
      }
    }
  }

  return fields;
}

const fieldKey = (
  field: Pick<ComposerField, 'entity' | 'type' | 'variable'>,
): string => `${field.entity}:${field.type}:${field.variable}`;

/**
 * Codebook controls that a reachable non-composer form actually renders for a
 * variable also rendered by Network Composer.
 *
 * The schema's writer tags identify shared FormFieldSchema surfaces without a
 * second stage-type list: their reference ends in `variable` and is validated.
 * Network Composer fields are excluded because their override was collected
 * separately. FamilyPedigree has no stage subject, so its node form recovers
 * the type from nodeConfig.
 */
function ordinaryFormFields(
  codebook: StructuralCodebook,
  stages: Stage[],
  composers: readonly ComposerField[],
): ComposerField[] {
  const composerKeys = new Set(composers.map(fieldKey));
  const fields: ComposerField[] = [];

  for (const hit of collectEntityAttributeReferences({ stages })) {
    if (
      hit.usage !== 'validatedAttribute' ||
      hit.path[hit.path.length - 1] !== 'variable'
    ) {
      continue;
    }
    const stageIndex = hit.path[0] === 'stages' ? hit.path[1] : undefined;
    if (typeof stageIndex !== 'number') continue;
    const stage = stages[stageIndex];
    if (stage === undefined || stage.type === 'NetworkComposer') continue;

    const subject =
      hit.subject ??
      (stage.type === 'FamilyPedigree'
        ? { entity: 'node' as const, type: stage.nodeConfig.type }
        : undefined);
    if (subject === undefined || subject.entity === 'ego') continue;

    const key = fieldKey({ ...subject, variable: hit.variableId });
    if (!composerKeys.has(key)) continue;
    const variable =
      codebook[subject.entity]?.[subject.type]?.variables?.[hit.variableId];
    if (
      variable === undefined ||
      !('component' in variable) ||
      variable.component === undefined
    ) {
      continue;
    }
    fields.push({
      ...subject,
      variable: hit.variableId,
      component: variable.component,
      ...('parameters' in variable && variable.parameters !== undefined
        ? { parameters: variable.parameters }
        : {}),
    });
  }

  return fields;
}

/**
 * The bounded rendering one composer field contributes, or `undefined` where
 * its control does not alter a generated variable's value space.
 *
 * Read through the same guards `buildConstraints` reads a codebook variable's
 * parameters with, and narrowed to the keys the control consults: a
 * RelativeDatePicker never reads `min`/`max` and a DatePicker never reads
 * `anchor`, so a field that switches the control and leaves the codebook's
 * parameters to fall through renders on that control's own defaults. Dropping
 * the keys it ignores here is what lets the result be a codebook variable the
 * schema's own union describes.
 */
function renderingOf(
  field: ComposerField,
  codebookParameters: Record<string, unknown> | undefined,
): ComposerRendering | undefined {
  if (field.component === 'Boolean' || field.component === 'Toggle') {
    return { component: field.component };
  }

  if (
    field.component !== 'DatePicker' &&
    field.component !== 'RelativeDatePicker'
  ) {
    return undefined;
  }

  const parameters = field.parameters ?? codebookParameters;

  if (field.component === 'DatePicker') {
    const type = readString(parameters, 'type');
    const min = readString(parameters, 'min');
    const max = readString(parameters, 'max');
    return {
      component: 'DatePicker',
      parameters: {
        ...(type === 'full' || type === 'month' || type === 'year'
          ? { type }
          : {}),
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      },
    };
  }

  const anchor = readString(parameters, 'anchor');
  const before = readNumber(parameters, 'before');
  const after = readNumber(parameters, 'after');
  return {
    component: 'RelativeDatePicker',
    parameters: {
      ...(anchor !== undefined ? { anchor } : {}),
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
    },
  };
}

function isDateRendering(
  rendering: ComposerRendering,
): rendering is ComposerDateRendering {
  return (
    rendering.component === 'DatePicker' ||
    rendering.component === 'RelativeDatePicker'
  );
}

function dateWindowOf(
  rendering: ComposerDateRendering,
  today: string,
): DateWindow {
  const entry: VariableEntry = {
    id: 'composer-rendering',
    name: 'Network Composer date field',
    type: 'datetime',
    ...rendering,
  };
  const window = buildVariableConstraints(entry, today).dateWindow;
  if (window === undefined) {
    throw new Error('A datetime control must resolve to a date window.');
  }
  return window;
}

function laterBound(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a > b ? a : b;
}

function earlierBound(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a < b ? a : b;
}

/** Combine compatible renderings of one stored value. */
function mergedRendering(
  a: ComposerRendering,
  b: ComposerRendering,
  today: string,
): ComposerRendering | undefined {
  if (
    (a.component === 'Boolean' || a.component === 'Toggle') &&
    (b.component === 'Boolean' || b.component === 'Toggle')
  ) {
    // Toggle offers both values, so a Boolean choice control is the tighter
    // domain whenever the same variable is rendered through both.
    return {
      component:
        a.component === 'Boolean' || b.component === 'Boolean'
          ? 'Boolean'
          : 'Toggle',
    };
  }

  if (!isDateRendering(a) || !isDateRendering(b)) return undefined;

  const aWindow = dateWindowOf(a, today);
  const bWindow = dateWindowOf(b, today);
  if (aWindow.resolution !== bWindow.resolution) return undefined;

  const min = laterBound(aWindow.min, bWindow.min);
  const max = earlierBound(aWindow.max, bWindow.max);
  if (min !== undefined && max !== undefined && min > max) return undefined;

  return {
    component: 'DatePicker',
    parameters: {
      type: aWindow.resolution,
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    },
  };
}

/**
 * The rendering each variable is generated against, folded from every
 * contributed field naming it.
 *
 * Date controls at one resolution are narrowed to their common window. An empty
 * intersection or different resolutions are reported as a disagreement,
 * because the interview gives the variable a single stored value and both
 * stages can submit it. A composer's canvas lists every node of its subject
 * type — `getNetworkNodesForType`, not the nodes that stage created — so a node
 * built anywhere in the interview can be opened in either stage's inspector.
 * A pair of controls at different resolutions has no overlap one stored value
 * can describe: the coarser control cannot display the finer control's value.
 *
 * `parametersOf` supplies the codebook variable's own parameters, which a field
 * declaring none reads through its chosen control.
 */
function resolveComposerRenderings(
  fields: readonly ComposerField[],
  parametersOf: (field: ComposerField) => Record<string, unknown> | undefined,
  today: string,
): {
  renderings: ComposerRenderings;
  disagreements: ComposerRenderingDisagreement[];
} {
  const renderings: ComposerRenderings = { node: new Map(), edge: new Map() };
  const disagreements: ComposerRenderingDisagreement[] = [];
  const reported = new Set<string>();

  for (const field of fields) {
    const rendering = renderingOf(field, parametersOf(field));
    if (rendering === undefined) continue;

    const byVariable =
      renderings[field.entity].get(field.type) ??
      new Map<string, ComposerRendering>();
    renderings[field.entity].set(field.type, byVariable);

    const existing = byVariable.get(field.variable);
    if (existing === undefined) {
      byVariable.set(field.variable, rendering);
      continue;
    }
    const merged = mergedRendering(existing, rendering, today);
    if (merged !== undefined) {
      byVariable.set(field.variable, merged);
      continue;
    }

    const key = `${field.entity}:${field.type}:${field.variable}`;
    if (reported.has(key)) continue;
    reported.add(key);
    disagreements.push({
      entity: field.entity,
      type: field.type,
      variable: field.variable,
    });
  }

  return { renderings, disagreements };
}

/**
 * Resolve every reachable control domain that constrains a composer-rendered
 * variable. Composer overrides contribute their stage-effective control;
 * ordinary forms contribute the codebook control they actually render.
 */
function resolveComposerRenderingsForProtocol(
  codebook: StructuralCodebook,
  stages: Stage[],
  today: string,
): {
  renderings: ComposerRenderings;
  disagreements: ComposerRenderingDisagreement[];
} {
  const composers = composerFields(stages);
  const fields = [
    ...composers,
    ...ordinaryFormFields(codebook, stages, composers),
  ];
  const variableOf = (field: ComposerField): Variable | undefined =>
    codebook[field.entity]?.[field.type]?.variables?.[field.variable];

  return resolveComposerRenderings(
    fields,
    (field) => {
      const variable = variableOf(field);
      return variable !== undefined && 'parameters' in variable
        ? variable.parameters
        : undefined;
    },
    today,
  );
}

/**
 * The same variable, rendered by the control a composer field puts in front of
 * the participant.
 *
 * Applied only where generation models a control-defined domain: date windows
 * on datetime variables and the Boolean/Toggle choice set on booleans.
 */
function renderedVariable(
  variable: Variable,
  rendering: ComposerRendering,
): Variable {
  if (
    variable.type === 'datetime' &&
    (rendering.component === 'DatePicker' ||
      rendering.component === 'RelativeDatePicker')
  ) {
    return { ...variable, ...rendering };
  }
  if (
    variable.type === 'boolean' &&
    (rendering.component === 'Boolean' || rendering.component === 'Toggle')
  ) {
    return { ...variable, component: rendering.component };
  }
  return variable;
}

function renderedVariables(
  variables: Variables,
  byVariable: ReadonlyMap<string, ComposerRendering>,
): Variables {
  return Object.fromEntries(
    Object.entries(variables).map(([id, variable]) => {
      const rendering = byVariable.get(id);
      return [
        id,
        rendering === undefined
          ? variable
          : renderedVariable(variable, rendering),
      ];
    }),
  );
}

/**
 * The codebook a run generates against: the one the protocol declares, with
 * every variable a NetworkComposer renders narrowed to the control domains of
 * every reachable form that can submit it.
 *
 * A composer field overrides the codebook variable's `component` and
 * `parameters` for the form the interview renders — `createFieldMetadata` in
 * `packages/interview/src/selectors/forms.ts` — and those two are what
 * `buildDatePickerBoundProps` turns into the field's hard `min`/`max`
 * validators. Read from the codebook alone, a stage rendering a datetime
 * variable as a RelativeDatePicker fixed to one anchor day looks like whatever
 * broad window the codebook declared, and every node the stage creates is given
 * a date its own form rejects.
 *
 * Boolean fields are folded for the same reason: Boolean uses its configured
 * options as the offered domain, while Toggle always offers both values.
 *
 * Folded into the codebook rather than kept beside it so that the count and the
 * draw cannot come apart: `analyseFeasibility` and the draw's constraint maps
 * are both built from this one codebook, so whatever window a composer's fields
 * imply is the window feasibility reasons about and the window
 * `generateEntityAttributes` draws inside.
 *
 * Applied to the type rather than to the stage, which is the same reading the
 * runtime gives it. One shared network runs through every stage, a composer
 * lists every node of its subject type, and one stored value is submitted
 * through whichever form the participant opens — so a value for this variable
 * has to satisfy the composer's control wherever the node was created.
 *
 * The codebook control contributes only when a reachable ordinary form names
 * the variable. A composer-only variable still uses only its override, so an
 * unused codebook default cannot narrow the generated domain.
 */
export function applyComposerRenderings(
  codebook: StructuralCodebook,
  stages: Stage[],
  today: string,
): { codebook: StructuralCodebook; conflicts: ConstraintConflict[] } {
  const fields = composerFields(stages);
  if (fields.length === 0) return { codebook, conflicts: [] };

  const { renderings, disagreements } = resolveComposerRenderingsForProtocol(
    codebook,
    stages,
    today,
  );

  const conflicts = disagreements.map((disagreement) => {
    const definition = codebook[disagreement.entity]?.[disagreement.type];
    const name = definition?.variables?.[disagreement.variable]?.name;
    return {
      entity: disagreement.entity,
      entityType: disagreement.type,
      ...(definition?.name !== undefined
        ? { entityTypeName: definition.name }
        : {}),
      variableIds: [disagreement.variable],
      variableNames: [name ?? disagreement.variable],
      rules: [...COMPOSER_RENDERING_CONFLICT.rules],
      reason: COMPOSER_RENDERING_CONFLICT.reason,
    };
  });

  const node: NonNullable<StructuralCodebook['node']> = {};
  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    const byVariable = renderings.node.get(type);
    node[type] =
      byVariable === undefined || definition.variables === undefined
        ? definition
        : {
            ...definition,
            variables: renderedVariables(definition.variables, byVariable),
          };
  }

  const edge: NonNullable<StructuralCodebook['edge']> = {};
  for (const [type, definition] of Object.entries(codebook.edge ?? {})) {
    const byVariable = renderings.edge.get(type);
    edge[type] =
      byVariable === undefined || definition.variables === undefined
        ? definition
        : {
            ...definition,
            variables: renderedVariables(definition.variables, byVariable),
          };
  }

  return {
    codebook: {
      ...codebook,
      ...(codebook.node !== undefined ? { node } : {}),
      ...(codebook.edge !== undefined ? { edge } : {}),
    },
    conflicts,
  };
}
