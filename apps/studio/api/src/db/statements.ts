// `@effect/sql-pg` refuses a multi-command string (SQLSTATE 42601), and the
// schema scripts carry dollar-quoted plpgsql bodies, so splitting on `;` would
// cut a function in half.

/** A dollar-quote tag cannot contain `$`, unlike `isNameCharacter`. */
function isTagStart(character: string | undefined): boolean {
  if (character === undefined) return false;
  return (
    (character >= 'a' && character <= 'z') ||
    (character >= 'A' && character <= 'Z') ||
    character === '_' ||
    character.charCodeAt(0) > 127
  );
}

function isTagCharacter(character: string | undefined): boolean {
  if (character === undefined) return false;
  return isTagStart(character) || (character >= '0' && character <= '9');
}

function isNameCharacter(character: string | undefined): boolean {
  return character === '$' || isTagCharacter(character);
}

function dollarQuoteBodyStart(script: string, open: number): number {
  let index = open + 1;
  if (script[index] === '$') return index + 1;
  if (!isTagStart(script[index])) return -1;
  while (isTagCharacter(script[index])) index += 1;
  return script[index] === '$' ? index + 1 : -1;
}

function scanDollarQuoted(
  script: string,
  open: number,
  bodyStart: number,
): number {
  const delimiter = script.slice(open, bodyStart);
  const close = script.indexOf(delimiter, bodyStart);
  return close === -1 ? script.length : close + delimiter.length;
}

/**
 * A plain `'…'` is read as `standard_conforming_strings = on`, where a
 * backslash is an ordinary character.
 */
function scanSingleQuoted(
  script: string,
  open: number,
  escapes: boolean,
): number {
  let index = open + 1;
  while (index < script.length) {
    const character = script[index];
    if (escapes && character === '\\') {
      index += 2;
      continue;
    }
    if (character === "'") {
      if (script[index + 1] === "'") {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return script.length;
}

function scanDoubleQuoted(script: string, open: number): number {
  let index = open + 1;
  while (index < script.length) {
    if (script[index] === '"') {
      if (script[index + 1] === '"') {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return script.length;
}

/** Postgres ends a `--` comment at a carriage return as well as a newline. */
function scanLineComment(script: string, open: number): number {
  let index = open + 2;
  while (
    index < script.length &&
    script[index] !== '\n' &&
    script[index] !== '\r'
  ) {
    index += 1;
  }
  return index;
}

/** Postgres block comments nest: an inner opener needs its own closer. */
function scanBlockComment(script: string, open: number): number {
  let depth = 1;
  let index = open + 2;
  while (index < script.length) {
    if (script[index] === '/' && script[index + 1] === '*') {
      depth += 1;
      index += 2;
      continue;
    }
    if (script[index] === '*' && script[index + 1] === '/') {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
      continue;
    }
    index += 1;
  }
  return script.length;
}

function isWhitespace(character: string): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\n' ||
    character === '\r' ||
    character === '\f' ||
    character === '\v'
  );
}

/**
 * An unterminated quote, dollar quote or block comment is returned as part of
 * the last command rather than raised, so the server reports the syntax error.
 */
export function splitStatements(script: string): readonly string[] {
  const statements: string[] = [];
  let start = 0;
  let index = 0;
  let hasCommand = false;

  const flush = (end: number) => {
    if (hasCommand) statements.push(script.slice(start, end).trim());
    hasCommand = false;
  };

  while (index < script.length) {
    const character = script[index]!;

    if (character === ';') {
      flush(index);
      index += 1;
      start = index;
      continue;
    }

    if (character === '-' && script[index + 1] === '-') {
      index = scanLineComment(script, index);
      continue;
    }

    if (character === '/' && script[index + 1] === '*') {
      index = scanBlockComment(script, index);
      continue;
    }

    if (character === "'") {
      const previous = script[index - 1];
      const escapes =
        (previous === 'E' || previous === 'e') &&
        !isNameCharacter(script[index - 2]);
      hasCommand = true;
      index = scanSingleQuoted(script, index, escapes);
      continue;
    }

    if (character === '"') {
      hasCommand = true;
      index = scanDoubleQuoted(script, index);
      continue;
    }

    if (character === '$' && !isNameCharacter(script[index - 1])) {
      const bodyStart = dollarQuoteBodyStart(script, index);
      if (bodyStart !== -1) {
        hasCommand = true;
        index = scanDollarQuoted(script, index, bodyStart);
        continue;
      }
    }

    if (!isWhitespace(character)) hasCommand = true;
    index += 1;
  }

  flush(script.length);
  return statements;
}

/**
 * What Postgres reads as SQL syntax in `statement`: every comment and every
 * quoted span — a string literal, a quoted identifier, a dollar-quoted body —
 * becomes one space, so a keyword can be searched for without matching the
 * same word inside a value, a name or a function body. Read by the same
 * scanners as `splitStatements`, so the two never disagree about where a
 * quote or a comment ends.
 */
export function executableText(statement: string): string {
  let text = '';
  let index = 0;
  while (index < statement.length) {
    const character = statement[index]!;
    let end = -1;
    if (character === '-' && statement[index + 1] === '-') {
      end = scanLineComment(statement, index);
    } else if (character === '/' && statement[index + 1] === '*') {
      end = scanBlockComment(statement, index);
    } else if (character === "'") {
      const previous = statement[index - 1];
      const escapes =
        (previous === 'E' || previous === 'e') &&
        !isNameCharacter(statement[index - 2]);
      end = scanSingleQuoted(statement, index, escapes);
    } else if (character === '"') {
      end = scanDoubleQuoted(statement, index);
    } else if (character === '$' && !isNameCharacter(statement[index - 1])) {
      const bodyStart = dollarQuoteBodyStart(statement, index);
      if (bodyStart !== -1) end = scanDollarQuoted(statement, index, bodyStart);
    }
    if (end === -1) {
      text += character;
      index += 1;
    } else {
      text += ' ';
      index = end;
    }
  }
  return text;
}
