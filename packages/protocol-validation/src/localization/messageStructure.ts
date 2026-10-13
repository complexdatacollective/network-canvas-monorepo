import {
  type MessageFormatElement,
  parse,
  TYPE,
} from '@formatjs/icu-messageformat-parser';

/**
 * A message as an editor holds it: runs of text, the values it shows, and
 * switches that choose a version of the text by a value. Text is held as the
 * reader sees it, without ICU quoting; `printMessageStructure` adds the
 * quoting back.
 */
export type MessageNode =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'argument'; name: string }>
  /** `#` inside a plural: the number the plural is on. */
  | Readonly<{ kind: 'count' }>
  | MessageSwitch;

export type MessageSwitch = Readonly<{
  kind: 'switch';
  argument: string;
  type: 'select' | 'plural';
  /** A plural's offset, which `#` shows the number less. */
  offset?: number;
  /** In the message's own order; `other` is always among them. */
  versions: readonly MessageVersion[];
}>;

export type MessageVersion = Readonly<{
  /** A select case, a plural category, or an exact number such as `=0`. */
  key: string;
  nodes: readonly MessageNode[];
}>;

/** What a message holds that an editor cannot show as text and switches. */
export type MessageStructureProblem = Readonly<{
  kind: 'unreadable' | 'unsupported';
  /** The value the unsupported syntax is on, where there is one. */
  argument?: string;
}>;

const PARSE_OPTIONS = { ignoreTag: true };

const nodesOf = (
  elements: readonly MessageFormatElement[],
): MessageNode[] | MessageStructureProblem => {
  const nodes: MessageNode[] = [];
  const pushText = (text: string) => {
    const last = nodes.at(-1);
    if (last?.kind === 'text') {
      nodes[nodes.length - 1] = { kind: 'text', text: last.text + text };
    } else if (text !== '') {
      nodes.push({ kind: 'text', text });
    }
  };

  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
        pushText(element.value);
        break;
      case TYPE.argument:
        nodes.push({ kind: 'argument', name: element.value });
        break;
      case TYPE.pound:
        nodes.push({ kind: 'count' });
        break;
      case TYPE.select:
      case TYPE.plural: {
        if (element.type === TYPE.plural && element.pluralType !== 'cardinal') {
          return { kind: 'unsupported', argument: element.value };
        }
        const versions: MessageVersion[] = [];
        for (const [key, option] of Object.entries(element.options)) {
          const inner = nodesOf(option.value);
          if (!Array.isArray(inner)) return inner;
          versions.push({ key, nodes: inner });
        }
        nodes.push({
          kind: 'switch',
          argument: element.value,
          type: element.type === TYPE.select ? 'select' : 'plural',
          ...(element.type === TYPE.plural &&
            element.offset !== 0 && { offset: element.offset }),
          versions,
        });
        break;
      }
      default:
        // Number, date and time formats, and tags, which protocol text never
        // parses (tags stay text).
        return {
          kind: 'unsupported',
          ...('value' in element &&
            typeof element.value === 'string' && { argument: element.value }),
        };
    }
  }
  return nodes;
};

/**
 * A message's text, values and switches, or what stops an editor showing it:
 * a message that is not valid ICU, or one that uses syntax other than
 * arguments, `select` and cardinal `plural` (a number or date format, an
 * ordinal plural).
 */
export const messageStructure = (
  message: string,
): Readonly<{ nodes: readonly MessageNode[] }> | MessageStructureProblem => {
  let elements: MessageFormatElement[];
  try {
    elements = parse(message, PARSE_OPTIONS);
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: 'unreadable' };
    throw error;
  }
  const nodes = nodesOf(elements);
  return Array.isArray(nodes) ? { nodes } : nodes;
};

const isSpecial = (char: string, inPlural: boolean) =>
  char === '{' || char === '}' || (inPlural && char === '#');

/**
 * Text as ICU reads it literally. A run of braces (and, inside a plural, `#`)
 * is quoted as one, since quoting each separately would put a closing and an
 * opening apostrophe side by side, which ICU reads as an apostrophe. Outside a
 * run an apostrophe is doubled only where ICU would start a quote with it.
 */
const escapeText = (
  text: string,
  inPlural: boolean,
  /** What the message prints next, which an apostrophe at the end meets. */
  following = '',
): string => {
  let message = '';
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    if (isSpecial(char, inPlural)) {
      message += "'";
      while (index < text.length) {
        const runChar = text.charAt(index);
        if (runChar === "'") message += "''";
        else if (isSpecial(runChar, inPlural)) message += runChar;
        else break;
        index += 1;
      }
      message += "'";
      continue;
    }
    if (char === "'") {
      const next = index + 1 < text.length ? text.charAt(index + 1) : following;
      const startsQuote =
        next === "'" ||
        next === '<' ||
        next === '>' ||
        isSpecial(next, inPlural);
      message += startsQuote ? "''" : "'";
    } else {
      message += char;
    }
    index += 1;
  }
  return message;
};

const printNodes = (
  nodes: readonly MessageNode[],
  inPlural: boolean,
  /** What follows the nodes: the brace closing a version, or nothing. */
  end: string,
): string => {
  let message = '';
  for (const [index, node] of nodes.entries()) {
    switch (node.kind) {
      case 'text': {
        const next = nodes[index + 1];
        const following =
          next === undefined
            ? end
            : next.kind === 'count'
              ? inPlural
                ? '#'
                : "'"
              : next.kind === 'text'
                ? next.text.charAt(0)
                : '{';
        message += escapeText(node.text, inPlural, following);
        break;
      }
      case 'argument':
        message += `{${node.name}}`;
        break;
      case 'count':
        // Outside a plural `#` is only text.
        message += inPlural ? '#' : escapeText('#', false);
        break;
      case 'switch': {
        const plural = node.type === 'plural';
        const offset =
          plural && node.offset !== undefined && node.offset !== 0
            ? ` offset:${node.offset}`
            : '';
        const arms = node.versions
          .map(
            (version) =>
              `${version.key} {${printNodes(version.nodes, plural || inPlural, '}')}}`,
          )
          .join(' ');
        message += `{${node.argument}, ${node.type},${offset} ${arms}}`;
        break;
      }
    }
  }
  return message;
};

/** The message `nodes` describe, with its text quoted for ICU. */
export const printMessageStructure = (nodes: readonly MessageNode[]): string =>
  printNodes(nodes, false, '');
