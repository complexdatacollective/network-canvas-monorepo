import { createNextState } from '@reduxjs/toolkit';

import {
  canonicalizeLocale,
  collectLocalizedStrings,
  type CurrentProtocol,
  isUndeterminedLocale,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringHit,
  messageText,
} from '@codaco/protocol-validation';
import { withTranslation } from '~/utils/localizedText';

export type LocaleOperationFailure =
  /** Not a well-formed BCP 47 language tag, or the undetermined language. */
  | 'invalid-tag'
  | 'already-declared'
  | 'not-declared'
  /** The default language cannot be removed until another is the default. */
  | 'default-locale'
  /** Removing the language would leave text with no translation at all. */
  | 'would-empty'
  /** The path is not where the protocol holds a participant-facing text. */
  | 'not-localized-string'
  /** A translation participants would see as nothing. */
  | 'blank-text';

export type LocaleOperationResult =
  | { ok: true; protocol: CurrentProtocol }
  | { ok: false; reason: LocaleOperationFailure };

const fail = (reason: LocaleOperationFailure): LocaleOperationResult => ({
  ok: false,
  reason,
});

const isDeclared = (protocol: CurrentProtocol, locale: LocaleTag) =>
  protocol.localization.locales.includes(locale);

/** What a change to the protocol's languages does to one text. */
export type LocalizedStringRewrite = (
  value: LocalizedString,
) => LocalizedString;

/** Deletes the translation written in `locale`. */
export const withoutLocale =
  (locale: LocaleTag): LocalizedStringRewrite =>
  (value) => {
    if (!Object.hasOwn(value, locale)) return value;
    const { [locale]: _removed, ...rest } = value;
    return rest;
  };

/** Moves the translation written in `from` to `to`, keeping its text. */
export const movedLocale =
  (from: LocaleTag, to: LocaleTag): LocalizedStringRewrite =>
  (value) =>
    Object.hasOwn(value, from)
      ? Object.fromEntries(
          Object.entries(value).map(([key, text]) => [
            key === from ? to : key,
            text,
          ]),
        )
      : value;

/**
 * Replaces each text in `document` — a protocol, or any part of one shaped as
 * the protocol holds it — in one draft, so a locale operation is a single
 * protocol edit: one undo step, and nothing is written if any part of it is
 * refused. The same rewrite carries the change into a stage open in an editor.
 */
export const rewriteLocalizedStrings = <T extends object>(
  document: T,
  rewrite: LocalizedStringRewrite,
): T =>
  createNextState(document, (draft) => {
    for (const hit of collectLocalizedStrings(document)) {
      const next = rewrite(hit.value);
      if (next !== hit.value) setAtPath(draft, hit.path, next);
    }
  });

const setAtPath = (
  root: unknown,
  path: readonly (string | number)[],
  value: LocalizedString,
) => {
  const key = path.at(-1);
  let parent: unknown = root;
  for (const segment of path.slice(0, -1)) {
    parent =
      typeof parent === 'object' && parent !== null
        ? Reflect.get(parent, segment)
        : undefined;
  }
  if (
    key === undefined ||
    typeof parent !== 'object' ||
    parent === null ||
    !Reflect.set(parent, key, value)
  ) {
    throw new Error(
      `Localized string at ${path.join('.')} is not in the protocol it was collected from.`,
    );
  }
};

const resolveNewLocale = (
  protocol: CurrentProtocol,
  tag: string,
):
  | { ok: true; locale: LocaleTag }
  | { ok: false; reason: LocaleOperationFailure } => {
  const locale = canonicalizeLocale(tag.trim());
  if (locale === undefined || isUndeterminedLocale(locale)) {
    return { ok: false, reason: 'invalid-tag' };
  }
  if (isDeclared(protocol, locale)) {
    return { ok: false, reason: 'already-declared' };
  }
  return { ok: true, locale };
};

/**
 * Declares new languages. Nothing is translated: the new languages show as
 * missing translations until they are written.
 */
export const addLocales = (
  protocol: CurrentProtocol,
  tags: readonly string[],
): LocaleOperationResult => {
  const added: LocaleTag[] = [];
  for (const tag of tags) {
    const resolved = resolveNewLocale(protocol, tag);
    if (!resolved.ok) return fail(resolved.reason);
    if (added.includes(resolved.locale)) return fail('already-declared');
    added.push(resolved.locale);
  }
  return {
    ok: true,
    protocol: {
      ...protocol,
      localization: {
        ...protocol.localization,
        locales: [...protocol.localization.locales, ...added],
      },
    },
  };
};

export type LocaleRemovalImpact = {
  /** How many translations the removal deletes. */
  translationCount: number;
  /** Text that exists only in this language, and so blocks the removal. */
  strandedStrings: readonly LocalizedStringHit[];
};

/**
 * What removing `locale` would delete, and what would be left with no text.
 *
 * `texts` may hold more than one reading of the same text — the protocol's,
 * and an unsaved one in an open stage editor — and each place counts once:
 * translated if any reading has the language, stranded if any reading has
 * nothing else.
 */
export const getLocaleRemovalImpact = (
  texts: readonly LocalizedStringHit[],
  locale: LocaleTag,
): LocaleRemovalImpact => {
  const translated = new Set<string>();
  const stranded = new Map<string, LocalizedStringHit>();
  for (const hit of texts) {
    if (!Object.hasOwn(hit.value, locale)) continue;
    const place = JSON.stringify(hit.path);
    translated.add(place);
    if (
      !stranded.has(place) &&
      Object.keys(hit.value).every((key) => key === locale)
    ) {
      stranded.set(place, hit);
    }
  }
  return {
    translationCount: translated.size,
    strandedStrings: [...stranded.values()],
  };
};

/** Deletes a language and every translation written in it. */
export const removeLocale = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
): LocaleOperationResult => {
  if (!isDeclared(protocol, locale)) return fail('not-declared');
  if (locale === protocol.localization.defaultLocale) {
    return fail('default-locale');
  }
  const impact = getLocaleRemovalImpact(
    collectLocalizedStrings(protocol),
    locale,
  );
  if (impact.strandedStrings.length > 0) return fail('would-empty');
  return {
    ok: true,
    protocol: {
      ...rewriteLocalizedStrings(protocol, withoutLocale(locale)),
      localization: {
        ...protocol.localization,
        locales: protocol.localization.locales.filter(
          (declared) => declared !== locale,
        ),
      },
    },
  };
};

export const setDefaultLocale = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
): LocaleOperationResult => {
  if (!isDeclared(protocol, locale)) return fail('not-declared');
  return {
    ok: true,
    protocol: {
      ...protocol,
      localization: { ...protocol.localization, defaultLocale: locale },
    },
  };
};

const isSamePath = (
  a: readonly (string | number)[],
  b: readonly (string | number)[],
) => a.length === b.length && a.every((segment, index) => segment === b[index]);

/**
 * Writes one translation of one participant-facing text, stored exactly as the
 * stage editors store it. `path` must be where `collectLocalizedStrings` finds
 * that text, so nothing else in the protocol can be written through it.
 */
export const setTranslation = (
  protocol: CurrentProtocol,
  path: readonly (string | number)[],
  locale: LocaleTag,
  text: string,
): LocaleOperationResult => {
  if (!isDeclared(protocol, locale)) return fail('not-declared');
  if (text.trim() === '') return fail('blank-text');
  const hit = collectLocalizedStrings(protocol).find((candidate) =>
    isSamePath(candidate.path, path),
  );
  if (!hit) return fail('not-localized-string');
  return {
    ok: true,
    protocol: createNextState(protocol, (draft) => {
      setAtPath(draft, hit.path, withTranslation(hit.value, locale, text));
    }),
  };
};

/**
 * Replaces every translation of one participant-facing text at once. `value`
 * holds stored messages, as the localized fields write them, and `path` must
 * be where `collectLocalizedStrings` finds that text.
 */
export const setLocalizedString = (
  protocol: CurrentProtocol,
  path: readonly (string | number)[],
  value: LocalizedString,
): LocaleOperationResult => {
  const translations = Object.entries(value);
  if (translations.some(([locale]) => !isDeclared(protocol, locale))) {
    return fail('not-declared');
  }
  if (translations.every(([, message]) => messageText(message).trim() === '')) {
    return fail('blank-text');
  }
  const hit = collectLocalizedStrings(protocol).find((candidate) =>
    isSamePath(candidate.path, path),
  );
  if (!hit) return fail('not-localized-string');
  return {
    ok: true,
    protocol: createNextState(protocol, (draft) => {
      setAtPath(draft, hit.path, value);
    }),
  };
};

/**
 * Says that the text recorded as `from` is really written in `tag`: the
 * declaration entry and every translation move to the new tag together, and
 * the default follows when it is `from`. Nothing is translated or deleted.
 * A language the protocol already has is never merged into, so a tag it
 * declares is refused.
 */
export const changeLocale = (
  protocol: CurrentProtocol,
  from: LocaleTag,
  tag: string,
): LocaleOperationResult => {
  if (!isDeclared(protocol, from)) return fail('not-declared');
  const resolved = resolveNewLocale(protocol, tag);
  if (!resolved.ok) return fail(resolved.reason);
  const to = resolved.locale;
  const { localization } = protocol;
  return {
    ok: true,
    protocol: {
      ...rewriteLocalizedStrings(protocol, movedLocale(from, to)),
      localization: {
        defaultLocale:
          localization.defaultLocale === from ? to : localization.defaultLocale,
        locales: localization.locales.map((declared) =>
          declared === from ? to : declared,
        ),
      },
    },
  };
};
