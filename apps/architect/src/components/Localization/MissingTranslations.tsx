import { createElement, type RefObject, useId } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { Label } from '@codaco/fresco-ui/Label';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Section from '@codaco/fresco-ui/Section';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { CurrentProtocol, LocaleTag } from '@codaco/protocol-validation';
import {
  getLocalizationCoverage,
  getMissingTranslationGroups,
  type MissingTranslationField,
  type TranslationPlace,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { localizedText } from '~/utils/localizedText';

import { useLanguageName } from './useLanguageName';

export const ALL_LANGUAGES = 'all';

const messages = defineMessages({
  title: {
    id: 'architect.localization.missingTranslations.title',
    defaultMessage: 'Missing translations',
    description:
      'Heading of the list of texts that are not translated into every language.',
  },
  description: {
    id: 'architect.localization.missingTranslations.description',
    defaultMessage:
      'Missing translations do not stop you from saving, previewing or using the protocol. Participants see the text in another language instead.',
    description: 'Explanation above the list of missing translations.',
  },
  filterLabel: {
    id: 'architect.localization.missingTranslations.filterLabel',
    defaultMessage: 'Show missing translations for',
    description: 'Label of the language filter of the missing translations.',
  },
  allLanguages: {
    id: 'architect.localization.missingTranslations.allLanguages',
    defaultMessage: 'All languages',
    description:
      'Filter option that shows missing translations in every language.',
  },
  filterOption: {
    id: 'architect.localization.missingTranslations.filterOption',
    defaultMessage: '{language} ({count, number})',
    description:
      'Filter option for one language. count is how many of its translations are missing.',
  },
  complete: {
    id: 'architect.localization.missingTranslations.complete',
    defaultMessage: 'Every text is translated into every language.',
    description: 'Shown when no translation is missing.',
  },
  singleLanguage: {
    id: 'architect.localization.missingTranslations.singleLanguage',
    defaultMessage:
      'This protocol has one language. Add a language to start translating.',
    description: 'Shown when a protocol has only one language.',
  },
  stage: {
    id: 'architect.localization.missingTranslations.stage',
    defaultMessage: 'Stage',
    description: 'Kind of place a missing translation is in: a stage.',
  },
  nodeType: {
    id: 'architect.localization.missingTranslations.nodeType',
    defaultMessage: 'Node type',
    description: 'Kind of place a missing translation is in: a node type.',
  },
  edgeType: {
    id: 'architect.localization.missingTranslations.edgeType',
    defaultMessage: 'Edge type',
    description: 'Kind of place a missing translation is in: an edge type.',
  },
  ego: {
    id: 'architect.localization.missingTranslations.ego',
    defaultMessage: 'Ego',
    description:
      'Place a missing translation is in: the attributes of the ego (the participant).',
  },
  protocol: {
    id: 'architect.localization.missingTranslations.protocol',
    defaultMessage: 'Protocol',
    description: 'Place a missing translation is in: the protocol itself.',
  },
  unnamed: {
    id: 'architect.localization.missingTranslations.unnamed',
    defaultMessage: 'Untitled',
    description: 'Name shown for a stage or type that has no name.',
  },
  gap: {
    id: 'architect.localization.missingTranslations.gap',
    defaultMessage: '{language}: shows {fallback}',
    description:
      'One missing translation. language is the missing language; fallback is the language participants see instead.',
  },
});

type PlaceDetails = {
  kind: string;
  name: string;
  href: string | null;
  variableNames: (id: string) => string | undefined;
};

const describePlace = (
  intl: IntlShape,
  protocol: CurrentProtocol,
  place: TranslationPlace,
): PlaceDetails => {
  const { localization, codebook } = protocol;
  const unnamed = intl.formatMessage(messages.unnamed);
  switch (place.kind) {
    case 'stage': {
      const stage = protocol.stages.find(({ id }) => id === place.stageId);
      return {
        kind: intl.formatMessage(messages.stage),
        name: localizedText(stage?.label, localization) || unnamed,
        href: `/protocol/stage/${place.stageId}`,
        variableNames: () => undefined,
      };
    }
    case 'codebook': {
      const definition = codebook[place.entity]?.[place.entityType];
      return {
        kind: intl.formatMessage(
          place.entity === 'node' ? messages.nodeType : messages.edgeType,
        ),
        name:
          localizedText(definition?.label, localization) ||
          definition?.name ||
          unnamed,
        href: '/protocol/codebook',
        variableNames: (id) => definition?.variables?.[id]?.name,
      };
    }
    case 'ego':
      return {
        kind: intl.formatMessage(messages.ego),
        name: '',
        href: '/protocol/codebook',
        variableNames: (id) => codebook.ego?.variables?.[id]?.name,
      };
    case 'protocol':
      return {
        kind: intl.formatMessage(messages.protocol),
        name: '',
        href: null,
        variableNames: () => undefined,
      };
  }
};

/**
 * The string's path below its place, as written in the protocol file, with
 * variable ids replaced by the variable names researchers know them by.
 */
const formatFieldPath = (
  field: MissingTranslationField['field'],
  variableNames: PlaceDetails['variableNames'],
) =>
  field
    .map((segment, index) => {
      if (typeof segment === 'number') return `[${segment}]`;
      const name =
        field[index - 1] === 'variables' ? variableNames(segment) : undefined;
      return `${index === 0 ? '' : '.'}${name ?? segment}`;
    })
    .join('');

// Rendered inside the Section, so its element sits one level below the
// Section's title; `level` only sets its size.
const PlaceHeading = ({ details }: { details: PlaceDetails }) => {
  const enclosingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingLevel === null ? 'h4' : headingTagBelow(enclosingLevel);
  return (
    <Heading level="h3" margin="none" render={createElement(headingTag)}>
      {details.name && (
        <span className="block text-sm font-normal text-current/70">
          {details.kind}
        </span>
      )}
      {details.href ? (
        <NativeLink render={<Link href={details.href} />}>
          {details.name || details.kind}
        </NativeLink>
      ) : (
        details.name || details.kind
      )}
    </Heading>
  );
};

type MissingTranslationsProps = {
  filter: LocaleTag | typeof ALL_LANGUAGES;
  onFilterChange: (filter: LocaleTag | typeof ALL_LANGUAGES) => void;
  headingRef: RefObject<HTMLSpanElement | null>;
};

const MissingTranslations = ({
  filter,
  onFilterChange,
  headingRef,
}: MissingTranslationsProps) => {
  const intl = useAppIntl();
  const filterId = useId();
  const protocol = useSelector(getProtocol);
  const coverage = useSelector(getLocalizationCoverage);
  const groups = useSelector(getMissingTranslationGroups);
  const languageName = useLanguageName();

  if (!protocol) return null;

  const visibleGroups = groups.flatMap((group) => {
    const fields = group.fields.flatMap((field) => {
      const gaps =
        filter === ALL_LANGUAGES
          ? field.gaps
          : field.gaps.filter(({ locale }) => locale === filter);
      return gaps.length > 0 ? [{ ...field, gaps }] : [];
    });
    return fields.length > 0 ? [{ ...group, fields }] : [];
  });

  const languagesWithGaps = coverage.locales.filter(
    ({ missing }) => missing > 0,
  );

  return (
    <Section
      title={
        <span ref={headingRef} tabIndex={-1} className="focusable">
          {intl.formatMessage(messages.title)}
        </span>
      }
      description={intl.formatMessage(messages.description)}
    >
      {coverage.warnings.length === 0 ? (
        <Paragraph margin="none">
          {intl.formatMessage(
            protocol.localization.locales.length === 1
              ? messages.singleLanguage
              : messages.complete,
          )}
        </Paragraph>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex max-w-md flex-col gap-2">
            <Label htmlFor={filterId}>
              {intl.formatMessage(messages.filterLabel)}
            </Label>
            <NativeSelectField
              id={filterId}
              name="missing-translations-language"
              value={filter}
              onChange={(value) =>
                onFilterChange(
                  typeof value === 'string' ? value : ALL_LANGUAGES,
                )
              }
              options={[
                {
                  value: ALL_LANGUAGES,
                  label: intl.formatMessage(messages.allLanguages),
                },
                ...languagesWithGaps.map(({ locale, missing }) => ({
                  value: locale,
                  label: intl.formatMessage(messages.filterOption, {
                    language: languageName(locale),
                    count: missing,
                  }),
                })),
              ]}
            />
          </div>
          <ul className="flex flex-col gap-8">
            {visibleGroups.map(({ key, place, fields }) => {
              const details = describePlace(intl, protocol, place);
              return (
                <li key={key} className="flex flex-col gap-3">
                  <PlaceHeading details={details} />
                  <ul className="divide-outline flex flex-col divide-y">
                    {fields.map((field) => (
                      <li
                        key={field.field.join('.')}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2"
                      >
                        <code
                          dir="ltr"
                          className="font-monospace text-sm break-all"
                        >
                          {formatFieldPath(field.field, details.variableNames)}
                        </code>
                        <ul className="flex flex-wrap gap-x-4 text-sm">
                          {field.gaps.map(({ locale, fallbackLocale }) => (
                            <li key={locale}>
                              {intl.formatMessage(messages.gap, {
                                language: languageName(locale),
                                fallback: languageName(fallbackLocale),
                              })}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
};

export default MissingTranslations;
