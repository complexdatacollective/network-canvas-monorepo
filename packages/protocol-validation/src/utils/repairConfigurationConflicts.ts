import { normalizeForComparison } from '@codaco/shared-consts';

import {
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOption,
  optionsMatchInterfaceOwnedSet,
} from '../schemas/8/interface-owned-options.ts';
import {
  findExclusiveVariableConflicts,
  findInterfaceOwnedOptionBindings,
} from './findExclusiveVariableConflicts.ts';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A problem this module found, described the way a researcher would describe
 * it. `repair` says what accepting the fix would do; when it is absent the
 * problem cannot be fixed automatically and the whole protocol must be
 * declined.
 */
export type ConfigurationProblem = {
  /** What is wrong, in one sentence. */
  problem: string;
  /** What accepting the fix would do, in one sentence. Absent = unrepairable. */
  repair?: string;
};

export type RepairResult = {
  /**
   * The protocol with every repairable problem fixed. Identical (by reference)
   * to the input when nothing needed changing.
   */
  protocol: unknown;
  problems: ConfigurationProblem[];
  /**
   * True when every problem found has a repair. A caller must not offer to fix
   * anything when this is false — dropping only the repairable half would hand
   * the researcher a protocol that still fails to open.
   */
  repairable: boolean;
};

/**
 * The array containers a conflicting reference can be removed from, with the
 * minimum length the schema requires. A reference outside this set has no
 * removable container — a required slot on a stage, for example — and is
 * reported as unrepairable rather than guessed at.
 */
const REMOVABLE_CONTAINERS: Record<string, { minLength: number }> = {
  fields: { minLength: 1 },
  // FamilyPedigree holds its node form as a bare, optional array.
  form: { minLength: 0 },
  diseases: { minLength: 1 },
  prompts: { minLength: 1 },
  nominationPrompts: { minLength: 0 },
  additionalAttributes: { minLength: 0 },
};

/**
 * How short the schema lets a removable container become.
 *
 * `fields` is the one key whose answer depends on where it sits:
 * `FormSchema`/`TitlelessFormSchema` require at least one field, while
 * NetworkComposer's `nodeForm.fields` and each edge form's `fields` are
 * optional and may be empty (a composer stage can legitimately have no
 * editable attributes).
 */
const minLengthFor = (
  protocol: UnknownRecord,
  containerPath: readonly (string | number)[],
  key: string,
): number => {
  if (key === 'fields') {
    const stageIndex = containerPath[1];
    const stages = protocol.stages;
    const stage =
      typeof stageIndex === 'number' && Array.isArray(stages)
        ? stages[stageIndex]
        : undefined;
    if (isRecord(stage) && stage.type === 'NetworkComposer') return 0;
  }
  return REMOVABLE_CONTAINERS[key]?.minLength ?? 1;
};

const cloneProtocol = (protocol: unknown): unknown => structuredClone(protocol);

/** The value at `path`, or undefined if any step is missing. */
const valueAt = (root: unknown, path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>((current, step) => {
    if (Array.isArray(current) && typeof step === 'number')
      return current[step];
    if (isRecord(current) && typeof step === 'string') return current[step];
    return undefined;
  }, root);

/**
 * The removable array element enclosing a reference: the LAST array index in
 * its path below the stage index. `stages[3].diseases[1].variable` yields the
 * `diseases` array and index 1; `stages[3].nodeConfig.egoVariable` yields
 * nothing, because removing a required slot is not a repair.
 */
const removableContainerOf = (
  path: readonly (string | number)[],
): {
  containerPath: (string | number)[];
  key: string;
  index: number;
} | null => {
  for (let position = path.length - 1; position >= 2; position -= 1) {
    const step = path[position];
    if (typeof step !== 'number') continue;
    const key = path[position - 1];
    if (typeof key !== 'string') return null;
    if (!Object.hasOwn(REMOVABLE_CONTAINERS, key)) return null;
    return { containerPath: path.slice(0, position), key, index: step };
  }
  return null;
};

type PendingRemoval = {
  containerPath: (string | number)[];
  key: string;
  indices: Set<number>;
};

const removalKey = (containerPath: readonly (string | number)[]): string =>
  JSON.stringify(containerPath);

const containerLabel: Record<string, string> = {
  fields: 'form field',
  form: 'form field',
  diseases: 'disease',
  prompts: 'prompt',
  nominationPrompts: 'nomination prompt',
  additionalAttributes: 'automatically-set attribute',
};

/** Every `form.fields`-shaped array in a protocol, with its path. */
const formFieldArrays = (
  protocol: UnknownRecord,
): { path: (string | number)[]; fields: unknown[] }[] => {
  const found: { path: (string | number)[]; fields: unknown[] }[] = [];
  const visit = (value: unknown, path: (string | number)[]): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, [...path, index]);
      });
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'fields' && Array.isArray(child)) {
        found.push({ path: [...path, key], fields: child });
      }
      // FamilyPedigree holds its node form as a bare array under `form`.
      if (key === 'form' && Array.isArray(child)) {
        found.push({ path: [...path, key], fields: child });
      }
      visit(child, [...path, key]);
    }
  };
  visit(protocol.stages, ['stages']);
  return found;
};

/**
 * A variable's codebook `name`, searched across every entity type. The repair
 * walk does not resolve subjects (it works from paths, not references), and a
 * codebook key cannot span entity types, so a whole-codebook lookup is exact —
 * and a raw uuid in a researcher-facing sentence is not a description of
 * anything.
 */
const variableDisplayName = (
  protocol: UnknownRecord,
  variableId: string,
): string => {
  const codebook = protocol.codebook;
  if (!isRecord(codebook)) return variableId;
  const owners: unknown[] = [codebook.ego];
  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (isRecord(types)) owners.push(...Object.values(types));
  }
  for (const owner of owners) {
    if (!isRecord(owner)) continue;
    const variables = owner.variables;
    if (!isRecord(variables)) continue;
    const variable = variables[variableId];
    if (isRecord(variable) && typeof variable.name === 'string') {
      return variable.name;
    }
  }
  return variableId;
};

const asDiseaseRows = (
  value: unknown,
): { label: unknown; variable: unknown }[] | null =>
  Array.isArray(value) && value.every(isRecord)
    ? (value as { label: unknown; variable: unknown }[])
    : null;

/**
 * Repairs a protocol that violates the configuration rules introduced with
 * interface-owned variables, and describes every change in researcher
 * language so the fix can be confirmed before it is applied.
 *
 * Pure: the input is never mutated. Every repair is chosen so that the result
 * still satisfies the schema — a removal that would empty an array the schema
 * requires is NOT performed, and the whole protocol is reported unrepairable
 * instead, so accepting a repair can never lead to a second dead end.
 */
export const repairConfigurationConflicts = (
  protocol: unknown,
): RepairResult => {
  const source = isRecord(protocol) ? protocol : null;
  if (!source) return { protocol, problems: [], repairable: true };

  const problems: ConfigurationProblem[] = [];
  const removals = new Map<string, PendingRemoval>();
  const labelRenames: { path: (string | number)[]; label: string }[] = [];
  const optionRestorations: {
    path: (string | number)[];
    options: readonly InterfaceOwnedOption[];
  }[] = [];
  let unrepairable = false;

  const scheduleRemoval = (
    path: readonly (string | number)[],
    describeProblem: string,
    describeRepair: (what: string) => string,
  ): void => {
    const container = removableContainerOf(path);
    if (!container) {
      problems.push({ problem: describeProblem });
      unrepairable = true;
      return;
    }
    const key = removalKey(container.containerPath);
    const pending = removals.get(key) ?? {
      containerPath: container.containerPath,
      key: container.key,
      indices: new Set<number>(),
    };
    pending.indices.add(container.index);
    removals.set(key, pending);
    problems.push({
      problem: describeProblem,
      repair: describeRepair(containerLabel[container.key] ?? 'entry'),
    });
  };

  // 1. A form may not collect one variable twice.
  for (const { path, fields } of formFieldArrays(source)) {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (!isRecord(field) || typeof field.variable !== 'string') return;
      if (!seen.has(field.variable)) {
        seen.add(field.variable);
        return;
      }
      scheduleRemoval(
        [...path, index, 'variable'],
        `A form collects the same variable ("${variableDisplayName(source, field.variable)}") more than once.`,
        () => 'The repeated form field will be removed.',
      );
    });
  }

  // 2. A variable an interface owns outright may not be named elsewhere.
  for (const conflict of findExclusiveVariableConflicts(source)) {
    scheduleRemoval(
      conflict.path,
      `"${conflict.variableName}" is set by ${conflict.owner.owner}, but something else in this protocol also writes to it.`,
      (what) => `The conflicting ${what} will be removed.`,
    );
  }

  // 3. A Narrative Pedigree may not map one variable twice, and its disease
  //    labels must be distinguishable on screen.
  const stages = Array.isArray(source.stages) ? source.stages : [];
  stages.forEach((stage, stageIndex) => {
    if (!isRecord(stage) || stage.type !== 'NarrativePedigree') return;
    const diseases = asDiseaseRows(stage.diseases);
    if (!diseases) return;

    const firstLabelForVariable = new Map<string, string>();
    const droppedIndices = new Set<number>();
    diseases.forEach((disease, index) => {
      if (typeof disease.variable !== 'string') return;
      const label =
        typeof disease.label === 'string' ? disease.label : disease.variable;
      const firstLabel = firstLabelForVariable.get(disease.variable);
      if (firstLabel === undefined) {
        firstLabelForVariable.set(disease.variable, label);
        return;
      }
      droppedIndices.add(index);
      scheduleRemoval(
        ['stages', stageIndex, 'diseases', index, 'variable'],
        `A Narrative Pedigree records two diseases ("${firstLabel}" and "${label}") against the same variable.`,
        () => `The second disease ("${label}") will be removed.`,
      );
    });

    // Labels are compared across the rows that SURVIVE the variable dedupe, so
    // a row about to be removed never forces a rename of a row that stays.
    const seenLabels = new Set<string>();
    diseases.forEach((disease, index) => {
      if (droppedIndices.has(index)) return;
      if (typeof disease.label !== 'string') return;
      // The SAME comparison the schema makes (`narrative-pedigree.ts`), by the
      // same helper. A repair that judged duplicates differently from the
      // schema would either rename rows the schema was happy with, or leave a
      // protocol the schema still rejects — asking the researcher to approve a
      // repair that fixes nothing, every time they open it.
      const normalized = normalizeForComparison(disease.label.trim());
      if (!seenLabels.has(normalized)) {
        seenLabels.add(normalized);
        return;
      }
      // Renaming rather than removing: two rows sharing a label may map
      // different variables, and both mappings are meaningful — only the name
      // the participant sees has to be made distinct.
      const base = disease.label.trim();
      let suffix = 2;
      let candidate = `${base} (${suffix})`;
      while (seenLabels.has(normalizeForComparison(candidate))) {
        suffix += 1;
        candidate = `${base} (${suffix})`;
      }
      seenLabels.add(normalizeForComparison(candidate));
      labelRenames.push({
        path: ['stages', stageIndex, 'diseases', index],
        label: candidate,
      });
      problems.push({
        problem: `Two diseases on a Narrative Pedigree are both named "${disease.label}".`,
        repair: `The second will be renamed "${candidate}".`,
      });
    });
  });

  // 4. A variable whose OPTION SET an interface owns must still carry it. The
  //    editors now render those options read-only, so a protocol that already
  //    drifted has no other way back — and the canonical set is known exactly,
  //    which makes restoring it the one unambiguous repair in this module.
  const restoredKeys = new Set<string>();
  for (const binding of findInterfaceOwnedOptionBindings(source)) {
    const { entity, type } = binding.subject;
    if (entity !== 'ego' && type === undefined) continue;
    const variablePath: (string | number)[] =
      entity === 'ego'
        ? ['codebook', 'ego', 'variables', binding.variableId]
        : ['codebook', entity, type ?? '', 'variables', binding.variableId];
    const key = JSON.stringify(variablePath);
    if (restoredKeys.has(key)) continue;
    const variable = valueAt(source, variablePath);
    if (!isRecord(variable)) continue;
    if (variable.type !== 'categorical' && variable.type !== 'ordinal')
      continue;
    const optionSet = INTERFACE_OWNED_OPTION_SETS[binding.optionSet];
    const currentOptions = Array.isArray(variable.options)
      ? (variable.options as { value: unknown; label?: unknown }[])
      : undefined;
    if (optionsMatchInterfaceOwnedSet(currentOptions, optionSet.options)) {
      continue;
    }
    restoredKeys.add(key);
    optionRestorations.push({ path: variablePath, options: optionSet.options });
    problems.push({
      problem: `The ${optionSet.label} options on "${variableDisplayName(source, binding.variableId)}" have been changed, but the interface that uses them depends on the original set.`,
      repair: 'The original options will be restored.',
    });
  }

  if (problems.length === 0) {
    return { protocol, problems, repairable: true };
  }

  // A removal that would empty an array the schema requires is not a repair.
  for (const pending of removals.values()) {
    const container = valueAt(source, pending.containerPath);
    if (!Array.isArray(container)) {
      unrepairable = true;
      continue;
    }
    const minLength = minLengthFor(source, pending.containerPath, pending.key);
    if (container.length - pending.indices.size < minLength) {
      unrepairable = true;
    }
  }

  if (unrepairable) {
    // One unrepairable problem refuses the WHOLE protocol: fixing only the
    // rest would still leave a protocol that cannot be opened. Drop every
    // `repair` so the result cannot be read as a partial offer.
    return {
      protocol,
      problems: problems.map(({ problem }) => ({ problem })),
      repairable: false,
    };
  }

  const repaired = cloneProtocol(source);
  // Renames FIRST: their paths carry the index the row had BEFORE anything was
  // removed. Applying them after a removal would rewrite a different row's
  // participant-facing name and leave the real duplicate in place.
  for (const rename of labelRenames) {
    const row = valueAt(repaired, rename.path);
    if (isRecord(row)) row.label = rename.label;
  }
  for (const optionFix of optionRestorations) {
    const variable = valueAt(repaired, optionFix.path);
    if (isRecord(variable)) variable.options = optionFix.options;
  }
  for (const pending of removals.values()) {
    const container = valueAt(repaired, pending.containerPath);
    if (!Array.isArray(container)) continue;
    const kept = container.filter(
      (_item, index) => !pending.indices.has(index),
    );
    const parentPath = pending.containerPath.slice(0, -1);
    const parent = valueAt(repaired, parentPath);
    const property = pending.containerPath[pending.containerPath.length - 1];
    if (!isRecord(parent) || typeof property !== 'string') continue;
    // An emptied optional array is dropped entirely rather than left as `[]`:
    // the editors treat an absent list and an empty one differently.
    if (kept.length === 0) {
      delete parent[property];
    } else {
      parent[property] = kept;
    }
  }

  return { protocol: repaired, problems, repairable: true };
};
