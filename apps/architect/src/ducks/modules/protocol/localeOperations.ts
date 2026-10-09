import { createNextState } from '@reduxjs/toolkit';

import {
  canonicalizeLocale,
  collectLocalizedStrings,
  type CurrentProtocol,
  findInterfaceOwnedOptionBindings,
  isFinishSessionStage,
  isSuppliedOptionLabelSet,
  isUndeterminedLocale,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringHit,
  defaultFinishSessionTextAfterLanguageChange,
  type LanguageChange,
  messageText,
  suppliedOptionLabelsAfterLanguageChange,
  suppliedStageTextAfterLanguageChange,
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
 * The protocol after a change to its languages. `rewritten` is the protocol
 * with every translation already moved or removed as the change says; each
 * text Network Canvas supplies that the researcher has not changed in the
 * default language — the labels of the answers a Family Pedigree asks for, a
 * finish stage's closing text, and stage settings such as a roster's panel
 * title — then becomes what Network Canvas writes
 * for the protocol's languages as they now are.
 */
const withLanguageChange = (
  original: CurrentProtocol,
  rewritten: CurrentProtocol,
  change: LanguageChange,
): CurrentProtocol => {
  return createNextState(rewritten, (draft) => {
    draft.localization = {
      defaultLocale: change.after.defaultLocale,
      locales: [...change.after.locales],
    };
    for (const binding of findInterfaceOwnedOptionBindings(original)) {
      const set = binding.optionSet;
      if (!isSuppliedOptionLabelSet(set)) continue;
      const { entity, type } = binding.subject;
      const variableIn = (protocol: CurrentProtocol) =>
        (entity === 'ego'
          ? protocol.codebook.ego?.variables
          : type === undefined
            ? undefined
            : protocol.codebook[entity]?.[type]?.variables)?.[
          binding.variableId
        ];
      const variable = variableIn(original);
      const target = variableIn(draft as CurrentProtocol);
      if (variable?.type !== 'categorical' || target?.type !== 'categorical')
        continue;
      const options = suppliedOptionLabelsAfterLanguageChange(
        set,
        variable.options,
        change,
      );
      if (options !== undefined) target.options = options;
    }
    original.stages.forEach((stage, index) => {
      const target = draft.stages[index];
      if (target === undefined) return;
      if (isFinishSessionStage(stage)) {
        Object.assign(
          target,
          defaultFinishSessionTextAfterLanguageChange(stage, change),
        );
      }
      for (const { path, value } of suppliedStageTextAfterLanguageChange(
        stage,
        change,
      )) {
        setAtPath(target, path, value);
      }
    });
  });
};

/**
 * Declares new languages. Nothing is translated except text Network Canvas
 * supplies that the researcher has not changed in the default language (see
 * `withLanguageChange`): a finish stage's closing text, the labels of the
 * answers a Family Pedigree asks for, and stage settings such as a roster's
 * panel title. Each gets its supplied text in every new language it is
 * supplied in. Everything else shows as a missing translation until it is
 * written.
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
  const before = protocol.localization;
  return {
    ok: true,
    protocol: withLanguageChange(protocol, protocol, {
      before,
      after: { ...before, locales: [...before.locales, ...added] },
    }),
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

/**
 * Deletes a language and every translation written in it. Text Network Canvas
 * supplies follows as for any change of languages (see `withLanguageChange`).
 */
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
  const before = protocol.localization;
  return {
    ok: true,
    protocol: withLanguageChange(
      protocol,
      rewriteLocalizedStrings(protocol, withoutLocale(locale)),
      {
        before,
        after: {
          ...before,
          locales: before.locales.filter((declared) => declared !== locale),
        },
      },
    ),
  };
};

/**
 * Makes another declared language the default. Text Network Canvas supplies
 * and the researcher has not changed follows (see `withLanguageChange`).
 */
export const setDefaultLocale = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
): LocaleOperationResult => {
  if (!isDeclared(protocol, locale)) return fail('not-declared');
  const before = protocol.localization;
  return {
    ok: true,
    protocol: withLanguageChange(protocol, protocol, {
      before,
      after: { ...before, defaultLocale: locale },
    }),
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
 * the default follows when it is `from`. Nothing the researcher wrote is
 * translated or deleted; text Network Canvas supplies and the researcher has
 * not changed becomes its text for the corrected language (see
 * `withLanguageChange`), so an English protocol corrected to German reads the
 * German supplied text. A language the protocol already has is never merged
 * into, so a tag it declares is refused.
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
  const before = protocol.localization;
  return {
    ok: true,
    protocol: withLanguageChange(
      protocol,
      rewriteLocalizedStrings(protocol, movedLocale(from, to)),
      {
        before,
        after: {
          defaultLocale:
            before.defaultLocale === from ? to : before.defaultLocale,
          locales: before.locales.map((declared) =>
            declared === from ? to : declared,
          ),
        },
        renamed: { [from]: to },
      },
    ),
  };
};
