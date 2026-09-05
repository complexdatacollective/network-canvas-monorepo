// The shared, isomorphic apply engine — the module both the client (optimistic
// echo) and the server (authoritative commit) run. Per #1247, this is "the
// hidden protocol surface where drift would actually occur"; the golden-
// transcript tests guard it by hash equality.
//
// Hashing uses @noble/hashes rather than node:crypto so this module runs
// identically in the browser (where the client's optimistic echo lives) and
// in Node — isomorphism is this package's reason to exist.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type SectionDoc = Record<string, unknown>;

/**
 * Where in a section document a command applies.
 *
 * A string is a top-level key, exactly as it has always been. An array is a
 * path of object keys reaching a value NESTED inside the document — the list a
 * Family Pedigree keeps at `nodeConfig.form`, say — so that such a list can be
 * edited with `insertItem`/`removeItem`/`moveItem` rather than being replaced
 * wholesale, and a collaborator's client can replay one row's arrival onto a
 * list that has since changed.
 *
 * Two forms rather than one dotted string, because a dot is a legal character
 * in a document key: `"nodeConfig.form"` cannot say which of the two it means.
 * A consumer written before nested addressing would read it as a top-level key
 * of that name and write the list somewhere the document does not keep one,
 * without complaining — and commands are kept in the command log and replayed,
 * so that reading would outlive the release that made it. An array is a shape
 * such a consumer's input schema refuses outright, which is the behaviour a
 * command it cannot understand should have. A one-segment path is written as
 * the plain string for the same reason in reverse: everything the editors
 * already emit stays byte-identical on the wire and in the log.
 *
 * Segments are object keys only. An array index is deliberately unaddressable:
 * a position means something different the moment anything inserts or removes
 * a row above it, so a command addressed at one would be replayed onto whatever
 * row had moved into that slot.
 */
export type CommandTarget = string | readonly string[];

export type Command =
  | { op: 'set'; key: CommandTarget; value: unknown }
  | { op: 'unset'; key: CommandTarget }
  | { op: 'insertItem'; key: CommandTarget; index: number; item: unknown }
  | { op: 'removeItem'; key: CommandTarget; index: number }
  | { op: 'moveItem'; key: CommandTarget; from: number; to: number };

export class ApplyError extends Error {}

/**
 * Names a prototype rather than a property of the document. Writing through
 * one reaches every object in the process, so a path is refused rather than
 * followed.
 */
const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const isDocument = (value: unknown): value is SectionDoc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The target as a path, refusing one that addresses nothing reachable. */
export function targetPath(target: CommandTarget): readonly string[] {
  const path = typeof target === 'string' ? [target] : target;
  if (path.length === 0) {
    throw new ApplyError('A command must address a field');
  }
  for (const segment of path) {
    if (typeof segment !== 'string' || segment === '') {
      throw new ApplyError(`Invalid field path ${formatTarget(target)}`);
    }
    if (UNSAFE_SEGMENTS.has(segment)) {
      throw new ApplyError(`Field path ${formatTarget(target)} is not allowed`);
    }
  }
  return path;
}

/** The top-level key a command touches, whichever form it addresses it in. */
export function targetRoot(target: CommandTarget): string {
  return targetPath(target)[0]!;
}

/**
 * The address a command carries for this path.
 *
 * The one-segment case answers a plain string, which is what makes every
 * command an editor already emits identical to the one it emitted before
 * nested addressing existed. See `CommandTarget`.
 */
export function commandTarget(path: readonly string[]): CommandTarget {
  return path.length === 1 ? path[0]! : [...path];
}

export function formatTarget(target: CommandTarget): string {
  return typeof target === 'string' ? target : target.join('.');
}

/**
 * The object a path's next segment is read from or written into.
 *
 * A missing container is created on the way to a write, because writing to
 * `nodeConfig.form` in a document with no `nodeConfig` means the same thing as
 * writing to a top-level key that is not there yet. Anything else — a string, a
 * number, a LIST — is refused: replacing it would silently throw away whatever
 * the document actually holds there, and a list is the positional addressing
 * `CommandTarget` exists to rule out.
 */
function containerAt(
  parent: SectionDoc,
  segment: string,
  target: CommandTarget,
): SectionDoc {
  const existing = parent[segment];
  if (existing === undefined) return {};
  if (!isDocument(existing)) {
    throw new ApplyError(
      `Field ${formatTarget(target)} is not reachable: ${segment} is not an object`,
    );
  }
  return existing;
}

function readAt(doc: SectionDoc, target: CommandTarget): unknown {
  const path = targetPath(target);
  let cursor: SectionDoc = doc;
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment];
    if (next === undefined) return undefined;
    if (!isDocument(next)) {
      throw new ApplyError(
        `Field ${formatTarget(target)} is not reachable: ${segment} is not an object`,
      );
    }
    cursor = next;
  }
  return cursor[path.at(-1)!];
}

/** Pure: copies every container it passes through. */
function writeAt(
  doc: SectionDoc,
  target: CommandTarget,
  value: unknown,
): SectionDoc {
  const write = (parent: SectionDoc, path: readonly string[]): SectionDoc => {
    const [head, ...rest] = path;
    if (head === undefined) return parent;
    if (rest.length === 0) return { ...parent, [head]: value };
    return {
      ...parent,
      [head]: write(containerAt(parent, head, target), rest),
    };
  };
  return write(doc, targetPath(target));
}

/**
 * Pure: removes the path, and nothing else.
 *
 * A container the removal emptied is left in place. What an empty object means
 * is a question about the document's schema, which this engine does not have —
 * the editor that decides a capability is off says so by removing the container
 * itself.
 */
function removeAt(doc: SectionDoc, target: CommandTarget): SectionDoc {
  const remove = (parent: SectionDoc, path: readonly string[]): SectionDoc => {
    const [head, ...rest] = path;
    if (head === undefined) return parent;
    if (rest.length === 0) {
      const { [head]: _removed, ...remaining } = parent;
      return remaining;
    }
    // Nothing to remove, and creating the containers on the way to it would
    // add keys to a document that a removal was asked for.
    if (parent[head] === undefined) return parent;
    return {
      ...parent,
      [head]: remove(containerAt(parent, head, target), rest),
    };
  };
  return remove(doc, targetPath(target));
}

function asList(doc: SectionDoc, target: CommandTarget): unknown[] {
  const value = readAt(doc, target) ?? [];
  if (!Array.isArray(value)) {
    throw new ApplyError(`Field ${formatTarget(target)} is not a list`);
  }
  return value;
}

/** Pure: returns a new document; never mutates the input. */
export function applyCommand(doc: SectionDoc, command: Command): SectionDoc {
  switch (command.op) {
    case 'set':
      return writeAt(doc, command.key, command.value);
    case 'unset':
      return removeAt(doc, command.key);
    case 'insertItem': {
      const list = [...asList(doc, command.key)];
      if (command.index < 0 || command.index > list.length) {
        throw new ApplyError(`insertItem index ${command.index} out of range`);
      }
      list.splice(command.index, 0, command.item);
      return writeAt(doc, command.key, list);
    }
    case 'removeItem': {
      const list = [...asList(doc, command.key)];
      if (command.index < 0 || command.index >= list.length) {
        throw new ApplyError(`removeItem index ${command.index} out of range`);
      }
      list.splice(command.index, 1);
      return writeAt(doc, command.key, list);
    }
    case 'moveItem': {
      const list = [...asList(doc, command.key)];
      if (
        command.from < 0 ||
        command.from >= list.length ||
        command.to < 0 ||
        command.to >= list.length
      ) {
        throw new ApplyError(`moveItem out of range`);
      }
      const [item] = list.splice(command.from, 1);
      list.splice(command.to, 0, item);
      return writeAt(doc, command.key, list);
    }
  }
}

export function applyCommands(
  doc: SectionDoc,
  commands: Command[],
): SectionDoc {
  return commands.reduce(applyCommand, doc);
}

// Canonical serialization: recursively key-sorted JSON, so structurally equal
// documents always hash identically (the #1276 deterministic-ordering rule).
// Non-JSON values follow JSON.stringify semantics exactly — array elements
// JSON cannot represent (undefined, functions, symbols) serialize as null,
// and object properties holding them are dropped — so a document always
// hashes identically to the JSONB representation Postgres stores.
function canon(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    // Indexed, not `map`: map skips holes, so a sparse array would serialize
    // as if the holes were not there, while JSON (and therefore the JSONB the
    // row stores) renders every hole as null.
    const items: string[] = [];
    for (let i = 0; i < value.length; i++) {
      items.push(canon(value[i]) ?? 'null');
    }
    return `[${items.join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, canon(v)] as const)
      .filter(
        (entry): entry is readonly [string, string] => entry[1] !== undefined,
      )
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, c]) => `${JSON.stringify(k)}:${c}`).join(',')}}`;
  }
  // JSON.stringify returns undefined (not a string) for undefined, functions,
  // and symbols; the callers above substitute per JSON semantics.
  return JSON.stringify(value);
}

export function canonicalize(value: unknown): string {
  return canon(value) ?? 'null';
}

export function contentHash(doc: SectionDoc): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalize(doc))));
}

export function manifestHash(
  sectionHashes: Record<string, string>,
  parent: string | null,
): string {
  return bytesToHex(
    sha256(utf8ToBytes(canonicalize({ parent, sections: sectionHashes }))),
  );
}
