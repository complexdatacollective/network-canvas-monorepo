import { escapeMarkdownText } from '../../localization/markdownText.ts';
import { escapeMessageText } from '../../localization/messageSyntax.ts';
import { createMigration } from '../../migration/index.ts';
import {
  collectLocalizedStringSites,
  type LocalizedStringSite,
} from '../../utils/collectLocalizedStrings.ts';
import { TypeLevelOperators } from './filters/filter.ts';
import ProtocolSchemaV9 from './schema.ts';

// Schema 8 never recorded the language its copy was written in.
const UNDETERMINED_LOCALE = 'und';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const inUndeterminedLocale = (text: string) => ({
  [UNDETERMINED_LOCALE]: escapeMessageText(text),
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
    const localized = inUndeterminedLocale(site.value);
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
- Text that participants see is now marked as written in "Unspecified language", because older protocols do not record which language they use. You can change it to the language it is actually written in on the Languages page in Architect.
- Encrypted attributes are no longer experimental: the Anonymisation interface is always available, and an attribute marked as encrypted is always encrypted. If this protocol marked attributes as encrypted without turning on the experimental "Encrypted Attributes" feature, those attributes are no longer marked, so they keep being collected without encryption.
- If an Anonymisation stage required a minimum passphrase length longer than its maximum, no participant could choose a passphrase, so both lengths are removed and the default minimum length applies.
- Skip logic and filters can no longer compare the answers to an encrypted attribute. Rules are checked without the participant's passphrase, so under schema 8 a rule like this only ever compared the encrypted text, never the answer. These rules are removed. Rules that only check whether an encrypted attribute is answered still work, so they are kept. Skip logic left with no rules is removed, so its stage now always appears: a stage that was shown only when a removed rule matched may never have appeared under schema 8. A filter left with no rules is removed, so it no longer limits what its stage or panel shows. Where other rules remain, they may now match differently: if all rules had to match, they now match at least as often as before; if any one rule could match, at most as often. Check the stages that used the removed rules. Rules in a panel that lists people from an external data file are kept, because that data is not encrypted.`,
  migrate: ({ experiments, ...doc }) => {
    const migrated = structuredClone(doc);
    if (!isRecord(experiments) || experiments.encryptedVariables !== true) {
      removeEncryptedMarks(migrated.codebook);
    }
    removeContradictoryPassphraseRules(migrated);
    removeEncryptedAttributeComparisons(migrated);
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
      ...(experiments !== undefined && {
        experiments: withoutEncryptedVariables(experiments),
      }),
      schemaVersion: 9 as const,
      localization: {
        defaultLocale: UNDETERMINED_LOCALE,
        locales: [UNDETERMINED_LOCALE],
      },
    };
  },
});

export default migrationV8toV9;
