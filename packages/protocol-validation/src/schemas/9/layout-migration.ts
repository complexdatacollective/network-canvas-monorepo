import {
  type ExportColumnVariable,
  findLayoutExportColumnConflicts,
  normalizeCodebookName,
  normalizeForComparison,
} from '@codaco/shared-consts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stagesOf = (protocol: unknown): Record<string, unknown>[] =>
  isRecord(protocol) && Array.isArray(protocol.stages)
    ? protocol.stages.filter(isRecord)
    : [];

const promptLayoutVariable = (prompt: unknown): string | undefined => {
  if (!isRecord(prompt) || !isRecord(prompt.layout)) return undefined;
  const { layoutVariable } = prompt.layout;
  return typeof layoutVariable === 'string' ? layoutVariable : undefined;
};

/**
 * A schema 9 Sociogram has one layout, so a schema 8 Sociogram whose prompts
 * use different layout variables becomes consecutive stages, one for each run
 * of prompts that share a layout variable. A prompt that names none stays in
 * the run before it. Each new stage is a copy of the original with its own
 * prompts, and keeps the original's id for now: the ids given at the end of
 * the migration give each copy a new one and point skip logic at the first.
 */
export const splitSociogramsByLayout = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  protocol.stages = protocol.stages.flatMap((stage: unknown) => {
    if (!isRecord(stage) || stage.type !== 'Sociogram') return [stage];
    if (!Array.isArray(stage.prompts)) return [stage];
    const runs: unknown[][] = [];
    let current: string | undefined;
    for (const prompt of stage.prompts) {
      const layout = promptLayoutVariable(prompt);
      const last = runs.at(-1);
      if (
        last !== undefined &&
        (layout === undefined || current === undefined || layout === current)
      ) {
        last.push(prompt);
        current ??= layout;
        continue;
      }
      runs.push([prompt]);
      current = layout;
    }
    if (runs.length <= 1) return [stage];
    const { prompts: _prompts, ...settings } = stage;
    return runs.map((prompts) => ({ ...structuredClone(settings), prompts }));
  });
};

type LayoutCandidate = {
  key: string;
  name: string;
  /** The name of the first node type that held the layout variable. */
  typeName: string;
};

const nodeTypesOf = (codebook: unknown): Record<string, unknown> =>
  isRecord(codebook) && isRecord(codebook.node) ? codebook.node : {};

const isExportOptionValue = (
  value: unknown,
): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const asExportColumnVariable = (
  variable: unknown,
): ExportColumnVariable | undefined => {
  if (!isRecord(variable)) return undefined;
  const { name, type, options } = variable;
  if (typeof name !== 'string' || typeof type !== 'string') return undefined;
  if (!Array.isArray(options)) return { name, type };
  return {
    name,
    type,
    options: options.flatMap((option: unknown) =>
      isRecord(option) && isExportOptionValue(option.value)
        ? [{ value: option.value }]
        : [],
    ),
  };
};

/**
 * Whether a layout named `name` would clash with a layout already accepted
 * or with a node variable: by name, or by a column an export writes.
 */
const layoutNameClashes = (
  name: string,
  accepted: Readonly<Record<string, { name: string }>>,
  nodeVariablesByType: Record<string, Record<string, ExportColumnVariable>>,
): boolean => {
  const comparable = normalizeForComparison(name);
  if (
    Object.values(accepted).some(
      (layout) => normalizeForComparison(layout.name) === comparable,
    )
  ) {
    return true;
  }
  if (
    Object.values(nodeVariablesByType).some((variables) =>
      Object.values(variables).some(
        (variable) => normalizeForComparison(variable.name) === comparable,
      ),
    )
  ) {
    return true;
  }
  const candidateKey = '\u0000candidate';
  return findLayoutExportColumnConflicts(
    { ...accepted, [candidateKey]: { name } },
    nodeVariablesByType,
  ).some(({ layoutId }) => layoutId === candidateKey);
};

/** The first name for a layout that clashes with nothing already there. */
const availableLayoutName = (
  candidate: LayoutCandidate,
  accepted: Readonly<Record<string, { name: string }>>,
  nodeVariablesByType: Record<string, Record<string, ExportColumnVariable>>,
): string => {
  const clashes = (name: string) =>
    layoutNameClashes(name, accepted, nodeVariablesByType);
  const name = normalizeCodebookName(candidate.name);
  if (!clashes(name)) return name;
  const base = normalizeCodebookName(`${candidate.name}_${candidate.typeName}`);
  if (!clashes(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const numbered = `${base}_${String(suffix)}`;
    if (!clashes(numbered)) return numbered;
  }
};

/**
 * A layout is no longer a node attribute: each schema 8 node attribute of
 * type `layout` becomes a layout in `codebook.layouts` with the same id and
 * name, and leaves its node type. Layout attributes of several node types
 * that share a key become one layout, named after the first in codebook
 * order. Positions stay on each node under the same key, so interview data
 * keeps its shape. Each Sociogram takes its prompts' layout variable (one,
 * after `splitSociogramsByLayout`), and each Narrative preset and Network
 * Composer its own. A name that would clash with another layout or a node
 * attribute, or with a column either is exported to, is changed for the
 * later layout in codebook order to `<name>_<node type name>`, followed by a
 * number if that clashes too. Filter rules that name a layout attribute keep
 * naming it, now the layout.
 */
export const moveLayoutVariablesToLayouts = (protocol: unknown) => {
  if (!isRecord(protocol)) return;
  const { codebook } = protocol;
  const candidates = new Map<string, LayoutCandidate>();
  for (const [typeKey, definition] of Object.entries(nodeTypesOf(codebook))) {
    if (!isRecord(definition) || !isRecord(definition.variables)) continue;
    const typeName =
      typeof definition.name === 'string' ? definition.name : typeKey;
    for (const [key, variable] of Object.entries(definition.variables)) {
      if (!isRecord(variable) || variable.type !== 'layout') continue;
      if (!candidates.has(key)) {
        candidates.set(key, {
          key,
          name: typeof variable.name === 'string' ? variable.name : key,
          typeName,
        });
      }
      Reflect.deleteProperty(definition.variables, key);
    }
  }

  for (const stage of stagesOf(protocol)) {
    if (stage.type === 'Sociogram' && Array.isArray(stage.prompts)) {
      const layout = stage.prompts
        .map(promptLayoutVariable)
        .find((key) => key !== undefined);
      for (const prompt of stage.prompts) {
        if (isRecord(prompt)) Reflect.deleteProperty(prompt, 'layout');
      }
      if (layout !== undefined) stage.layout = layout;
    }
    if (stage.type === 'Narrative' && Array.isArray(stage.presets)) {
      for (const preset of stage.presets) {
        if (!isRecord(preset) || !Object.hasOwn(preset, 'layoutVariable')) {
          continue;
        }
        preset.layout = preset.layoutVariable;
        Reflect.deleteProperty(preset, 'layoutVariable');
      }
    }
    if (
      stage.type === 'NetworkComposer' &&
      Object.hasOwn(stage, 'layoutVariable')
    ) {
      stage.layout = stage.layoutVariable;
      Reflect.deleteProperty(stage, 'layoutVariable');
    }
  }

  if (candidates.size === 0 || !isRecord(codebook)) return;
  const nodeVariablesByType = Object.fromEntries(
    Object.entries(nodeTypesOf(codebook)).map(([typeKey, definition]) => [
      typeKey,
      Object.fromEntries(
        Object.entries(
          isRecord(definition) && isRecord(definition.variables)
            ? definition.variables
            : {},
        ).flatMap(([key, variable]) => {
          const columns = asExportColumnVariable(variable);
          return columns === undefined ? [] : [[key, columns] as const];
        }),
      ),
    ]),
  );
  const layouts: Record<string, { name: string }> = {};
  for (const candidate of candidates.values()) {
    layouts[candidate.key] = {
      name: availableLayoutName(candidate, layouts, nodeVariablesByType),
    };
  }
  codebook.layouts = layouts;
};

type LayoutOwner = { entity: 'ego' } | { entity: 'edge'; type: string };

const namesRemovedLayout = (
  rule: unknown,
  removed: readonly (LayoutOwner & { key: string })[],
): boolean => {
  if (!isRecord(rule) || !isRecord(rule.options)) return false;
  const { attribute, type } = rule.options;
  return removed.some(
    (owner) =>
      owner.key === attribute &&
      rule.type === owner.entity &&
      (owner.entity === 'ego' || owner.type === type),
  );
};

/** Removes the rules that name a removed layout; true when none are left. */
const emptiedOfRemovedLayouts = (
  filter: unknown,
  removed: readonly (LayoutOwner & { key: string })[],
): boolean => {
  if (!isRecord(filter) || !Array.isArray(filter.rules)) return false;
  const rules = filter.rules.filter(
    (rule: unknown) => !namesRemovedLayout(rule, removed),
  );
  if (rules.length === filter.rules.length) return false;
  filter.rules = rules;
  return rules.length === 0;
};

/**
 * Schema 8 let ego and edge types define layout attributes, which no stage
 * could write. Schema 9 has no layout attribute, and layouts belong to nodes
 * only, so these are removed, with every filter and skip logic rule naming
 * one. A filter left with no rules goes, and so does skip logic.
 */
export const removeEgoAndEdgeLayoutVariables = (protocol: unknown) => {
  if (!isRecord(protocol) || !isRecord(protocol.codebook)) return;
  const { codebook } = protocol;
  const removed: (LayoutOwner & { key: string })[] = [];
  const removeFrom = (variables: unknown, owner: LayoutOwner) => {
    if (!isRecord(variables)) return;
    for (const [key, variable] of Object.entries(variables)) {
      if (!isRecord(variable) || variable.type !== 'layout') continue;
      Reflect.deleteProperty(variables, key);
      removed.push({ ...owner, key });
    }
  };
  if (isRecord(codebook.ego)) {
    removeFrom(codebook.ego.variables, { entity: 'ego' });
  }
  if (isRecord(codebook.edge)) {
    for (const [type, definition] of Object.entries(codebook.edge)) {
      if (isRecord(definition)) {
        removeFrom(definition.variables, { entity: 'edge', type });
      }
    }
  }
  if (removed.length === 0) return;
  for (const stage of stagesOf(protocol)) {
    if (emptiedOfRemovedLayouts(stage.filter, removed)) {
      Reflect.deleteProperty(stage, 'filter');
    }
    if (
      isRecord(stage.skipLogic) &&
      emptiedOfRemovedLayouts(stage.skipLogic.filter, removed)
    ) {
      Reflect.deleteProperty(stage, 'skipLogic');
    }
    for (const list of [stage.panels, stage.presets]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (isRecord(item) && emptiedOfRemovedLayouts(item.filter, removed)) {
          Reflect.deleteProperty(item, 'filter');
        }
      }
    }
  }
};
