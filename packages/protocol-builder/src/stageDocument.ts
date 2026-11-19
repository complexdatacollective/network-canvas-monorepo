import {
  stageWithoutSuppliedText,
  stageWithSuppliedText,
} from '@codaco/interview/supplied-wording';
import {
  createProtocolObjectId,
  isExclusiveVariantContainer,
  type LocalizationDeclaration,
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
 * Where the stage form holds the words every stage of its kind shares, as
 * the researcher has them for the entries the open stage uses.
 *
 * A change to them made from a stage editor is part of the stage's draft:
 * held here, written with the stage when it is saved, and thrown away with the
 * draft (see `pendingSharedWording`). A stage holds no key of this name, so
 * `stageDocument` leaves it out of the stage itself.
 */
export const SHARED_WORDING_PATH = 'interfaceText';

/**
 * Where the stage form holds the codebook changes made while the stage is
 * open (see `StagedCodebookStore`).
 *
 * Held in the stage's own form so that they are part of its draft in every
 * way a host can see: they make the form dirty, they are thrown away with it,
 * and the form's save writes them with the stage. Parked rather than mounted —
 * no control is registered here — and never part of the stage document: a
 * stage holds no key of this name, `stageFieldsOf` leaves it out, and
 * `dormantFieldsOf` does not replay it over the draft.
 */
export const STAGED_CODEBOOK_PATH = 'stagedCodebook';

/**
 * Whether a form field whose path starts with `root` holds the stage's
 * codebook changes rather than any part of the stage. Every reading of the
 * form's fields AS the stage — what a save replays, what a rewrite or a reset
 * of the stage reaches — passes over it: those are about the stage document,
 * and the codebook changes are kept, saved and discarded by their own store
 * (see `StagedCodebookStore`).
 */
export const holdsStagedCodebook = (root: unknown): boolean =>
  root === STAGED_CODEBOOK_PATH;

/**
 * The stage's own fields: the draft without the shared words or codebook
 * changes held with it.
 */
export function stageFieldsOf(draft: StageFormDraft): StageFormDraft {
  const {
    [SHARED_WORDING_PATH]: _shared,
    [STAGED_CODEBOOK_PATH]: _codebook,
    ...fields
  } = draft;
  return fields;
}

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
  createId: () => string = createProtocolObjectId,
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

/**
 * The stage an editor saves: its identity over what the form holds, with only
 * the wording of the researcher's own for the settings Network Canvas words.
 *
 * The form holds Network Canvas's wording for each such setting the stage
 * shows, so its field has words to start from (see `stageFieldsForEditing`).
 * None of that is the stage's to store: the interview shows Network Canvas's
 * wording for whatever a stage does not hold. So a translation that reads
 * exactly as Network Canvas words it is left out, a setting left with none is
 * left out with it, and so is a setting shown only under a configuration that
 * is now off (see `stageWithoutSuppliedText`). The rule is kept here, so
 * every save path and every reading of the draft as a stage agrees on it.
 *
 * The shared words and codebook changes the form holds beside the stage are
 * not the stage's (see `SHARED_WORDING_PATH`, `STAGED_CODEBOOK_PATH`), so they
 * are left out.
 */
export function stageDocument(
  identity: StageIdentity,
  fields: StageFormDraft,
): SectionDoc {
  assertNoIdentityFields(fields);
  return stageWithoutSuppliedText({
    id: identity.id,
    type: identity.type,
    ...structuredClone(stageFieldsOf(fields)),
  });
}

/**
 * What a stage form holds for `fields`: the stage's own fields, with Network
 * Canvas's wording for each setting it words that the stage shows, in every
 * protocol language the stage has no translation of its own in (see
 * `stageWithSuppliedText`). A stage being opened, a new one and one just
 * saved are all held this way, so a wording field starts with the words a
 * participant would read and the form never counts them as a change.
 */
export function stageFieldsForEditing<Fields extends StageFormDraft>(
  type: StageType,
  fields: Fields,
  localization: LocalizationDeclaration,
): Fields {
  const { type: _type, ...filled } = stageWithSuppliedText(
    { ...fields, type },
    localization,
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `fields` with its optional wording settings filled in, so still Fields
  return filled as unknown as Fields;
}

/**
 * The form's draft once the stage is saved: the stage as `stageDocument`
 * stored it, held as a form holds one (`stageFieldsForEditing`), so the draft
 * the editor goes on editing is the stage the protocol stored.
 *
 * `localization` is undefined while the protocol's languages are not known
 * yet, and nothing is filled in then.
 */
export function savedStageFields(
  identity: StageIdentity,
  fields: StageFormDraft,
  localization: LocalizationDeclaration | undefined,
): StageFormDraft {
  const { id: _id, type: _type, ...saved } = stageDocument(identity, fields);
  return localization === undefined
    ? saved
    : stageFieldsForEditing(identity.type, saved, localization);
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
