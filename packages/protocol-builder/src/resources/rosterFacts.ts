import csv from 'csvtojson';

import { createMessageError } from '@codaco/app-i18n/messages';
import {
  entityAttributesProperty,
  VariableNameSchema,
  VariableValueSchema,
} from '@codaco/shared-consts';

import { resourceFailureMessages } from './resourceMessages.ts';

/**
 * The bytes a roster was read from, and what the file was called.
 *
 * Read from one module by every host that has to say whether a file can be
 * the roster a stage points at: the gateway Architect's editors call today,
 * and the protocol-builder contract's `resources.inspect`. A researcher whose
 * CSV a stage editor accepts is one whose CSV the host accepts.
 */
export type RosterContent = Readonly<{
  bytes: Uint8Array;
  contentType: string;
  /** The file the researcher picked; its extension decides the format. */
  source?: string;
}>;

export type RosterFacts = Readonly<{
  counts: Readonly<{ nodes: number; edges: number }>;
  variableNames: readonly string[];
}>;

/**
 * Why a file cannot be the roster a stage points at, in the researcher's
 * terms. Lower case and without a full stop, because every surface that shows
 * it puts it after a clause of its own.
 *
 * The string is an encoded message rather than English prose: it crosses the
 * port's string-only `ResourceGatewayFailure.message` on its way to the
 * editor, which decodes it in the reader's own language.
 */
export type RosterProblem = Readonly<{ unreadable: string }>;

/**
 * The refusal, with the specific fault named when there is one.
 *
 * `detail` is itself an encoded message, carried as a reference rather than
 * pasted in as text: a sentence assembled from two languages' worth of
 * fragments reads as neither, so the whole of it is resolved at once where it
 * is rendered.
 */
function unreadableRoster(detail?: string): RosterProblem {
  return Object.freeze({
    unreadable:
      detail === undefined
        ? createMessageError(resourceFailureMessages.rosterUnreadable)
        : createMessageError(resourceFailureMessages.rosterUnreadableDetail, {
            detail: { messageError: detail },
          }),
  });
}

/**
 * A file that parsed perfectly and still cannot be committed as a roster.
 *
 * Kept apart from {@link unreadableRoster} because it is a different thing to
 * tell a researcher: nothing is wrong with how the file is written, so saying
 * it "is not a readable network" would send them looking for a corruption that
 * is not there.
 */
function unusableRoster(reason: string): RosterProblem {
  return Object.freeze({ unreadable: reason });
}

/**
 * A roster with nothing in it: the mistake a spreadsheet makes when a filtered
 * or empty sheet is exported.
 *
 * Refused rather than described, because a stage pointing at it saves and
 * validates exactly like any other and then presents no participant at all
 * when the interview runs — and this is the last moment at which choosing a
 * different file is still what the researcher would do.
 */
const EMPTY_ROSTER = createMessageError(resourceFailureMessages.rosterEmpty);

/**
 * The attribute names a roster may carry, which are the variable names the
 * protocol will hold.
 *
 * {@link VariableNameSchema} is the rule the runtime and the protocol format
 * already apply — NMTOKEN-compatible, because variable names reach XML-based
 * exports — and it is used rather than restated so a name the protocol format
 * learns to accept is one this gateway learns to accept. A spreadsheet's own
 * headings routinely break it ("home address", "date of birth"), and a roster
 * that only fails at export time is one the researcher cannot connect to the
 * file they chose weeks earlier.
 */
function unusableAttributeName(
  names: readonly string[],
): RosterProblem | undefined {
  for (const name of names) {
    if (VariableNameSchema.safeParse(name).success) continue;
    return unusableRoster(
      createMessageError(resourceFailureMessages.rosterAttributeNameUnusable, {
        name,
      }),
    );
  }
  return undefined;
}

/**
 * The facts a researcher picks a roster on, read from the file the same way
 * Architect reads it: which format the resource is in is decided by its
 * filename, exactly as Architect's own `networkReader` switches on the
 * extension, and the media type answers only for a resource whose name says
 * nothing.
 */
export function readRosterFacts(
  content: RosterContent,
): Promise<RosterFacts | RosterProblem> {
  const text = new TextDecoder().decode(content.bytes);
  return isCsvRoster(content)
    ? parseCsvRoster(text)
    : Promise.resolve(parseJsonRoster(text));
}

function isCsvRoster(content: RosterContent): boolean {
  const source = content.source?.toLowerCase() ?? '';
  if (source.endsWith('.csv')) return true;
  if (source.endsWith('.json')) return false;
  return content.contentType.split(';')[0]?.trim().toLowerCase() === 'text/csv';
}

/**
 * A CSV roster is one node per row, its columns that node's attributes, and no
 * edges — Architect's own reading of the same file, through the same parser.
 * `checkColumn` comes with it: a row carrying more or fewer values than the
 * header names is content the researcher has to fix, not a row to silently
 * keep half of.
 *
 * `flatKeys` is what the interview runtime reads the same file with. Without
 * it the parser folds a column called `home.city` into a nested object, so
 * this would report a variable named `home` the roster does not have — and
 * give it a value no attribute may hold, refusing the very file the interview
 * loads without complaint.
 */
async function parseCsvRoster(
  text: string,
): Promise<RosterFacts | RosterProblem> {
  const converter = csv({ checkColumn: true, flatKeys: true });
  // A mismatched row is reported as an event and the row is dropped: the parse
  // still settles, with a roster quietly shorter than the file. Listening is
  // also what keeps the failure from surfacing as an unhandled stream error.
  let malformed = false;
  converter.on('error', () => {
    malformed = true;
  });

  let rows: unknown;
  try {
    rows = await converter.fromString(text);
  } catch {
    return unreadableRoster();
  }
  if (malformed || !Array.isArray(rows)) return unreadableRoster();
  const parsedRows: readonly unknown[] = rows;
  const attributes = parsedRows.filter(isAttributeRecord);
  if (attributes.length !== parsedRows.length) return unreadableRoster();
  for (const [index, row] of attributes.entries()) {
    // One-based, because it names a line of the researcher's own file.
    const unreadableValue = unreadableAttributeValue(row, {
      kind: 'row',
      position: index + 1,
    });
    if (unreadableValue !== undefined) return unreadableValue;
  }

  if (attributes.length === 0) return unusableRoster(EMPTY_ROSTER);
  const variableNames = attributeNames(attributes);
  const unusableName = unusableAttributeName(variableNames);
  if (unusableName !== undefined) return unusableName;

  return Object.freeze({
    counts: Object.freeze({ nodes: attributes.length, edges: 0 }),
    variableNames,
  });
}

/**
 * A JSON roster, read exactly as far as the interview runtime reads it.
 *
 * Every entry of `nodes` is checked, not just counted: `loadExternalData`'s
 * `parseExternalNode` throws on an entry that is not an object, on one whose
 * attributes are not an object, and on any attribute value its
 * `VariableValueSchema` rejects, so a roster carrying any of those is a file
 * the interview cannot load. Counting it as a readable node here is what lets
 * a protocol commit a field pointing at a roster that fails when it is used,
 * with a manifest entry that looks perfectly valid — so the entry is named
 * and the file is refused instead.
 */
function parseJsonRoster(text: string): RosterFacts | RosterProblem {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return unreadableRoster();
  }
  if (!isAttributeRecord(parsed)) return unreadableRoster();
  const nodes: readonly unknown[] | undefined = Array.isArray(parsed.nodes)
    ? parsed.nodes
    : undefined;
  const edges: readonly unknown[] = Array.isArray(parsed.edges)
    ? parsed.edges
    : [];
  if (nodes === undefined) return unreadableRoster();

  const nodeAttributes: Readonly<Record<string, unknown>>[] = [];
  for (const [index, node] of nodes.entries()) {
    // One-based, because it names a row of the researcher's own file.
    const position = index + 1;
    if (!isAttributeRecord(node)) {
      return unreadableRoster(
        createMessageError(resourceFailureMessages.rosterNodeNotObject, {
          position,
        }),
      );
    }
    const attributes: unknown = node[entityAttributesProperty];
    if (attributes === undefined) continue;
    if (!isAttributeRecord(attributes)) {
      return unreadableRoster(
        createMessageError(
          resourceFailureMessages.rosterNodeAttributesNotObject,
          { position },
        ),
      );
    }
    const unreadableValue = unreadableAttributeValue(attributes, {
      kind: 'node',
      position,
    });
    if (unreadableValue !== undefined) return unreadableValue;
    nodeAttributes.push(attributes);
  }

  if (nodes.length === 0 && edges.length === 0) {
    return unusableRoster(EMPTY_ROSTER);
  }
  const variableNames = attributeNames(nodeAttributes);
  const unusableName = unusableAttributeName(variableNames);
  if (unusableName !== undefined) return unusableName;

  return Object.freeze({
    counts: Object.freeze({ nodes: nodes.length, edges: edges.length }),
    variableNames,
  });
}

/**
 * The value check both roster formats are read through, because the interview
 * reads them through one: `loadExternalData`'s `parseExternalAttributes` runs
 * every attribute of a JSON node and of a CSV row through
 * {@link VariableValueSchema}, and throws on a value it rejects — a nested
 * object is the ordinary way a hand-edited roster gets one. The schema itself
 * is used rather than a check written to look like it, so a variable value the
 * protocol format learns to hold is one this gateway learns to accept.
 *
 * An absent value is passed over rather than refused, exactly as the runtime
 * passes over it: an empty cell is a value the roster does not carry, not a
 * value it carries wrongly.
 *
 * `entry` names the row in the researcher's own file, which with the attribute
 * name is the whole of what they have to go and fix. It picks between two
 * whole sentences rather than being dropped into one: "row" and "node" sit
 * inside a clause whose wording a translator has to be able to change.
 */
function unreadableAttributeValue(
  attributes: Readonly<Record<string, unknown>>,
  entry: RosterEntryPosition,
): RosterProblem | undefined {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    if (VariableValueSchema.safeParse(value).success) continue;
    return unreadableRoster(
      entry.kind === 'row'
        ? createMessageError(resourceFailureMessages.rosterValueUnusableInRow, {
            name,
            row: entry.position,
          })
        : createMessageError(
            resourceFailureMessages.rosterValueUnusableInNode,
            { name, position: entry.position },
          ),
    );
  }
  return undefined;
}

/** Which entry of the researcher's own file a roster problem is about. */
type RosterEntryPosition = Readonly<{
  kind: 'node' | 'row';
  /** One-based, because it names a line or entry the researcher can see. */
  position: number;
}>;

/**
 * Sorted rather than in the order the file happens to list them, because this
 * is what a summary shows a researcher comparing two similarly named rosters,
 * and a row that names its columns in a different order is the same roster.
 */
function attributeNames(
  attributes: readonly Readonly<Record<string, unknown>>[],
): readonly string[] {
  const names = new Set<string>();
  for (const record of attributes) {
    for (const name of Object.keys(record)) names.add(name);
  }
  return Object.freeze([...names].toSorted());
}

function isAttributeRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
