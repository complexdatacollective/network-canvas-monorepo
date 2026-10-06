import { useEffect } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import {
  PEDIGREE_GENDER_WORDS,
  type PedigreeGenderWords,
  type VariableOption,
} from '@codaco/protocol-validation';

import { familyPedigreeMessages as messages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';

type TermList = Record<string, unknown>[];

export type GenderIdentityTermsFieldProps = CreateFormFieldProps<
  TermList,
  'div',
  {
    /**
     * The options of the bound gender identity attribute, in the order the
     * participant is offered them.
     */
    options: readonly VariableOption[];
  }
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGenderWords = (value: unknown): value is PedigreeGenderWords =>
  PEDIGREE_GENDER_WORDS.some((words) => words === value);

/** The words an option takes: what it is mapped to, else neutral words. */
const wordsFor = (
  terms: unknown,
  optionValue: VariableOption['value'],
): PedigreeGenderWords => {
  if (!Array.isArray(terms)) return 'neutral';
  for (const term of terms as unknown[]) {
    if (
      isRecord(term) &&
      term.value === optionValue &&
      isGenderWords(term.words)
    ) {
      return term.words;
    }
  }
  return 'neutral';
};

/** Whether the mapping names a value the attribute no longer has. */
const namesAnotherValue = (
  terms: unknown,
  options: readonly VariableOption[],
): boolean =>
  Array.isArray(terms) &&
  (terms as unknown[]).some(
    (term) =>
      !isRecord(term) || !options.some((option) => option.value === term.value),
  );

/**
 * The whole mapping for the attribute's current options: each option keeps the
 * words it was given, except `chosen`, which takes the words just picked. An
 * entry for a value the attribute no longer has is not carried over.
 */
const termsFor = (
  terms: unknown,
  options: readonly VariableOption[],
  chosen?: Readonly<{ optionValue: VariableOption['value']; words: string }>,
): TermList =>
  options.map((option) => ({
    value: option.value,
    words:
      chosen?.optionValue === option.value
        ? chosen.words
        : wordsFor(terms, option.value),
  }));

/**
 * Which kinship words each option of the gender identity attribute takes.
 *
 * One row per option of the bound attribute, each with a choice of the four
 * kinds of words. The value is the whole mapping, written for the attribute's
 * current options: an option never chosen reads and is written as neutral
 * words, and an entry for a value the attribute no longer has is dropped — a
 * mapping naming a value the attribute lacks is one the protocol refuses.
 *
 * Laid out as the discrete shape-per-value mapping in the codebook is
 * (`NodeShapeMappingFields`): the answer on the left, its choice on the right.
 */
export default function GenderIdentityTermsField({
  value,
  onChange,
  options,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: GenderIdentityTermsFieldProps) {
  const intl = useAppIntl();

  const wordsOptions = [
    {
      value: 'feminine',
      label: intl.formatMessage(messages.genderWordsFeminine),
    },
    {
      value: 'masculine',
      label: intl.formatMessage(messages.genderWordsMasculine),
    },
    {
      value: 'neutral',
      label: intl.formatMessage(messages.genderWordsNeutral),
    },
    {
      value: 'unknown',
      label: intl.formatMessage(messages.genderWordsUnknown),
    },
  ] satisfies { value: PedigreeGenderWords; label: string }[];

  // The attribute can lose an option under a mapping that names it — by being
  // edited in the codebook, or by another attribute being chosen. Drop the
  // entry here rather than leave a stage the protocol refuses.
  const stale = namesAnotherValue(value, options);
  useEffect(() => {
    if (stale && !disabled && !readOnly) onChange?.(termsFor(value, options));
  }, [stale, disabled, readOnly, value, options, onChange]);

  return (
    <div
      className={className}
      aria-invalid={ariaInvalid}
      {...(ariaDescribedBy === undefined
        ? {}
        : { 'aria-describedby': ariaDescribedBy })}
    >
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const label = getMarkdownLabelText(option.label);
          return (
            <div
              key={String(option.value)}
              className="bg-input text-input-contrast flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-4 py-3"
            >
              <span className="min-w-0 flex-1 text-sm">{label}</span>
              <div className="w-72 max-w-full shrink-0">
                <UnconnectedField
                  name={`gender-words-for-${String(option.value)}`}
                  label={intl.formatMessage(messages.genderTermsRowLabel, {
                    value1: label,
                  })}
                  labelHidden
                  component={NativeSelectField}
                  options={wordsOptions}
                  value={wordsFor(value, option.value)}
                  disabled={disabled}
                  readOnly={readOnly}
                  onChange={(next) => {
                    if (disabled || readOnly) return;
                    if (!isGenderWords(next)) return;
                    onChange?.(
                      termsFor(value, options, {
                        optionValue: option.value,
                        words: next,
                      }),
                    );
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
