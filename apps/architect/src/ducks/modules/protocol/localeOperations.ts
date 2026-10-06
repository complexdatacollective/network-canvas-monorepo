import { createNextState } from '@reduxjs/toolkit';

import {
  canonicalizeLocale,
  collectLocalizedStrings,
  type CurrentProtocol,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringHit,
  messageText,
} from '@codaco/protocol-validation';
import { UNSPECIFIED_LOCALE, withTranslation } from '~/utils/localizedText';

export type LocaleOperationFailure =
  /** Not a well-formed BCP 47 language tag. */
  | 'invalid-tag'
  /** `und` marks migrated text; it can be replaced but never introduced. */
  | 'unspecified-tag'
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

/**
 * Replaces each collected string in one draft, so a locale operation is a
 * single protocol edit: one undo step, and nothing is written if any part of
 * it is refused.
 */
const rewriteLocalizedStrings = (
  protocol: CurrentProtocol,
  rewrite: (value: LocalizedString) => LocalizedString,
  localization: CurrentProtocol['localization'],
): CurrentProtocol =>
  createNextState(protocol, (draft) => {
    for (const hit of collectLocalizedStrings(protocol)) {
      const next = rewrite(hit.value);
      if (next !== hit.value) setAtPath(draft, hit.path, next);
    }
    draft.localization = localization;
  });

const setAtPath = (
  root: object,
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
  if (locale === undefined) return { ok: false, reason: 'invalid-tag' };
  if (locale === UNSPECIFIED_LOCALE) {
    return { ok: false, reason: 'unspecified-tag' };
  }
  if (isDeclared(protocol, locale)) {
    return { ok: false, reason: 'already-declared' };
  }
  return { ok: true, locale };
};

/**
 * Declares new languages after the existing ones. Nothing is translated: the
 * new languages show as missing translations until they are written.
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

export const getLocaleRemovalImpact = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
): LocaleRemovalImpact => {
  const translated = collectLocalizedStrings(protocol).filter((hit) =>
    Object.hasOwn(hit.value, locale),
  );
  return {
    translationCount: translated.length,
    strandedStrings: translated.filter((hit) =>
      Object.keys(hit.value).every((key) => key === locale),
    ),
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
  if (getLocaleRemovalImpact(protocol, locale).strandedStrings.length > 0) {
    return fail('would-empty');
  }
  return {
    ok: true,
    protocol: rewriteLocalizedStrings(
      protocol,
      (value) => {
        if (!Object.hasOwn(value, locale)) return value;
        const { [locale]: _removed, ...rest } = value;
        return rest;
      },
      {
        ...protocol.localization,
        locales: protocol.localization.locales.filter(
          (declared) => declared !== locale,
        ),
      },
    ),
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

/**
 * Moves a language to `index` in the declaration, whose order is the final
 * fallback order after the default.
 */
export const moveLocale = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
  index: number,
): LocaleOperationResult => {
  const { locales } = protocol.localization;
  if (!locales.includes(locale)) return fail('not-declared');
  const others = locales.filter((declared) => declared !== locale);
  const target = Math.min(Math.max(index, 0), others.length);
  return {
    ok: true,
    protocol: {
      ...protocol,
      localization: {
        ...protocol.localization,
        locales: [...others.slice(0, target), locale, ...others.slice(target)],
      },
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
 * Says that text marked as `from` is written in `tag`: the declaration entry
 * and every translation move to the new tag together, and the default follows
 * when it is the language being relabelled. An existing language is never
 * merged into.
 */
export const relabelLocale = (
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
    protocol: rewriteLocalizedStrings(
      protocol,
      (value) =>
        Object.hasOwn(value, from)
          ? Object.fromEntries(
              Object.entries(value).map(([key, text]) => [
                key === from ? to : key,
                text,
              ]),
            )
          : value,
      {
        defaultLocale:
          localization.defaultLocale === from ? to : localization.defaultLocale,
        locales: localization.locales.map((declared) =>
          declared === from ? to : declared,
        ),
      },
    ),
  };
};
