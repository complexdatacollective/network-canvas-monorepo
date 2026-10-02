import { normalizeCodebookName } from '@codaco/shared-consts';

import {
  createMigration,
  type ProtocolDocument,
} from '../../migration/index.ts';

type OptionEntry = { value: unknown; [key: string]: unknown };
type VariableRecord = Record<
  string,
  { name: string; options?: OptionEntry[]; [key: string]: unknown }
>;
type TypeEntry = {
  name: string;
  variables?: VariableRecord;
  [key: string]: unknown;
};
type TypesRecord = Record<string, TypeEntry>;
type AdditionalAttribute = { value: unknown; [key: string]: unknown };
type Prompt = {
  additionalAttributes?: AdditionalAttribute[];
  [key: string]: unknown;
};
type Rule = {
  type?: unknown;
  options?: {
    type?: unknown;
    attribute?: unknown;
    value?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
type Filter = { rules?: Rule[]; [key: string]: unknown };
type Stage = {
  prompts?: Prompt[];
  filter?: Filter;
  skipLogic?: { filter?: Filter; [key: string]: unknown };
  panels?: { filter?: Filter; [key: string]: unknown }[];
  [key: string]: unknown;
};
// Old option value to new, per attribute, keyed by `ruleScope`.
type OptionValueRenames = Map<string, Map<unknown, unknown>>;

const setProps = (
  props: Record<string, unknown>,
  source: Record<string, unknown> = {},
): Record<string, unknown> => {
  const result = { ...source };
  for (const key of Object.keys(props)) {
    if (source[key]) {
      result[key] = props[key];
    }
  }
  return result;
};

const getNextSafeValue = (
  value: string,
  existing: string[],
  inc = 1,
): string => {
  const incrementedValue = inc > 1 ? `${value}${inc}` : value;
  if (!existing.includes(incrementedValue)) {
    return incrementedValue;
  }
  return getNextSafeValue(value, existing, inc + 1);
};

// Makes a name `CodebookNameSchema` accepts while keeping every letter, digit,
// space and symbol. Tabs and line breaks separate words, so they become
// spaces; other control characters and the noncharacters U+FFFE and U+FFFF are
// dropped. A name left empty takes `fallback`, the record id.
const getSafeValue = (
  value: unknown,
  existing: string[] = [],
  fallback?: string,
): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const safeValue = normalizeCodebookName(
    value
      .toWellFormed()
      .replace(/[\t\n\v\f\r]+/g, ' ')
      .replace(/[\p{Cc}\uFFFE\uFFFF]/gu, ''),
  );
  return getNextSafeValue(
    safeValue === '' && fallback ? fallback : safeValue,
    existing,
  );
};

const migrateOptionValues = (options: OptionEntry[] = []): OptionEntry[] => {
  const result: OptionEntry[] = [];
  for (const { value, ...rest } of options) {
    result.push({
      ...rest,
      value: getSafeValue(
        value,
        result.map((o) => String(o.value)),
      ),
    });
  }
  return result;
};

const migrateVariable = (
  variable: VariableRecord[string],
  variableId: string,
  takenNames: string[] = [],
): VariableRecord[string] =>
  setProps(
    {
      options: migrateOptionValues(variable.options),
      name: getSafeValue(variable.name, takenNames, variableId),
    },
    variable as unknown as Record<string, unknown>,
  ) as unknown as VariableRecord[string];

// Built from entries rather than by assignment: assigning a `__proto__` id to
// a plain object replaces its prototype and loses the entry, where
// `Object.fromEntries` keeps it for validation to refuse.
const migrateEntries = <T extends { name: string }>(
  record: Record<string, T>,
  migrateEntry: (entry: T, id: string, takenNames: string[]) => T,
): Record<string, T> => {
  const migrated: [string, T][] = [];
  for (const [id, entry] of Object.entries(record)) {
    if (!entry) continue;
    const takenNames = migrated.map(([, done]) => done.name);
    migrated.push([id, migrateEntry(entry, id, takenNames)]);
  }
  return Object.fromEntries(migrated);
};

const migrateVariables = (variables: VariableRecord = {}): VariableRecord =>
  migrateEntries(variables, migrateVariable);

const migrateType = (
  type: TypeEntry,
  typeId?: string,
  takenNames: string[] = [],
): TypeEntry =>
  setProps(
    {
      name: getSafeValue(type.name, takenNames, typeId),
      variables: migrateVariables(type.variables),
    },
    type as unknown as Record<string, unknown>,
  ) as unknown as TypeEntry;

const migrateTypes = (types: TypesRecord = {}): TypesRecord =>
  migrateEntries(types, migrateType);

// Filter and skip logic rules compare against option values, so a value this
// migration changes is changed in the rules that name it too. A rule is scoped
// by its own `type` ('alter' | 'edge' | 'ego') and, for alters and edges, the
// entity type in `options.type`.
const ruleScope = (
  ruleType: unknown,
  entityType: unknown,
  attribute: unknown,
) =>
  JSON.stringify([ruleType, ruleType === 'ego' ? null : entityType, attribute]);

const collectOptionValueRenames = (
  scopes: {
    ruleType: string;
    entityType?: string;
    before?: TypeEntry;
    after?: TypeEntry;
  }[],
): OptionValueRenames => {
  const renames: OptionValueRenames = new Map();
  for (const { ruleType, entityType, before, after } of scopes) {
    for (const [variableId, variable] of Object.entries(
      before?.variables ?? {},
    )) {
      const migratedOptions = after?.variables?.[variableId]?.options ?? [];
      const changed: Map<unknown, unknown> = new Map();
      // Only an option value's first occurrence is renamed: a later duplicate
      // gets a suffix, and rules naming the value meant the first.
      const seen = new Set<unknown>();
      (variable.options ?? []).forEach(({ value }, index) => {
        if (seen.has(value)) return;
        seen.add(value);
        const migratedValue = migratedOptions[index]?.value;
        if (migratedValue !== value) changed.set(value, migratedValue);
      });
      if (changed.size > 0) {
        renames.set(ruleScope(ruleType, entityType, variableId), changed);
      }
    }
  }
  return renames;
};

const renameRuleValues = (
  filter: Filter,
  renames: OptionValueRenames,
): Filter => {
  if (!Array.isArray(filter.rules)) return filter;
  return {
    ...filter,
    rules: filter.rules.map((rule) => {
      const renamed = renames.get(
        ruleScope(rule.type, rule.options?.type, rule.options?.attribute),
      );
      if (!renamed || !rule.options) return rule;
      const rename = (value: unknown) =>
        renamed.has(value) ? renamed.get(value) : value;
      const { value } = rule.options;
      return {
        ...rule,
        options: {
          ...rule.options,
          value: Array.isArray(value) ? value.map(rename) : rename(value),
        },
      };
    }),
  };
};

const migratePrompt = (prompt: Prompt): Prompt => {
  const booleanOnlyAttributes = (prompt.additionalAttributes ?? []).filter(
    (additionalAttribute) =>
      additionalAttribute.value === true || additionalAttribute.value === false,
  );
  return Object.keys(prompt).reduce<Record<string, unknown>>((object, key) => {
    if (key !== 'additionalAttributes') {
      object[key] = prompt[key];
    } else if (booleanOnlyAttributes.length > 0) {
      object[key] = booleanOnlyAttributes;
    }
    return object;
  }, {}) as Prompt;
};

const migrateStage = (stage: Stage): Stage => ({
  ...stage,
  prompts: (stage.prompts ?? []).map((prompt) =>
    prompt.additionalAttributes ? migratePrompt(prompt) : prompt,
  ),
});

const renameStageRuleValues = (
  stage: Stage,
  renames: OptionValueRenames,
): Stage => {
  const { filter, skipLogic, panels } = stage;
  return {
    ...stage,
    ...(filter && { filter: renameRuleValues(filter, renames) }),
    ...(skipLogic?.filter && {
      skipLogic: {
        ...skipLogic,
        filter: renameRuleValues(skipLogic.filter, renames),
      },
    }),
    ...(Array.isArray(panels) && {
      panels: panels.map((panel) =>
        panel.filter
          ? { ...panel, filter: renameRuleValues(panel.filter, renames) }
          : panel,
      ),
    }),
  };
};

const migrateStages = (
  stages: Stage[] = [],
  renames: OptionValueRenames,
): Stage[] =>
  stages.map((stage) => {
    const migrated = stage.prompts ? migrateStage(stage) : stage;
    return renames.size > 0
      ? renameStageRuleValues(migrated, renames)
      : migrated;
  });

const notes = `- Tidy **attribute names** and **ordinal/categorical values**: spaces at the start or end are removed, tabs and line breaks become spaces, and other invisible control characters are removed. Letters from any language, numbers, spaces and punctuation are kept. Attributes and values that already meet these requirements **will not be modified**. Filter and skip logic rules that use a changed value are updated to match.
- Add a numerical suffix (\`attribute2\`, \`attribute3\`, etc.) to any attributes or categorical/ordinal values that clash as a result of these changes.
- Rename node and edge types to ensure they are unique, and tidy them in the same way as attribute names. Names that clash will get a numerical suffix, as above.
- **NOTE:** If you are using external network data, its column headings must match your attribute names. If this migration changes an attribute name, update the matching column heading yourself.
- Remove any non-boolean 'additional attributes' from prompts. It was necessary to simplify this feature, and so only boolean attribute types will be supported moving forwards. Any non-boolean attributes you created that will be removed by this migration will remain in your codebook, but will be marked 'unused'. You should review and remove these manually, or replace them with equivalent boolean attributes.`;

const migrationV3toV4 = createMigration({
  from: 3,
  to: 4,
  dependencies: {},
  notes,
  migrate: (doc) => {
    const codebook = doc.codebook as Record<string, unknown>;
    const stages = doc.stages as Stage[];
    const nodeTypes = codebook.node as TypesRecord | undefined;
    const edgeTypes = codebook.edge as TypesRecord | undefined;
    const egoType = codebook.ego as TypeEntry | undefined;

    const migratedNodeTypes = migrateTypes(nodeTypes);
    const migratedEdgeTypes = migrateTypes(edgeTypes);
    const migratedEgoType = egoType ? migrateType(egoType) : undefined;

    const newCodebook = setProps(
      {
        node: migratedNodeTypes,
        edge: migratedEdgeTypes,
        ego: migratedEgoType,
      },
      codebook,
    );

    const renames = collectOptionValueRenames([
      ...Object.entries(nodeTypes ?? {}).map(([entityType, before]) => ({
        ruleType: 'alter',
        entityType,
        before,
        after: migratedNodeTypes[entityType],
      })),
      ...Object.entries(edgeTypes ?? {}).map(([entityType, before]) => ({
        ruleType: 'edge',
        entityType,
        before,
        after: migratedEdgeTypes[entityType],
      })),
      { ruleType: 'ego', before: egoType, after: migratedEgoType },
    ]);

    const newStages = migrateStages(stages, renames);

    return {
      ...doc,
      codebook: newCodebook,
      stages: newStages,
      schemaVersion: 4 as const,
    } as ProtocolDocument<4>;
  },
});

export default migrationV3toV4;
