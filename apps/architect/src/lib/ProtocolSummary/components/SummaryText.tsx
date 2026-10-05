import { useCallback, useContext } from 'react';

import {
  getLocaleMetadata,
  type LocaleTag,
  type LocalizedString,
} from '@codaco/protocol-validation';
import Markdown from '~/components/Markdown';
import { resolveLocalizedText } from '~/utils/localizedText';

import SummaryContext from './SummaryContext';

/**
 * Resolves protocol text in the summary's language, falling back exactly as
 * the interview does for a participant who chose that language.
 */
export const useSummaryText = () => {
  const { protocol, locale } = useContext(SummaryContext);
  return useCallback(
    (value: LocalizedString | undefined) =>
      resolveLocalizedText(value, protocol.localization, locale),
    [protocol.localization, locale],
  );
};

const languageAttributes = (locale: LocaleTag) => ({
  lang: locale,
  dir: getLocaleMetadata(locale).direction,
});

type SummaryTextProps = {
  value: LocalizedString | undefined;
};

/** Protocol text, marked with the language of the translation shown. */
export const SummaryText = ({ value }: SummaryTextProps) => {
  const resolved = useSummaryText()(value);
  if (!resolved) return null;
  return <span {...languageAttributes(resolved.locale)}>{resolved.text}</span>;
};

export const SummaryMarkdown = ({ value }: SummaryTextProps) => {
  const resolved = useSummaryText()(value);
  if (!resolved) return null;
  return (
    <span {...languageAttributes(resolved.locale)}>
      <Markdown label={resolved.text} />
    </span>
  );
};
