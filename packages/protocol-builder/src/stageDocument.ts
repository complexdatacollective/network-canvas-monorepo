import { v4 as uuid } from 'uuid';

import {
  isExclusiveVariantContainer,
  type StageType,
} from '@codaco/protocol-validation';
import {
  canonicalize,
  commandTarget,
  type Command,
  type SectionDoc,
} from '@codaco/studio-sync/apply';

import { isStageType } from './stage-types.ts';

/** Identity the stage's section owns; never a form field. */
export type StageIdentity = Readonly<{ id: string; type: StageType }>;

/** A stage section document without its identity: what the form holds. */
export type StageFormDraft = Readonly<SectionDoc>;

/**
 * A stage being CREATED rather than opened.
 *
 * Present only while the interview does not contain the stage yet, which is
 * the one fact several parts of an editor need and none can work out for
 * itself: a new stage is the only one whose name may be proposed, and the only
 * one whose place among the others is not in the stage order. `position` is
 * where the host will insert it, counting from zero.
 */
export type StageCreation = Readonly<{ position: number }>;

class StageIdentityCommandError extends Error {
  readonly field: 'id' | 'type';

  constructor(field: 'id' | 'type') {
    super(`the stage's ${field} is not a form field`);
    this.field = field;
    this.name = 'StageIdentityCommandError';
  }
}

export function createStageIdentity(
  type: StageType,
  createId: () => string = () => uuid({}),
): StageIdentity {
  const id = createId();
  if (id === '') throw new Error('stage identity must be non-empty');
  return Object.freeze({ id, type });
}

export function stageDraftFromDocument(document: SectionDoc): Readonly<{
  identity: StageIdentity;
  fields: StageFormDraft;
}> {
  const { id, type, ...fields } = document;
  if (typeof id !== 'string' || id === '' || !isStageType(type)) {
    throw new Error('stage document has no valid section-owned identity');
  }
  return Object.freeze({
    identity: Object.freeze({ id, type }),
    fields: Object.freeze(structuredClone(fields)),
  });
}

export function stageDocument(
  identity: StageIdentity,
  fields: StageFormDraft,
): SectionDoc {
  assertNoIdentityFields(fields);
  return { id: identity.id, type: identity.type, ...structuredClone(fields) };
}

function assertNoIdentityFields(fields: StageFormDraft): void {
  if (Object.hasOwn(fields, 'id')) throw new StageIdentityCommandError('id');
  if (Object.hasOwn(fields, 'type')) {
    throw new StageIdentityCommandError('type');
  }
}

/**
 * How deep a command may address.
 *
 * A bound rather than none, because the diff walks a document a researcher's
 * own values shape: a deeply nested value would otherwise make it recurse as
 * far as that value goes. Past this depth the difference is said as one `set`
 * of the whole container, which is always a correct command and never a
 * deeper walk.
 */
const MAX_COMMAND_PATH_SEGMENTS = 16;

const isDictionary = (value: unknown): value is SectionDoc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a container the draft is creating is diffed against. */
const EMPTY_CONTAINER: SectionDoc = Object.freeze({});

/**
 * The commands that turn one draft into another.
 *
 * Addressed at the deepest place the difference actually is, so a change to one
 * member of a nested object leaves a sibling nobody touched alone: writing
 * `nodeConfig` whole to record a new `nodeConfig.type` would put back whatever
 * else the draft happens to be carrying under it.
 *
 * Two shapes stop the descent. A container the schema allows only ONE shape of
 * travels whole — a sociogram's `background` is an image or a number of
 * concentric circles and never both, and a `set` of `background.image` beside
 * a leftover `background.circles` is a draft the schema refuses. And a
 * container the draft REMOVED is one `unset`, which takes what was inside it:
 * switching a capability off is a decision about the capability rather than
 * about the fields configured under it.
 */
export function commandsFromDraftChange(
  previous: StageFormDraft,
  next: StageFormDraft,
): Command[] {
  assertNoIdentityFields(previous);
  assertNoIdentityFields(next);
  const commands: Command[] = [];
  collectDraftCommands([], previous, next, commands);
  return commands;
}

function collectDraftCommands(
  path: readonly string[],
  previous: SectionDoc,
  next: SectionDoc,
  commands: Command[],
): void {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  for (const key of [...keys].toSorted()) {
    const here = [...path, key];
    const before = previous[key];
    const after = next[key];
    if (after === undefined) {
      if (Object.hasOwn(previous, key) && before !== undefined) {
        commands.push({ op: 'unset', key: commandTarget(here) });
      }
      continue;
    }
    if (
      Object.hasOwn(previous, key) &&
      canonicalize(before) === canonicalize(after)
    ) {
      continue;
    }
    const container = isDictionary(before)
      ? before
      : before === undefined
        ? EMPTY_CONTAINER
        : undefined;
    if (
      container !== undefined &&
      isDictionary(after) &&
      here.length < MAX_COMMAND_PATH_SEGMENTS &&
      !isExclusiveVariantContainer(here)
    ) {
      const said = commands.length;
      collectDraftCommands(here, container, after, commands);
      // A container the draft created with nothing inside it to say — `{}`, or
      // one holding only undefined members — is a difference all the same, and
      // the container itself is the only place left to say it.
      if (commands.length > said || container !== EMPTY_CONTAINER) continue;
    }
    commands.push({
      op: 'set',
      key: commandTarget(here),
      value: structuredClone(after),
    });
  }
}
