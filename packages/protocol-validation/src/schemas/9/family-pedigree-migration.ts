/**
 * The schema 8 to 9 conversion of the Family Pedigree and Narrative Pedigree
 * stages, run by `migrationV8toV9` before it localizes the document's text.
 *
 * Every string written here is plain schema 8 text. The migration's
 * localization pass, which runs afterwards, wraps each participant-facing one
 * in the undetermined locale, so the converted stages and the stage this adds
 * are escaped exactly as the rest of the document is.
 */
import {
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from './family-pedigree-values.ts';
import {
  type InterfaceOwnedOption,
  optionsMatchInterfaceOwnedSet,
} from './interface-owned-options.ts';
import { FAMILY_PEDIGREE_BUILD_PROMPT_ID } from './stages/family-pedigree.ts';

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Fields => (isRecord(value) ? value : {});

/**
 * Leaves out the keys whose value is undefined, so a key schema 8 was missing
 * stays missing and validation reports it, rather than the conversion
 * inventing a value.
 */
const withoutUndefined = (fields: Fields): Fields =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

/** `base` if it is free, otherwise `base` followed by the first free number. */
const freshId = (base: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

const variablesOf = (
  codebook: unknown,
  entity: 'node' | 'edge',
  type: unknown,
): Fields | undefined => {
  if (typeof type !== 'string') return undefined;
  const definition = asRecord(asRecord(asRecord(codebook)[entity])[type]);
  return isRecord(definition.variables) ? definition.variables : undefined;
};

/**
 * Schema 8 locked the sex at birth and relationship kind attributes to its own
 * labels, and schema 9 keeps the same values under new labels. The values a
 * participant already recorded are untouched; only the labels change. An
 * attribute whose values do not match is left as it is, for validation to
 * report.
 */
const adoptCanonicalOptions = (
  variable: unknown,
  canonical: readonly InterfaceOwnedOption[],
) => {
  if (!isRecord(variable) || !Array.isArray(variable.options)) return;
  if (variable.type !== 'categorical') return;
  const options = variable.options.filter(isRecord).map(({ value }) => ({
    value,
  }));
  if (!optionsMatchInterfaceOwnedSet(options, canonical)) return;
  variable.options = canonical.map((option) => ({ ...option }));
};

const RELATIVES_NOT_RECORDED_KEY = 'relativesNotRecorded';

/**
 * The attribute a converted stage records "has no siblings" and similar
 * answers in. Schema 8 had no such attribute, so one is added to the person
 * type, with a key and a name nothing on that type already uses. Every
 * converted stage on one person type shares it, as stages may share their
 * other structural attributes.
 */
const relativesNotRecordedAttribute = (
  codebook: unknown,
  nodeType: unknown,
  created: Map<string, string>,
): string | undefined => {
  if (typeof nodeType !== 'string') return undefined;
  const existing = created.get(nodeType);
  if (existing !== undefined) return existing;

  const definition = asRecord(asRecord(codebook).node)[nodeType];
  if (!isRecord(definition)) return undefined;
  if (!isRecord(definition.variables)) definition.variables = {};
  const variables = asRecord(definition.variables);

  const names = new Set(
    Object.values(variables).flatMap((variable) =>
      isRecord(variable) && typeof variable.name === 'string'
        ? [variable.name.toLowerCase()]
        : [],
    ),
  );
  let key = RELATIVES_NOT_RECORDED_KEY;
  for (
    let suffix = 2;
    Object.hasOwn(variables, key) || names.has(key.toLowerCase());
    suffix += 1
  ) {
    key = `${RELATIVES_NOT_RECORDED_KEY}${suffix}`;
  }

  variables[key] = {
    name: key,
    type: 'categorical',
    options: PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS.map((option) => ({
      ...option,
    })),
  };
  created.set(nodeType, key);
  return key;
};

/**
 * `{ mode: 'fixed', value }` becomes its value and `participantChoice` becomes
 * `participantPreference`. Schema 8 required a framing, so it had no default
 * to preserve. Anything else is passed through for validation to report.
 */
const convertFraming = (framing: unknown): unknown => {
  if (!isRecord(framing)) return framing;
  if (framing.mode === 'participantChoice') return 'participantPreference';
  if (framing.mode === 'fixed') return framing.value;
  return framing;
};

/**
 * Schema 8's grandparents requirement becomes the grandparents scope at the
 * same enforcement. The children requirement has no counterpart and is
 * dropped, as is a grandparents requirement that was off.
 */
const convertBoundaries = (
  boundaries: unknown,
  relativesNotRecorded: () => string | undefined,
): Fields | undefined => {
  const enforcement = asRecord(boundaries).requireGrandparents;
  if (enforcement !== 'required' && enforcement !== 'recommended') {
    return undefined;
  }
  return withoutUndefined({
    scope: 'grandparents',
    enforcement,
    relativesNotRecordedAttribute: relativesNotRecorded(),
  });
};

const NOMINATION_PROMPT_ID_BASE = 'nomination';

/**
 * Each prompt keeps its id and text and names its attribute `attribute`. Schema
 * 9 reserves the id `pedigree` for the family-building step, so a prompt with
 * that id is given a fresh one. Schema 9 needs at least one prompt, so an empty
 * list is left out.
 */
const convertNominationPrompts = (prompts: unknown): unknown => {
  if (!Array.isArray(prompts)) return prompts;
  if (prompts.length === 0) return undefined;
  const taken = new Set(
    prompts.flatMap((prompt) =>
      isRecord(prompt) && typeof prompt.id === 'string' ? [prompt.id] : [],
    ),
  );
  return prompts.map((prompt) => {
    if (!isRecord(prompt)) return prompt;
    const { variable, ...rest } = prompt;
    if (rest.id !== FAMILY_PEDIGREE_BUILD_PROMPT_ID) {
      return withoutUndefined({ ...rest, attribute: variable });
    }
    const id = freshId(NOMINATION_PROMPT_ID_BASE, taken);
    taken.add(id);
    return withoutUndefined({ ...rest, id, attribute: variable });
  });
};

/** Schema 8's bare field list becomes a form; an empty list is left out. */
const convertForm = (form: unknown): unknown => {
  if (!Array.isArray(form)) return form;
  return form.length > 0 ? { fields: form } : undefined;
};

const isEmptyText = (item: unknown) =>
  isRecord(item) &&
  item.type === 'text' &&
  typeof item.content === 'string' &&
  item.content.trim() === '';

const DEFAULT_PEDIGREE_LABEL = 'Family pedigree';

/**
 * Schema 9's pedigree has no introduction screen, so a schema 8 one becomes an
 * Information stage shown just before the pedigree. Its heading is the
 * pedigree's label. It is shown or skipped by the pedigree's own skip logic,
 * so the two still appear or are skipped together. Text items with no text,
 * which showed nothing, are left out; an introduction left with no items
 * adds no stage.
 */
const introductionStage = (
  pedigree: Fields,
  introScreen: unknown,
  id: string,
): Fields | undefined => {
  const items = asRecord(introScreen).items;
  if (!Array.isArray(items)) return undefined;
  const shown = items.filter((item) => !isEmptyText(item));
  if (shown.length === 0) return undefined;
  const label =
    typeof pedigree.label === 'string' && pedigree.label.trim() !== ''
      ? pedigree.label
      : DEFAULT_PEDIGREE_LABEL;
  return withoutUndefined({
    id,
    type: 'Information',
    label: `${label} (introduction)`,
    title: label,
    items: structuredClone(shown),
    skipLogic:
      pedigree.skipLogic === undefined
        ? undefined
        : structuredClone(pedigree.skipLogic),
  });
};

/**
 * A stage still in the schema 8 shape. One that already has the schema 9 keys
 * is left alone, which keeps the conversion from running twice on a stage.
 */
const isSchema8FamilyPedigree = (stage: unknown): stage is Fields =>
  isRecord(stage) &&
  stage.type === 'FamilyPedigree' &&
  isRecord(stage.nodeConfig);

const convertFamilyPedigreeStage = (
  stage: Fields,
  codebook: unknown,
  relativesNotRecordedByType: Map<string, string>,
): Fields => {
  const {
    nodeConfig,
    edgeConfig,
    framing,
    boundaries,
    introScreen: _introScreen,
    censusPrompt,
    nominationPrompts,
    ...base
  } = stage;
  const node = asRecord(nodeConfig);
  const edge = asRecord(edgeConfig);

  adoptCanonicalOptions(
    variablesOf(codebook, 'node', node.type)?.[
      String(node.biologicalSexVariable)
    ],
    PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
  );
  adoptCanonicalOptions(
    variablesOf(codebook, 'edge', edge.type)?.[
      String(edge.relationshipTypeVariable)
    ],
    PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  );

  return withoutUndefined({
    ...base,
    subject: withoutUndefined({ entity: 'node', type: node.type }),
    prompt: censusPrompt,
    nodeConfiguration: withoutUndefined({
      nameAttribute: node.nodeLabelVariable,
      sexAssignedAtBirthAttribute: node.biologicalSexVariable,
      egoAttribute: node.egoVariable,
    }),
    edgeConfiguration: withoutUndefined({
      type: edge.type,
      kindAttribute: edge.relationshipTypeVariable,
      gestationalCarrierAttribute: edge.isGestationalCarrierVariable,
      currentPartnerAttribute: edge.isActiveVariable,
    }),
    framing: convertFraming(framing),
    completeness: convertBoundaries(boundaries, () =>
      relativesNotRecordedAttribute(
        codebook,
        node.type,
        relativesNotRecordedByType,
      ),
    ),
    form: convertForm(node.form),
    nominationPrompts: convertNominationPrompts(nominationPrompts),
  });
};

const retargetSkipDestination = (
  stage: unknown,
  retargets: ReadonlyMap<string, string>,
) => {
  const destination = asRecord(asRecord(asRecord(stage).skipLogic).destination);
  if (destination.type !== 'stage' || typeof destination.stageId !== 'string') {
    return;
  }
  const retarget = retargets.get(destination.stageId);
  if (retarget !== undefined) destination.stageId = retarget;
};

/**
 * Converts every schema 8 Family Pedigree stage in place, inserting the
 * Information stage that carries its introduction screen, if it had one.
 *
 * A skip that jumped to the pedigree used to land on its introduction screen,
 * so it now jumps to the new Information stage instead.
 */
export const migrateFamilyPedigreeStages = (protocol: Fields) => {
  if (!Array.isArray(protocol.stages)) return;
  const { codebook } = protocol;
  const stageIds = new Set(
    protocol.stages.flatMap((stage) =>
      isRecord(stage) && typeof stage.id === 'string' ? [stage.id] : [],
    ),
  );
  const relativesNotRecordedByType = new Map<string, string>();
  const retargets = new Map<string, string>();

  const stages: unknown[] = [];
  for (const stage of protocol.stages) {
    if (!isSchema8FamilyPedigree(stage)) {
      stages.push(stage);
      continue;
    }
    const pedigreeId =
      typeof stage.id === 'string' && stage.id !== ''
        ? stage.id
        : 'family-pedigree';
    const introduction = introductionStage(
      stage,
      stage.introScreen,
      freshId(`${pedigreeId}-introduction`, stageIds),
    );
    if (introduction && typeof introduction.id === 'string') {
      stageIds.add(introduction.id);
      if (typeof stage.id === 'string') {
        retargets.set(stage.id, introduction.id);
      }
      stages.push(introduction);
    }
    stages.push(
      convertFamilyPedigreeStage(stage, codebook, relativesNotRecordedByType),
    );
  }

  for (const stage of stages) retargetSkipDestination(stage, retargets);
  protocol.stages = stages;
};

/**
 * Schema 9 names the attribute a disease row reads `attribute`, as every other
 * pedigree binding does. Each row keeps its other keys, and the stage keeps
 * its `sourceStageId`, which still names the converted pedigree.
 */
export const migrateNarrativePedigreeStages = (protocol: Fields) => {
  if (!Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'NarrativePedigree') continue;
    if (!Array.isArray(stage.diseases)) continue;
    stage.diseases = stage.diseases.map((disease: unknown) =>
      isRecord(disease) &&
      Object.hasOwn(disease, 'variable') &&
      !Object.hasOwn(disease, 'attribute')
        ? Object.fromEntries(
            Object.entries(disease).map(([key, value]) => [
              key === 'variable' ? 'attribute' : key,
              value,
            ]),
          )
        : disease,
    );
  }
};
