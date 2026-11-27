import { createNextState } from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit';

import {
  stageWithoutSuppliedText,
  stageWithSuppliedText,
  suppliedWordingIn,
  withoutSuppliedWording,
  withSuppliedWording,
} from '@codaco/interview/supplied-wording';
import { withTranslation } from '@codaco/protocol-builder/localization/localizedText';
import {
  canonicalizeLocale,
  collectLocalizedStrings,
  type CurrentProtocol,
  findInterfaceOwnedOptionBindings,
  isBlankMessage,
  isBlankText,
  isFallbackLanguageChoice,
  isFinishSessionStage,
  isSuppliedOptionLabelSet,
  isUndeterminedLocale,
  type LocaleTag,
  type LocalizationDeclaration,
  ownerOfTextPath,
  textOwnersOf,
  type LocalizedString,
  type LocalizedStringHit,
  type TextOwnerPath,
  textPlaceOf,
  defaultFinishSessionTextAfterLanguageChange,
  type LanguageChange,
  needsFallbackLanguage,
  suppliedOptionLabelsAfterLanguageChange,
  withFallbackLanguage,
  withoutUnusedTextDefinitions,
} from '@codaco/protocol-validation';
import { isRecord, valueAtPath } from '@codaco/shared-consts';

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
  | 'blank-text'
  /**
   * Not a fallback language this protocol may name: its default language
   * needs none, or the language is not one Network Canvas has wording in.
   */
  | 'not-fallback-choice';

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
 * language the protocol has no wording of its own in. The result is stored as
 * every protocol is (`withoutSuppliedWording`), so a text of that wording
 * whose only translation the change removed is no longer held, rather than
 * held with no translation.
 *
 * The protocol's fallback language follows its default language: it is kept
 * while the default language is one Network Canvas has no wording in, and
 * goes when one it has wording in becomes the default
 * (`withFallbackLanguage`). None is chosen for the researcher, so a protocol
 * that comes to need one has none until they choose it.
 */
const withLanguageChange = (
  original: CurrentProtocol,
  rewritten: CurrentProtocol,
  change: LanguageChange,
): CurrentProtocol => {
  const changed = createNextState(rewritten, (draft) => {
    draft.localization = withFallbackLanguage(
      {
        defaultLocale: change.after.defaultLocale,
        locales: [...change.after.locales],
      },
      original.localization.fallbackLocale,
    );
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
  return withoutSuppliedWording(changed);
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
 *
 * `kept` says which texts the removal leaves in the protocol, once it is
 * stored as the stage editor saves it (`textKeptAfterRemoval`): the question
 * of a field that only the removed language's form places goes with the
 * field, and the wording of a dynamic attribute that only the removed
 * language's text shows goes with the dynamic attribute, so neither is
 * stranded. It is asked for only when some text would be stranded.
 */
export const getLocaleRemovalImpact = (
  texts: readonly LocalizedStringHit[],
  locale: LocaleTag,
  supplied: (
    path: LocalizedStringHit['path'],
  ) => LocalizedString | undefined = () => undefined,
  kept?: () => (path: LocalizedStringHit['path']) => boolean,
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
  // Read only when something would be stranded, which is rare: removing a
  // language is worked out for every language the Languages page lists.
  const isKept = stranded.size === 0 || kept === undefined ? undefined : kept();
  return {
    translationCount: translated.size,
    strandedStrings: [...stranded.values()].filter(
      ({ path }) => isKept?.(path) ?? true,
    ),
  };
};

/** Whether `owner` still has the form field or dynamic attribute of the text at `path`, relative to it. */
const ownerKeeps = (
  before: unknown,
  after: unknown,
  path: readonly (string | number)[],
): boolean => {
  const place = textPlaceOf(path, 'owner');
  if (place.kind === 'formFieldText') {
    const id = valueAtPath(before, [
      ...place.form,
      'fields',
      place.index,
      'id',
    ]);
    const fields = valueAtPath(after, [...place.form, 'fields']);
    return (
      typeof id !== 'string' ||
      (Array.isArray(fields) &&
        fields.some((entry) => isRecord(entry) && entry.id === id))
    );
  }
  if (place.kind !== 'dynamicAttributeWording') return true;
  const definitions = valueAtPath(after, ['dynamicAttributes']);
  return isRecord(definitions) && Object.hasOwn(definitions, place.id);
};

/**
 * Which texts removing `locale` leaves in `protocol`, once it is stored as
 * the stage editor saves it (`removedLocale`): not the question or hint of a
 * form field that the clean-up removes, nor the wording of a dynamic
 * attribute that it removes. The paths of the stored protocol cannot say so,
 * as removing a field moves the fields after it, so each text's field or
 * dynamic attribute is looked for by its id.
 *
 * `openStage` is a stage open in an editor, at its index in the protocol:
 * its texts are judged as that editor's save would store it once the
 * language is removed, since that save, not the removal, writes it.
 */
export const textKeptAfterRemoval = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
  openStage?: Readonly<{ index: number; stage: unknown }>,
): ((path: readonly (string | number)[]) => boolean) => {
  const removed = removedLocale(protocol, locale);
  const after = removed.localization;
  const [openBefore] =
    openStage === undefined || !isRecord(openStage.stage)
      ? []
      : rewriteLocalizedStrings(
          { stages: [openStage.stage] },
          withoutLocale(locale),
        ).stages;
  const openAfter =
    openBefore === undefined
      ? undefined
      : withoutUnusedTextDefinitions(openBefore, after);
  return (path) => {
    const owner = ownerOfTextPath(path);
    if (owner === undefined) return true;
    const within = path.slice(owner.length);
    return openStage !== undefined &&
      openAfter !== undefined &&
      isEqual(owner, ['stages', openStage.index])
      ? ownerKeeps(openStage.stage, openAfter, within)
      : ownerKeeps(
          valueAtPath(protocol, owner),
          valueAtPath(removed, owner),
          within,
        );
  };
};

/**
 * `protocol` without `locale` and every translation written in it, stored as
 * the stage editor saves it (`withoutUnusedTextDefinitions`): without the
 * form fields, dynamic attributes and conditions that only the deleted
 * language's text used.
 */
const removedLocale = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
): CurrentProtocol => {
  const before = protocol.localization;
  const removed = withLanguageChange(
    protocol,
    rewriteLocalizedStrings(protocol, withoutLocale(locale)),
    {
      before,
      after: {
        ...before,
        locales: before.locales.filter((declared) => declared !== locale),
      },
    },
  );
  return withoutUnusedDefinitions(removed, textOwnersOf(removed));
};

/**
 * Deletes a language and every translation written in it. No other text
 * changes: no language is added, so none gains Network Canvas's wording.
 * Every stage and every node type's label is then written as the stage
 * editor saves it (`withoutUnusedTextDefinitions`): without the form fields,
 * dynamic attributes and conditions that only the deleted language's text
 * used, so that what is left is a valid protocol. It is refused when it
 * would leave a text with no translation, judged in the protocol as it is
 * then stored: a text that goes with its field or dynamic attribute does not
 * count.
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
    () => textKeptAfterRemoval(protocol, locale),
  );
  if (impact.strandedStrings.length > 0) return fail('would-empty');
  return { ok: true, protocol: removedLocale(protocol, locale) };
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
 * Names the protocol's fallback language: the language the interview shows
 * its own text in when it has that text in none of the languages a
 * participant would otherwise be shown. Only a protocol whose default
 * language Network Canvas has no wording in names one, and only a language
 * Network Canvas has wording in can be it (`needsFallbackLanguage`). No text
 * changes.
 */
export const setFallbackLocale = (
  protocol: CurrentProtocol,
  locale: LocaleTag,
): LocaleOperationResult => {
  if (
    !needsFallbackLanguage(protocol.localization.defaultLocale) ||
    !isFallbackLanguageChoice(locale)
  ) {
    return fail('not-fallback-choice');
  }
  return {
    ok: true,
    protocol: {
      ...protocol,
      localization: withFallbackLanguage(protocol.localization, locale),
    },
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
    isEqual(candidate.path, path),
  );
  if (!hit) return fail('not-localized-string');
  return {
    ok: true,
    protocol: storedAfterEdit(
      protocol,
      createNextState(shown, (draft) => {
        // Never empty: blank text was refused above.
        setAtPath(
          draft,
          hit.path,
          withTranslation(hit.value, locale, text) ?? {},
        );
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
 * One kind of the text definitions of an owner of text (see
 * `withoutUnusedTextDefinitions`): its conditions, or its dynamic
 * attributes.
 */
export type TextDefinitionKey = 'conditions' | 'dynamicAttributes';

/** One owner's conditions or dynamic attributes, written whole. */
export type OwnerTextDefinitions = Readonly<{
  owner: TextOwnerPath;
  key: TextDefinitionKey;
  /** Empty when the owner declares none. */
  value: Readonly<Record<string, unknown>>;
}>;

/**
 * `protocol` with each owner's conditions or dynamic attributes as
 * `definitions` give them, or undefined when an owner is not in it.
 */
const withOwnerDefinitions = (
  protocol: CurrentProtocol,
  definitions: readonly OwnerTextDefinitions[],
): CurrentProtocol | undefined => {
  if (definitions.length === 0) return protocol;
  if (
    definitions.some(({ owner }) => !isRecord(valueAtPath(protocol, owner)))
  ) {
    return undefined;
  }
  return createNextState(protocol, (draft) => {
    for (const { owner, key, value } of definitions) {
      const held = valueAtPath(draft, owner);
      if (!isRecord(held)) continue;
      if (Object.keys(value).length === 0) Reflect.deleteProperty(held, key);
      else Reflect.set(held, key, value);
    }
  });
};

/**
 * `protocol` with each of `owners` written as the stage editor saves it
 * (`withoutUnusedTextDefinitions`), in the protocol's languages.
 */
const withoutUnusedDefinitions = (
  protocol: CurrentProtocol,
  owners: readonly TextOwnerPath[],
): CurrentProtocol => {
  const localization: LocalizationDeclaration = protocol.localization;
  const pruned = owners.flatMap((owner) => {
    const held = valueAtPath(protocol, owner);
    if (!isRecord(held)) return [];
    const kept = withoutUnusedTextDefinitions(held, localization);
    return kept === held ? [] : [{ owner, kept }];
  });
  if (pruned.length === 0) return protocol;
  return createNextState(protocol, (draft) => {
    for (const { owner, kept } of pruned) {
      const parent = valueAtPath(draft, owner.slice(0, -1));
      const key = owner.at(-1);
      if (typeof parent === 'object' && parent !== null && key !== undefined) {
        Reflect.set(parent, key, kept);
      }
    }
  });
};

/**
 * What the translation table saves, in one step: the conditions and dynamic
 * attributes that its text declares (written first, so that a text can use a
 * dynamic attribute created with it), then every changed text
 * (`setLocalizedStrings`). Each owner that changed is then written as the
 * stage editor saves it (`withoutUnusedTextDefinitions`): without the form
 * fields and translations of their questions and hints that its form does
 * not use, and the dynamic attributes and conditions that nothing uses.
 */
export const setTranslations = (
  protocol: CurrentProtocol,
  {
    definitions,
    updates,
  }: Readonly<{
    definitions: readonly OwnerTextDefinitions[];
    updates: Parameters<typeof setLocalizedStrings>[1];
  }>,
): LocaleOperationResult => {
  const declared = withOwnerDefinitions(protocol, definitions);
  if (declared === undefined) return fail('not-localized-string');
  const result = setLocalizedStrings(declared, updates);
  if (!result.ok) return result;
  const owners = new Map<string, TextOwnerPath>();
  for (const owner of [
    ...definitions.map((definition) => definition.owner),
    ...updates.flatMap(({ path }) => {
      const textOwner = ownerOfTextPath(path);
      return textOwner === undefined ? [] : [textOwner];
    }),
  ]) {
    owners.set(JSON.stringify(owner), owner);
  }
  return {
    ok: true,
    protocol: withoutUnusedDefinitions(result.protocol, [...owners.values()]),
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
