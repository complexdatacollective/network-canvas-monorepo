import { z } from 'zod';

import { isBlankMessage } from '../../localization/blankText.ts';
import {
  canonicalizeLocale,
  isCanonicalLocale,
  isUndeterminedLocale,
  type LocaleTag,
} from '../../localization/localeTag.ts';
import { findMessageSyntaxProblem } from '../../localization/messageSyntax.ts';

const LOCALIZED_STRING = 'localizedString' as const;

/**
 * How a localized field is rendered. Markdown fields format the message first
 * and render the result as markdown; plain fields render the formatted text.
 */
export type LocalizedStringFormat = 'plain' | 'markdown';

type LocalizedStringDescriptor = Readonly<{
  format: LocalizedStringFormat;
}>;

/**
 * Participant-facing copy keyed by the protocol locale it is written in. Each
 * value is an ICU MessageFormat message made only of literal text.
 */
export type LocalizedString = Readonly<Record<LocaleTag, string>>;

/**
 * Describes why a value is not a canonical BCP 47 tag, suggesting the
 * canonical spelling when one exists. Underscores are read as hyphens for the
 * suggestion only, so `EN_us` is still rejected.
 */
const findLocaleTagProblem = (value: string): string | undefined => {
  if (isUndeterminedLocale(value)) {
    return `"${value}" does not name a language. A protocol must be written in a specific language, such as "en".`;
  }
  if (isCanonicalLocale(value)) return undefined;
  const canonical =
    canonicalizeLocale(value) ?? canonicalizeLocale(value.replaceAll('_', '-'));
  return canonical === undefined
    ? `"${value}" is not a valid language tag.`
    : `"${value}" is not a canonical language tag. Use "${canonical}".`;
};

export const LocaleTagSchema = z.string().superRefine((value, ctx) => {
  const problem = findLocaleTagProblem(value);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

export const ProtocolLocalizationSchema = z
  .strictObject({
    defaultLocale: LocaleTagSchema,
    // The languages have no order: every list of them is shown alphabetically
    // by name, and neither fallback nor the protocol hash depends on it.
    locales: z
      .array(LocaleTagSchema)
      .min(1, { message: 'A protocol must declare at least one language.' }),
  })
  .superRefine((localization, ctx) => {
    const seen = new Set<LocaleTag>();
    localization.locales.forEach((locale, index) => {
      const key = canonicalizeLocale(locale) ?? locale;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Language "${locale}" is declared more than once.`,
          path: ['locales', index],
        });
      }
      seen.add(key);
    });

    if (!localization.locales.includes(localization.defaultLocale)) {
      ctx.addIssue({
        code: 'custom',
        message: `The default language "${localization.defaultLocale}" must be one of the protocol's languages.`,
        path: ['defaultLocale'],
      });
    }
  });

/**
 * The rule for one translation of a localized string that must say something:
 * not empty, and not made only of spaces or other characters that show
 * nothing. Pass it to `localizedString` as `content`.
 *
 * Every translation supplied is held to it, so a blank translation is invalid
 * rather than a gap the interview falls back over; a language the string has
 * no translation for is a gap, and is not an error.
 *
 * The text is judged as written, not as rendered. Markdown that draws nothing
 * from visible characters (`**`, `&nbsp;`, `<br>`) is not recognised as blank:
 * no rule in this package decides what markdown renders, and the renderer
 * lives in the UI package.
 */
export const nonBlankText = () =>
  z
    .string()
    .min(1)
    .refine((message) => message === '' || !isBlankMessage(message), {
      message: 'Text cannot be blank.',
    });

/**
 * A participant-facing string with one translation per protocol locale.
 *
 * `content` is the owning field's rule for a single translation (for example
 * `z.string().min(1)`), applied to every translation supplied. Keys must be
 * canonical locale tags; whether each is declared by the protocol is decided
 * by the protocol-level refinement, which can see `localization`. A string
 * need not cover every declared locale: missing translations are warnings
 * (`analyzeProtocolLocalization`), not errors.
 *
 * The metadata tag is what lets `collectLocalizedStrings` find every localized
 * field without a hand-maintained list of paths.
 */
export const localizedString = (
  content: z.ZodString,
  format: LocalizedStringFormat,
) =>
  z
    .record(
      z.string(),
      content.superRefine((message, ctx) => {
        const problem = findMessageSyntaxProblem(message);
        if (problem) ctx.addIssue({ code: 'custom', message: problem });
      }),
    )
    .superRefine((value, ctx) => {
      const locales = Object.keys(value);
      if (locales.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Text must have at least one translation.',
        });
      }
      for (const locale of locales) {
        const problem = findLocaleTagProblem(locale);
        if (problem) {
          ctx.addIssue({ code: 'custom', message: problem, path: [locale] });
        }
      }
    })
    .meta({ [LOCALIZED_STRING]: { format } });

const isLocalizedStringDescriptor = (
  value: unknown,
): value is LocalizedStringDescriptor =>
  typeof value === 'object' &&
  value !== null &&
  'format' in value &&
  (value.format === 'plain' || value.format === 'markdown');

export const getLocalizedStringDescriptor = (
  schema: z.ZodType,
): LocalizedStringDescriptor | undefined => {
  const descriptor = schema.meta()?.[LOCALIZED_STRING];
  return isLocalizedStringDescriptor(descriptor) ? descriptor : undefined;
};
