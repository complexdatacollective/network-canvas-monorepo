import { escapeMarkdownText } from '../../localization/markdownText.ts';
import { escapeMessageText } from '../../localization/messageSyntax.ts';
import { createMigration } from '../../migration/index.ts';
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
import ProtocolSchemaV9 from './schema.ts';

// Schema 8 never recorded the language its copy was written in, so a migrated
// protocol is taken to be written in English, tagged plainly as `en` rather
// than as a regional variant.
const MIGRATED_LOCALE = 'en';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const inMigratedLocale = (text: string) => ({
  [MIGRATED_LOCALE]: escapeMessageText(text),
});

const nameOrKey = (definition: unknown, key: string) => {
  const name = isRecord(definition) ? definition.name : undefined;
  return typeof name === 'string' && name !== '' ? name : key;
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
    if (field.label !== undefined && field.label !== '') continue;
    field.label = escapeMarkdownText(
      nameOrKey(variables[field.variable], field.variable),
    );
  }
};

/**
 * A schema 8 Network Composer field with no caption, or an empty one, was
 * captioned with its attribute's name, so the field keeps that name as its
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
    const localized = inMigratedLocale(site.value);
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

const migrationV8toV9 = createMigration({
  from: 8,
  to: 9,
  dependencies: {},
  notes: `- Attribute names can now use letters from any language, as well as spaces and punctuation. Existing attribute names are not changed.
- Text that participants see is now marked as written in English, because older protocols do not record which language they use. If your protocol is written in another language, add that language on the Languages page in Architect, enter each text in it, and then remove English.
- Family Pedigree stages are converted to the redesigned Family Pedigree. If a stage had an introduction screen, the screen becomes an Information stage just before the pedigree, which is skipped whenever the pedigree is skipped.
- The Family Pedigree answers for sex assigned at birth and for the kind of each relationship keep the values already recorded, but their labels change to the wording of the redesigned interface. A nomination prompt with the ID "pedigree", which is now reserved, is given a new ID.
- The old Family Pedigree always required two of the participant's parents. A converted Family Pedigree requires both of the participant's biological parents or, where it required recording grandparents, the family up to the grandparents, which also includes siblings, children, aunts and uncles. Where it recommended recording grandparents, it now recommends recording the family up to the grandparents, so recording both parents becomes a recommendation rather than a requirement, because a stage has only one completeness setting. Only biological parents and gamete donors now count as parents; the old interface also counted adoptive parents and surrogates.
- A new attribute, "relativesNotRecorded", is added for the people in every converted Family Pedigree, to record when a participant says someone has no siblings or no children, or does not know. If the person type already has an attribute with that name, the new attribute's name ends in a number instead, such as "relativesNotRecorded2".
- Three Family Pedigree settings are removed because the redesigned interface does not use them: requiring the other biological parent of the participant's children and that parent's family, the attribute for each person's relationship to the participant, and the attribute for which gamete each parent gave. Both attributes stay in the codebook with any answers already recorded, but are no longer filled in.
- The converted Family Pedigree does not ask about gender identity. Where it uses gendered words such as mother or sister, they follow each person's sex assigned at birth.
- Additional person fields on a Family Pedigree that collected the name or sex assigned at birth are removed, because the redesigned interface asks every person for both itself. The old interface never showed a field for the name. Answers already recorded are kept.
- A Family Pedigree cannot be converted if two of its answers use the same attribute: two nomination prompts, a nomination prompt and an additional person field, or the name and another answer. Each now needs an attribute of its own. Give each its own attribute in the version of Architect that made the protocol, then upgrade it.`,
  migrate: (doc) => {
    const migrated = structuredClone(doc);
    // Before the codebook labels and the localization pass, so the attribute
    // and stage the conversion adds are labelled and localized with the rest.
    migrateFamilyPedigreeStages(migrated);
    migrateNarrativePedigreeStages(migrated);
    addCodebookLabels(migrated.codebook);
    addHighlightLabels(migrated);
    addComposerCaptions(migrated);

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

    return {
      ...migrated,
      schemaVersion: 9 as const,
      localization: {
        defaultLocale: MIGRATED_LOCALE,
        locales: [MIGRATED_LOCALE],
      },
    };
  },
  // A pedigree's introduction screen becomes a stage of its own, which moves
  // the pedigree and every stage after it one place on; the framework moves
  // each session's stage records and resume position with their stages
  // before this runs. A session on a pedigree it had not started had not yet
  // seen the introduction, so it resumes on the new stage instead. The
  // redesigned pedigree keeps a different stage record, which is translated
  // without losing anything the participant recorded.
  migrateSession: (session, { before, after }) => {
    resumeUnstartedPedigreeAtIntroduction(session, after, before);
    migrateFamilyPedigreeSessionRecords(session, after, before);
    return session;
  },
});

export default migrationV8toV9;
