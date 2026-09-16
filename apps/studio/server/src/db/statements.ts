// Cutting a Postgres script into the single commands a prepared-statement
// protocol will accept.
//
// `@effect/sql-pg` has no simple-query path: every statement goes through
// Parse/Bind/Execute, and the extended protocol refuses a multi-command string
// outright — SQLSTATE 42601, "cannot insert multiple commands into a prepared
// statement". Everything Studio applies its schema from is a multi-command
// string: drizzle-kit's rendered DDL, the nineteen sidecars in src/db/schema.ts,
// pg-boss's construction plan, and the job grants in packages/studio-sync. The
// plan alone is ~17 KB of dollar-quoted plpgsql, so splitting on `;` would cut
// function bodies in half.
//
// Splitting happens at execution time only. The schema fingerprint is computed
// over the unsplit strings, so nothing here can move it.

/**
 * The tag of a dollar-quoted string follows the rules of an unquoted
 * identifier, except that it cannot contain a dollar sign — so `$` is excluded
 * here and included by `isNameCharacter` below, which asks a different
 * question.
 */
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

/** Whether a character could be part of the identifier ending at it. */
function isNameCharacter(character: string | undefined): boolean {
  return character === '$' || isTagCharacter(character);
}

/**
 * The index just past the opening delimiter of a dollar-quoted string starting
 * at `open`, or -1 when `open` is an ordinary `$` — a positional parameter
 * (`$1`, `$2::jsonb`) is the case that matters, and pg-boss's plan passes
 * those to its plpgsql functions.
 */
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
  // The closing delimiter must match the opening tag exactly, so a `$$` inside
  // a `$body$…$body$` body is body text rather than a terminator.
  const delimiter = script.slice(open, bodyStart);
  const close = script.indexOf(delimiter, bodyStart);
  return close === -1 ? script.length : close + delimiter.length;
}

/**
 * @param escapes the `E'…'` form, where a backslash escapes the next character
 *   (so `E'\''` holds one quote and does not end there). A plain `'…'` is read
 *   as `standard_conforming_strings = on`, which every supported server has
 *   defaulted to for a decade: a backslash there is an ordinary character, and
 *   `''` is the only way to write a quote. `U&'…'` needs no case of its own —
 *   its backslashes introduce code points rather than escaping a quote, and it
 *   doubles quotes like any standard string.
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

/** Stops on the newline rather than past it; the caller treats it as space. */
function scanLineComment(script: string, open: number): number {
  const end = script.indexOf('\n', open + 2);
  return end === -1 ? script.length : end;
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
 * Splits a Postgres script into single commands.
 *
 * Each command is returned as its own original bytes with the surrounding
 * whitespace trimmed and the terminating `;` dropped — comments inside a
 * command are kept rather than stripped, so a sidecar's plpgsql arrives with
 * the prose that explains it. A fragment holding nothing but whitespace and
 * comments is not a command and is dropped; a trailing command with no
 * terminator is returned like any other.
 *
 * A quote, dollar quote or block comment left open at the end of the input is
 * returned as part of the last command rather than raised: this splits input
 * that Postgres is about to parse anyway, and handing the malformed tail to
 * the server produces the syntax error a caller can act on, at the statement
 * that caused it, instead of a second error message from here.
 */
export function splitStatements(script: string): readonly string[] {
  const statements: string[] = [];
  let start = 0;
  let index = 0;
  /** Whether anything but whitespace and comments has been seen since `start`. */
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
      // `E'…'` only when the `E` is a token of its own: in `nameE'x'` the
      // lexer has already read an identifier, and the string is a plain one.
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

    // A dollar quote must be separated from a preceding identifier: in
    // `my$tbl$name` the `$` continues the identifier, and Postgres reads the
    // whole thing as one name rather than as `my` followed by a quote.
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
