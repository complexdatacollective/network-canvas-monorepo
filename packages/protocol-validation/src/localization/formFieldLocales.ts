import { isRecord, valueAtPath } from '@codaco/shared-consts';

import { textPlaceOf } from '../utils/textPlace.ts';
import { fieldIdsIn, readContentDocument } from './contentDocument.ts';
import type { LocaleTag, LocalizationDeclaration } from './localeTag.ts';
import { resolveLocalizedString } from './resolveLocalizedString.ts';

type Path = readonly (string | number)[];

/** The ids of the fields that one language's form document places, in order. */
export const fieldIdsInDocument = (
  message: string | undefined,
): readonly string[] =>
  message === undefined || message === ''
    ? []
    : fieldIdsIn(readContentDocument(message).nodes);

/**
 * The fields that each language's form places, by the document that the
 * language is shown: its own document, else the document that it falls back
 * to (`resolveLocalizedString`), whose questions it then asks in its own
 * words. Each set is in the order that the document places the fields.
 *
 * A declared language has no fields when no declared language has a
 * document. A document in a language that the protocol does not declare
 * places its own fields: the interview never shows it, and validation
 * reports it, but an editor keeps what it places until it is removed.
 * Without `localization`, each document places its own fields and nothing
 * falls back.
 */
export const formFieldPlacement = (
  content: Readonly<Record<LocaleTag, string>> | undefined,
  localization: LocalizationDeclaration | undefined,
): ReadonlyMap<LocaleTag, ReadonlySet<string>> => {
  const documents = content ?? {};
  const placement = new Map<LocaleTag, ReadonlySet<string>>();
  for (const [locale, message] of Object.entries(documents)) {
    placement.set(locale, new Set(fieldIdsInDocument(message)));
  }
  if (localization === undefined) return placement;
  const anyDeclared = localization.locales.some((locale) =>
    Object.hasOwn(documents, locale),
  );
  for (const locale of localization.locales) {
    if (placement.has(locale)) continue;
    placement.set(
      locale,
      anyDeclared
        ? new Set(
            fieldIdsInDocument(
              resolveLocalizedString(documents, localization, [locale]).text,
            ),
          )
        : new Set(),
    );
  }
  return placement;
};

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
