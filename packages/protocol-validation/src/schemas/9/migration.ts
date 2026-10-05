import { escapeMessageText } from '../../localization/messageSyntax.ts';
import { createMigration } from '../../migration/index.ts';
import {
  collectLocalizedStringSites,
  type LocalizedStringSite,
} from '../../utils/collectLocalizedStrings.ts';
import ProtocolSchemaV9 from './schema.ts';

// Schema 8 never recorded the language its copy was written in.
const UNDETERMINED_LOCALE = 'und';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const inUndeterminedLocale = (text: string) => ({
  [UNDETERMINED_LOCALE]: escapeMessageText(text),
});

/**
 * Schema 8 had no participant-facing name for an entity type or attribute, so
 * its label starts as the name participants already saw. The codebook key
 * stands in for a missing or empty name, because a variable label may not be
 * empty.
 */
const addLabels = (definitions: unknown) => {
  if (!isRecord(definitions)) return;
  for (const [key, definition] of Object.entries(definitions)) {
    if (!isRecord(definition)) continue;
    if (definition.label === undefined) {
      const { name } = definition;
      definition.label = typeof name === 'string' && name !== '' ? name : key;
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
- Text that participants see is now marked as written in "Unspecified language", because older protocols do not record which language they use. You can change it to the language it is actually written in on the Languages page in Architect.`,
  migrate: (doc) => {
    const migrated = structuredClone(doc);
    addCodebookLabels(migrated.codebook);

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
        defaultLocale: UNDETERMINED_LOCALE,
        locales: [UNDETERMINED_LOCALE],
      },
    };
  },
});

export default migrationV8toV9;
