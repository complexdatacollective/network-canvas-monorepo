// What a Fresco export has to carry for the schema 9 interview walk.
//
// Pure and free of Playwright, so each oracle is exercised on synthetic files
// in `scripts/release-test/fresco-release-test-lane-contracts.test.mjs` and
// shown failing there on files that break the behaviour it guards. The input
// is `readInterviewExport(...).files`: one `{ name, text }` per data entry.
import {
  ncFinishOutcomeProperty,
  ncSessionProperty,
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
 * Where each exported interview ended, as each format records it, keyed by
 * the session id the export gives the interview.
 *
 * `csv` reads every ego CSV that has the finish outcome column (an empty cell
 * is recorded as ''); `graphml` reads every graph's nc:finishOutcome
 * (recorded as '' when the graph has none — GraphML leaves the attribute out
 * when there is no outcome).
 */
export function finishOutcomesByFormat(files) {
  const csv = {};
  const graphml = {};
  for (const { name, text } of files) {
    if (/\.csv$/i.test(name)) {
      const lines = text.split(/\r?\n/).filter((line) => line !== '');
      const header = splitCsvRow(lines[0] ?? '');
      const outcome = header.indexOf(ncFinishOutcomeProperty);
      const session = header.indexOf(ncSessionProperty);
      if (outcome === -1 || session === -1) continue;
      for (const line of lines.slice(1)) {
        const cells = splitCsvRow(line);
        csv[cells[session]] = cells[outcome] ?? '';
      }
    } else if (/\.graphml$/i.test(name)) {
      for (const tag of text.match(GRAPH_START_TAG) ?? []) {
        const session = attributeOf(tag, 'nc:sessionUUID');
        if (session !== undefined)
          graphml[session] = attributeOf(tag, 'nc:finishOutcome') ?? '';
      }
    }
  }
  return { csv, graphml };
}

/**
 * Compares the outcomes an export records with the ones expected, per
 * interview and per format. Returns the problems; an empty list is a pass.
 * Both formats must record every expected interview: an interview missing
 * from a format is a problem, never a pass by omission.
 */
export function finishOutcomeProblems(files, expected) {
  const found = finishOutcomesByFormat(files);
  const problems = [];
  for (const [format, outcomes] of Object.entries(found)) {
    for (const [session, outcome] of Object.entries(expected)) {
      if (!Object.hasOwn(outcomes, session))
        problems.push(`${format} has no row for interview ${session}`);
      else if (outcomes[session] !== outcome)
        problems.push(
          `${format} records interview ${session} as "${outcomes[session]}", expected "${outcome}"`,
        );
    }
  }
  return problems;
}

/** The placeholder the exporters write in place of an encrypted value. */
export const ENCRYPTED_PLACEHOLDER = 'ENCRYPTED';

/**
 * Whether an encrypted answer stayed out of the export: no file may hold the
 * plaintext, and the placeholder has to be there — an export that merely
 * lacks the attribute (or the person) would otherwise pass as well as one
 * that protected it.
 */
export function encryptedValueProblems(files, plaintext) {
  const problems = files
    .filter(({ text }) => text.includes(plaintext))
    .map(({ name }) => `${name} holds "${plaintext}" in plain text`);
  if (!files.some(({ text }) => text.includes(ENCRYPTED_PLACEHOLDER)))
    problems.push(
      `no exported file holds the ${ENCRYPTED_PLACEHOLDER} placeholder, so the encrypted attribute was not exported at all`,
    );
  return problems;
}
