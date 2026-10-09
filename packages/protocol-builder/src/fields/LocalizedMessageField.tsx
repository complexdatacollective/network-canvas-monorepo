import { useId } from 'react';
import { z } from 'zod/mini';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField, {
  type RichTextEditorToken,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  composeMessage,
  findMessageArgumentProblem,
  type LocaleTag,
  type LocalizedString,
  type MessageArguments,
  type MessagePart,
  type MessageVariant,
  messageVariants,
  pluralCountExamples,
} from '@codaco/protocol-validation';

import { asLocalizedString } from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import type { RichTextContent as JSONContent } from '../markdown/markdownAdapter.ts';
import { LocalizedStringField } from './LocalizedStringField.tsx';
import { useMessageArgumentLabels } from './messageArgumentLabels.ts';

const messages = defineMessages({
  pluralVersion: {
    id: 'protocolBuilder.localizedMessage.pluralVersion',
    defaultMessage: 'When “{placeholder}” is {numbers}',
    description:
      'Label of the box holding the version of a text shown for some numbers. placeholder is the name of the number the text can show, such as “Parents missing”; numbers lists examples of the numbers that version is for, in the language being edited, such as “1” or “0, 2, 3, …”.',
  },
  versionsBlank: {
    id: 'protocolBuilder.localizedMessage.versionsBlank',
    defaultMessage:
      'Write every version of this text, or leave them all empty.',
    description:
      'Refusal shown under a text written in several versions (for the participant, for someone else, and so on) when some versions have words and others are empty, in any of the protocol’s languages.',
  },
  unreadable: {
    id: 'protocolBuilder.localizedMessage.unreadable',
    defaultMessage:
      'This text uses something it cannot show. Write it again here.',
    description:
      'Refusal shown under a text written in several versions when a translation imported from elsewhere uses a placeholder or a choice this text does not offer.',
  },
});

/** How many examples a plural version's label gives of the numbers it is for. */
const EXAMPLE_COUNT = 3;

const isBlankVariant = (variant: MessageVariant) =>
  variant.parts.every((part) => typeof part === 'string' && part.trim() === '');

const documentOf = (parts: readonly MessagePart[]): JSONContent => {
  const content = parts.flatMap((part): JSONContent[] =>
    typeof part === 'string'
      ? part === ''
        ? []
        : [{ type: 'text', text: part }]
      : [{ type: 'token', attrs: { id: part.argument } }],
  );
  return {
    type: 'doc',
    content: [
      content.length > 0
        ? { type: 'paragraph', content }
        : { type: 'paragraph' },
    ],
  };
};

const partsOf = (document: JSONContent | undefined): MessagePart[] => {
  const parts: MessagePart[] = [];
  const collect = (nodes: readonly JSONContent[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'text') {
        const last = parts.at(-1);
        const text = node.text ?? '';
        if (typeof last === 'string') parts[parts.length - 1] = last + text;
        else if (text !== '') parts.push(text);
      } else if (node.type === 'token') {
        const id: unknown = node.attrs?.id;
        if (typeof id === 'string') parts.push({ argument: id });
      } else {
        collect(node.content);
      }
    }
  };
  collect(document?.content);
  return parts;
};

/**
 * What a translation of a message is refused for: some of its versions
 * written and others empty, or something its arguments do not offer. Every
 * place that writes a message holds it to this rule: the stage editor's
 * field (`localizedMessageValidation`) and Architect's translation table.
 */
export const localizedMessageProblem = (
  message: string,
  declaration: MessageArguments,
  locale: LocaleTag,
): 'versionsBlank' | 'unreadable' | undefined => {
  if (findMessageArgumentProblem(message, declaration) === undefined) {
    return undefined;
  }
  const variants = messageVariants(message, declaration, locale);
  const blank = variants.filter(isBlankVariant).length;
  return blank > 0 && blank < variants.length ? 'versionsBlank' : 'unreadable';
};

/**
 * The rule every translation of a localized message is held to: each
 * version has words, or none does, and it uses only what the setting
 * offers. Shown under the field rather than left to the stage's save, where
 * the schema's refusal would name no translation.
 */
export function localizedMessageValidation(
  declaration: MessageArguments,
  intl: IntlShape,
): CustomFieldValidation {
  return {
    schema: z.unknown().check(
      z.superRefine((value, ctx) => {
        for (const [locale, message] of Object.entries(
          asLocalizedString(value) ?? {},
        )) {
          const problem = localizedMessageProblem(message, declaration, locale);
          if (problem !== undefined) {
            ctx.addIssue({
              code: 'custom',
              input: value,
              message: intl.formatMessage(messages[problem]),
              path: [],
            });
            return;
          }
        }
      }),
    ),
  };
}

/**
 * Why `message` cannot be saved, in words, or undefined when it can (or when
 * there is nothing to judge).
 */
export function useLocalizedMessageProblem(
  message: string | undefined,
  declaration: MessageArguments,
  locale: LocaleTag,
): string | undefined {
  const intl = useAppIntl();
  if (message === undefined) return undefined;
  const problem = localizedMessageProblem(message, declaration, locale);
  return problem === undefined
    ? undefined
    : intl.formatMessage(messages[problem]);
}

type VersionGroup = Readonly<{
  key: string;
  /** What the group's select cases mean, or empty without a select. */
  label: string;
  versions: readonly Readonly<{
    index: number;
    /** The plural version's label, or undefined without a plural. */
    label: string | undefined;
    variant: MessageVariant;
  }>[];
}>;

/**
 * A message's versions in `locale`, grouped by their select cases in
 * declared order, each group holding one version per plural category, with
 * the words the researcher reads for each, and the placeholders the text can
 * show.
 */
function useMessageVersions(
  message: string,
  declaration: MessageArguments,
  locale: LocaleTag,
) {
  const intl = useAppIntl();
  const { caseLabels, placeholderLabels } = useMessageArgumentLabels();

  const tokens: RichTextEditorToken[] = Object.entries(declaration).flatMap(
    ([argument, { kind }]) =>
      kind === 'select'
        ? []
        : [{ id: argument, label: placeholderLabels[argument] ?? argument }],
  );
  const selects = Object.entries(declaration).flatMap(([argument, { kind }]) =>
    kind === 'select' ? [argument] : [],
  );
  const plural = Object.entries(declaration).find(
    ([, { kind }]) => kind === 'plural',
  )?.[0];
  // Every version a message has is for some whole numbers, so each label
  // has examples (see `pluralCountExamples`).
  const examples =
    plural === undefined ? undefined : pluralCountExamples(locale);
  const pluralLabel = (variant: MessageVariant) => {
    if (plural === undefined) return undefined;
    const counts =
      [...(examples ?? [])].find(
        ([category]) => category === variant.when[plural],
      )?.[1] ?? [];
    const shown = counts
      .slice(0, EXAMPLE_COUNT)
      .map((count) => intl.formatNumber(count));
    return intl.formatMessage(messages.pluralVersion, {
      placeholder: placeholderLabels[plural] ?? plural,
      numbers: intl.formatList(
        counts.length > EXAMPLE_COUNT ? [...shown, '…'] : shown,
        { type: 'unit', style: 'short' },
      ),
    });
  };

  const variants = messageVariants(message, declaration, locale);
  const groups = new Map<
    string,
    { key: string; label: string; versions: VersionGroup['versions'][number][] }
  >();
  variants.forEach((variant, index) => {
    const key = selects
      .map((argument) => variant.when[argument])
      .join('\u0000');
    const group = groups.get(key) ?? {
      key,
      label: selects
        .map(
          (argument) =>
            caseLabels[argument]?.[variant.when[argument] ?? ''] ?? '',
        )
        .join(' '),
      versions: [],
    };
    group.versions.push({ index, label: pluralLabel(variant), variant });
    groups.set(key, group);
  });

  return {
    variants,
    groups: [...groups.values()] as readonly VersionGroup[],
    tokens,
  };
}

/** A version's parts as text, each placeholder as its name in brackets. */
const versionText = (
  parts: readonly MessagePart[],
  tokens: readonly RichTextEditorToken[],
) =>
  parts
    .map((part) =>
      typeof part === 'string'
        ? part
        : `[${tokens.find((token) => token.id === part.argument)?.label ?? part.argument}]`,
    )
    .join('');

/**
 * A message's versions in `locale`, read-only, each placeholder named in
 * brackets: what a summary or an unfocused table cell shows. A message whose
 * versions all read the same shows as its one phrase, and a case whose
 * versions all read the same, whatever the number, shows once.
 */
export function LocalizedMessageVersionsSummary({
  message,
  declaration,
  locale,
}: Readonly<{
  message: string;
  declaration: MessageArguments;
  locale: LocaleTag;
}>) {
  const { variants, groups, tokens } = useMessageVersions(
    message,
    declaration,
    locale,
  );
  const texts = variants.map((variant) => versionText(variant.parts, tokens));
  if (texts.every((text) => text === texts[0])) return <>{texts[0] ?? ''}</>;

  return (
    <dl className="flex flex-col gap-1">
      {groups.flatMap((group) => {
        const first = group.versions[0];
        const same =
          first !== undefined &&
          group.versions.every(
            ({ index }) => texts[index] === texts[first.index],
          );
        const shown = same
          ? [{ index: first.index, label: undefined }]
          : group.versions;
        return shown.map(({ index, label }) => (
          <div key={index}>
            <dt className="text-sm text-current/70">
              {[group.label, label].filter(Boolean).join(' · ')}
            </dt>
            <dd>{texts[index]}</dd>
          </div>
        ));
      })}
    </dl>
  );
}

export type LocalizedMessageVersionsProps = Readonly<{
  id: string;
  name: string;
  /** One translation, as the protocol stores it, or empty. */
  message: string;
  /** Writes the translation; undefined when every version was emptied. */
  onMessageChange: (message: string | undefined) => void;
  readOnly?: boolean;
  disabled?: boolean;
  declaration: MessageArguments;
  locale: LocaleTag;
  ariaLabelledBy: string | undefined;
  ariaDescribedBy: string;
  ariaInvalid?: boolean;
  /** Focuses the first version as it mounts. */
  autoFocus?: boolean;
}>;

/**
 * One translation of a localized message, edited a version at a time: a
 * heading per select case, then a labelled line of text per plural category,
 * each holding the message's placeholders as chips.
 */
export function LocalizedMessageVersions({
  id,
  name,
  message,
  onMessageChange,
  readOnly = false,
  disabled,
  declaration,
  locale,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  autoFocus = false,
}: LocalizedMessageVersionsProps) {
  const baseId = useId();
  const { variants, groups, tokens } = useMessageVersions(
    message,
    declaration,
    locale,
  );

  const write = (index: number, parts: readonly MessagePart[]) => {
    const next = variants.map((variant, at) =>
      at === index ? { ...variant, parts } : variant,
    );
    onMessageChange(
      next.every(isBlankVariant)
        ? undefined
        : composeMessage(next, declaration, locale),
    );
  };

  return (
    <div
      id={id}
      data-name={name}
      role="group"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      className="flex flex-col gap-4"
    >
      {groups.map((group, groupIndex) => {
        const groupId = `${baseId}-group-${groupIndex}`;
        return (
          <div key={group.key} className="flex flex-col gap-2">
            {group.label !== '' && (
              <p id={groupId} className="text-sm font-semibold">
                {group.label}
              </p>
            )}
            {group.versions.map(({ index, label, variant }) => {
              const labelId = `${baseId}-version-${index}`;
              const labelledBy = [
                group.label === '' ? ariaLabelledBy : groupId,
                label === undefined ? undefined : labelId,
              ]
                .filter((part) => part !== undefined)
                .join(' ');
              return (
                <div key={index} className="flex flex-col gap-1">
                  {label !== undefined && (
                    <p id={labelId} className="text-sm">
                      {label}
                    </p>
                  )}
                  <RichTextEditorField
                    id={`${id}-${index}`}
                    name={`${name}-${index}`}
                    aria-labelledby={labelledBy}
                    aria-describedby={ariaDescribedBy}
                    aria-invalid={ariaInvalid}
                    compact
                    toolbarOptions={{
                      bold: false,
                      italic: false,
                      history: false,
                    }}
                    tokens={tokens}
                    // Every keystroke, so that a host can mark the text
                    // changed, and judge it, as it is written.
                    changeMode="input"
                    readOnly={readOnly}
                    disabled={disabled}
                    autoFocus={autoFocus && index === 0}
                    value={documentOf(variant.parts)}
                    onChange={(document) => write(index, partsOf(document))}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export type LocalizedMessageFieldProps = CreateFormFieldProps<
  LocalizedString,
  'div',
  {
    /** What the setting's messages may use (see `localizedMessage`). */
    'arguments': MessageArguments;
    'id': string;
    'name': string;
    'aria-describedby': string;
  }
>;

/**
 * Participant-facing text that changes with what it is about: a localized
 * message (see `localizedMessage`), edited one version at a time in the
 * editing language (see `LocalizedMessageVersions`).
 *
 * There is a version for each case of each select argument — "about the
 * participant" and "about someone else" — and, within each, one for each
 * plural category of the editing language, labelled with examples of the
 * numbers it is for. The versions are written back as one message; versions
 * that all read the same become one phrase. Emptying every version removes
 * the translation, and emptying only some is refused (see
 * `localizedMessageValidation`).
 */
export default function LocalizedMessageField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  arguments: declaration,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: LocalizedMessageFieldProps) {
  const { localization, locale } = useEditingLanguage();

  return (
    <LocalizedStringField value={value} onChange={onChange}>
      {(translation) => (
        <LocalizedMessageVersions
          id={id}
          name={name}
          message={translation.message}
          onMessageChange={translation.onMessageChange}
          readOnly={readOnly === true || translation.readOnly}
          disabled={disabled}
          declaration={declaration}
          locale={locale ?? localization?.defaultLocale ?? 'en'}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
          ariaInvalid={ariaInvalid}
        />
      )}
    </LocalizedStringField>
  );
}
