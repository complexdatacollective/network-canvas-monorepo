// What a Fresco export has to carry for the schema 9 interview walk.
//
// Pure and free of Playwright, so each oracle is exercised on synthetic files
// in `scripts/release-test/fresco-release-test-lane-contracts.test.mjs` and
// shown failing there on files that break the behaviour it guards. The input
// is `readInterviewExport(...).files`: one `{ name, text }` per data entry.
import {
  ncFinishOutcomeProperty,
  ncSessionProperty,
  ncUUIDProperty,
} from '../../../../packages/shared-consts/src/export-process.ts';

/** The cells of one CSV row: quoted cells may hold commas and doubled quotes. */
export function splitCsvRow(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      cells.push(cell);
      cell = '';
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

const GRAPH_START_TAG = /<graph\b(?:[^>"]|"[^"]*")*>/g;
const attributeOf = (tag, name) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * Every outcome each format records, in the order it records them, keyed by
 * the session id the export gives the interview. An interview a format
 * records more than once keeps every reading, so a repeat can be reported
 * instead of the last one silently winning.
 */
function outcomeReadings(files) {
  const csv = {};
  const graphml = {};
  const record = (readings, session, outcome) => {
    (readings[session] ??= []).push(outcome);
  };
  for (const { name, text } of files) {
    if (/\.csv$/i.test(name)) {
      const lines = text.split(/\r?\n/).filter((line) => line !== '');
      const header = splitCsvRow(lines[0] ?? '');
      const outcome = header.indexOf(ncFinishOutcomeProperty);
      const session = header.indexOf(ncSessionProperty);
      if (outcome === -1 || session === -1) continue;
      for (const line of lines.slice(1)) {
        const cells = splitCsvRow(line);
        record(csv, cells[session], cells[outcome] ?? '');
      }
    } else if (/\.graphml$/i.test(name)) {
      for (const tag of text.match(GRAPH_START_TAG) ?? []) {
        const session = attributeOf(tag, 'nc:sessionUUID');
        if (session !== undefined)
          record(graphml, session, attributeOf(tag, 'nc:finishOutcome') ?? '');
      }
    }
  }
  return { csv, graphml };
}

/**
 * Where each exported interview ended, as each format records it, keyed by
 * the session id the export gives the interview.
 *
 * `csv` reads every ego CSV that has the finish outcome column (an empty cell
 * is recorded as ''); `graphml` reads every graph's nc:finishOutcome
 * (recorded as '' when the graph has none — GraphML leaves the attribute out
 * when there is no outcome). An interview recorded more than once reads as
 * its last record here; finishOutcomeProblems reports the repeat.
 */
export function finishOutcomesByFormat(files) {
  const readings = outcomeReadings(files);
  const last = (byFormat) =>
    Object.fromEntries(
      Object.entries(byFormat).map(([session, outcomes]) => [
        session,
        outcomes.at(-1),
      ]),
    );
  return { csv: last(readings.csv), graphml: last(readings.graphml) };
}

/**
 * Compares the outcomes an export records with the ones expected, per
 * interview and per format. Returns the problems; an empty list is a pass.
 * Both formats must record every expected interview exactly once: an
 * interview missing from a format is a problem, never a pass by omission, and
 * one recorded twice is a problem even when one of its records is right,
 * because a researcher's analysis would read both.
 */
export function finishOutcomeProblems(files, expected) {
  const found = outcomeReadings(files);
  const problems = [];
  for (const [format, readings] of Object.entries(found)) {
    for (const [session, outcome] of Object.entries(expected)) {
      const recorded = readings[session];
      if (!recorded)
        problems.push(`${format} has no row for interview ${session}`);
      else if (recorded.length > 1)
        problems.push(
          `${format} records interview ${session} ${recorded.length} times (${recorded.map((value) => `"${value}"`).join(', ')})`,
        );
      else if (recorded[0] !== outcome)
        problems.push(
          `${format} records interview ${session} as "${recorded[0]}", expected "${outcome}"`,
        );
    }
  }
  return problems;
}

/** The placeholder the exporters write in place of an encrypted value. */
export const ENCRYPTED_PLACEHOLDER = 'ENCRYPTED';

/**
 * The exported records of one node: each CSV row whose UUID column holds its
 * id, and each GraphML <node> whose networkCanvasUUID data holds it (GraphML
 * numbers its nodes, so the element id is not the node's id). Each record
 * maps an attribute's exported name — the CSV column, or the GraphML key's
 * attr.name — to its value.
 */
function nodeRecords(files, nodeId) {
  const records = [];
  for (const { name, text } of files) {
    if (/\.csv$/i.test(name)) {
      const lines = text.split(/\r?\n/).filter((line) => line !== '');
      const header = splitCsvRow(lines[0] ?? '');
      const uuid = header.indexOf(ncUUIDProperty);
      if (uuid === -1) continue;
      for (const line of lines.slice(1)) {
        const cells = splitCsvRow(line);
        if (cells[uuid] === nodeId)
          records.push({
            format: 'csv',
            name,
            fields: new Map(
              header.map((column, index) => [column, cells[index]]),
            ),
          });
      }
    } else if (/\.graphml$/i.test(name)) {
      const keyNames = new Map(
        [...text.matchAll(/<key\b[^>]*>/g)].map(([tag]) => [
          attributeOf(tag, 'id'),
          attributeOf(tag, 'attr.name'),
        ]),
      );
      for (const [, body] of text.matchAll(
        /<node\b[^>]*>([\s\S]*?)<\/node>/g,
      )) {
        const fields = new Map(
          [...body.matchAll(/<data\b([^>]*)>([^<]*)<\/data>/g)].map(
            ([, attributes, value]) => {
              const key = attributeOf(` ${attributes}`, 'key');
              return [keyNames.get(key) ?? key, value];
            },
          ),
        );
        if (fields.get(ncUUIDProperty) === nodeId)
          records.push({ format: 'graphml', name, fields });
      }
    }
  }
  return records;
}

/**
 * What is wrong with how many records of a node each format holds. The lanes
 * export both formats, so a node missing from either is an answer lost in
 * that format, which a record in the other cannot stand in for; and a node
 * recorded twice in one format is a duplicated person in the researcher's
 * data, even when both copies agree.
 */
const recordCountProblems = (records, nodeId) =>
  ['csv', 'graphml'].flatMap((format) => {
    const count = records.filter((record) => record.format === format).length;
    if (count === 0)
      return [`no exported ${format} file has a record for node ${nodeId}`];
    if (count > 1)
      return [
        `the exported ${format} files hold ${count} records for node ${nodeId}`,
      ];
    return [];
  });

/**
 * Whether one person's encrypted answer stayed out of the export: no file may
 * hold the plaintext, and that person's own exported record has to carry the
 * placeholder. A placeholder anywhere else proves nothing about this answer:
 * another person's encrypted value (a relative the pedigree labelled itself,
 * say) would carry one even if this answer had been lost. Every record the
 * export holds for the person must carry it, in both the CSV and the GraphML.
 */
export function encryptedValueProblems(
  files,
  plaintext,
  nodeId,
  attribute = 'name',
) {
  const problems = files
    .filter(({ text }) => text.includes(plaintext))
    .map(({ name }) => `${name} holds "${plaintext}" in plain text`);
  const records = nodeRecords(files, nodeId);
  problems.push(...recordCountProblems(records, nodeId));
  for (const { name, fields } of records)
    if (fields.get(attribute) !== ENCRYPTED_PLACEHOLDER)
      problems.push(
        `${name}'s record for node ${nodeId} holds ${attribute}=${JSON.stringify(fields.get(attribute) ?? null)}, not the ${ENCRYPTED_PLACEHOLDER} placeholder, so its encrypted answer was dropped`,
      );
  return problems;
}

/**
 * Whether each person's answers reached that person's own exported records.
 * `expected` maps a node id to the attributes its records must hold, by
 * exported name (a categorical answer is exported as one true/false column
 * per option, such as `context_work`). Searching the archive's text instead
 * would find a short answer such as "5" or "work" in any header or other
 * record, and pass with the answer itself dropped. Every record the export
 * holds for the node must carry every value, and the node must have a record
 * in both the CSV and the GraphML.
 */
export function nodeAnswerProblems(files, expected) {
  const problems = [];
  for (const [nodeId, answers] of Object.entries(expected)) {
    const records = nodeRecords(files, nodeId);
    problems.push(...recordCountProblems(records, nodeId));
    for (const { name, fields } of records)
      for (const [attribute, value] of Object.entries(answers))
        if (fields.get(attribute) !== value)
          problems.push(
            `${name}'s record for node ${nodeId} holds ${attribute}=${JSON.stringify(fields.get(attribute) ?? null)}, expected ${JSON.stringify(value)}`,
          );
  }
  return problems;
}
