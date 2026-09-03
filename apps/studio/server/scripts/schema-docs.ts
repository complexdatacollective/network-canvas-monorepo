import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { importer } from '@dbml/core';
import { run as renderDbml } from '@softwaretechnik/dbml-renderer';

import { SIDECARS } from '../src/db/schema.ts';
import {
  computeSchemaFingerprint,
  renderDrizzleSchemaStatements,
} from './apply.ts';

const COMMAND = 'pnpm --filter @codaco/studio-server sync-fingerprint';
const README_MARKER_START = '<!-- generated:schema-docs start -->';
const README_MARKER_END = '<!-- generated:schema-docs end -->';

const serverRoot = new URL('..', import.meta.url);

export const STUDIO_README_PATH = fileURLToPath(
  new URL('../README.md', serverRoot),
);
export const STUDIO_ERD_PATH = fileURLToPath(
  new URL('../schema-erd.svg', serverRoot),
);

type Policy = {
  name: string;
  table: string;
};

type Role = {
  name: string;
  options: string;
};

type Trigger = {
  name: string;
  action: string;
  table: string;
  body: string;
  functionName: string;
};

type Privilege = {
  privileges: string;
  table: string;
  roles: string;
  /** Offset in the assembled sidecar SQL: privileges are order-dependent. */
  at: number;
};

type SchemaMetadata = {
  policies: Policy[];
  roles: Role[];
  forcedTables: string[];
  triggers: Trigger[];
  grants: Privilege[];
  revocations: Privilege[];
};

export type SchemaDocs = {
  fingerprint: string;
  readmeSection: string;
  svg: string;
};

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function extractMetadata(
  drizzleSql: string,
  sidecarSql: string,
): SchemaMetadata {
  const policies = [
    ...drizzleSql.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+"([^"]+)"/g),
  ].map(([, name, table]) => ({ name: name!, table: table! }));

  const roles = [...sidecarSql.matchAll(/CREATE ROLE\s+(\w+)\s+([^;]+);/g)].map(
    ([, name, options]) => ({
      name: name!,
      options: compactSql(options!),
    }),
  );

  const forcedTables = [
    ...sidecarSql.matchAll(/ALTER TABLE\s+(\w+)\s+FORCE ROW LEVEL SECURITY;/g),
  ].map(([, table]) => table!);

  // Both optional groups are for the deferred commit-time constraint trigger,
  // which Postgres refuses to CREATE OR REPLACE: it is documented beside the
  // immediate ones, with its DEFERRABLE clause landing in `body`, where the
  // row-timing detail belongs.
  const triggers = [
    ...sidecarSql.matchAll(
      /CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER\s+(\w+)\s+([\s\S]*?)\s+ON\s+(\w+)\s+([\s\S]*?)EXECUTE FUNCTION\s+(\w+)\(\);/g,
    ),
  ].map(([, name, action, table, body, functionName]) => ({
    name: name!,
    action: compactSql(action!),
    table: table!,
    body: compactSql(body!),
    functionName: functionName!,
  }));

  // Narrow grants that re-admit a single column after a table-level
  // revocation. Without these the README would read as a stricter privilege
  // set than the database actually has, because the revocation beside them is
  // documented. Both matchers name exactly one table, so the broad
  // `ON ALL TABLES IN SCHEMA` and multi-table tenant grants stay out.
  const grants = [
    ...sidecarSql.matchAll(/GRANT\s+([^;]+?)\s+ON\s+(\w+)\s+TO\s+([^;]+);/g),
  ].map((match) => ({
    privileges: compactSql(match[1]!),
    table: match[2]!,
    roles: compactSql(match[3]!),
    at: match.index,
  }));

  const revocations = [
    ...sidecarSql.matchAll(/REVOKE\s+([^;]+?)\s+ON\s+(\w+)\s+FROM\s+([^;]+);/g),
  ].map((match) => ({
    privileges: compactSql(match[1]!),
    table: match[2]!,
    roles: compactSql(match[3]!),
    at: match.index,
  }));

  return { policies, roles, forcedTables, triggers, grants, revocations };
}

function tableNotes(metadata: SchemaMetadata): Map<string, string> {
  const notes = new Map<string, string[]>();
  const add = (table: string, note: string) => {
    const annotations = notes.get(table) ?? [];
    annotations.push(note);
    notes.set(table, annotations);
  };

  for (const policy of metadata.policies) {
    add(policy.table, `RLS policy ${policy.name}`);
  }
  for (const table of metadata.forcedTables) {
    add(table, 'sidecar forces row-level security');
  }
  for (const trigger of metadata.triggers) {
    add(
      trigger.table,
      `sidecar trigger ${trigger.name}: ${trigger.action} calls ${trigger.functionName}()`,
    );
  }

  return new Map(
    [...notes].map(([table, values]) => [table, values.join('; ')]),
  );
}

function escapeDbmlString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

/**
 * DBML Core emits the current DBML dialect. The renderer deliberately supports
 * a smaller visual subset: checks do not affect table relationships, and its
 * one-to-many endpoints do not distinguish nullable foreign keys. Remove only
 * those two unsupported constructs before handing the DBML to Graphviz.
 */
function normalizeDbmlForRenderer(dbml: string): string {
  const lines: string[] = [];
  let inChecks = false;

  for (const line of dbml.split('\n')) {
    if (line === '  Checks {') {
      inChecks = true;
      continue;
    }
    if (inChecks) {
      if (line === '  }') inChecks = false;
      continue;
    }

    lines.push(
      line.startsWith('Ref ')
        ? line.replace(/\s\??(<>|<|>|-)\??\s/, ' $1 ')
        : line,
    );
  }

  return lines.join('\n');
}

function annotateDbml(dbml: string, metadata: SchemaMetadata): string {
  const notes = tableNotes(metadata);
  return dbml.replace(
    /^Table "([^"]+)" \{$/gm,
    (declaration: string, table: string) => {
      const note = notes.get(table);
      return note
        ? `Table "${table}" [note: '${escapeDbmlString(note)}'] {`
        : declaration;
    },
  );
}

function makeSvgAccessible(svg: string): string {
  return svg
    .replace(
      '<!-- Title: dbml Pages: 1 -->',
      [
        '<!-- Generated by the Studio sync-fingerprint script. Do not edit by hand. -->',
        '<!-- Title: Network Canvas Studio ERD Pages: 1 -->',
      ].join('\n'),
    )
    .replace(
      '<title>dbml</title>',
      [
        '<title>Network Canvas Studio entity-relationship diagram</title>',
        '<desc>Tables and enforced foreign-key relationships generated from the assembled Drizzle schema. Sidecar-managed row-level security and triggers are attached as table tooltips.</desc>',
      ].join('\n'),
    );
}

function codeList(values: string[]): string {
  return values.map((value) => `\`${value}\``).join(', ');
}

function triggerDescription(trigger: Trigger): string {
  const rowClause = trigger.body === 'FOR EACH ROW' ? '' : `; ${trigger.body}`;
  return `\`${trigger.name}\`: ${trigger.action}${rowClause} → \`${trigger.functionName}()\``;
}

function renderMarkdownTable(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, column) =>
    Math.max(...rows.map((row) => row[column]!.length)),
  );
  const pad = (row: string[]) =>
    `| ${row.map((cell, column) => cell.padEnd(widths[column]!)).join(' | ')} |`;
  const divider = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return [pad(rows[0]!), divider, ...rows.slice(1).map(pad)];
}

function renderSidecarTable(metadata: SchemaMetadata): string[] {
  const policyNames = [...new Set(metadata.policies.map(({ name }) => name))];
  const roleDescriptions = metadata.roles.map(
    ({ name, options }) => `\`${name}\` (${options})`,
  );
  const triggersByTable = Map.groupBy(metadata.triggers, ({ table }) => table);

  const rows = [
    [
      'Roles',
      `${roleDescriptions.join('; ')}; the applying login receives SET on both roles.`,
    ],
    [
      'Schema and sequences',
      `Both roles receive schema USAGE plus USAGE and SELECT on all sequences.`,
    ],
    [
      'All Studio tables',
      `Both roles initially receive SELECT, INSERT, UPDATE, and DELETE through the access sidecar; table-specific revocations below are applied afterwards.`,
    ],
    [
      codeList(metadata.forcedTables),
      `Drizzle policy ${codeList(policyNames)} plus sidecar FORCE ROW LEVEL SECURITY and tenant-table DML grants.`,
    ],
    ...[...triggersByTable].map(([table, triggers]) => [
      `\`${table}\``,
      triggers.map(triggerDescription).join('; '),
    ]),
    // Ordered by position in the assembled sidecar SQL, because a grant that
    // re-admits one column after a table-level revocation says something
    // different from one applied before it.
    ...[
      ...metadata.grants.map((grant) => ({
        ...grant,
        clause: `Grants ${grant.privileges} to ${grant.roles}.`,
      })),
      ...metadata.revocations.map((revocation) => ({
        ...revocation,
        clause: `Revokes ${revocation.privileges} from ${revocation.roles}.`,
      })),
    ]
      .toSorted((left, right) => left.at - right.at)
      .map(({ table, clause }) => [`\`${table}\` privileges`, clause]),
  ];

  return renderMarkdownTable([['Scope', 'Sidecar-enforced behavior'], ...rows]);
}

function renderReadmeSection(
  fingerprint: string,
  metadata: SchemaMetadata,
): string {
  return [
    README_MARKER_START,
    '',
    '#### Generated entity-relationship diagram',
    '',
    `<!-- Generated by \`${COMMAND}\` from the assembled Drizzle schema and raw-SQL sidecars. Do not edit by hand. -->`,
    '',
    '[![Network Canvas Studio entity-relationship diagram](./schema-erd.svg)](./schema-erd.svg)',
    '',
    "Open the image for the full-size diagram. Tables with row-level security or trigger sidecars carry those details as SVG tooltips. The diagram shows physical foreign-key constraints; deliberately unconstrained logical references are not drawn as relationships. The renderer uses `1`/`*` edge endpoints, so optionality remains visible through each column's not-null marker rather than the edge.",
    '',
    `Schema fingerprint: \`${fingerprint}\`.`,
    '',
    'Sidecar behavior that cannot be represented as ERD relationships:',
    '',
    ...renderSidecarTable(metadata),
    '',
    README_MARKER_END,
  ].join('\n');
}

export function spliceSchemaDocs(readme: string, section: string): string {
  const start = readme.indexOf(README_MARKER_START);
  const end = readme.indexOf(README_MARKER_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `README is missing the ${README_MARKER_START} / ${README_MARKER_END} markers`,
    );
  }

  return (
    readme.slice(0, start) +
    section +
    readme.slice(end + README_MARKER_END.length)
  );
}

export async function renderSchemaDocs(): Promise<SchemaDocs> {
  const [drizzleStatements, fingerprint] = await Promise.all([
    renderDrizzleSchemaStatements(),
    computeSchemaFingerprint(),
  ]);
  const drizzleSql = drizzleStatements.join('\n');
  const sidecarSql = SIDECARS.join('\n');
  const metadata = extractMetadata(drizzleSql, sidecarSql);
  const dbml = normalizeDbmlForRenderer(
    annotateDbml(importer.import(drizzleSql, 'postgres'), metadata),
  );

  return {
    fingerprint,
    readmeSection: renderReadmeSection(fingerprint, metadata),
    svg: makeSvgAccessible(renderDbml(dbml, 'svg')),
  };
}

export function writeSchemaDocs(artifacts: SchemaDocs): void {
  const readme = readFileSync(STUDIO_README_PATH, 'utf8');
  writeFileSync(
    STUDIO_README_PATH,
    spliceSchemaDocs(readme, artifacts.readmeSection),
  );
  writeFileSync(STUDIO_ERD_PATH, artifacts.svg);
}
