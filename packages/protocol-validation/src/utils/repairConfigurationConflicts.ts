import { duplicateFormFieldIndices } from '../schemas/8/common/forms.ts';
import {
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOption,
  optionsMatchInterfaceOwnedSet,
} from '../schemas/8/interface-owned-options.ts';
// The CURRENT protocol schema, imported from its own module rather than
// through `../schemas/index.ts` — see the note in
// `collectEntityAttributeReferences.ts` for why that indirection cannot be
// used from a module the schema's own validation reaches.
import CurrentProtocolSchema from '../schemas/8/schema.ts';
import {
  diseaseLabelKey,
  duplicateDiseaseRows,
} from '../schemas/8/stages/narrative-pedigree.ts';
import {
  findExclusiveVariableConflicts,
  findInterfaceOwnedOptionBindings,
} from './findExclusiveVariableConflicts.ts';
import { repairLegacyColorReferences } from './repairLegacyColorReferences.ts';

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
 * The array containers a conflicting reference can be removed from, keyed to
 * the word a researcher would use for one of their entries. A reference
 * outside this set has no removable container — a required slot on a stage,
 * for example — and is reported as unrepairable rather than guessed at.
 *
 * How SHORT each container may become is deliberately absent: that is the
 * schema's answer, and the only one that stays right. It is read back from the
 * schema by re-parsing the repaired protocol (see `repairBrokeStructure`)
 * rather than copied here, where `fields` alone would need a NetworkComposer
 * special case and every future array a new entry nobody would remember to add.
 */
const REMOVABLE_CONTAINERS: Record<string, string> = {
  fields: 'form field',
  // FamilyPedigree holds its node form as a bare, optional array.
  form: 'form field',
  diseases: 'disease',
  prompts: 'prompt',
  nominationPrompts: 'nomination prompt',
  additionalAttributes: 'automatically-set attribute',
};

/**
 * Optional object properties a conflicting reference can be removed WITH, keyed
 * to the word a researcher would use for one. Preferred over dropping the
 * enclosing array entry, and searched first: a Sociogram prompt whose highlight
 * names a variable an interface owns still has its text, its layout and its
 * edge settings, and dropping the prompt would take all three — or, on a
 * single-prompt stage, refuse the protocol outright, because `prompts` may not
 * be emptied.
 *
 * A property listed here must be OPTIONAL in the schema. That is not asserted
 * from a hand-written copy of the schema's shape: the repaired protocol is
 * re-parsed, and a deletion the schema complains about at the property's own
 * path declines the whole repair (see `repairBrokeStructure`).
 */
const REMOVABLE_PROPERTIES: Record<string, string> = {
  highlight: 'tap-to-highlight setting',
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

type RepairTarget =
  /** Drop one entry from an array. */
  | {
      kind: 'entry';
      containerPath: (string | number)[];
      key: string;
      index: number;
    }
  /** Delete one optional property. */
  | { kind: 'property'; propertyPath: (string | number)[]; key: string };

/**
 * The smallest thing that can be removed to unbind a reference: walking OUT
 * from the reference, the first removable optional property (`REMOVABLE_
 * PROPERTIES`) or, failing that, the enclosing array element (the last array
 * index in the path below the stage index).
 *
 * `stages[3].diseases[1].variable` yields the `diseases` array and index 1;
 * `stages[3].prompts[0].highlight.variable` yields the `highlight` property,
 * because the binding is that property and nothing else in the prompt is
 * implicated; `stages[3].nodeConfig.egoVariable` yields nothing, because
 * removing a required slot is not a repair.
 */
const repairTargetOf = (
  path: readonly (string | number)[],
): RepairTarget | null => {
  for (let position = path.length - 1; position >= 2; position -= 1) {
    const step = path[position];
    if (typeof step !== 'number') {
      if (typeof step === 'string' && Object.hasOwn(REMOVABLE_PROPERTIES, step))
        return {
          kind: 'property',
          propertyPath: path.slice(0, position + 1),
          key: step,
        };
      continue;
    }
    const key = path[position - 1];
    if (typeof key !== 'string') return null;
    if (!Object.hasOwn(REMOVABLE_CONTAINERS, key)) return null;
    return {
      kind: 'entry',
      containerPath: path.slice(0, position),
      key,
      index: step,
    };
  }
  return null;
};

type PendingRemoval = {
  containerPath: (string | number)[];
  indices: Set<number>;
};

const removalKey = (containerPath: readonly PropertyKey[]): string =>
  JSON.stringify(containerPath.map(String));

/**
 * Which of `paths` the schema complains about at the path itself — a too-short
 * or now-missing array, a property that turned out not to be optional.
 */
const brokenPaths = (
  protocol: unknown,
  paths: ReadonlySet<string>,
): Set<string> => {
  const broken = new Set<string>();
  const result = CurrentProtocolSchema.safeParse(protocol);
  if (result.success) return broken;
  for (const issue of result.error.issues) {
    const key = removalKey(issue.path);
    if (paths.has(key)) broken.add(key);
  }
  return broken;
};

/**
 * True when a removal left one of the places it touched in a state the schema
 * rejects — a shortened array below its minimum, a deleted property the schema
 * requires. Compared against the SAME complaint on the original, so a problem
 * that place already had is never blamed on the repair.
 */
const repairBrokeStructure = (
  source: unknown,
  repaired: unknown,
  touched: readonly (readonly (string | number)[])[],
): boolean => {
  const paths = new Set(touched.map(removalKey));
  if (paths.size === 0) return false;
  const after = brokenPaths(repaired, paths);
  if (after.size === 0) return false;
  const before = brokenPaths(source, paths);
  return [...after].some((key) => !before.has(key));
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
 * Repairs a protocol that violates known current configuration rules,
 * including undefined colors generated by the old Narrative Pedigree picker
 * and the rules introduced with interface-owned variables. Describes every
 * change in researcher language so the fix can be confirmed before it is
 * applied.
 *
 * Pure: the input is never mutated. Every repair is chosen so that the result
 * still satisfies the schema — a removal that would empty an array the schema
 * requires is NOT performed, and the whole protocol is reported unrepairable
 * instead, so accepting a repair can never lead to a second dead end.
 *
 * That last sentence is CHECKED, not merely intended: the repaired protocol is
 * put back through this same pass, and a repair that leaves any problem this
 * module recognises declines the whole protocol instead of offering a fix the
 * researcher would be asked to accept again the next time they opened it.
 */
export const repairConfigurationConflicts = (protocol: unknown): RepairResult =>
  runRepair(protocol, true);

/**
 * `verify` runs the repaired protocol back through one more pass to prove the
 * repair actually cleared what it described. False in that second pass, so the
 * check is one level deep rather than recursive.
 */
const runRepair = (protocol: unknown, verify: boolean): RepairResult => {
  const originalSource = isRecord(protocol) ? protocol : null;
  if (!originalSource) return { protocol, problems: [], repairable: true };

  const legacyColorRepair = repairLegacyColorReferences(originalSource);
  const source = isRecord(legacyColorRepair.protocol)
    ? legacyColorRepair.protocol
    : originalSource;

  const problems: ConfigurationProblem[] = legacyColorRepair.repairs.map(
    (repair) => {
      if (repair.kind === 'geospatial') {
        return {
          problem: `${repair.stageLabel ? `The Geospatial stage "${repair.stageLabel}"` : 'A Geospatial stage'} uses legacy color "${repair.from}", which is not a current color reference.`,
          repair: `Its color will use the defined palette reference "${repair.to}".`,
        };
      }
      return {
        problem: `${repair.diseaseLabel ? `The disease "${repair.diseaseLabel}"` : 'A Narrative Pedigree disease'} uses "${repair.from}", which has no defined node palette color.`,
        repair: `Its color will use the defined palette reference "${repair.to}".`,
      };
    },
  );
  const removals = new Map<string, PendingRemoval>();
  const propertyDeletions = new Map<string, (string | number)[]>();
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
    const target = repairTargetOf(path);
    if (!target) {
      problems.push({ problem: describeProblem });
      unrepairable = true;
      return;
    }
    if (target.kind === 'property') {
      propertyDeletions.set(removalKey(target.propertyPath), [
        ...target.propertyPath,
      ]);
      problems.push({
        problem: describeProblem,
        repair: describeRepair(REMOVABLE_PROPERTIES[target.key] ?? 'setting'),
      });
      return;
    }
    const key = removalKey(target.containerPath);
    const pending = removals.get(key) ?? {
      containerPath: target.containerPath,
      indices: new Set<number>(),
    };
    pending.indices.add(target.index);
    removals.set(key, pending);
    problems.push({
      problem: describeProblem,
      repair: describeRepair(REMOVABLE_CONTAINERS[target.key] ?? 'entry'),
    });
  };

  // 1. A form may not collect one variable twice. `duplicateFormFieldIndices`
  //    is the schema's own finder, so the repair keeps exactly the fields the
  //    schema would accept.
  for (const { path, fields } of formFieldArrays(source)) {
    for (const index of duplicateFormFieldIndices(fields)) {
      const field = fields[index];
      const variable = isRecord(field) ? field.variable : undefined;
      if (typeof variable !== 'string') continue;
      scheduleRemoval(
        [...path, index, 'variable'],
        `A form collects the same attribute ("${variableDisplayName(source, variable)}") more than once.`,
        () => 'The repeated form field will be removed.',
      );
    }
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

    // The SAME finder the schema uses (`narrative-pedigree.ts`), so the repair
    // cannot judge a duplicate differently from the rule it is repairing.
    const { variableDuplicates } = duplicateDiseaseRows(diseases);
    const labelOf = (index: number): string => {
      const row = diseases[index];
      if (typeof row?.label === 'string') return row.label;
      return typeof row?.variable === 'string' ? row.variable : '';
    };
    // Every row this pass is dropping: the variable duplicates found just
    // above, PLUS any row step 2 already scheduled for removal because it
    // bound a variable an interface owns. Both leave the list, so neither may
    // force a rename on a row that stays — a disease left alone after the
    // other was deleted would otherwise be renamed "X (2)" with no "X".
    const droppedIndices = new Set(variableDuplicates);
    for (const index of removals.get(
      removalKey(['stages', stageIndex, 'diseases']),
    )?.indices ?? []) {
      droppedIndices.add(index);
    }
    for (const index of variableDuplicates) {
      const variable = diseases[index]?.variable;
      const firstIndex = diseases.findIndex(
        (candidate) => candidate.variable === variable,
      );
      scheduleRemoval(
        ['stages', stageIndex, 'diseases', index, 'variable'],
        `A Narrative Pedigree records two diseases ("${labelOf(firstIndex)}" and "${labelOf(index)}") against the same attribute.`,
        () => `The second disease ("${labelOf(index)}") will be removed.`,
      );
    }

    // Labels are compared across the rows that SURVIVE the variable dedupe, so
    // a row about to be removed never forces a rename of a row that stays.
    const { labelDuplicates } = duplicateDiseaseRows(diseases, droppedIndices);
    const renameIndices = new Set(labelDuplicates);
    // Seeded from EVERY surviving row before renaming starts, not accumulated
    // as the walk goes: a name generated for row 1 has to avoid row 2's as
    // much as row 0's. Accumulating let "Asthma", "Asthma", "Asthma (2)"
    // rename row 1 to a name row 2 already held, so the repaired protocol
    // still failed the rule it had just been repaired for.
    const seenLabels = new Set<string>();
    diseases.forEach((disease, index) => {
      if (droppedIndices.has(index)) return;
      if (typeof disease.label === 'string')
        seenLabels.add(diseaseLabelKey(disease.label));
    });
    diseases.forEach((disease, index) => {
      if (droppedIndices.has(index)) return;
      if (typeof disease.label !== 'string') return;
      if (!renameIndices.has(index)) return;
      // Renaming rather than removing: two rows sharing a label may map
      // different variables, and both mappings are meaningful — only the name
      // the participant sees has to be made distinct.
      const base = disease.label.trim();
      let suffix = 2;
      let candidate = `${base} (${suffix})`;
      while (seenLabels.has(diseaseLabelKey(candidate))) {
        suffix += 1;
        candidate = `${base} (${suffix})`;
      }
      seenLabels.add(diseaseLabelKey(candidate));
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

  // One unrepairable problem refuses the WHOLE protocol: fixing only the rest
  // would still leave a protocol that cannot be opened. Drop every `repair` so
  // the result cannot be read as a partial offer.
  const decline = (): RepairResult => ({
    protocol,
    problems: problems.map(({ problem }) => ({ problem })),
    repairable: false,
  });

  // A container that is not an array cannot have an entry removed from it, and
  // a property whose owner is not an object cannot be deleted from it.
  for (const pending of removals.values()) {
    if (!Array.isArray(valueAt(source, pending.containerPath))) {
      unrepairable = true;
    }
  }
  for (const propertyPath of propertyDeletions.values()) {
    if (!isRecord(valueAt(source, propertyPath.slice(0, -1)))) {
      unrepairable = true;
    }
  }
  if (unrepairable) return decline();

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
  // Property deletions before entry removals, for the same reason renames go
  // first: their paths carry pre-removal indices.
  for (const propertyPath of propertyDeletions.values()) {
    const owner = valueAt(repaired, propertyPath.slice(0, -1));
    const property = propertyPath[propertyPath.length - 1];
    if (isRecord(owner) && typeof property === 'string') delete owner[property];
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

  // A removal that leaves an array shorter than the schema allows — or deletes
  // a property the schema turns out to require — is not a repair. The SCHEMA
  // owns those answers: one field is required on a NameGenerator form and none
  // on a NetworkComposer's, and `highlight` is optional on a Sociogram prompt.
  // So ask it, rather than keeping a hand-written copy here that a new array,
  // a new property or a new stage type would silently outdate.
  if (
    repairBrokeStructure(source, repaired, [
      ...[...removals.values()].map((pending) => pending.containerPath),
      ...propertyDeletions.values(),
    ])
  ) {
    return decline();
  }

  // Finally, prove the repair did what it said. Anything this module still
  // recognises in its own output is a fix that would be offered again the next
  // time the researcher opened the protocol, which is worse than declining.
  if (verify && runRepair(repaired, false).problems.length > 0) {
    return decline();
  }

  return { protocol: repaired, problems, repairable: true };
};
