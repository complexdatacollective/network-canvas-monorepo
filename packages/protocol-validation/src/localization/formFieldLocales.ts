import { isRecord, valueAtPath } from '@codaco/shared-consts';

import { textPlaceOf } from '../utils/textPlace.ts';
import { fieldIdsIn, readContentDocument } from './contentDocument.ts';
import type { LocaleTag, LocalizationDeclaration } from './localeTag.ts';
import {
  localesThatMayBeShown,
  resolveLocalizedString,
} from './resolveLocalizedString.ts';

type Path = readonly (string | number)[];

/** The ids of the fields that one language's form document places, in order. */
export const fieldIdsInDocument = (
  message: string | undefined,
): readonly string[] =>
  message === undefined || message === ''
    ? []
    : fieldIdsIn(readContentDocument(message).nodes);

type Documents = Readonly<Record<LocaleTag, string>>;

/**
 * Each language's fields: those of its own document, for any language that
 * has one; for a declared language without one, those of each document that
 * `shownTo` gives it.
 */
const placementBy = (
  content: Documents | undefined,
  localization: LocalizationDeclaration | undefined,
  shownTo: (
    documents: Documents,
    localization: LocalizationDeclaration,
    locale: LocaleTag,
  ) => readonly string[],
): ReadonlyMap<LocaleTag, ReadonlySet<string>> => {
  const documents = content ?? {};
  const placement = new Map<LocaleTag, ReadonlySet<string>>();
  for (const [locale, message] of Object.entries(documents)) {
    placement.set(locale, new Set(fieldIdsInDocument(message)));
  }
  if (localization === undefined) return placement;
  for (const locale of localization.locales) {
    if (placement.has(locale)) continue;
    placement.set(
      locale,
      new Set(
        shownTo(documents, localization, locale).flatMap(fieldIdsInDocument),
      ),
    );
  }
  return placement;
};

/**
 * The fields that each language's form places, by the document that the
 * language is shown when the participant's browser lists no other language
 * that has one: its own document, else the document that it falls back to
 * (`resolveLocalizedString`), whose questions it then asks in its own
 * words. Each set is in the order that the document places the fields.
 * What is reported about a language reads this: which questions it is asked
 * to translate, and how its form differs from the default language's.
 *
 * A declared language has no fields when no declared language has a
 * document. A document in a language that the protocol does not declare
 * places its own fields: the interview never shows it, and validation
 * reports it, but an editor keeps what it places until it is removed.
 * Without `localization`, each document places its own fields and nothing
 * falls back.
 */
export const formFieldPlacement = (
  content: Documents | undefined,
  localization: LocalizationDeclaration | undefined,
): ReadonlyMap<LocaleTag, ReadonlySet<string>> =>
  placementBy(content, localization, (documents, declaration, locale) =>
    declaration.locales.some((declared) => Object.hasOwn(documents, declared))
      ? [resolveLocalizedString(documents, declaration, [locale]).text]
      : [],
  );

/**
 * The fields that each language's form may place, whatever languages the
 * participant's browser lists: a declared language without a document of
 * its own may be shown any document that it can fall back to
 * (`localesThatMayBeShown`), so it may place the fields of each of them. A
 * language with its own document places that document's fields, as in
 * `formFieldPlacement`. What a save keeps reads this, so that it never
 * removes a field's question that a participant may be shown; the sets are
 * in no particular order.
 */
export const formFieldPossiblePlacement = (
  content: Documents | undefined,
  localization: LocalizationDeclaration | undefined,
): ReadonlyMap<LocaleTag, ReadonlySet<string>> =>
  placementBy(content, localization, (documents, declaration, locale) =>
    [...localesThatMayBeShown(documents, declaration, locale)].flatMap(
      (shown) => {
        const message = documents[shown];
        return message === undefined ? [] : [message];
      },
    ),
  );

/** The placement of a form's fields, by its `content` as a protocol stores it. */
const placementOf = (
  content: Record<string, unknown>,
  localization: LocalizationDeclaration,
) => {
  const documents: Record<LocaleTag, string> = {};
  for (const [locale, message] of Object.entries(content)) {
    if (typeof message === 'string') documents[locale] = message;
  }
  return formFieldPlacement(documents, localization);
};

/**
 * For a form field's question or hint at `path`, the declared languages
 * whose form places the field (`formFieldPlacement`). `undefined` when
 * `path` is not a form field's question or hint: such a text is shown in
 * every language.
 */
export const localesPlacingFieldText = (
  path: Path,
  protocol: unknown,
  localization: LocalizationDeclaration,
): readonly LocaleTag[] | undefined => {
  const place = textPlaceOf(path);
  if (place.kind !== 'formFieldText') return undefined;
  const all = localization.locales;
  const fieldId = valueAtPath(protocol, [
    ...place.form,
    'fields',
    place.index,
    'id',
  ]);
  const content = valueAtPath(protocol, [...place.form, 'content']);
  if (typeof fieldId !== 'string' || !isRecord(content)) return all;
  const placement = placementOf(content, localization);
  return all.filter((locale) => placement.get(locale)?.has(fieldId) === true);
};
