import { createNextState } from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit';

import {
  canonicalizeLocale,
  collectLocalizedStrings,
  type CurrentProtocol,
  findInterfaceOwnedOptionBindings,
  isBlankMessage,
  isBlankText,
  isFinishSessionStage,
  isSuppliedOptionLabelSet,
  isUndeterminedLocale,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringHit,
  defaultFinishSessionTextAfterLanguageChange,
  type LanguageChange,
  stageWithoutSuppliedText,
  stageWithSuppliedText,
  suppliedOptionLabelsAfterLanguageChange,
  suppliedWordingIn,
  withoutSuppliedWording,
  withSuppliedWording,
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

/** Leaves every translation as it is. */
export const unchangedText: LocalizedStringRewrite = (value) => value;

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
 * A stage open in an editor after a change to the protocol's languages. The
 * editor holds Network Canvas's wording for the settings the stage does not
 * word itself (`stageWithSuppliedText`), which is no text of the stage's: so
 * `rewrite` moves or removes only the stage's own translations, and Network
 * Canvas's wording is then filled in for the languages the protocol has
 * after the change. It is how the change reaches the stage's unsaved fields,
 * which the protocol does not hold.
 */
export const stageAfterLanguageChange = <
  Stage extends Readonly<{ type: string }> & Readonly<Record<string, unknown>>,
>(
  stage: Stage,
  rewrite: LocalizedStringRewrite,
  change: LanguageChange,
): Stage => {
  const own = stageWithoutSuppliedText(stage);
  const [rewritten = own] = rewriteLocalizedStrings(
    { stages: [own] },
    rewrite,
  ).stages;
  return stageWithSuppliedText(rewritten, change.after);
};

/**
 * The protocol after a change to its languages. `rewritten` is the protocol
 * with every translation already moved or removed as the change says. Then,
 * in each text Network Canvas copies into a protocol — the labels of the
 * answers a Family Pedigree asks for, and a finish stage's text and name — a
 * language the protocol did not have gains Network Canvas's wording wherever
 * it has no translation, even where the researcher has reworded the text in
 * another language, and Network Canvas's wording for a corrected language
 * becomes its wording for the language as corrected (see
 * `suppliedTextAfterLanguageChange`). No translation is overwritten.
 *
 * The wording Network Canvas supplies for stage settings, such as a roster's
 * panel title, and for the interview's shared words is not copied into a
 * protocol, so nothing is written for it: the interview shows it in each
 * language the protocol has no wording of its own in.
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
      target.options = suppliedOptionLabelsAfterLanguageChange(
        set,
        variable.options,
        change,
      );
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
    });
  });
};

/**
 * Declares new languages. Nothing is translated except text Network Canvas
 * copies into a protocol (see `withLanguageChange`): a finish stage's text
 * and name, and the labels of the answers a Family Pedigree asks for. Each
 * gets its supplied text in every new language it is supplied in, whether or
 * not the researcher has reworded it in the languages the protocol already
 * has. Stage settings and shared words that Network Canvas words read in its
 * wording for the new language without anything being written. Everything
 * else shows as a missing translation until it is written.
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
 *
 * `supplied` gives Network Canvas's own wording for a place, where it words
 * it (`suppliedWordingIn`). Such a text is never left with nothing while
 * Network Canvas has wording for it in a language that stays, even where the
 * researcher's own wording for it is only in the language being removed, so
 * that place is not stranded. Only Network Canvas's wording counts: what the
 * saved protocol holds at a place says nothing about an unsaved reading of
 * it.
 */
export const getLocaleRemovalImpact = (
  texts: readonly LocalizedStringHit[],
  locale: LocaleTag,
  supplied: (
    path: LocalizedStringHit['path'],
  ) => LocalizedString | undefined = () => undefined,
): LocaleRemovalImpact => {
  const translated = new Set<string>();
  const stranded = new Map<string, LocalizedStringHit>();
  for (const hit of texts) {
    if (!Object.hasOwn(hit.value, locale)) continue;
    const place = JSON.stringify(hit.path);
    translated.add(place);
    if (
      !stranded.has(place) &&
      Object.keys(hit.value).every((key) => key === locale) &&
      Object.keys(supplied(hit.path) ?? {}).every((key) => key === locale)
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
 * Deletes a language and every translation written in it. No other text
 * changes: no language is added, so none gains Network Canvas's wording.
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
    suppliedWordingIn(protocol),
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
 * Makes another declared language the default. No text changes: no language
 * is added, so none gains Network Canvas's wording.
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

/**
 * `edited`, a change made to `protocol` with the wording it shows written
 * out, as the protocol stores it (`withoutSuppliedWording`). Each stage the
 * change left as the protocol holds it is the protocol's own object, and so
 * are its shared words, so one edited text is one changed place in the
 * protocol's history and not a copy of every stage.
 */
const storedAfterEdit = (
  protocol: CurrentProtocol,
  edited: CurrentProtocol,
): CurrentProtocol => {
  const stored = withoutSuppliedWording(edited);
  const stages = stored.stages.map((stage, index) => {
    const held = protocol.stages[index];
    return held !== undefined && isEqual(stage, held) ? held : stage;
  });
  const { interfaceText: _stored, ...rest } = stored;
  const interfaceText = isEqual(stored.interfaceText, protocol.interfaceText)
    ? protocol.interfaceText
    : stored.interfaceText;
  return {
    ...rest,
    stages: stages.every((stage, index) => stage === protocol.stages[index])
      ? protocol.stages
      : stages,
    ...(interfaceText === undefined ? {} : { interfaceText }),
  };
};

const isSamePath = (
  a: readonly (string | number)[],
  b: readonly (string | number)[],
) => a.length === b.length && a.every((segment, index) => segment === b[index]);

/**
 * Writes one translation of one participant-facing text, stored exactly as the
 * stage editors store it. `path` must be where `collectLocalizedStrings` finds
 * that text in the protocol with the wording it shows written out
 * (`withSuppliedWording`), so a text Network Canvas words can be written
 * whether or not the protocol holds any wording for it yet, and nothing else
 * in the protocol can be written through it. The protocol is stored holding
 * only the researcher's own wording (`withoutSuppliedWording`), so a
 * translation written exactly as Network Canvas words it is not kept.
 */
export const setTranslation = (
  protocol: CurrentProtocol,
  path: readonly (string | number)[],
  locale: LocaleTag,
  text: string,
): LocaleOperationResult => {
  if (!isDeclared(protocol, locale)) return fail('not-declared');
  if (isBlankText(text)) return fail('blank-text');
  const shown = withSuppliedWording(protocol);
  const hit = collectLocalizedStrings(shown).find((candidate) =>
    isSamePath(candidate.path, path),
  );
  if (!hit) return fail('not-localized-string');
  return {
    ok: true,
    protocol: storedAfterEdit(
      protocol,
      createNextState(shown, (draft) => {
        setAtPath(draft, hit.path, withTranslation(hit.value, locale, text));
      }),
    ),
  };
};

/** Why one text cannot be set to `value`, or undefined when it can. */
const localizedStringRefusal = (
  protocol: CurrentProtocol,
  value: LocalizedString,
): LocaleOperationFailure | undefined => {
  const translations = Object.entries(value);
  if (translations.some(([locale]) => !isDeclared(protocol, locale))) {
    return 'not-declared';
  }
  if (
    translations.length === 0 ||
    translations.some(([, message]) => isBlankMessage(message))
  ) {
    return 'blank-text';
  }
  return undefined;
};

/**
 * Replaces every translation of several participant-facing texts at once:
 * every one is set, or, when one cannot be, none is. Each `value` holds
 * stored messages, as the localized fields write them, and each `path` must
 * be where `collectLocalizedStrings` finds that text in the protocol with the
 * wording it shows written out (see `setTranslation`). Every translation must
 * say something, as the schema requires: a language with nothing to show is
 * left out of `value`, never stored blank.
 */
export const setLocalizedStrings = (
  protocol: CurrentProtocol,
  updates: readonly Readonly<{
    path: readonly (string | number)[];
    value: LocalizedString;
  }>[],
): LocaleOperationResult => {
  // Setting a text never adds or removes one, so the texts are found once.
  const shown = withSuppliedWording(protocol);
  const texts = new Map(
    collectLocalizedStrings(shown).map((hit) => [
      JSON.stringify(hit.path),
      hit,
    ]),
  );
  const writes: { path: (string | number)[]; value: LocalizedString }[] = [];
  for (const { path, value } of updates) {
    const refusal = localizedStringRefusal(protocol, value);
    if (refusal !== undefined) return fail(refusal);
    const hit = texts.get(JSON.stringify(path));
    if (!hit) return fail('not-localized-string');
    writes.push({ path: hit.path, value });
  }
  return {
    ok: true,
    protocol: storedAfterEdit(
      protocol,
      createNextState(shown, (draft) => {
        for (const { path, value } of writes) setAtPath(draft, path, value);
      }),
    ),
  };
};

/**
 * Says that the text recorded as `from` is really written in `tag`: the
 * declaration entry and every translation move to the new tag together, and
 * the default follows when it is `from`. Nothing the researcher wrote is
 * translated or deleted. In the text Network Canvas copies into a protocol, a
 * translation that is its wording for `from` becomes its wording for the
 * corrected language, or is removed where it has none there, and a supplied
 * text with no translation in `from` gains the corrected language's wording
 * (see `withLanguageChange`). The wording it supplies without copying reads
 * in the corrected language as soon as the protocol declares it. So an
 * English protocol corrected to German reads the German supplied text. A
 * language the protocol already has is never merged into, so a tag it
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
