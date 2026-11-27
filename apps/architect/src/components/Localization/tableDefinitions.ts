import { isEqual } from 'es-toolkit';

import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import {
  type CurrentProtocol,
  DynamicAttributeSchema,
  type DynamicAttributeVersion,
  dynamicAttributeVersions,
  type LocaleTag,
  type LocalizedString,
  ownerOfTextPath,
  type TextOwnerPath,
  type TextPlace,
} from '@codaco/protocol-validation';
import { isRecord, valueAtPath } from '@codaco/shared-consts';
import type {
  TextDefinitionKey,
  OwnerTextDefinitions,
} from '~/ducks/modules/protocol/localeOperations';
import type { RootState } from '~/ducks/store';
import { getProtocol } from '~/selectors/protocol';

import {
  type CellValue,
  pathKey,
  readCellValue,
  readTranslationFieldName,
  type TextPath,
  translationFieldName,
} from './cellNames';
import {
  type CellLogic,
  latestOrder,
  type Patch,
  patchAfterWrite,
  withPatch,
  withPatches,
} from './logicEdits';
import { findRow, storedTranslation, withCellText } from './rowText';

/**
 * The conditions and dynamic attributes of each owner of text (a stage, or a
 * node type's label) as the translation table holds them. A cell's logic
 * changes are kept with the cell (see `logicEdits`), and the wording of each
 * version of a saved dynamic attribute is kept in one place only: the cell of
 * that version's own row. A cell's editor that changes such wording writes it
 * there.
 */

type Values = Readonly<Record<string, FieldValue>>;

type Definitions = Readonly<Record<string, unknown>>;

const NO_DEFINITIONS: Definitions = Object.freeze({});

/** `container` with `value` at `path`, copying what it passes through. */
const withValueAt = (
  container: unknown,
  path: readonly (string | number)[],
  value: unknown,
): unknown => {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (typeof head === 'number') {
    const list = Array.isArray(container) ? [...container] : [];
    list[head] = withValueAt(list[head], rest, value);
    return list;
  }
  const record = isRecord(container) ? { ...container } : {};
  record[head] = withValueAt(record[head], rest, value);
  return record;
};

/** The conditions or dynamic attributes that `owner` has in `protocol`. */
const storedDefinitions = (
  protocol: CurrentProtocol | null,
  owner: TextOwnerPath,
  key: TextDefinitionKey,
): Definitions => {
  const held = valueAtPath(protocol, [...owner, key]);
  return isRecord(held) ? held : NO_DEFINITIONS;
};

/** The versions of the dynamic attribute `definition`, if it is one. */
const versionsOf = (
  definition: unknown,
): readonly DynamicAttributeVersion[] | undefined => {
  const parsed = DynamicAttributeSchema.safeParse(definition);
  return parsed.success ? dynamicAttributeVersions(parsed.data) : undefined;
};

/**
 * A version of one of the dynamic attributes that `owner` has in the
 * protocol: the row its wording is translated in.
 */
type SavedVersion = Readonly<{
  id: string;
  version: DynamicAttributeVersion;
  /** The path of the wording, which is its row's path. */
  path: TextPath;
}>;

const savedVersionsOf = (
  protocol: CurrentProtocol | null,
  owner: TextOwnerPath,
): readonly SavedVersion[] =>
  Object.entries(
    storedDefinitions(protocol, owner, 'dynamicAttributes'),
  ).flatMap(([id, definition]) =>
    (versionsOf(definition) ?? []).map((version) => ({
      id,
      version,
      path: [...owner, 'dynamicAttributes', id, ...version.path],
    })),
  );

/**
 * Where, in the dynamic attribute `id` of `dynamicAttributes`, the version
 * that `version` is now has its wording: the version for the same
 * condition, answer or kind of version. Undefined when it has none any more,
 * as when its condition was removed.
 */
const counterpartOf = (
  dynamicAttributes: Definitions,
  { id, version }: SavedVersion,
): readonly (string | number)[] | undefined =>
  versionsOf(dynamicAttributes[id])?.find(
    (candidate) =>
      candidate.role === version.role && candidate.key === version.key,
  )?.path;

const wordingAt = (
  dynamicAttributes: Definitions,
  id: string,
  path: readonly (string | number)[],
): LocalizedString => {
  const wording = valueAtPath(dynamicAttributes[id], path);
  return isRecord(wording)
    ? Object.fromEntries(
        Object.entries(wording).flatMap(([locale, message]) =>
          typeof message === 'string' ? [[locale, message]] : [],
        ),
      )
    : {};
};

/** A cell the table holds, read from its field. */
type HeldCell = Readonly<{
  name: string;
  path: TextPath;
  locale: LocaleTag;
  value: CellValue;
}>;

const heldCells = (values: Values): HeldCell[] =>
  Object.entries(values).flatMap(([name, value]) => {
    const cell = readTranslationFieldName(name);
    return cell === undefined
      ? []
      : [{ name, ...cell, value: readCellValue(value) }];
  });

/** The cells of the texts of `owner` that have changed its logic. */
const logicOfOwner = (
  values: Values,
  owner: TextOwnerPath,
  except?: string,
): readonly CellLogic[] =>
  heldCells(values).flatMap(({ name, path, value }) => {
    if (name === except || value.logic === undefined) return [];
    const of = ownerOfTextPath(path);
    return of !== undefined && isEqual(of, owner) ? [value.logic] : [];
  });

/** The text that the row of `saved` holds in `locale` in the table. */
const wordingTextIn = (
  state: RootState,
  values: Values,
  saved: SavedVersion,
  locale: LocaleTag,
) => {
  const name = translationFieldName(saved.path, locale);
  if (Object.hasOwn(values, name)) return readCellValue(values[name]).text;
  const row = findRow(state, saved.path);
  return row === undefined ? '' : storedTranslation(row, locale);
};

/**
 * `dynamicAttributes`, those of `owner`, with the wording of each version
 * that the protocol has as its version's row holds it, wherever the version
 * now is. A version that the protocol does not have, as one that a cell has
 * just added, keeps the wording that its dynamic attribute gives it.
 */
const withRowWordings = (
  state: RootState,
  values: Values,
  owner: TextOwnerPath,
  dynamicAttributes: Definitions,
): Definitions => {
  const protocol = getProtocol(state);
  let held = dynamicAttributes;
  for (const saved of savedVersionsOf(protocol, owner)) {
    const row = findRow(state, saved.path);
    const to = counterpartOf(held, saved);
    if (row === undefined || to === undefined) continue;
    const wording = (protocol?.localization.locales ?? []).reduce(
      (current, locale) => {
        const name = translationFieldName(saved.path, locale);
        return Object.hasOwn(values, name)
          ? withCellText(row, current, locale, readCellValue(values[name]).text)
          : current;
      },
      row.value,
    );
    if (isEqual(wording, wordingAt(held, saved.id, to))) continue;
    const written = withValueAt(held, [saved.id, ...to], wording);
    if (isRecord(written)) held = written;
  }
  return held;
};

/**
 * The conditions or dynamic attributes of `owner` as the table holds them:
 * the protocol's, with the changes of every cell but `except` applied (see
 * `withPatches`), and each saved version's wording as its row holds it.
 */
export const definitionsInTable = (
  state: RootState,
  values: Values,
  owner: TextOwnerPath,
  key: TextDefinitionKey,
  except?: string,
): Definitions => {
  const changed = withPatches(
    storedDefinitions(getProtocol(state), owner, key),
    logicOfOwner(values, owner, except).map((logic) => logic[key]),
  );
  return key === 'dynamicAttributes'
    ? withRowWordings(state, values, owner, changed)
    : changed;
};

/**
 * The conditions and dynamic attributes that the table changes: each that a
 * cell's logic changed and that differs from the protocol's.
 */
export const definitionDraftsIn = (
  state: RootState,
  values: Values,
): OwnerTextDefinitions[] => {
  const owners = new Map<string, TextOwnerPath>();
  for (const { path, value } of heldCells(values)) {
    const owner = value.logic === undefined ? undefined : ownerOfTextPath(path);
    if (owner !== undefined) owners.set(pathKey(owner), owner);
  }
  const protocol = getProtocol(state);
  return [...owners.values()].flatMap((owner) =>
    (['conditions', 'dynamicAttributes'] as const).flatMap((key) => {
      if (logicOfOwner(values, owner).every((logic) => !logic[key])) return [];
      const value = definitionsInTable(state, values, owner, key);
      return isEqual(value, storedDefinitions(protocol, owner, key))
        ? []
        : [{ owner, key, value }];
    }),
  );
};

/**
 * Whether the text at `place` is the wording of a version of one of the
 * dynamic attributes of `owner`.
 */
export const isDynamicAttributeWordingOf = (
  place: TextPlace,
  owner: TextOwnerPath,
) => place.kind === 'dynamicAttributeWording' && isEqual(place.owner, owner);

/**
 * Whether the text at `place` is the wording of a version of a dynamic
 * attribute of an owner whose dynamic attributes `definitions` write.
 */
export const isWordingOfDrafted = (
  definitions: readonly Readonly<{
    owner: TextOwnerPath;
    key: TextDefinitionKey;
  }>[],
  place: TextPlace,
) =>
  definitions.some(
    ({ owner, key }) =>
      key === 'dynamicAttributes' && isDynamicAttributeWordingOf(place, owner),
  );

/** A cell's text that a change of logic writes: a version's wording. */
export type WordingWrite = Readonly<{
  path: TextPath;
  locale: LocaleTag;
  text: string;
}>;

/**
 * What the editor of the cell at `path` in `locale` changes by writing
 * `next` as its owner's conditions or dynamic attributes: the cell's logic,
 * and the wording of each saved version that `next` words differently,
 * which is written in that version's row.
 */
export const logicWrite = (
  state: RootState,
  values: Values,
  cell: Readonly<{ path: TextPath; locale: LocaleTag }>,
  key: TextDefinitionKey,
  next: Definitions,
): Readonly<{ logic: CellLogic | undefined; wordings: WordingWrite[] }> => {
  const owner = ownerOfTextPath(cell.path);
  const name = translationFieldName(cell.path, cell.locale);
  const current = readCellValue(values[name]).logic;
  if (owner === undefined) return { logic: current, wordings: [] };
  const protocol = getProtocol(state);

  const wordings: WordingWrite[] = [];
  if (key === 'dynamicAttributes') {
    for (const saved of savedVersionsOf(protocol, owner)) {
      const row = findRow(state, saved.path);
      const to = counterpartOf(next, saved);
      if (row === undefined || to === undefined) continue;
      for (const locale of protocol?.localization.locales ?? []) {
        const wanted = storedTranslation(
          { ...row, value: wordingAt(next, saved.id, to) },
          locale,
        );
        if (wanted !== wordingTextIn(state, values, saved, locale)) {
          wordings.push({ path: saved.path, locale, text: wanted });
        }
      }
    }
  }
  // The wording is the rows' from now on, so the cell's change is judged
  // with them written.
  const written: Values = {
    ...values,
    ...Object.fromEntries(
      wordings.map(({ path, locale, text }) => {
        const wordingName = translationFieldName(path, locale);
        return [
          wordingName,
          { ...readCellValue(values[wordingName]), text },
        ] as const;
      }),
    ),
  };
  const patches = heldCells(values).flatMap(({ value }) =>
    value.logic === undefined
      ? []
      : [value.logic.conditions, value.logic.dynamicAttributes],
  );
  const patch: Patch = patchAfterWrite({
    previous: current?.[key],
    without: definitionsInTable(state, written, owner, key, name),
    shown: definitionsInTable(state, written, owner, key),
    next:
      key === 'dynamicAttributes'
        ? withRowWordings(state, written, owner, next)
        : next,
    order: latestOrder(patches) + 1,
  });
  return { logic: withPatch(current, key, patch), wordings };
};

/**
 * The paths whose cells are read for the conditions and dynamic attributes
 * of `owner`: each text of the owner, whose cell may have changed its logic,
 * and each row of its dynamic attributes' wording.
 */
export const ownerTextPaths = (
  rows: readonly Readonly<{ path: TextPath; place: TextPlace }>[],
  owner: TextOwnerPath,
): TextPath[] =>
  rows.flatMap(({ path, place }) =>
    place.owner !== undefined && isEqual(place.owner, owner) ? [path] : [],
  );
