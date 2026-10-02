import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const UPDATE_APPS = [
  {
    id: 'architect',
    name: 'Architect',
    packageName: '@codaco/architect',
    directory: 'apps/architect',
  },
  {
    id: 'interviewer',
    name: 'Interviewer',
    packageName: '@codaco/interviewer',
    directory: 'apps/interviewer',
  },
  {
    id: 'fresco',
    name: 'Fresco',
    packageName: 'fresco',
    directory: 'apps/fresco',
  },
];

export const UPDATES_CSV_PATH = 'apps/networkcanvas.com/content/updates.csv';

const UPDATES_COLUMNS = [
  'id',
  'date',
  'kind',
  'versions',
  'title',
  'summary',
  'details',
  'link',
];

const NO_USER_FACING_CHANGE = 'none';

const DEFAULT_RELEASE_SUMMARY = '- Maintenance and stability improvements.';

const UPDATE_LINE = /^Update:[ \t]*(.*)$/m;

export function readUpdateLine(summary) {
  const match = summary.match(UPDATE_LINE);
  if (!match) return null;
  return match[1].trim();
}

export function stripUpdateLine(summary) {
  return summary
    .replace(UPDATE_LINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstParagraph(summary) {
  return (
    stripUpdateLine(summary)
      .split(/\n\s*\n/)[0]
      ?.replace(/\s*\n\s*/g, ' ')
      .trim() ?? ''
  );
}

export function userNotesFor(changesets) {
  const notes = new Map(UPDATE_APPS.map(({ id }) => [id, []]));
  for (const changeset of changesets) {
    const line = readUpdateLine(changeset.summary);
    if (line?.toLowerCase() === NO_USER_FACING_CHANGE) continue;
    const note = line || firstParagraph(changeset.summary);
    if (!note) continue;
    for (const app of UPDATE_APPS) {
      if (!changeset.releases.some(({ name }) => name === app.packageName)) {
        continue;
      }
      const appNotes = notes.get(app.id);
      if (!appNotes.includes(note)) appNotes.push(note);
    }
  }
  return notes;
}

export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const [header = [], ...rows] = records.filter(
    (row) => row.length > 1 || row[0] !== '',
  );
  return rows.map((row) =>
    Object.fromEntries(
      header.map((column, index) => [column, row[index] ?? '']),
    ),
  );
}

function csvField(value) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function stringifyCsv(rows, columns = UPDATES_COLUMNS) {
  return `${[
    columns,
    ...rows.map((row) => columns.map((column) => row[column] ?? '')),
  ]
    .map((fields) => fields.map(csvField).join(','))
    .join('\n')}\n`;
}

function parseVersions(value) {
  return value
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [app, version] = entry.split('@');
      return { app, version: version || undefined };
    });
}

function releaseKind(version) {
  return /^\d+\.\d+\.0(?:-|$)/.test(version) ? 'feature' : 'fix';
}

function releaseEntryId(app, version) {
  return `${app}-${version.replace(/[^0-9A-Za-z]+/g, '-')}`;
}

export function addReleaseEntries(rows, { released, notes, date }) {
  const existingIds = new Set(rows.map((row) => row.id));
  const added = released
    .filter(
      ({ app, version }) => !existingIds.has(releaseEntryId(app, version)),
    )
    .map(({ app, version }) => {
      const appNotes = notes.get(app) ?? [];
      const name = UPDATE_APPS.find(({ id }) => id === app)?.name ?? app;
      return {
        id: releaseEntryId(app, version),
        date,
        kind: releaseKind(version),
        versions: `${app}@${version}`,
        title: `${name} ${version}`,
        summary:
          appNotes.length > 0
            ? appNotes.map((note) => `- ${note}`).join('\n')
            : DEFAULT_RELEASE_SUMMARY,
        details: '',
        link: '',
      };
    });

  return { rows: [...added, ...rows], added };
}

export function missingReleaseEntries(rows, currentVersions) {
  const covered = new Set(
    rows.flatMap((row) =>
      parseVersions(row.versions)
        .filter(({ version }) => version)
        .map(({ app, version }) => `${app}@${version}`),
    ),
  );
  return currentVersions.filter(
    ({ app, version }) => !covered.has(`${app}@${version}`),
  );
}

export function readAppVersions(root) {
  return UPDATE_APPS.map(({ id, directory }) => ({
    app: id,
    version: JSON.parse(
      readFileSync(join(root, directory, 'package.json'), 'utf8'),
    ).version,
  }));
}

export function readUpdateRows(root) {
  return parseCsv(readFileSync(join(root, UPDATES_CSV_PATH), 'utf8'));
}

export function writeUpdateRows(root, rows) {
  writeFileSync(join(root, UPDATES_CSV_PATH), stringifyCsv(rows));
}
