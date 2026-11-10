import {
  labelComparisonKey,
  type LocaleTag,
  STAGE_LABEL_MAX_LENGTH,
  type StageNameParts,
} from '@codaco/protocol-validation';

import {
  formatStageNameMessage,
  type StageNameLanguage,
} from './stageNameLanguage.ts';

export type Qualifier = { full: string; summary: string };

/**
 * A proposed name is written in the protocol's default language, the one the
 * stage's name is stored in (`stageNameLanguageOf`), and everything here that
 * depends on a language takes it from the one `StageNameLanguage` the caller
 * holds:
 *
 * - The parts are put together by the language's own pattern
 *   (`StageNameWording.name`), not joined in English order.
 * - `dedupeStageLabel` compares the proposal with the DEFAULT-language text of
 *   the names already stored, which is where a proposal is written, so a name
 *   is unique in the language it is shown in.
 * - The schema's limit, `STAGE_LABEL_MAX_LENGTH`, is measured on the text as
 *   written, and `truncateToWord` cuts it at a word of that language, which
 *   for a language written without spaces is found by the runtime's word
 *   segmentation.
 *
 * Nothing here is rewritten when the protocol's default language changes later.
 * A name that was proposed and saved is the researcher's text from then on,
 * like any name they typed, and is not among the wording Network Canvas
 * supplies (`suppliedStageText`); a name still waiting to be saved is
 * proposed again in the new language (`useAutoStageName`).
 */

type NameParts = {
  subjectName?: string | null | undefined;
  typeName: string;
  qualifier?: string | null | undefined;
};

export function composeStageName(
  parts: NameParts,
  language: StageNameLanguage,
): string {
  const subject = parts.subjectName?.trim() ?? '';
  const qualifier = parts.qualifier?.trim() ?? '';
  const shape: StageNameParts =
    subject && qualifier
      ? 'subjectTypeQualifier'
      : subject
        ? 'subjectType'
        : qualifier
          ? 'typeQualifier'
          : 'type';
  const stageName = formatStageNameMessage(language, language.wording.name, {
    parts: shape,
    subject,
    type: parts.typeName.trim(),
    qualifier,
  }).trim();

  return stageName.charAt(0).toUpperCase() + stageName.slice(1);
}

/**
 * `labelComparisonKey`, the comparison the schema's rules hold every set of
 * labels to: a stage label is a researcher-authored NAME, and the question "is
 * this the same name as that one?" is answered identically everywhere in the
 * ecosystem — case-folded AND Unicode-canonical, ignoring surrounding spaces.
 * Folding case alone let a decomposed "Café" and a precomposed one sit side by
 * side as two different stages here while the codebook, the schema and the
 * migration repair all counted them as one.
 */
export function dedupeStageLabel(
  base: string,
  existingLabels: string[],
): string {
  const taken = new Set(existingLabels.map(labelComparisonKey));
  if (!taken.has(labelComparisonKey(base))) {
    return base;
  }
  let suffix = 2;
  while (taken.has(labelComparisonKey(`${base} #${suffix}`))) {
    suffix += 1;
  }
  return `${base} #${suffix}`;
}

/**
 * `value` cut after the last whole word of `locale` that ends within `max`
 * characters. Words are the runtime's (`Intl.Segmenter`), so a language
 * written without spaces is cut at a word too, and a name that has no word
 * ending in range is cut between characters a reader sees as one rather than
 * through the middle of one.
 */
function truncateToWord(value: string, max: number, locale: LocaleTag): string {
  if (value.length <= max) {
    return value;
  }
  let end = 0;
  for (const { segment, index, isWordLike } of new Intl.Segmenter(locale, {
    granularity: 'word',
  }).segment(value)) {
    const segmentEnd = index + segment.length;
    if (segmentEnd > max) break;
    if (isWordLike) end = segmentEnd;
  }
  if (end > 0) {
    return value.slice(0, end);
  }
  for (const { segment, index } of new Intl.Segmenter(locale, {
    granularity: 'grapheme',
  }).segment(value)) {
    const segmentEnd = index + segment.length;
    if (segmentEnd > max) break;
    end = segmentEnd;
  }
  return value.slice(0, end).trimEnd();
}

// Truncate the base *before* de-duplicating so the ` #n` suffix is never chopped
// (a post-truncation slice could cut into a wide suffix like ` #10`, reviving a
// collision). Shrink the budget by however much the deduped candidate overflows
// until it fits within the cap.
function fitTruncatedUniqueLabel(
  base: string,
  existingLabels: string[],
  locale: LocaleTag,
): string {
  let max = STAGE_LABEL_MAX_LENGTH;
  while (max > 0) {
    const candidate = dedupeStageLabel(
      truncateToWord(base, max, locale),
      existingLabels,
    );
    if (candidate.length <= STAGE_LABEL_MAX_LENGTH) {
      return candidate;
    }
    max -= candidate.length - STAGE_LABEL_MAX_LENGTH;
  }
  return dedupeStageLabel(base.slice(0, 1), existingLabels).slice(
    0,
    STAGE_LABEL_MAX_LENGTH,
  );
}

export function generateStageLabel(input: {
  language: StageNameLanguage;
  typeName: string;
  subjectName?: string | null;
  qualifier?: Qualifier | null;
  existingLabels: string[];
}): string {
  const { language, typeName, subjectName, qualifier, existingLabels } = input;
  const compose = (parts: NameParts) => composeStageName(parts, language);

  // Most-informative first; each candidate sheds detail so a long name can fit the schema's limit.
  const candidates: string[] = [];
  if (qualifier) {
    candidates.push(
      compose({ subjectName, typeName, qualifier: qualifier.full }),
    );
    if (qualifier.summary !== qualifier.full) {
      candidates.push(
        compose({ subjectName, typeName, qualifier: qualifier.summary }),
      );
    }
    candidates.push(
      compose({ subjectName: null, typeName, qualifier: qualifier.summary }),
    );
  } else {
    candidates.push(compose({ subjectName, typeName, qualifier: null }));
    candidates.push(compose({ subjectName: null, typeName, qualifier: null }));
  }

  for (const base of candidates) {
    const deduped = dedupeStageLabel(base, existingLabels);
    if (deduped.length <= STAGE_LABEL_MAX_LENGTH) {
      return deduped;
    }
  }

  const fallbackBase = candidates[candidates.length - 1] ?? typeName;
  return fitTruncatedUniqueLabel(fallbackBase, existingLabels, language.locale);
}
