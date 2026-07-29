import type {
  ComponentType,
  Stage,
  StructuralCodebook,
  Variable,
  Variables,
} from '@codaco/protocol-validation';

import type { ConstraintConflict } from './error';

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
 * Only the two date pickers are modelled, because they are the only controls
 * whose parameters bound the value a field will accept: `buildDatePickerBoundProps`
 * turns exactly these into the interview's hard `min`/`max` validators and
 * returns `{}` for every other component. A composer rendering a datetime
 * variable with, say, a Text control therefore contributes no bound at all,
 * which is why such a field leaves the codebook's own window in place rather
 * than widening it — the value the codebook's window produces is one that
 * control submits happily.
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

/** A variable two composer fields render with different date controls. */
export type ComposerRenderingDisagreement = {
  entity: 'node' | 'edge';
  type: string;
  variable: string;
};

/**
 * How a disagreement reads to whoever configured the protocol, in one place so
 * that the two entry points into this machinery — `generateNetwork` and
 * `SyntheticInterview` — refuse it in the same words.
 */
export const COMPOSER_RENDERING_CONFLICT = {
  summary:
    'this protocol renders one variable with two different date controls',
  rules: ['component', 'parameters'],
  reason:
    'two Network Composer stages render this variable with different date controls, ' +
    'and the one value it holds is submitted through both',
} as const;

/** One rendering per variable, by entity type. */
export type ComposerRenderings = {
  node: Map<string, Map<string, ComposerDateRendering>>;
  edge: Map<string, Map<string, ComposerDateRendering>>;
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

/**
 * The date bounds one composer field renders with, or `undefined` where it
 * renders no date control at all.
 *
 * Read through the same guards `buildConstraints` reads a codebook variable's
 * parameters with, and narrowed to the keys the control consults: a
 * RelativeDatePicker never reads `min`/`max` and a DatePicker never reads
 * `anchor`, so a field that switches the control and leaves the codebook's
 * parameters to fall through renders on that control's own defaults. Dropping
 * the keys it ignores here is what lets the result be a codebook variable the
 * schema's own union describes.
 */
function dateRenderingOf(
  field: ComposerField,
  codebookParameters: Record<string, unknown> | undefined,
): ComposerDateRendering | undefined {
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

/** Whether two fields put the same window in front of a participant. */
function sameRendering(
  a: ComposerDateRendering,
  b: ComposerDateRendering,
): boolean {
  if (a.component === 'DatePicker') {
    return (
      b.component === 'DatePicker' &&
      a.parameters.type === b.parameters.type &&
      a.parameters.min === b.parameters.min &&
      a.parameters.max === b.parameters.max
    );
  }

  return (
    b.component === 'RelativeDatePicker' &&
    a.parameters.anchor === b.parameters.anchor &&
    a.parameters.before === b.parameters.before &&
    a.parameters.after === b.parameters.after
  );
}

/**
 * The one date rendering each variable is generated against, folded from every
 * composer field naming it.
 *
 * Two fields rendering one variable with different windows are reported as a
 * disagreement rather than resolved, because the interview gives the variable a
 * single stored value and both stages can submit it. A composer's canvas lists
 * every node of its subject type — `getNetworkNodesForType`, not the nodes that
 * stage created — so a node built anywhere in the interview can be opened in
 * either stage's inspector, and a value satisfying one window is refused by the
 * other. Choosing between them would emit data one of the two rejects, and
 * narrowing to their overlap would refuse a pair of `<select>`s at different
 * resolutions that no overlap can describe: the coarser control cannot even
 * display the finer control's value.
 *
 * `parametersOf` supplies the codebook variable's own parameters, which a field
 * declaring none reads through its chosen control.
 */
export function resolveComposerRenderings(
  fields: readonly ComposerField[],
  parametersOf: (field: ComposerField) => Record<string, unknown> | undefined,
): {
  renderings: ComposerRenderings;
  disagreements: ComposerRenderingDisagreement[];
} {
  const renderings: ComposerRenderings = { node: new Map(), edge: new Map() };
  const disagreements: ComposerRenderingDisagreement[] = [];
  const reported = new Set<string>();

  for (const field of fields) {
    const rendering = dateRenderingOf(field, parametersOf(field));
    if (rendering === undefined) continue;

    const byVariable =
      renderings[field.entity].get(field.type) ??
      new Map<string, ComposerDateRendering>();
    renderings[field.entity].set(field.type, byVariable);

    const existing = byVariable.get(field.variable);
    if (existing === undefined) {
      byVariable.set(field.variable, rendering);
      continue;
    }
    if (sameRendering(existing, rendering)) continue;

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
 * The same variable, rendered by the control a composer field puts in front of
 * the participant.
 *
 * Applied only to a datetime variable. The constraint machinery reads a
 * variable's `component` and `parameters` in exactly one place —
 * `resolveDateWindow`, which returns nothing for any other type — so overlaying
 * a control onto, say, a text variable would change no generated value while
 * making the codebook say something the codebook never said. (A composer *can*
 * render a text variable with a date picker, and the interview would then
 * validate that text against date bounds. Nothing here models that: the draw
 * takes its shape from the variable's declared type, so there is no date for a
 * window to bound.)
 */
function renderedVariable(
  variable: Variable,
  rendering: ComposerDateRendering,
): Variable {
  if (variable.type !== 'datetime') return variable;
  return { ...variable, ...rendering };
}

function renderedVariables(
  variables: Variables,
  byVariable: ReadonlyMap<string, ComposerDateRendering>,
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
 * every variable a NetworkComposer renders carrying that stage's control and
 * parameters instead of its own.
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
 * What is deliberately *not* folded is the codebook control's own window
 * alongside the composer's. A variable a composer renders is one whose codebook
 * control the composer replaces, and intersecting the two would refuse a
 * protocol nothing is wrong with: Architect gives every datetime variable a
 * codebook DatePicker, whose window stops at today, so a composer anchoring
 * dates in the future would be refused for a bound no field in the interview
 * applies. A second, non-composer form rendering the same variable through the
 * codebook's own control keeps that unmodelled window, which is the boundary
 * this cut accepts.
 */
export function applyComposerRenderings(
  codebook: StructuralCodebook,
  stages: Stage[],
): { codebook: StructuralCodebook; conflicts: ConstraintConflict[] } {
  const fields = composerFields(stages);
  if (fields.length === 0) return { codebook, conflicts: [] };

  const variableOf = (field: ComposerField): Variable | undefined =>
    codebook[field.entity]?.[field.type]?.variables?.[field.variable];

  const { renderings, disagreements } = resolveComposerRenderings(
    fields,
    (field) => {
      const variable = variableOf(field);
      return variable !== undefined && 'parameters' in variable
        ? variable.parameters
        : undefined;
    },
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
