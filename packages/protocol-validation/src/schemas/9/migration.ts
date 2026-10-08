import { isBlankText } from '../../localization/blankText.ts';
import { escapeMarkdownText } from '../../localization/markdownText.ts';
import { escapeMessageText } from '../../localization/messageSyntax.ts';
import { createMigration } from '../../migration/index.ts';
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
import { DEFAULT_FINISH_SESSION_TEXT } from './finish-session-defaults.ts';
import ProtocolSchemaV9 from './schema.ts';

// Schema 8 never recorded the language its copy was written in, and a schema 9
// protocol always has a real one, so migrated copy is recorded as English. The
// researcher can change it to the language it is really written in.
const DEFAULT_LOCALE = 'en';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const inDefaultLocale = (text: string) => ({
  [DEFAULT_LOCALE]: escapeMessageText(text),
});

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

// Schema 9 keeps `experiments` for features released within it, but
// encrypted attributes are no longer one of them.
const withoutEncryptedVariables = (experiments: unknown) => {
  if (!isRecord(experiments)) return experiments;
  const { encryptedVariables: _released, ...remaining } = experiments;
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

// The id the appended finish stage takes, unless a schema 8 stage already
// has it. Deterministic, so migrating one document twice gives one result.
const FINISH_STAGE_ID = 'finish';

const finishStageId = (stages: unknown): string => {
  const taken = new Set(
    Array.isArray(stages)
      ? stages.flatMap((stage) =>
          isRecord(stage) && typeof stage.id === 'string' ? [stage.id] : [],
        )
      : [],
  );
  let id = FINISH_STAGE_ID;
  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${FINISH_STAGE_ID}-${suffix}`;
  }
  return id;
};

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

const finishStageFor = (stages: unknown, defaultLocale: string) => {
  const text = DEFAULT_FINISH_SESSION_TEXT.en;
  return {
    id: finishStageId(stages),
    type: 'FinishSession' as const,
    label: { [defaultLocale]: text.label },
    title: { [defaultLocale]: text.title },
    content: { [defaultLocale]: text.content },
    outcome: 'completed' as const,
  };
};

type SiteChange =
  | { kind: 'set'; value: unknown }
  | { kind: 'remove' }
  | { kind: 'keep' };

/**
 * An empty string follows the site's own rule: where the field accepts empty
 * text it is kept as data, and where it does not, an optional field is left
 * out. A required field is wrapped regardless, so validation reports what
 * schema 8 already rejected.
 *
 * Schema 8 typed every site as a string except the end labels of a Network
 * Composer scale, whose parameter record accepted any value. The interview
 * only ever rendered string end labels there, so any other value is dropped.
 * A non-string anywhere else was already invalid and is left for validation.
 */
const localizeSite = (site: LocalizedStringSite): SiteChange => {
  if (typeof site.value === 'string') {
    const localized = inDefaultLocale(site.value);
    if (site.schema.safeParse(localized).success || !site.optional) {
      return { kind: 'set', value: localized };
    }
    return { kind: 'remove' };
  }
  return site.looseContainer && site.optional
    ? { kind: 'remove' }
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

const migrationV8toV9 = createMigration({
  from: 8,
  to: 9,
  dependencies: {},
  notes: `- Attribute names can now use letters from any language, as well as spaces and punctuation. Existing attribute names are not changed.
- Text that participants see is now recorded as English, because older protocols do not record which language they use. After upgrading, confirm the protocol's default language: if your protocol is written in another language, change it on the Languages page in Architect.
- A form field whose question was empty or contained only spaces now uses the name of its attribute as the question, because every question must contain some text.
- Encrypted attributes are no longer experimental: the Anonymisation interface is always available, and an attribute marked as encrypted is always encrypted. If this protocol marked attributes as encrypted without turning on the experimental "Encrypted Attributes" feature, those attributes are no longer marked, so they keep being collected without encryption.
- If an Anonymisation stage required a minimum passphrase length longer than its maximum, no participant could choose a passphrase, so both lengths are removed and the default minimum length applies.
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
- The screen that ends the interview is now a Finish Screen stage at the end of your protocol, so you can change its heading and text and translate them like the rest of your protocol. It starts with the text the interview has always shown there.`,
  migrate: ({ experiments, ...doc }) => {
    const migrated = structuredClone(doc);
    if (!isRecord(experiments) || experiments.encryptedVariables !== true) {
      removeEncryptedMarks(migrated.codebook);
    }
    removeContradictoryPassphraseRules(migrated);
    removeEncryptedAttributeComparisons(migrated);
    // Before the codebook labels and the localization pass, so the attribute
    // and stage the conversion adds are labelled and localized with the rest.
    migrateFamilyPedigreeStages(migrated);
    migrateNarrativePedigreeStages(migrated);
    addCodebookLabels(migrated.codebook);
    addHighlightLabels(migrated);
    addComposerCaptions(migrated);
    addFormFieldPrompts(migrated);

    // Every site is found before any is rewritten, so the walk reads the
    // document as schema 8 left it.
    for (const site of collectLocalizedStringSites(
      ProtocolSchemaV9,
      migrated,
    )) {
      const key = site.path.at(-1);
      if (key === undefined) continue;
      const change = localizeSite(site);
      if (change.kind === 'keep') continue;
      const container = containerAt(migrated, site.path.slice(0, -1));
      if (change.kind === 'set') Reflect.set(container, key, change.value);
      else Reflect.deleteProperty(container, key);
    }

    const localization = {
      defaultLocale: DEFAULT_LOCALE,
      locales: [DEFAULT_LOCALE],
    };

    return {
      ...migrated,
      stages: endsAtFinishStage(migrated.stages)
        ? migrated.stages
        : [
            ...(Array.isArray(migrated.stages) ? migrated.stages : []),
            finishStageFor(migrated.stages, localization.defaultLocale),
          ],
      ...(experiments !== undefined && {
        experiments: withoutEncryptedVariables(experiments),
      }),
      schemaVersion: 9 as const,
      localization,
    };
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
    resumeAtAppendedFinishStage(session, after);
    resumeUnstartedPedigreeAtIntroduction(session, after, before);
    migrateFamilyPedigreeSessionRecords(session, after, before);
    return session;
  },
});

export default migrationV8toV9;
