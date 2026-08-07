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

export type Command =
  | { op: 'set'; key: string; value: unknown }
  | { op: 'unset'; key: string }
  | { op: 'insertItem'; key: string; index: number; item: unknown }
  | { op: 'removeItem'; key: string; index: number }
  | { op: 'moveItem'; key: string; from: number; to: number };

export class ApplyError extends Error {}

function asList(doc: SectionDoc, key: string): unknown[] {
  const value = doc[key] ?? [];
  if (!Array.isArray(value)) {
    throw new ApplyError(`Field ${key} is not a list`);
  }
  return value;
}

/** Pure: returns a new document; never mutates the input. */
export function applyCommand(doc: SectionDoc, command: Command): SectionDoc {
  switch (command.op) {
    case 'set':
      return { ...doc, [command.key]: command.value };
    case 'unset': {
      const { [command.key]: _removed, ...rest } = doc;
      return rest;
    }
    case 'insertItem': {
      const list = [...asList(doc, command.key)];
      if (command.index < 0 || command.index > list.length) {
        throw new ApplyError(`insertItem index ${command.index} out of range`);
      }
      list.splice(command.index, 0, command.item);
      return { ...doc, [command.key]: list };
    }
    case 'removeItem': {
      const list = [...asList(doc, command.key)];
      if (command.index < 0 || command.index >= list.length) {
        throw new ApplyError(`removeItem index ${command.index} out of range`);
      }
      list.splice(command.index, 1);
      return { ...doc, [command.key]: list };
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
      return { ...doc, [command.key]: list };
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
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
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
