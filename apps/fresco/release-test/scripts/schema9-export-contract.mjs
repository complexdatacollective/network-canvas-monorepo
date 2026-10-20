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

/** Each GraphML key's attr.name, by the key's id. */
const graphmlKeyNames = (text) =>
  new Map(
    [...text.matchAll(/<key\b[^>]*>/g)].map(([tag]) => [
      attributeOf(tag, 'id'),
      attributeOf(tag, 'attr.name'),
    ]),
  );

/** The <data> elements of a stretch of GraphML, by their key's attr.name. */
const graphmlFields = (body, keyNames) =>
  new Map(
    [...body.matchAll(/<data\b([^>]*)>([^<]*)<\/data>/g)].map(
      ([, attributes, value]) => {
        const key = attributeOf(` ${attributes}`, 'key');
        return [keyNames.get(key) ?? key, value];
      },
    ),
  );

/**
 * The exported records of one node or edge: each CSV row whose UUID column
 * holds its id (a node's attribute list, an edge's edge list), and each
 * GraphML <node> or <edge> whose networkCanvasUUID data holds it (GraphML
 * numbers its elements, so the element id is not the entity's id). Each record
 * maps an attribute's exported name — the CSV column, or the GraphML key's
 * attr.name — to its value.
 */
function entityRecords(files, entityId, element) {
  const records = [];
  for (const { name, text } of files) {
    if (/\.csv$/i.test(name)) {
      const lines = text.split(/\r?\n/).filter((line) => line !== '');
      const header = splitCsvRow(lines[0] ?? '');
      const uuid = header.indexOf(ncUUIDProperty);
      if (uuid === -1) continue;
      for (const line of lines.slice(1)) {
        const cells = splitCsvRow(line);
        if (cells[uuid] === entityId)
          records.push({
            format: 'csv',
            name,
            fields: new Map(
              header.map((column, index) => [column, cells[index]]),
            ),
          });
      }
    } else if (/\.graphml$/i.test(name)) {
      const keyNames = graphmlKeyNames(text);
      const pattern = new RegExp(
        `<${element}\\b[^>]*>([\\s\\S]*?)<\\/${element}>`,
        'g',
      );
      for (const [, body] of text.matchAll(pattern)) {
        const fields = graphmlFields(body, keyNames);
        if (fields.get(ncUUIDProperty) === entityId)
          records.push({ format: 'graphml', name, fields });
      }
    }
  }
  return records;
}

const nodeRecords = (files, nodeId) => entityRecords(files, nodeId, 'node');

/**
 * What is wrong with how many records of one thing each format holds. The
 * lanes export both formats, so a record missing from either is an answer
 * lost in that format, which a record in the other cannot stand in for; and
 * a record repeated in one format is a duplicated person, relationship or
 * interview in the researcher's data, even when the copies agree.
 */
const recordCountProblems = (records, what) =>
  ['csv', 'graphml'].flatMap((format) => {
    const count = records.filter((record) => record.format === format).length;
    if (count === 0)
      return [`no exported ${format} file has a record for ${what}`];
    if (count > 1)
      return [`the exported ${format} files hold ${count} records for ${what}`];
    return [];
  });

/**
 * An expected value that a record may hold anything for except `value`: for
 * an answer nobody gave, which the CSV leaves blank and the GraphML leaves
 * out, but which must never read as `value`.
 */
export const anythingBut = (value) => ({ anythingBut: value });

/**
 * The columns a categorical answer exports as, one true/false column per
 * option the protocol's codebook lists, named for the variable: only the
 * chosen option true. Taken from the codebook the server stored rather than
 * a list kept here, so an option added to the protocol (or by its migration)
 * is checked too, and an export that marks any other option true fails.
 */
export function categoricalColumns(codebook, entity, type, variableId, chosen) {
  const variable = codebook?.[entity]?.[type]?.variables?.[variableId];
  const options = Array.isArray(variable?.options)
    ? variable.options.map((option) =>
        typeof option === 'object' && option !== null ? option.value : option,
      )
    : [];
  if (!options.includes(chosen))
    throw new Error(
      `the stored codebook's ${entity} ${type} variable ${variableId} has no option ${JSON.stringify(chosen)} (options: ${JSON.stringify(options)})`,
    );
  return Object.fromEntries(
    options.map((option) => [
      `${variable.name}_${option}`,
      String(option === chosen),
    ]),
  );
}

/** Every value `answers` names, compared with each record that should hold it. */
const fieldProblems = (records, answers, what) => {
  const problems = [];
  for (const { name, fields } of records)
    for (const [attribute, value] of Object.entries(answers)) {
      const held = fields.get(attribute);
      const excluded = typeof value === 'object' && value !== null;
      if (excluded ? held === value.anythingBut : held !== value)
        problems.push(
          `${name}'s record for ${what} holds ${attribute}=${JSON.stringify(held ?? null)}, expected ${excluded ? `anything but ${JSON.stringify(value.anythingBut)}` : JSON.stringify(value)}`,
        );
    }
  return problems;
};

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
  problems.push(...recordCountProblems(records, `node ${nodeId}`));
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
  return Object.entries(expected).flatMap(([nodeId, answers]) => {
    const records = nodeRecords(files, nodeId);
    const what = `node ${nodeId}`;
    return [
      ...recordCountProblems(records, what),
      ...fieldProblems(records, answers, what),
    ];
  });
}

const byText = (a, b) => String(a).localeCompare(String(b));

/**
 * What is wrong with the set of relationships the export holds: each format
 * must carry every id in `expectedIds` once and no other, so a relationship
 * the export (or the interview) made up, or a second copy of one, fails as
 * surely as one dropped.
 */
export function edgeSetProblems(files, expectedIds) {
  const held = { csv: [], graphml: [] };
  for (const { name, text } of files) {
    if (/\.csv$/i.test(name)) {
      const lines = text.split(/\r?\n/).filter((line) => line !== '');
      const header = splitCsvRow(lines[0] ?? '');
      const uuid = header.indexOf(ncUUIDProperty);
      if (uuid === -1 || !header.includes('networkCanvasSourceUUID')) continue;
      for (const line of lines.slice(1)) held.csv.push(splitCsvRow(line)[uuid]);
    } else if (/\.graphml$/i.test(name)) {
      const keyNames = graphmlKeyNames(text);
      for (const [, body] of text.matchAll(/<edge\b[^>]*>([\s\S]*?)<\/edge>/g))
        held.graphml.push(graphmlFields(body, keyNames).get(ncUUIDProperty));
    }
  }
  const expected = [...expectedIds].sort(byText);
  return Object.entries(held).flatMap(([format, ids]) =>
    JSON.stringify([...ids].sort(byText)) === JSON.stringify(expected)
      ? []
      : [
          `the exported ${format} files hold the relationships ${JSON.stringify([...ids].sort(byText))}, not ${JSON.stringify(expected)}`,
        ],
  );
}

/**
 * Whether each relationship reached its own exported records: one row of an
 * edge list CSV and one GraphML <edge>, found by the edge's id. `expected`
 * maps an edge id to what its records must hold, by exported name — the ends
 * as `networkCanvasSourceUUID` and `networkCanvasTargetUUID`, so a
 * relationship drawn between the wrong people fails, and each answer as the
 * node answers are (one true/false column per option of a categorical one).
 */
export function edgeAnswerProblems(files, expected) {
  return Object.entries(expected).flatMap(([edgeId, answers]) => {
    const records = entityRecords(files, edgeId, 'edge');
    const what = `edge ${edgeId}`;
    return [
      ...recordCountProblems(records, what),
      ...fieldProblems(records, answers, what),
    ];
  });
}

/**
 * Each interview's ego records, keyed by the session id the export gives it:
 * the ego CSV row carrying that session id, and the attributes of the GraphML
 * graph whose nc:sessionUUID is that id — the ego's own data, which the graph
 * holds outside every <node> and <edge>.
 */
function egoRecords(files) {
  const bySession = {};
  const record = (session, entry) => {
    (bySession[session] ??= []).push(entry);
  };
  for (const { name, text } of files) {
    if (/\.csv$/i.test(name)) {
      const lines = text.split(/\r?\n/).filter((line) => line !== '');
      const header = splitCsvRow(lines[0] ?? '');
      const session = header.indexOf(ncSessionProperty);
      if (session === -1) continue;
      for (const line of lines.slice(1)) {
        const cells = splitCsvRow(line);
        record(cells[session], {
          format: 'csv',
          name,
          fields: new Map(
            header.map((column, index) => [column, cells[index]]),
          ),
        });
      }
    } else if (/\.graphml$/i.test(name)) {
      const keyNames = graphmlKeyNames(text);
      for (const [graph, tag] of text.matchAll(
        /(<graph\b(?:[^>"]|"[^"]*")*>)[\s\S]*?<\/graph>/g,
      )) {
        const session = attributeOf(tag, 'nc:sessionUUID');
        if (session === undefined) continue;
        const own = graph
          .slice(tag.length)
          .replace(/<(node|edge)\b[^>]*\/>/g, '')
          .replace(/<(node|edge)\b[^>]*>[\s\S]*?<\/\1>/g, '');
        record(session, {
          format: 'graphml',
          name,
          fields: graphmlFields(own, keyNames),
        });
      }
    }
  }
  return bySession;
}

/**
 * Whether each interview's ego answers reached that interview's own ego
 * records. `expected` maps a session id to the ego attributes its records
 * must hold, by exported name. A search of the whole archive would pass an
 * answer recorded on another interview's ego, or anywhere else at all; this
 * holds each answer to the one ego CSV row and the one GraphML graph the
 * export gives that session, and reports a session either format leaves out
 * or records twice.
 */
export function egoAnswerProblems(files, expected) {
  const bySession = egoRecords(files);
  return Object.entries(expected).flatMap(([session, answers]) => {
    const records = bySession[session] ?? [];
    const what = `the ego of interview ${session}`;
    return [
      ...recordCountProblems(records, what),
      ...fieldProblems(records, answers, what),
    ];
  });
}
