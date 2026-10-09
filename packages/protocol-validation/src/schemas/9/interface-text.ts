import { z } from 'zod';

import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import {
  FORMS_INTERFACE_TEXT,
  type InterfaceTextEntry,
  INTERVIEW_INTERFACE_TEXT,
  PASSPHRASE_INTERFACE_TEXT,
} from './interface-text-wording.ts';
import {
  type LocalizedString,
  localizedMessage,
  localizedString,
  nonBlankText,
} from './localized-string.ts';
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

/**
 * The interface text a protocol holds: the words the interview shows that
 * belong to no one stage, in the protocol's own languages, so a participant
 * reads them in the language of the interview whatever languages Network
 * Canvas ships. Text that belongs to one kind of stage is that stage's
 * setting instead.
 *
 * A protocol holds only the text it can show: the `interview` group always,
 * and each other group only while the protocol uses what it is for (see
 * `INTERFACE_TEXT_GROUPS`). Architect writes and removes the groups as the
 * protocol changes, with the wording Network Canvas supplies, and the
 * researcher may change and translate them like any other text.
 */

type ProtocolDocument = Readonly<{
  localization: LocalizationDeclaration;
  codebook?: unknown;
  stages?: readonly unknown[];
  interfaceText?: unknown;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsIn = (
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] =>
  isRecord(value) ? Object.values(value).filter(isRecord) : [];

/** Every attribute the codebook defines, of people, connections and ego. */
const codebookVariables = (
  codebook: unknown,
): readonly Readonly<Record<string, unknown>>[] => {
  if (!isRecord(codebook)) return [];
  const entities = [
    ...recordsIn(codebook.node),
    ...recordsIn(codebook.edge),
    ...(isRecord(codebook.ego) ? [codebook.ego] : []),
  ];
  return entities.flatMap((entity) => recordsIn(entity.variables));
};

const stagesOf = (
  protocol: ProtocolDocument,
): readonly Readonly<Record<string, unknown>>[] =>
  (protocol.stages ?? []).filter(isRecord);

/** Whether the protocol asks for a passphrase anywhere. */
const usesPassphrase = (protocol: ProtocolDocument) =>
  codebookVariables(protocol.codebook).some(
    (variable) => variable.encrypted === true,
  ) || stagesOf(protocol).some((stage) => stage.type === 'Anonymisation');

/** Stage types that always show a form of the interview's own. */
const FORM_STAGE_TYPES: ReadonlySet<string> = new Set([
  'EgoForm',
  'AlterForm',
  'AlterEdgeForm',
  'NameGenerator',
  'FamilyPedigree',
]);

const holdsAForm = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(holdsAForm);
  if (!isRecord(value)) return false;
  if (isRecord(value.form)) return true;
  return Object.values(value).some(holdsAForm);
};

/** Whether any stage shows a form, such as a Network Composer's fields. */
const usesForms = (protocol: ProtocolDocument) =>
  stagesOf(protocol).some(
    (stage) =>
      (typeof stage.type === 'string' && FORM_STAGE_TYPES.has(stage.type)) ||
      holdsAForm(stage),
  );

type InterfaceTextGroup = Readonly<{
  entries: Readonly<Record<string, InterfaceTextEntry>>;
  /** Whether a protocol shows the group's text; it is held only then. */
  usedBy: (protocol: ProtocolDocument) => boolean;
}>;

/** Every group of interface text, and when a protocol holds it. */
const INTERFACE_TEXT_GROUPS = {
  interview: { entries: INTERVIEW_INTERFACE_TEXT, usedBy: () => true },
  passphrase: { entries: PASSPHRASE_INTERFACE_TEXT, usedBy: usesPassphrase },
  forms: { entries: FORMS_INTERFACE_TEXT, usedBy: usesForms },
} as const satisfies Readonly<Record<string, InterfaceTextGroup>>;

type GroupName = keyof typeof INTERFACE_TEXT_GROUPS;

const GROUP_NAMES = Object.keys(INTERFACE_TEXT_GROUPS) as GroupName[];

const entrySchema = (entry: InterfaceTextEntry) =>
  entry.arguments === undefined
    ? localizedString(nonBlankText(), 'plain')
    : localizedMessage(nonBlankText(), { arguments: entry.arguments });

const groupSchema = (entries: Readonly<Record<string, InterfaceTextEntry>>) =>
  z.strictObject(
    Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [key, entrySchema(entry)]),
    ),
  );

export const InterfaceTextSchema = z.strictObject({
  interview: groupSchema(INTERVIEW_INTERFACE_TEXT).optional(),
  passphrase: groupSchema(PASSPHRASE_INTERFACE_TEXT).optional(),
  forms: groupSchema(FORMS_INTERFACE_TEXT).optional(),
});

/** The interface text a protocol holds, by group and name. */
export type InterfaceText = Readonly<
  Partial<Record<GroupName, Readonly<Record<string, LocalizedString>>>>
>;

/**
 * Where the protocol holds each interface text, and the message of the
 * interview's (or a shared package's) catalog it stands in for: what the
 * interview overlays the protocol's text onto.
 */
export const INTERFACE_TEXT_MESSAGES: readonly Readonly<{
  group: string;
  key: string;
  id: string;
}>[] = GROUP_NAMES.flatMap((group) =>
  Object.entries(INTERFACE_TEXT_GROUPS[group].entries).map(([key, entry]) => ({
    group,
    key,
    id: entry.id,
  })),
);

/**
 * The text Network Canvas writes for an entry in a protocol language: its
 * supplied wording there, or, in the default language when it supplies none,
 * the English wording, since every entry of a held group is required (the
 * rule for every supplied setting; see `supplied-stage-text.ts`).
 */
const writtenIn = (
  entry: InterfaceTextEntry,
  locale: LocaleTag,
  isDefault: boolean,
): string | undefined =>
  suppliedTextFor(entry.message, locale) ??
  (isDefault ? entry.message.en : undefined);

const suppliedValue = (
  entry: InterfaceTextEntry,
  localization: LocalizationDeclaration,
): LocalizedString => {
  const value: Record<LocaleTag, string> = {};
  for (const locale of localization.locales) {
    const text = writtenIn(
      entry,
      locale,
      locale === localization.defaultLocale,
    );
    if (text !== undefined) value[locale] = text;
  }
  return value;
};

const heldText = (protocol: ProtocolDocument): InterfaceText =>
  isRecord(protocol.interfaceText)
    ? (protocol.interfaceText as InterfaceText)
    : {};

/**
 * The interface text `protocol` should hold: each group it uses, keeping
 * every entry it already has and gaining Network Canvas's wording for any it
 * lacks, and no group it does not use.
 */
export const interfaceTextFor = (protocol: ProtocolDocument): InterfaceText => {
  const held = heldText(protocol);
  const next: Partial<Record<GroupName, Record<string, LocalizedString>>> = {};
  for (const group of GROUP_NAMES) {
    const { entries, usedBy } = INTERFACE_TEXT_GROUPS[group];
    if (!usedBy(protocol)) continue;
    const current = held[group] ?? {};
    next[group] = Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [
        key,
        current[key] ?? suppliedValue(entry, protocol.localization),
      ]),
    );
  }
  return next;
};

const sameText = (a: InterfaceText, b: InterfaceText): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * `protocol` holding the interface text it should (see `interfaceTextFor`):
 * the same protocol when it already does, so a caller can tell nothing
 * changed.
 */
export const withInterfaceText = <Protocol extends ProtocolDocument>(
  protocol: Protocol,
): Protocol => {
  const next = interfaceTextFor(protocol);
  return sameText(next, heldText(protocol)) &&
    protocol.interfaceText !== undefined
    ? protocol
    : { ...protocol, interfaceText: next };
};

/** One interface text, by group and name, as it reads after a change. */
export type InterfaceTextUpdate = Readonly<{
  group: string;
  key: string;
  value: LocalizedString;
}>;

/**
 * The interface text that follows a change to the protocol's languages (see
 * `suppliedTextAfterLanguageChange`), as it reads after it: each entry whose
 * default-language text before the change is still Network Canvas's. One the
 * researcher has reworded is theirs, and is not among them.
 */
export const interfaceTextAfterLanguageChange = (
  text: InterfaceText,
  change: LanguageChange,
): readonly InterfaceTextUpdate[] => {
  const { defaultLocale } = change.before;
  return GROUP_NAMES.flatMap((group) =>
    Object.entries(INTERFACE_TEXT_GROUPS[group].entries).flatMap(
      ([key, entry]: [string, InterfaceTextEntry]) => {
        const value = text[group]?.[key];
        if (
          value?.[defaultLocale] === undefined ||
          value[defaultLocale] !== writtenIn(entry, defaultLocale, true)
        ) {
          return [];
        }
        return [
          {
            group,
            key,
            value: suppliedTextAfterLanguageChange(
              value,
              (locale, isDefault) => writtenIn(entry, locale, isDefault),
              change,
            ),
          },
        ];
      },
    ),
  );
};
