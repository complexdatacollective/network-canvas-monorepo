import {
  CodebookNameSchema,
  entitySecureAttributesMeta,
  normalizeCodebookName,
} from '@codaco/shared-consts';

import { isBlankMessage, isBlankText } from '../../localization/blankText.ts';
import { DYNAMIC_VALUE_MARKER } from '../../localization/dynamicValueMessages.ts';
import type { LocalizationDeclaration } from '../../localization/localeTag.ts';
import { escapeMarkdownText } from '../../localization/markdownText.ts';
import {
  escapeMessageText,
  messageText,
} from '../../localization/messageSyntax.ts';
import { createMigration } from '../../migration/index.ts';
import type { SessionDocument } from '../../migration/session.ts';
import { collectEntityAttributeReferences } from '../../utils/collectEntityAttributeReferences.ts';
import {
  collectLocalizedStringSites,
  type LocalizedStringSite,
} from '../../utils/collectLocalizedStrings.ts';
import {
  migrateFamilyPedigreeStages,
  migrateNarrativePedigreeStages,
} from './family-pedigree-migration.ts';
import {
  migrateFamilyPedigreeSessionRecords,
  resumeUnstartedPedigreeAtIntroduction,
} from './family-pedigree-session-migration.ts';
import { TypeLevelOperators } from './filters/filter.ts';
import { createDefaultFinishSessionStage } from './finish-session-defaults.ts';
import { withInterfaceText } from './interface-text.ts';
import { ProtocolLocalizationSchema } from './localized-string.ts';
import ProtocolSchemaV9 from './schema.ts';
import { freshStageId } from './stage-ids.ts';
import { missingSuppliedStageText } from './supplied-stage-text.ts';
import { findValidationContradictions } from './variables/validation-contradictions.ts';
import { optionValueKey } from './variables/variable.ts';

// Schema 8 never recorded the language its copy was written in, and a schema 9
// protocol always has a real one, so migrated copy is recorded as English. The
// researcher can change it to the language it is really written in.
const DEFAULT_LOCALE = 'en';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The languages the migrated protocol declares. A document already written in
 * schema 9 form keeps its own: Fresco's deploy normalization re-runs this
 * migration over rows stored at schema 9, and declaring them English would
 * leave their text in languages the protocol no longer declares.
 */
const localizationOf = (doc: Record<string, unknown>) => {
  const declared = ProtocolLocalizationSchema.safeParse(doc.localization);
  return declared.success
    ? declared.data
    : { defaultLocale: DEFAULT_LOCALE, locales: [DEFAULT_LOCALE] };
};

// Under schema 8 the runtime encrypted an attribute marked `encrypted` only
// while `experiments.encryptedVariables` was on; otherwise it stored the
// plaintext. Schema 9 always encrypts, so a protocol migrated with the
// experiment off loses the mark, and an interview already under way goes on
// storing its answers as plaintext, as it did before.
const removeEncryptedMarks = (codebook: unknown) => {
  if (!isRecord(codebook) || !isRecord(codebook.node)) return;
  for (const type of Object.values(codebook.node)) {
    if (!isRecord(type) || !isRecord(type.variables)) continue;
    for (const variable of Object.values(type.variables)) {
      if (isRecord(variable)) Reflect.deleteProperty(variable, 'encrypted');
    }
  }
};

// Whether schema 8 encrypted the attributes marked `encrypted`. The schema 8
// alpha named the flag `encryptNames`, and its runtime encrypted those
// attributes while it was on, so a protocol from then is read by that name
// when it does not set `encryptedVariables` itself, as Fresco reads the
// experiments it stored.
const encryptionWasOn = (experiments: unknown) => {
  if (!isRecord(experiments)) return false;
  return typeof experiments.encryptedVariables === 'boolean'
    ? experiments.encryptedVariables
    : experiments.encryptNames === true;
};

// Schema 9 keeps `experiments` for features released within it, but
// encrypted attributes, under either name, are no longer one of them.
const withoutEncryptedVariables = (experiments: unknown) => {
  if (!isRecord(experiments)) return experiments;
  const {
    encryptedVariables: _released,
    encryptNames: _releasedAlpha,
    ...remaining
  } = experiments;
  return remaining;
};

// Schema 9 refuses an Anonymisation stage whose minimum passphrase length is
// above its maximum: no passphrase meets both, so a participant could never
// choose one. Both lengths go, as the 7 to 8 migration does with an inverted
// codebook pair, and the interview's default minimum applies instead.
const removeContradictoryPassphraseRules = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'Anonymisation') continue;
    const { validation } = stage;
    if (!isRecord(validation)) continue;
    const { minLength, maxLength } = validation;
    if (
      typeof minLength === 'number' &&
      typeof maxLength === 'number' &&
      minLength > maxLength
    ) {
      Reflect.deleteProperty(stage, 'validation');
    }
  }
};

/** Every attribute record in a codebook: each node type's, each edge type's and the ego's. */
const variableRecordsOf = (codebook: unknown): Record<string, unknown>[] => {
  if (!isRecord(codebook)) return [];
  const records: Record<string, unknown>[] = [];
  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (!isRecord(types)) continue;
    for (const type of Object.values(types)) {
      if (isRecord(type) && isRecord(type.variables)) {
        records.push(type.variables);
      }
    }
  }
  if (isRecord(codebook.ego) && isRecord(codebook.ego.variables)) {
    records.push(codebook.ego.variables);
  }
  return records;
};

/**
 * Removes the validation rules that contradict each other once an attribute
 * has lost options, as the 7 to 8 migration does for every attribute. Only a
 * contradiction involving an attribute this step changed is repaired: any
 * other was already in the document, and validation reports it.
 *
 * Needed because the analyser counts `1` and `"1"` as two values where schema
 * 9 counts one, so a `minSelected` the 7 to 8 migration kept can exceed the
 * options left. Each pass removes at least one rule, so the passes are
 * bounded by the number of rules.
 */
const removeContradictionsOf = (
  variables: Record<string, unknown>,
  changed: ReadonlySet<string>,
) => {
  const ruleCount = Object.values(variables).reduce<number>(
    (count, variable) =>
      isRecord(variable) && isRecord(variable.validation)
        ? count + Object.keys(variable.validation).length
        : count,
    0,
  );
  for (let pass = 0; pass <= ruleCount; pass += 1) {
    const contradiction = findValidationContradictions(variables).find(
      ({ variableIds }) => variableIds.some((id) => changed.has(id)),
    );
    if (!contradiction) return;
    for (const { variableId, rule } of contradiction.strips) {
      const variable = variables[variableId];
      if (isRecord(variable) && isRecord(variable.validation)) {
        Reflect.deleteProperty(variable.validation, rule);
      }
    }
  }
};

/**
 * Schema 9 refuses two options of one ordinal or categorical attribute with
 * the same value: they store the same answer, so a participant's choice
 * between them cannot be recovered, and their export columns collide. Each
 * later option whose value repeats an earlier one goes, compared as schema 9
 * compares them (`optionValueKey`), so `1` and `"1"` collide. Where the two
 * are exactly equal, answers already recorded, and filters and skip logic
 * that name the value, still refer to the option kept; where they differ in
 * type, `remapMergedOptionValues` and the session step rewrite them to it.
 */
const removeDuplicateOptionValues = (codebook: unknown) => {
  for (const variables of variableRecordsOf(codebook)) {
    const changed = new Set<string>();
    for (const [id, variable] of Object.entries(variables)) {
      if (!isRecord(variable) || !Array.isArray(variable.options)) continue;
      if (variable.type !== 'categorical' && variable.type !== 'ordinal') {
        continue;
      }
      const rewrites = optionValueRewrites(variable.options);
      for (const option of variable.options) {
        if (!isRecord(option)) continue;
        const { value } = option;
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        const rewritten = rewrites.get(value);
        if (rewritten !== undefined) option.value = rewritten;
      }
      const seen = new Set<string>();
      const options = variable.options.filter((option: unknown) => {
        const value = isRecord(option) ? option.value : undefined;
        // Any other value is already invalid, and is left for validation.
        if (typeof value !== 'string' && typeof value !== 'number') return true;
        const key = optionValueKey(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (options.length === variable.options.length) continue;
      variable.options = options;
      changed.add(id);
    }
    if (changed.size > 0) removeContradictionsOf(variables, changed);
  }
};

type OptionValue = string | number;

// Unicode category Cc, and the two noncharacters XML 1.0 cannot carry: what
// `CodebookNameSchema` refuses inside a name.
const UNNAMEABLE_CHARACTERS = /[\p{Cc}\uFFFE\uFFFF]/gu;

/**
 * A schema 8 option value as a schema 9 name. Schema 8 accepted any text, and
 * Architect saved values as typed, so a value can carry the spaces around it,
 * a decomposed spelling, or a pasted tab or line break. Each is repaired the
 * way Architect now writes a name as it is typed: control characters become
 * spaces, then the text is made NFC and trimmed. Undefined when nothing is
 * left to name the option by.
 */
const optionValueAsName = (value: string): string | undefined => {
  const name = normalizeCodebookName(
    value.toWellFormed().replace(UNNAMEABLE_CHARACTERS, ' '),
  );
  return CodebookNameSchema.safeParse(name).success ? name : undefined;
};

/** A name no other option of the attribute uses, from `base`. */
const unusedOptionName = (base: string, used: ReadonlySet<string>) => {
  if (!used.has(optionValueKey(base))) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!used.has(optionValueKey(candidate))) return candidate;
  }
};

/**
 * Each schema 8 option value schema 9 replaces, mapped to its replacement:
 * a value that is not a valid name becomes one (`optionValueAsName`), and a
 * value that then repeats an earlier option's, compared as schema 9 compares
 * them (`optionValueKey`), becomes that option's value, so the two merge.
 * Options `1` then `"1"` map `"1"` to `1`, and `"Yes "` maps to `"Yes"`. A
 * value with nothing left to name it by takes the option's label, or "Option"
 * and its position, numbered if another option already uses it.
 */
const optionValueRewrites = (
  options: readonly unknown[],
): Map<OptionValue, OptionValue> => {
  const values = options.map((option) =>
    isRecord(option) ? option.value : undefined,
  );
  const named = values.map((value) =>
    typeof value === 'string' ? optionValueAsName(value) : value,
  );
  // Every name an option already has, so a name given to an option that had
  // none never takes another option's.
  const used = new Set(
    named.flatMap((name) =>
      typeof name === 'string' || typeof name === 'number'
        ? [optionValueKey(name)]
        : [],
    ),
  );
  const first = new Map<string, OptionValue>();
  const rewrites = new Map<OptionValue, OptionValue>();
  values.forEach((value, index) => {
    if (typeof value !== 'string' && typeof value !== 'number') return;
    // A value repeated exactly is one value, already rewritten.
    if (rewrites.has(value)) return;
    const given = named[index];
    let name: OptionValue;
    if (typeof given === 'string' || typeof given === 'number') {
      name = given;
    } else {
      const option = options[index];
      // A schema 8 label is text; a document already in schema 9 form has
      // its label localized, and its first translation names it.
      const labelText = isRecord(option)
        ? typeof option.label === 'string'
          ? option.label
          : isRecord(option.label)
            ? Object.values(option.label).find(
                (text): text is string => typeof text === 'string',
              )
            : undefined
        : undefined;
      const label =
        labelText === undefined ? undefined : optionValueAsName(labelText);
      name = unusedOptionName(label ?? `Option ${index + 1}`, used);
      used.add(optionValueKey(name));
    }
    const key = optionValueKey(name);
    const kept = first.get(key) ?? name;
    if (!first.has(key)) first.set(key, name);
    if (kept !== value) rewrites.set(value, kept);
  });
  return rewrites;
};

/**
 * An attribute whose option values `removeDuplicateOptionValues` rewrites,
 * each mapped to the value it becomes (`optionValueRewrites`): one that was
 * not a valid name, or that merges into an earlier option across types.
 * Answers and rules compare option values exactly, so either still holding
 * the old value would name no option.
 */
type MergedOptionValues = {
  entity: 'node' | 'edge' | 'ego';
  type: string | undefined;
  attribute: string;
  kept: ReadonlyMap<OptionValue, OptionValue>;
};

const mergedOptionValuesOf = (codebook: unknown): MergedOptionValues[] => {
  const merged: MergedOptionValues[] = [];
  const visit = (
    entity: MergedOptionValues['entity'],
    type: string | undefined,
    variables: unknown,
  ) => {
    if (!isRecord(variables)) return;
    for (const [attribute, variable] of Object.entries(variables)) {
      if (!isRecord(variable) || !Array.isArray(variable.options)) continue;
      if (variable.type !== 'categorical' && variable.type !== 'ordinal') {
        continue;
      }
      const kept = optionValueRewrites(variable.options);
      if (kept.size > 0) merged.push({ entity, type, attribute, kept });
    }
  };
  if (!isRecord(codebook)) return merged;
  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (!isRecord(types)) continue;
    for (const [type, definition] of Object.entries(types)) {
      if (isRecord(definition)) visit(entity, type, definition.variables);
    }
  }
  if (isRecord(codebook.ego)) visit('ego', undefined, codebook.ego.variables);
  return merged;
};

/**
 * An answer or rule value with each removed value replaced by the value
 * kept. A categorical answer that held both keeps the value once.
 */
const withKeptValues = (
  value: unknown,
  kept: ReadonlyMap<OptionValue, OptionValue>,
): unknown => {
  const keptValue = (item: unknown) =>
    typeof item === 'string' || typeof item === 'number'
      ? (kept.get(item) ?? item)
      : item;
  return Array.isArray(value)
    ? [...new Set(value.map(keptValue))]
    : keptValue(value);
};

/**
 * Rewrites the value of every filter and skip logic rule, wherever a stage
 * holds one, that names a removed option value to the value kept.
 */
const remapMergedOptionValues = (
  protocol: unknown,
  merged: readonly MergedOptionValues[],
) => {
  if (merged.length === 0 || !isRecord(protocol)) return;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const { type: entity, options } = value;
    if (isRecord(options) && typeof options.attribute === 'string') {
      const attribute = merged.find(
        (candidate) =>
          candidate.entity === entity &&
          candidate.attribute === options.attribute &&
          (entity === 'ego' || candidate.type === options.type),
      );
      if (attribute && 'value' in options) {
        options.value = withKeptValues(options.value, attribute.kept);
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(protocol.stages);
  remapShapeMappings(protocol.codebook, merged);
};

/**
 * Rewrites each discrete node shape mapping on a merged attribute to the value
 * kept. An entry that then repeats an earlier one goes, as the later option
 * does, so the shape the first option had is the one the merged option keeps.
 */
const remapShapeMappings = (
  codebook: unknown,
  merged: readonly MergedOptionValues[],
) => {
  if (!isRecord(codebook) || !isRecord(codebook.node)) return;
  for (const [type, definition] of Object.entries(codebook.node)) {
    if (!isRecord(definition) || !isRecord(definition.shape)) continue;
    const mapping = definition.shape.dynamic;
    if (!isRecord(mapping) || mapping.type !== 'discrete') continue;
    if (!Array.isArray(mapping.map)) continue;
    const attribute = merged.find(
      (candidate) =>
        candidate.entity === 'node' &&
        candidate.type === type &&
        candidate.attribute === mapping.variable,
    );
    if (!attribute) continue;
    const seen = new Set<unknown>();
    mapping.map = mapping.map.flatMap((entry: unknown) => {
      if (!isRecord(entry)) return [entry];
      const value = withKeptValues(entry.value, attribute.kept);
      if (seen.has(value)) return [];
      seen.add(value);
      return [{ ...entry, value }];
    });
  }
};

/**
 * Rewrites a session's answers that hold a removed option value to the
 * value kept, reading which values were merged from the schema 8 codebook.
 */
const remapMergedOptionAnswers = (
  network: SessionDocument['network'],
  schema8Protocol: unknown,
) => {
  const merged = mergedOptionValuesOf(
    isRecord(schema8Protocol) ? schema8Protocol.codebook : undefined,
  );
  for (const { entity, type, attribute, kept } of merged) {
    const entities =
      entity === 'ego'
        ? [network.ego]
        : network[entity === 'node' ? 'nodes' : 'edges'].filter(
            (candidate) => candidate.type === type,
          );
    for (const candidate of entities) {
      const { attributes } = candidate;
      if (!isRecord(attributes) || !Object.hasOwn(attributes, attribute))
        continue;
      // An encrypted answer holds ciphertext, not option values: rewriting
      // it would corrupt the protected answer, so it is left as stored.
      const secure: unknown = candidate[entitySecureAttributesMeta];
      if (isRecord(secure) && Object.hasOwn(secure, attribute)) continue;
      attributes[attribute] = withKeptValues(attributes[attribute], kept);
    }
  }
};

/**
 * Text that shows nothing in any language: a schema 8 string, or the
 * translations of text already localized. Blank translations are removed
 * from localized text, so the text left says something in every language it
 * has, or is `undefined` when nothing is left.
 */
const withoutBlankText = (text: unknown): unknown => {
  if (typeof text === 'string') return isBlankText(text) ? undefined : text;
  if (!isRecord(text)) return text;
  const kept = Object.entries(text).filter(
    ([, message]) => typeof message !== 'string' || !isBlankMessage(message),
  );
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
};

/** Text that says something, as a schema 8 string or a localized record. */
const shownText = (text: unknown) => {
  const shown = withoutBlankText(text);
  return typeof shown === 'string' || isRecord(shown) ? shown : undefined;
};

// The title a panel whose title shows nothing is given: the stage's label,
// as the 7 to 8 migration gives a panel with no title, else "Introduction".
const fallbackPanelTitle = (label: unknown, defaultLocale: string): unknown =>
  shownText(label) ?? { [defaultLocale]: 'Introduction' };

/** The ids the stages already use, which a stage the migration adds must not. */
const takenStageIds = (stages: unknown): Set<string> =>
  new Set(
    Array.isArray(stages)
      ? stages.flatMap((stage) =>
          isRecord(stage) && typeof stage.id === 'string' ? [stage.id] : [],
        )
      : [],
  );

/**
 * Schema 9 has one way to give a participant instructions: an Information
 * stage. The introduction panel that opened an Ego Form, Alter Form, Alter
 * Edge Form, Dyad Census or Tie-Strength Census becomes an Information stage
 * just before it, titled and named with the panel's title (the stages menu
 * shows participants the name) and showing its text. It takes the stage's
 * own skip logic, so the two still appear or are skipped together. A skip
 * that jumped to the stage now jumps to its introduction, so the participant
 * still reads it first.
 *
 * An Ego Form showed its panel as the heading above its questions rather
 * than as a screen of its own, so the panel's title becomes the form's
 * title, which schema 9 shows there instead. Its text, if it has any, still
 * becomes an Information stage before the form.
 *
 * Schema 8 accepted a panel whose title or text was only spaces, and
 * published protocols use a body of spaces on purpose to show a panel with
 * only a title. Text that shows nothing is left out, and a title that shows
 * nothing takes the stage's label, as the 7 to 8 migration does for a panel
 * with no title. Text a document in schema 9 form already localized loses
 * only the translations that show nothing, which then fall back to another.
 */
const moveIntroductionPanelsToInformationStages = (
  protocol: unknown,
  { defaultLocale }: LocalizationDeclaration,
) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  const taken = takenStageIds(protocol.stages);
  const retargets = new Map<string, string>();
  const stages: unknown[] = [];
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || !isRecord(stage.introductionPanel)) {
      stages.push(stage);
      continue;
    }
    const { introductionPanel: panel, ...rest } = stage;
    const title =
      withoutBlankText(panel.title) ??
      fallbackPanelTitle(stage.label, defaultLocale);
    const text = withoutBlankText(panel.text);
    const isEgoForm = stage.type === 'EgoForm';
    if (isEgoForm && isRecord(rest.form)) {
      rest.form = { title: structuredClone(title), ...rest.form };
    }
    if (!isEgoForm || text !== undefined) {
      const id = freshStageId(
        typeof stage.id === 'string' ? stage.id : 'stage',
        '-introduction',
        taken,
      );
      taken.add(id);
      if (typeof stage.id === 'string') retargets.set(stage.id, id);
      stages.push({
        id,
        type: 'Information',
        label: structuredClone(title),
        title,
        items:
          text === undefined
            ? []
            : [{ id: 'introduction-text', type: 'text', content: text }],
        ...(stage.skipLogic !== undefined && {
          skipLogic: structuredClone(stage.skipLogic),
        }),
      });
    }
    stages.push(rest);
  }

  for (const stage of stages) {
    if (!isRecord(stage) || !isRecord(stage.skipLogic)) continue;
    const { destination } = stage.skipLogic;
    if (!isRecord(destination) || typeof destination.stageId !== 'string') {
      continue;
    }
    const retarget = retargets.get(destination.stageId);
    if (retarget !== undefined) destination.stageId = retarget;
  }
  protocol.stages = stages;
};

/**
 * Schema 8 accepted an Information stage whose title was only spaces, which
 * showed a stage with no heading. Schema 9 requires the title to say
 * something, so a title that shows nothing takes the stage's label, as an
 * introduction panel's does; a label is required to say something already.
 * Text already localized loses only its translations that show nothing, which
 * then fall back to another.
 */
const repairInformationTitles = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'Information') continue;
    stage.title = withoutBlankText(stage.title) ?? stage.label;
  }
};

/**
 * Schema 9 requires a Categorical Bin's "other" bin caption and its follow-up
 * question to say something, where schema 8 accepted text of only spaces,
 * which showed an unlabelled bin and a question with no words. Each that shows
 * nothing takes the other's text, else the default the 7 to 8 migration gives
 * when one is missing: "Other" for the caption, "Please specify" for the
 * question. Text already localized loses only its translations that show
 * nothing, as an introduction panel's does.
 */
const repairOtherBinText = (
  protocol: unknown,
  { defaultLocale }: LocalizationDeclaration,
) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'CategoricalBin') continue;
    if (!Array.isArray(stage.prompts)) continue;
    for (const prompt of stage.prompts) {
      if (!isRecord(prompt) || typeof prompt.otherVariable !== 'string') {
        continue;
      }
      if (prompt.otherVariable === '') continue;
      const question = shownText(prompt.otherVariablePrompt);
      const caption = shownText(prompt.otherOptionLabel);
      // Copied, so the two fields never share one object.
      prompt.otherVariablePrompt = structuredClone(
        question ?? caption ?? { [defaultLocale]: 'Please specify' },
      );
      prompt.otherOptionLabel = structuredClone(
        caption ?? question ?? { [defaultLocale]: 'Other' },
      );
    }
  }
};

/**
 * A Tie-Strength Census prompt's decline label must say something in schema 9,
 * where schema 8 accepted text of only spaces, which showed the participant an
 * unnamed decline option. One that shows nothing takes the default the 7 to 8
 * migration gives a missing one, "No relationship". Text already localized
 * loses only its translations that show nothing, as an introduction panel's
 * does.
 */
const repairTieStrengthDeclineLabels = (
  protocol: unknown,
  { defaultLocale }: LocalizationDeclaration,
) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'TieStrengthCensus') continue;
    if (!Array.isArray(stage.prompts)) continue;
    for (const prompt of stage.prompts) {
      if (!isRecord(prompt)) continue;
      prompt.negativeLabel = shownText(prompt.negativeLabel) ?? {
        [defaultLocale]: 'No relationship',
      };
    }
  }
};

const nameOrKey = (definition: unknown, key: string) => {
  const name = isRecord(definition) ? definition.name : undefined;
  return typeof name === 'string' && !isBlankText(name) ? name : key;
};

/**
 * Schema 8 had no label for an entity type or attribute, so its label starts
 * as its name. The codebook key stands in for a missing or empty name,
 * because a label may not be empty.
 */
const addLabels = (definitions: unknown) => {
  if (!isRecord(definitions)) return;
  for (const [key, definition] of Object.entries(definitions)) {
    if (!isRecord(definition)) continue;
    if (definition.label === undefined) {
      definition.label = nameOrKey(definition, key);
    }
  }
};

const addCodebookLabels = (codebook: unknown) => {
  if (!isRecord(codebook)) return;
  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    addLabels(types);
    if (!isRecord(types)) continue;
    for (const type of Object.values(types)) {
      if (isRecord(type)) addLabels(type.variables);
    }
  }
  if (isRecord(codebook.ego)) addLabels(codebook.ego.variables);
};

/** The attribute definitions of the entity type a stage subject names. */
const subjectVariables = (
  codebook: unknown,
  entity: 'node' | 'edge',
  subject: unknown,
): Record<string, unknown> => {
  const types =
    isRecord(codebook) && isRecord(codebook[entity]) ? codebook[entity] : {};
  const type = isRecord(subject) ? subject.type : undefined;
  const definition = typeof type === 'string' ? types[type] : undefined;
  return isRecord(definition) && isRecord(definition.variables)
    ? definition.variables
    : {};
};

// Whether a rule compares the value of an encrypted node attribute. A rule
// that only asks whether the attribute is answered still works on one.
const comparesEncryptedAttribute = (codebook: unknown, rule: unknown) => {
  if (!isRecord(rule) || rule.type !== 'node' || !isRecord(rule.options)) {
    return false;
  }
  const { type, attribute, operator } = rule.options;
  if (typeof type !== 'string' || typeof attribute !== 'string') return false;
  if (TypeLevelOperators.safeParse(operator).success) return false;
  const variables = subjectVariables(codebook, 'node', { type });
  const variable = variables[attribute];
  return isRecord(variable) && variable.encrypted === true;
};

// Removes a filter's rules that compare an encrypted attribute, and says
// whether that left it with none. A filter that already had no rules is not
// this step's to remove.
const emptiedOfEncryptedComparisons = (codebook: unknown, filter: unknown) => {
  if (!isRecord(filter) || !Array.isArray(filter.rules)) return false;
  const rules = filter.rules.filter(
    (rule: unknown) => !comparesEncryptedAttribute(codebook, rule),
  );
  if (rules.length === filter.rules.length) return false;
  filter.rules = rules;
  return rules.length === 0;
};

// Schema 9 refuses a rule that compares an encrypted attribute's value: rules
// are checked without the participant's passphrase, so under schema 8 such a
// rule only ever compared the ciphertext. A filter this leaves with no rules
// goes, and so does skip logic left with none. An external-data panel reads
// the researcher's own unencrypted rows, so its rules stay.
const removeEncryptedAttributeComparisons = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  const { codebook } = protocol;
  for (const stage of protocol.stages) {
    if (!isRecord(stage)) continue;
    if (emptiedOfEncryptedComparisons(codebook, stage.filter)) {
      Reflect.deleteProperty(stage, 'filter');
    }
    if (
      isRecord(stage.skipLogic) &&
      emptiedOfEncryptedComparisons(codebook, stage.skipLogic.filter)
    ) {
      Reflect.deleteProperty(stage, 'skipLogic');
    }
    if (!Array.isArray(stage.panels)) continue;
    for (const panel of stage.panels) {
      if (!isRecord(panel) || panel.dataSource !== 'existing') continue;
      if (emptiedOfEncryptedComparisons(codebook, panel.filter)) {
        Reflect.deleteProperty(panel, 'filter');
      }
    }
  }
};

/**
 * A schema 8 Narrative legend showed each highlighted attribute's name, so
 * each highlight keeps that name as its label. The attribute is looked up on
 * the stage subject's node type, and its id stands in for a missing or empty
 * name.
 */
const addHighlightLabels = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  const { codebook } = protocol;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'Narrative') continue;
    if (!Array.isArray(stage.presets)) continue;
    const variables = subjectVariables(codebook, 'node', stage.subject);
    for (const preset of stage.presets) {
      if (!isRecord(preset) || !Array.isArray(preset.highlight)) continue;
      preset.highlight = preset.highlight.map((variable: unknown) =>
        typeof variable === 'string'
          ? { variable, label: nameOrKey(variables[variable], variable) }
          : variable,
      );
    }
  }
};

const addFieldCaptions = (
  form: unknown,
  variables: Record<string, unknown>,
) => {
  if (!isRecord(form) || !Array.isArray(form.fields)) return;
  for (const field of form.fields) {
    if (!isRecord(field) || typeof field.variable !== 'string') continue;
    if (
      field.label !== undefined &&
      !(typeof field.label === 'string' && isBlankText(field.label))
    ) {
      continue;
    }
    field.label = escapeMarkdownText(
      nameOrKey(variables[field.variable], field.variable),
    );
  }
};

/**
 * A schema 8 Network Composer field with no caption, or an empty or blank one,
 * was captioned with its attribute's name, so the field keeps that name as its
 * caption, which schema 9 requires. The caption is markdown, so the name is
 * escaped to render as written. The attribute is looked up on the stage
 * subject's node type for the node form and on each edge type for its form,
 * and its id stands in for a missing or empty name.
 */
const addComposerCaptions = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  const { codebook } = protocol;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'NetworkComposer') continue;
    addFieldCaptions(
      stage.nodeForm,
      subjectVariables(codebook, 'node', stage.subject),
    );
    if (!Array.isArray(stage.edges)) continue;
    for (const edge of stage.edges) {
      if (!isRecord(edge)) continue;
      addFieldCaptions(
        edge.form,
        subjectVariables(codebook, 'edge', edge.subject),
      );
    }
  }
};

/**
 * Plain text as the markdown that shows it as written: a schema 8 string, or
 * each translation of text already localized.
 */
const asMarkdownText = (text: string | Record<string, unknown>): unknown => {
  if (typeof text === 'string') return escapeMarkdownText(text);
  return Object.fromEntries(
    Object.entries(text).map(([locale, message]) => [
      locale,
      typeof message === 'string'
        ? escapeMessageText(escapeMarkdownText(messageText(message)))
        : message,
    ]),
  );
};

/**
 * Schema 9 requires a Narrative preset's label, and the label of each
 * attribute it highlights, to say something, where schema 8 accepted a preset
 * label of only spaces, which showed a preset with no name. A preset label
 * that shows nothing takes the default the 7 to 8 migration gives a missing
 * one, "Preset" and its position; a highlight label, the attribute's name, as
 * `addHighlightLabels` gives one. Text already localized loses only its
 * translations that show nothing, which then fall back to another.
 */
const repairNarrativeLabels = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  const { codebook } = protocol;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'Narrative') continue;
    if (!Array.isArray(stage.presets)) continue;
    const variables = subjectVariables(codebook, 'node', stage.subject);
    stage.presets.forEach((preset: unknown, index: number) => {
      if (!isRecord(preset)) return;
      preset.label = shownText(preset.label) ?? `Preset ${index + 1}`;
      if (!Array.isArray(preset.highlight)) return;
      for (const highlight of preset.highlight) {
        if (!isRecord(highlight) || typeof highlight.variable !== 'string') {
          continue;
        }
        highlight.label =
          shownText(highlight.label) ??
          nameOrKey(variables[highlight.variable], highlight.variable);
      }
    });
  }
};

/**
 * Schema 9 requires the title of a Name Generator's form to say something,
 * where schema 8 accepted a title of only spaces, which showed a form with no
 * heading. One that shows nothing takes the default the 7 to 8 migration
 * gives a missing one: "Add" and the name of the stage's node type, or "Add"
 * alone. Text already localized loses only its translations that show
 * nothing, which then fall back to another.
 */
const repairFormTitles = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  const { codebook } = protocol;
  const types = isRecord(codebook) ? codebook.node : undefined;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'NameGenerator') continue;
    if (!isRecord(stage.form)) continue;
    const subjectType = isRecord(stage.subject) ? stage.subject.type : '';
    const definition =
      isRecord(types) && typeof subjectType === 'string'
        ? types[subjectType]
        : undefined;
    const name = isRecord(definition) ? definition.name : undefined;
    stage.form.title =
      shownText(stage.form.title) ??
      (typeof name === 'string' && !isBlankText(name) ? `Add ${name}` : 'Add');
  }
};

/**
 * Schema 9 requires a Family Pedigree's prompt, and each of its nomination
 * prompts, to say something, where schema 8 accepted text of only spaces,
 * which showed a prompt with no words. A prompt that shows nothing takes the
 * stage's name, and a nomination prompt the name of the attribute it sets,
 * as a form field's question does; both are markdown, so the name is escaped
 * to show as written. Text already localized loses only its translations that
 * show nothing, which then fall back to another.
 */
const repairFamilyPedigreeText = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  const { codebook } = protocol;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'FamilyPedigree') continue;
    // Text that is missing is left for validation to report.
    if (stage.prompt !== undefined) {
      const label = shownText(stage.label);
      stage.prompt =
        shownText(stage.prompt) ??
        (label === undefined ? stage.prompt : asMarkdownText(label));
    }
    if (!Array.isArray(stage.nominationPrompts)) continue;
    const variables = subjectVariables(codebook, 'node', stage.subject);
    for (const question of stage.nominationPrompts) {
      if (!isRecord(question) || typeof question.attribute !== 'string') {
        continue;
      }
      if (question.text === undefined) continue;
      question.text =
        shownText(question.text) ??
        escapeMarkdownText(
          nameOrKey(variables[question.attribute], question.attribute),
        );
    }
  }
};

/**
 * Schema 9 requires the text of an Information stage's text item to say
 * something, where schema 8 accepted text of only spaces, which showed
 * nothing. Such an item is removed, so the stage still shows nothing in its
 * place. Text already localized loses only its translations that show
 * nothing, which then fall back to another.
 */
const repairInformationTextItems = (protocol: unknown) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || stage.type !== 'Information') continue;
    if (!Array.isArray(stage.items)) continue;
    stage.items = stage.items.flatMap((item: unknown) => {
      if (!isRecord(item) || item.type !== 'text') return [item];
      // Content that is missing is left for validation to report.
      if (item.content === undefined) return [item];
      const content = shownText(item.content);
      return content === undefined ? [] : [{ ...item, content }];
    });
  }
};

// The id the appended finish stage takes, unless a schema 8 stage already
// has it. Deterministic, so migrating one document twice gives one result.
const FINISH_STAGE_ID = 'finish';

const finishStageId = (stages: unknown): string =>
  freshStageId(FINISH_STAGE_ID, '', takenStageIds(stages));

/**
 * Schema 8 ended every interview with a built-in screen the runtime added.
 * Schema 9 makes that screen a stage, so every migrated protocol gains one at
 * the end, carrying the text that screen showed, recorded in the protocol's
 * default language.
 */
/**
 * A session the framework left past the last stage, where the interview
 * engine's own finish screen used to be, resumes on the finish stage the
 * migration appended in its place.
 */
const resumeAtAppendedFinishStage = (
  session: { currentStep: number },
  after: unknown,
) => {
  const stages =
    typeof after === 'object' && after !== null && 'stages' in after
      ? after.stages
      : undefined;
  if (!Array.isArray(stages) || stages.length === 0) return;
  session.currentStep = Math.min(session.currentStep, stages.length - 1);
};

/**
 * A document that already ends at its finish stage keeps it: Fresco's deploy
 * normalization re-runs this migration over rows stored at schema 9, and a
 * second finish stage would make every such row invalid.
 */
const endsAtFinishStage = (stages: unknown): boolean => {
  if (!Array.isArray(stages)) return false;
  const last: unknown = stages.at(-1);
  return isRecord(last) && last.type === 'FinishSession';
};

/**
 * The finish stage the migration appends, with the supplied text in each of
 * the protocol's languages that has it: English for a schema 8 document, which
 * is recorded as English, and a schema 9 document's own languages otherwise.
 */
const finishStageFor = (
  stages: unknown,
  localization: LocalizationDeclaration,
) =>
  createDefaultFinishSessionStage({ id: finishStageId(stages), localization });

/**
 * A finish stage written before finish stages had modes, as a document stored
 * at schema 9 during its development can hold one: its heading becomes the
 * first line of its closing text, its finished notice gives way to finished
 * text, and it asks the participant to confirm, as every such stage did.
 */
const normalizeFinishStages = (
  migrated: { stages?: unknown },
  localization: LocalizationDeclaration,
) => {
  if (!Array.isArray(migrated.stages)) return;
  const defaults = createDefaultFinishSessionStage({
    id: FINISH_STAGE_ID,
    localization,
  });
  for (const stage of migrated.stages as unknown[]) {
    if (!isRecord(stage) || stage.type !== 'FinishSession') continue;
    stage.mode ??= 'confirmation';
    if ('title' in stage) {
      const title = isRecord(stage.title) ? stage.title : {};
      const content = isRecord(stage.content) ? { ...stage.content } : {};
      for (const [locale, heading] of Object.entries(title)) {
        if (typeof heading !== 'string' || heading.trim() === '') continue;
        const text = content[locale];
        content[locale] =
          typeof text === 'string' && text.trim() !== ''
            ? `# ${heading}\n\n${text}`
            : `# ${heading}`;
      }
      stage.content = content;
      delete stage.title;
    }
    if ('finishedNotice' in stage) delete stage.finishedNotice;
    stage.finishedContent ??= defaults.finishedContent;
  }
};

type SiteChange =
  | { kind: 'set'; value: unknown }
  | { kind: 'remove' }
  | { kind: 'keep' };

/**
 * Schema 9 reserves `DYNAMIC_VALUE_MARKER` in text that may show dynamic
 * values, as the place the interview puts each value. Schema 8 text could
 * hold it, as a private-use character no font draws, so it is dropped there
 * rather than leaving the text invalid, or an optional text left out.
 */
const holdsMarker = (text: unknown): text is string =>
  typeof text === 'string' && text.includes(DYNAMIC_VALUE_MARKER);

const withoutMarker = (text: unknown) =>
  holdsMarker(text) ? text.replaceAll(DYNAMIC_VALUE_MARKER, '') : text;

const withoutReservedMarker = (site: LocalizedStringSite): unknown => {
  if (site.dynamicValues === undefined) return site.value;
  if (!isRecord(site.value)) return withoutMarker(site.value);
  if (!Object.values(site.value).some(holdsMarker)) return site.value;
  return Object.fromEntries(
    Object.entries(site.value).map(([locale, text]) => [
      locale,
      withoutMarker(text),
    ]),
  );
};

/**
 * A string that shows nothing follows the site's own rule: where the field
 * accepts it, it is kept as data, and where it does not, an optional field is
 * left out. A required field is wrapped regardless, so validation reports what
 * schema 8 already rejected.
 *
 * Schema 8 typed every site as a string except the end labels of a Network
 * Composer scale, whose parameter record accepted any value. The interview
 * only ever rendered string end labels there, so any other value is dropped.
 * A non-string anywhere else was already invalid and is left for validation.
 *
 * Text that is already localized is kept, so a document written in schema 9
 * form comes through with its text in the languages it declares, less any
 * translation of an optional text that shows nothing. A string in
 * such a document is recorded in its default language. Either loses the
 * reserved marker first (see `withoutReservedMarker`).
 */
const localizeSite = (
  original: LocalizedStringSite,
  defaultLocale: string,
): SiteChange => {
  const value = withoutReservedMarker(original);
  // Stripped text must be written back even where it would otherwise be kept.
  const changed = value !== original.value;
  const site = changed ? { ...original, value } : original;
  if (typeof site.value === 'string') {
    const localized = { [defaultLocale]: escapeMessageText(site.value) };
    if (site.schema.safeParse(localized).success || !site.optional) {
      return { kind: 'set', value: localized };
    }
    return { kind: 'remove' };
  }
  // Text already localized, in a document written in schema 9 form. An
  // optional text loses its translations that show nothing, which schema 9
  // rejects, so those languages fall back to another; text left with none is
  // left out, as it would have shown nothing.
  if (site.optional && isRecord(site.value)) {
    const shown = withoutBlankText(site.value);
    if (shown === undefined) return { kind: 'remove' };
    if (isRecord(shown) && site.schema.safeParse(shown).success) {
      return Object.keys(shown).length === Object.keys(site.value).length &&
        !changed
        ? { kind: 'keep' }
        : { kind: 'set', value: shown };
    }
  }
  if (site.schema.safeParse(site.value).success) {
    return changed ? { kind: 'set', value: site.value } : { kind: 'keep' };
  }
  return site.looseContainer && site.optional
    ? { kind: 'remove' }
    : changed
      ? { kind: 'set', value: site.value }
      : { kind: 'keep' };
};

const containerAt = (
  root: unknown,
  path: readonly (string | number)[],
): object => {
  let node = root;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) break;
    node = Reflect.get(node, key);
  }
  if (typeof node !== 'object' || node === null) {
    throw new Error(`No container at ${JSON.stringify(path)}`);
  }
  return node;
};

/** The attribute definitions of the entity a stage subject names. */
const attributesOf = (
  codebook: unknown,
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string },
): Record<string, unknown> => {
  if (subject.entity !== 'ego') {
    return subjectVariables(codebook, subject.entity, subject);
  }
  const ego = isRecord(codebook) ? codebook.ego : undefined;
  return isRecord(ego) && isRecord(ego.variables) ? ego.variables : {};
};

/**
 * A schema 8 form field whose prompt was empty or only spaces was captioned
 * with its attribute's name, so the field keeps that name as its prompt, which
 * schema 9 requires to say something. The prompt is markdown, so the name is
 * escaped to render as written. The attribute is looked up on the entity type
 * the stage's form collects into, and its id stands in for a missing or empty
 * name. Every form field is found through the attribute it names, so each
 * stage type that holds a form is covered without being listed here: only a
 * form field names an attribute it writes with validation and has a prompt.
 */
const addFormFieldPrompts = (protocol: unknown) => {
  if (!isRecord(protocol)) return;
  const { codebook } = protocol;
  for (const hit of collectEntityAttributeReferences(protocol)) {
    if (hit.usage !== 'validatedAttribute' || !hit.subject) continue;
    const field = containerAt(protocol, hit.path.slice(0, -1));
    if (!isRecord(field) || typeof field.prompt !== 'string') continue;
    if (!isBlankText(field.prompt)) continue;
    const variables = attributesOf(codebook, hit.subject);
    field.prompt = escapeMarkdownText(
      nameOrKey(variables[hit.variableId], hit.variableId),
    );
  }
};

/**
 * Stage settings that schema 9 added and requires, whose wording Network
 * Canvas supplies (see `supplied-stage-text.ts`), get it on every stage
 * missing them, in the protocol's languages. A document already written in
 * schema 9 form keeps any it has.
 */
const addSuppliedStageText = (
  protocol: unknown,
  localization: LocalizationDeclaration,
) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || typeof stage.type !== 'string') continue;
    for (const { path, value } of missingSuppliedStageText(
      { ...stage, type: stage.type },
      localization,
    )) {
      let container: Record<string, unknown> = stage;
      for (const key of path.slice(0, -1)) {
        const next = container[key];
        if (!isRecord(next)) container[key] = {};
        container = container[key] as Record<string, unknown>;
      }
      const last = path.at(-1);
      if (last !== undefined) container[last] = value;
    }
  }
};

const migrationV8toV9 = createMigration({
  from: 8,
  to: 9,
  dependencies: {},
  notes: `- Attribute names can now use letters from any language, as well as spaces and punctuation. Existing attribute names are not changed.
- Text that participants see is now recorded as English, because older protocols do not record which language they use. After upgrading, confirm the protocol's default language: if your protocol is written in another language, change it on the Languages page in Architect.
- A form field whose question was empty or contained only spaces now uses the name of its attribute as the question, because every question must contain some text.
- Encrypted attributes are no longer experimental: the Anonymisation interface is always available, and an attribute marked as encrypted is always encrypted. If this protocol marked attributes as encrypted without turning on the experimental "Encrypted Attributes" feature, those attributes are no longer marked, so they keep being collected without encryption.
- If an Anonymisation stage required a minimum passphrase length longer than its maximum, no participant could choose a passphrase, so both lengths are removed and the default minimum length applies.
- Each option of an ordinal or categorical attribute must now have a value of its own, because answers are stored by value and two options with the same value cannot be told apart. Where options shared a value, the first is kept and the later ones are removed. Values are compared as written, except that a number and text that read the same, such as 1 and "1", count as the same value. Answers already recorded, and skip logic and filters, keep the value they use. If removing options leaves an attribute requiring more selections than it has options, that requirement is removed.
- An option's value is now held to the same rules as other names. Spaces at either end of a value are removed, each tab or line break inside it becomes a space, and its characters are stored in one standard Unicode form. An empty value is replaced by the option's label or, when there is none, by "Option" followed by the option's position. Options whose values are then identical are merged as above, and answers already recorded, skip logic, filters and node shapes are updated to the new value.
- Introduction panels are replaced by Information stages, so instructions to participants are written in one place. The introduction panel of a Per Alter Form, Per Alter Edge Form, Dyad Census or Tie-Strength Census stage becomes an Information stage just before it, with the panel's title and text. The new stage is skipped whenever the original stage is skipped, and skip logic that jumped to the original stage now jumps to the new one. An Ego Form's panel showed as the heading above its questions, so the panel's title becomes the title of the form, still shown above the questions; if the panel had text, the text moves to an Information stage just before the Ego Form. Panel text that contained only spaces is left out, and a panel title that contained only spaces now uses the stage's name.
- On a Categorical Bin stage, the label of the bin for answers not listed and the question that asks participants to describe their answer must now contain some text. Where either contained only spaces, it now uses the other's text, or "Other" for the label and "Please specify" for the question.
- On a Tie-Strength Census stage, the label of the option for declining to rate a relationship must now contain some text. Where it contained only spaces, it now reads "No relationship".
- The title of an Information stage must now contain some text. Where it contained only spaces, it now shows the name of the stage.
- Some other text that participants see must now contain some text. Where it contained only spaces, the label of a Narrative preset now reads "Preset" followed by its position, such as "Preset 1"; the title of a Name Generator's form for adding a node now reads "Add" followed by the name of the node type, such as "Add Person", or "Add" alone; a Family Pedigree's prompt now uses the name of the stage, and each of its nomination prompts uses the name of its attribute. A block of text on an Information stage that contained only spaces is removed, as is any hint, label at either end of a scale, or description of an image, audio or video that contained only spaces.
- Skip logic and filters can no longer compare the answers to an encrypted attribute. Rules are checked without the participant's passphrase, so under schema 8 a rule like this only ever compared the encrypted text, never the answer. These rules are removed. Rules that only check whether an encrypted attribute is answered still work, so they are kept. Skip logic left with no rules is removed, so its stage now always appears: a stage that was shown only when a removed rule matched may never have appeared under schema 8. A filter left with no rules is removed, so it no longer limits what its stage or panel shows. Where other rules remain, they may now match differently: if all rules had to match, they now match at least as often as before; if any one rule could match, at most as often. Check the stages that used the removed rules. Rules in a panel that lists people from an external data file are kept, because that data is not encrypted.
- Family Pedigree stages are converted to the redesigned Family Pedigree. If a stage had an introduction screen, the screen becomes an Information stage just before the pedigree, which is skipped whenever the pedigree is skipped.
- The Family Pedigree answers for sex assigned at birth and for the kind of each relationship keep the values already recorded, but their labels change to the wording of the redesigned interface. A nomination prompt with the ID "pedigree", which is now reserved, is given a new ID.
- The old Family Pedigree always required two of the participant's parents. A converted Family Pedigree requires both of the participant's biological parents or, where it required recording grandparents, the family up to the grandparents, which also includes siblings, children, the other biological parent of each of the participant's children, aunts and uncles. Where it recommended recording grandparents, it now recommends recording the family up to the grandparents, so recording both parents becomes a recommendation rather than a requirement, because a stage has only one completeness setting. Only biological parents and gamete donors now count as parents; the old interface also counted adoptive parents and surrogates.
- A new attribute, "relativesNotRecorded", is added for the people in every converted Family Pedigree, to record when a participant says someone has no siblings or no children, or does not know. If the person type already has an attribute with that name, the new attribute's name ends in a number instead, such as "relativesNotRecorded2".
- Two Family Pedigree settings change because the redesigned interface does not use them as they were. Requiring the other biological parent of the participant's children is now part of every completeness setting from parents, siblings and children upwards, and that parent's own family is no longer required. The attribute for which gamete each parent gave is removed, because the interface now works the gamete out from sex assigned at birth; it stays in the codebook with any answers already recorded, but is no longer filled in.
- The old Family Pedigree could write each person's relationship to the participant as English text. The redesigned interface records it in a categorical attribute with fixed values that do not depend on language, which a text attribute cannot hold, so a converted stage records no relationship. To keep recording it, for example to filter later stages to the participant's parents, choose or create a categorical attribute for it in the Family Pedigree stage in Architect. The old attribute stays in the codebook with any answers already recorded, but is no longer filled in.
- The converted Family Pedigree does not ask about gender identity. Where it uses gendered words such as mother or sister, they follow each person's sex assigned at birth.
- Additional person fields on a Family Pedigree that collected the name or sex assigned at birth are removed, because the redesigned interface asks every person for both itself. The old interface never showed a field for the name. Answers already recorded are kept.
- A Family Pedigree cannot be converted if two of its answers use the same attribute: two nomination prompts, a nomination prompt and an additional person field, or the name and another answer. Each now needs an attribute of its own. Give each its own attribute in the version of Architect that made the protocol, then upgrade it.
- The screen that ends the interview is now a Finish Screen stage at the end of your protocol, so you can change its heading and text and translate them like the rest of your protocol. It starts with the text the interview has always shown there.
- A Name Generator Roster stage now has a panel title, shown above the list of people participants choose from, so you can change it and translate it like the rest of your protocol. It starts with the heading the interview has always shown there, "Available to add".
- A Family Pedigree stage's own wording is now part of the stage, so you can change it and translate it like the rest of your protocol: the question asking each person's name and its hint, and, where the family must be complete, the list of what is still needed. It starts with the wording the interview has always shown.`,
  migrate: ({ experiments, ...doc }) => {
    const migrated = structuredClone(doc);
    const localization = localizationOf(migrated);
    if (!encryptionWasOn(experiments)) removeEncryptedMarks(migrated.codebook);
    removeContradictoryPassphraseRules(migrated);
    removeEncryptedAttributeComparisons(migrated);
    // Before the pedigree conversion, which reads the options it keeps.
    remapMergedOptionValues(migrated, mergedOptionValuesOf(migrated.codebook));
    removeDuplicateOptionValues(migrated.codebook);
    // Before the codebook labels and the localization pass, so the attribute
    // and stage the conversion adds are labelled and localized with the rest.
    migrateFamilyPedigreeStages(migrated);
    migrateNarrativePedigreeStages(migrated);
    addCodebookLabels(migrated.codebook);
    addHighlightLabels(migrated);
    addComposerCaptions(migrated);
    addFormFieldPrompts(migrated);
    addSuppliedStageText(migrated, localization);
    moveIntroductionPanelsToInformationStages(migrated, localization);
    repairInformationTitles(migrated);
    repairInformationTextItems(migrated);
    repairNarrativeLabels(migrated);
    repairFormTitles(migrated);
    repairFamilyPedigreeText(migrated);
    repairOtherBinText(migrated, localization);
    repairTieStrengthDeclineLabels(migrated, localization);
    normalizeFinishStages(migrated, localization);

    // Every site is found before any is rewritten, so the walk reads the
    // document as schema 8 left it.
    for (const site of collectLocalizedStringSites(
      ProtocolSchemaV9,
      migrated,
    )) {
      const key = site.path.at(-1);
      if (key === undefined) continue;
      const change = localizeSite(site, localization.defaultLocale);
      if (change.kind === 'keep') continue;
      const container = containerAt(migrated, site.path.slice(0, -1));
      if (change.kind === 'set') Reflect.set(container, key, change.value);
      else Reflect.deleteProperty(container, key);
    }

    // The interview's own words for what the protocol uses, recorded in
    // English like the rest of its text, from the protocol as migrated (an
    // attribute whose encryption was never on is no longer encrypted).
    return withInterfaceText({
      ...migrated,
      stages: endsAtFinishStage(migrated.stages)
        ? migrated.stages
        : [
            ...(Array.isArray(migrated.stages) ? migrated.stages : []),
            finishStageFor(migrated.stages, localization),
          ],
      ...(experiments !== undefined && {
        experiments: withoutEncryptedVariables(experiments),
      }),
      schemaVersion: 9 as const,
      localization,
    });
  },
  // A pedigree's introduction screen becomes a stage of its own, which moves
  // the pedigree and every stage after it one place on; the framework moves
  // each session's stage records and resume position with their stages
  // before this runs. A session on a pedigree it had not started had not yet
  // seen the introduction, so it resumes on the new stage instead. The
  // redesigned pedigree keeps a different stage record, which is translated
  // without losing anything the participant recorded.
  //
  // The finish stage this step appends is the screen the interview engine
  // used to add after the last stage. The framework keeps a session that was
  // on that screen past the end of the stages, so it resumes on the finish
  // stage instead.
  migrateSession: (session, { before, after }) => {
    remapMergedOptionAnswers(session.network, before);
    resumeAtAppendedFinishStage(session, after);
    resumeUnstartedPedigreeAtIntroduction(session, after, before);
    migrateFamilyPedigreeSessionRecords(session, after, before);
    return session;
  },
});

export default migrationV8toV9;
