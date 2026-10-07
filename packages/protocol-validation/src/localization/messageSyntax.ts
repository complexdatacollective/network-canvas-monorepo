import {
  type MessageFormatElement,
  parse,
  type ParserOptions,
  TYPE,
} from '@formatjs/icu-messageformat-parser';

// Tags stay literal text: markdown fields legitimately contain `<br>` and
// similar, and the runtime formats with the same option.
const PARSE_OPTIONS: ParserOptions = { ignoreTag: true };

const isBrace = (char: string | undefined) => char === '{' || char === '}';

// An apostrophe only starts ICU quote syntax when it precedes one of these.
const QUOTE_TRIGGERS = new Set(["'", '{', '}', '<', '>']);

/**
 * Converts plain text into an ICU MessageFormat message whose only element is
 * that text. `messageText(escapeMessageText(text)) === text` for every string.
 *
 * Braces are wrapped in a quoted run (`{` → `'{'`); a run absorbs adjacent
 * braces and apostrophes, because quoting each brace separately would place a
 * closing and opening apostrophe side by side, which ICU reads as an escaped
 * apostrophe. Outside a run an apostrophe is doubled only where ICU would read
 * it as quote syntax, so "Don't" is unchanged.
 */
export const escapeMessageText = (text: string): string => {
  let message = '';
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (isBrace(char)) {
      message += "'";
      while (index < text.length) {
        const runChar = text.charAt(index);
        if (runChar === "'") {
          message += "''";
        } else if (isBrace(runChar)) {
          message += runChar;
        } else {
          break;
        }
        index += 1;
      }
      message += "'";
      continue;
    }

    if (char === "'") {
      const next = text.charAt(index + 1);
      message += QUOTE_TRIGGERS.has(next) ? "''" : "'";
    } else {
      message += char;
    }
    index += 1;
  }

  return message;
};

const parseMessage = (message: string): MessageFormatElement[] | undefined => {
  try {
    return parse(message, PARSE_OPTIONS);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
};

const literalText = (
  elements: readonly MessageFormatElement[],
): string | undefined => {
  let text = '';
  for (const element of elements) {
    if (element.type !== TYPE.literal) return undefined;
    text += element.value;
  }
  return text;
};

/**
 * Returns the plain text of an ICU message made only of literal text.
 *
 * A message that does not parse, or that contains placeholders or formatting,
 * is returned unchanged so an editor can still show what the protocol holds.
 * Schema validation rejects such messages.
 */
export const messageText = (message: string): string => {
  const elements = parseMessage(message);
  if (!elements) return message;
  return literalText(elements) ?? message;
};

/**
 * Describes why a localized string is not a literal-only ICU message, or
 * returns undefined when it is valid.
 */
export const findMessageSyntaxProblem = (
  message: string,
): string | undefined => {
  let elements: MessageFormatElement[];
  try {
    elements = parse(message, PARSE_OPTIONS);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return `Text is not valid message syntax (${error.message}).`;
  }

  if (literalText(elements) === undefined) {
    return 'Text cannot contain placeholders or formatting such as "{name}", plural or select.';
  }

  return undefined;
};
