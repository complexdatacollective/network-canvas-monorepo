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
} from '@codaco/protocol-validation';

import { asLocalizedString } from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import type { RichTextContent as JSONContent } from '../markdown/markdownAdapter.ts';
import { LocalizedStringField } from './LocalizedStringField.tsx';

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
/** Far enough to find examples of every category in every CLDR language. */
const EXAMPLE_SEARCH_LIMIT = 1000;

/** Examples of the whole numbers each plural category is for in `locale`. */
const numberExamples = (
  locale: LocaleTag,
): ReadonlyMap<string, readonly string[]> => {
  const rules = new Intl.PluralRules(locale);
  const found = new Map<string, number[]>();
  for (let n = 0; n <= EXAMPLE_SEARCH_LIMIT; n += 1) {
    const category = rules.select(n);
    const numbers = found.get(category) ?? [];
    // One past the count, to know whether the list goes on.
    if (numbers.length <= EXAMPLE_COUNT) numbers.push(n);
    found.set(category, numbers);
  }
  return new Map(
    [...found].map(([category, numbers]) => [
      category,
      numbers.length > EXAMPLE_COUNT
        ? [...numbers.slice(0, EXAMPLE_COUNT).map(String), '…']
        : numbers.map(String),
    ]),
  );
};

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
 * written and others empty, or something its arguments do not offer.
 */
const messageProblem = (
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
          const problem = messageProblem(message, declaration, locale);
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

type MessageVersionsProps = Readonly<{
  id: string;
  name: string;
  message: string;
  onMessageChange: (message: string | undefined) => void;
  readOnly: boolean;
  disabled: boolean | undefined;
  declaration: MessageArguments;
  caseLabels: LocalizedMessageFieldProps['caseLabels'];
  placeholderLabels: LocalizedMessageFieldProps['placeholderLabels'];
  locale: LocaleTag;
  ariaLabelledBy: string | undefined;
  ariaDescribedBy: string;
  ariaInvalid: boolean | undefined;
}>;

/** One translation's versions, grouped by case, one editor each. */
function MessageVersions({
  id,
  name,
  message,
  onMessageChange,
  readOnly,
  disabled,
  declaration,
  caseLabels,
  placeholderLabels,
  locale,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
}: MessageVersionsProps) {
  const intl = useAppIntl();
  const baseId = useId();

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
  const examples = plural === undefined ? undefined : numberExamples(locale);

  const variants = messageVariants(message, declaration, locale);
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

  // The versions in order, grouped by their select cases: a heading per
  // group when there is a select, then one editor per plural category.
  const groups = new Map<string, { label: string; indexes: number[] }>();
  variants.forEach((variant, index) => {
    const key = selects
      .map((argument) => variant.when[argument])
      .join('\u0000');
    const group = groups.get(key) ?? {
      label: selects
        .map(
          (argument) =>
            caseLabels[argument]?.[variant.when[argument] ?? ''] ?? '',
        )
        .join(' '),
      indexes: [],
    };
    group.indexes.push(index);
    groups.set(key, group);
  });

  const versionLabel = (variant: MessageVariant) =>
    plural === undefined
      ? undefined
      : intl.formatMessage(messages.pluralVersion, {
          placeholder: placeholderLabels[plural] ?? plural,
          numbers: intl.formatList(
            examples?.get(variant.when[plural] ?? '') ?? [],
            { type: 'unit', style: 'short' },
          ),
        });

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
      {[...groups.entries()].map(([key, group], groupIndex) => {
        const groupId = `${baseId}-group-${groupIndex}`;
        return (
          <div key={key} className="flex flex-col gap-2">
            {group.label !== '' && (
              <p id={groupId} className="text-sm font-semibold">
                {group.label}
              </p>
            )}
            {group.indexes.map((index) => {
              const variant = variants[index];
              if (variant === undefined) return null;
              const label = versionLabel(variant);
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
                    readOnly={readOnly}
                    disabled={disabled}
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
    /**
     * What each case of each select argument means, said to the researcher:
     * one label per declared case and one for `other`.
     */
    'caseLabels': Readonly<Record<string, Readonly<Record<string, string>>>>;
    /**
     * The name of each placeholder the text can show: a text argument, and
     * a plural argument's number.
     */
    'placeholderLabels': Readonly<Record<string, string>>;
    'id': string;
    'name': string;
    'aria-describedby': string;
  }
>;

/**
 * Participant-facing text that changes with what it is about: a localized
 * message (see `localizedMessage`), edited one version at a time in the
 * editing language.
 *
 * There is a version for each case of each select argument — "when it is the
 * participant" and "when it is someone else" — and, within each, one for each
 * plural category of the editing language, labelled with examples of the
 * numbers it is for. Each version is a line of text holding the setting's
 * placeholders as chips, which the toolbar inserts. The versions are written
 * back as one message; versions that all read the same become one phrase.
 * Emptying every version removes the translation, and emptying only some is
 * refused (see `localizedMessageValidation`).
 */
export default function LocalizedMessageField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  arguments: declaration,
  caseLabels,
  placeholderLabels,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: LocalizedMessageFieldProps) {
  const { localization, locale } = useEditingLanguage();

  return (
    <LocalizedStringField value={value} onChange={onChange}>
      {(translation) => (
        <MessageVersions
          id={id}
          name={name}
          message={translation.message}
          onMessageChange={translation.onMessageChange}
          readOnly={readOnly === true || translation.readOnly}
          disabled={disabled}
          declaration={declaration}
          caseLabels={caseLabels}
          placeholderLabels={placeholderLabels}
          locale={locale ?? localization?.defaultLocale ?? 'en'}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
          ariaInvalid={ariaInvalid}
        />
      )}
    </LocalizedStringField>
  );
}
