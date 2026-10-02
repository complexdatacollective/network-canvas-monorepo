import {
  entityAttributesProperty,
  hasXmlIllegalCharacters,
} from '@codaco/shared-consts';

import { readRosterCsv } from './readRosterCsv.ts';

/*
 * A roster's column names become variable names and its cells become the
 * values an interview starts with, so both reach every export. GraphML is XML,
 * and XML 1.0 cannot hold some characters at all: the exporter would have to
 * drop them from the researcher's data. A roster holding one is refused when it
 * is imported instead, while the researcher still has the file open to fix.
 */

export type RosterFormat = 'csv' | 'json';

/**
 * Where an unsupported character is, in terms the researcher can find in their
 * own file. `character` is the code point written as `U+0007`. Rows and lines
 * count from 1, and a CSV header is row 1. Nodes count from 1 in the order the
 * file lists them.
 */
export type RosterCharacterProblem = Readonly<
  | { kind: 'columnName'; column: number; character: string }
  | { kind: 'cell'; row: number; column: string; character: string }
  | { kind: 'attributeName'; node: number; character: string }
  | {
      kind: 'attributeValue';
      node: number;
      attribute: string;
      character: string;
    }
  | { kind: 'line'; line: number; character: string }
>;

export type RosterCharacterReport = Readonly<{
  /** The first problems found, in file order, at most {@link MAX_PROBLEMS}. */
  problems: readonly RosterCharacterProblem[];
  /** How many problems the file holds in all. */
  total: number;
}>;

const MAX_PROBLEMS = 100;

const codePointLabel = (character: string) =>
  `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

const firstIllegalCharacter = (value: string): string | undefined => {
  if (!hasXmlIllegalCharacters(value)) return undefined;
  for (const character of value) {
    if (hasXmlIllegalCharacters(character)) return codePointLabel(character);
  }
  return undefined;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A JSON roster value may be a list or an object (a categorical answer, a
// layout position), and every string inside it is kept.
const firstIllegalCharacterIn = (value: unknown): string | undefined => {
  if (typeof value === 'string') return firstIllegalCharacter(value);
  const nested: readonly unknown[] = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.entries(value).flat()
      : [];
  for (const item of nested) {
    const character = firstIllegalCharacterIn(item);
    if (character !== undefined) return character;
  }
  return undefined;
};

const csvProblems = async (text: string): Promise<RosterCharacterProblem[]> => {
  const { columns, rows } = await readRosterCsv(text);
  const problems: RosterCharacterProblem[] = [];
  for (const [index, name] of columns.entries()) {
    const character = firstIllegalCharacter(name);
    if (character !== undefined) {
      problems.push({ kind: 'columnName', column: index + 1, character });
    }
  }
  for (const { row, values } of rows) {
    for (const [column, value] of Object.entries(values)) {
      const character = firstIllegalCharacterIn(value);
      if (character !== undefined) {
        problems.push({ kind: 'cell', row, column, character });
      }
    }
  }
  return problems;
};

// Only node attributes are checked, because they are all an interview reads
// from a JSON roster.
const jsonProblems = (text: string): RosterCharacterProblem[] => {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !Array.isArray(parsed.nodes)) return [];
  const nodes: readonly unknown[] = parsed.nodes;

  const problems: RosterCharacterProblem[] = [];
  for (const [index, entry] of nodes.entries()) {
    const node = index + 1;
    const attributes = isRecord(entry)
      ? entry[entityAttributesProperty]
      : undefined;
    if (!isRecord(attributes)) continue;
    for (const [attribute, value] of Object.entries(attributes)) {
      const nameCharacter = firstIllegalCharacter(attribute);
      if (nameCharacter !== undefined) {
        problems.push({
          kind: 'attributeName',
          node,
          character: nameCharacter,
        });
        continue;
      }
      const character = firstIllegalCharacterIn(value);
      if (character !== undefined) {
        problems.push({ kind: 'attributeValue', node, attribute, character });
      }
    }
  }
  return problems;
};

const lineProblems = (text: string): RosterCharacterProblem[] =>
  text.split(/\r\n|\r|\n/).flatMap((content, index) => {
    const character = firstIllegalCharacter(content);
    return character === undefined
      ? []
      : [{ kind: 'line' as const, line: index + 1, character }];
  });

const parsedProblems = async (
  text: string,
  format: RosterFormat,
): Promise<RosterCharacterProblem[]> => {
  try {
    return format === 'csv' ? await csvProblems(text) : jsonProblems(text);
  } catch {
    // A file that cannot be parsed is refused for that by its own check; the
    // raw text below still says whether it holds a character to remove.
    return [];
  }
};

/**
 * The characters in a roster that an XML export could not hold, wherever an
 * interview would read them from.
 *
 * The file is read as the interview reads it, so a problem is placed by row and
 * column, or by node and attribute. The raw text is scanned as well, and its
 * problems are placed by line when the parsed file has none: a CSV parser trims
 * some control characters from the edge of a cell, and one in a JSON file
 * usually stops it parsing at all. Tab, line feed and carriage return are
 * allowed everywhere, including inside a quoted cell.
 */
export const findRosterCharacterProblems = async (
  text: string,
  format: RosterFormat,
): Promise<RosterCharacterReport> => {
  const parsed = await parsedProblems(text, format);
  const problems = parsed.length > 0 ? parsed : lineProblems(text);
  return {
    problems: problems.slice(0, MAX_PROBLEMS),
    total: problems.length,
  };
};
