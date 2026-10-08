import { useEffect } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import type { VariableOption } from '@codaco/protocol-validation';

import {
  GENDER_WORDS_LABELS,
  namesAnotherValue,
  termsForOptions,
  wordsFor,
} from '../editors/family-pedigree/sections/genderWords.ts';
import { familyPedigreeMessages as messages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';
import { useLocalizedText } from '../localization/ProtocolLocalization.tsx';

type TermList = Record<string, unknown>[];

export type GenderIdentityWordsSummaryFieldProps = CreateFormFieldProps<
  TermList,
  'div',
  {
    /**
     * The options of the bound gender identity attribute, in the order the
     * participant is offered them.
     */
    options: readonly VariableOption[];
    /** The summary's accessible name, already formatted. */
    tableLabel: string;
    /**
     * Whether an entry naming a value the attribute no longer has is dropped
     * from the mapping. Off while the options dialog's save is still on its
     * way into the codebook: the mapping it wrote then names options the
     * attribute does not have yet, and dropping them would lose their words.
     */
    reconcile: boolean;
  }
>;

/**
 * Which kinship words each option of the gender identity attribute takes,
 * shown read-only beside the button that edits them.
 *
 * The words are chosen in the options dialog, on the row of the option they
 * belong to, so the options and their words are only ever edited together.
 * The value is still the stage's mapping, held by this field so the stage
 * saves it: an option the mapping names no words for reads as neutral, which
 * is what the interview gives it, and an entry for a value the attribute no
 * longer has is dropped — a mapping naming a value the attribute lacks is one
 * the protocol refuses. The attribute can lose an option under a mapping that
 * names it when another Family Pedigree stage edits the same options.
 */
export default function GenderIdentityWordsSummaryField({
  value,
  onChange,
  options,
  tableLabel,
  reconcile,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
}: GenderIdentityWordsSummaryFieldProps) {
  const intl = useAppIntl();
  const localize = useLocalizedText();

  const stale = namesAnotherValue(value, options);
  useEffect(() => {
    if (stale && reconcile && !disabled && !readOnly) {
      onChange?.(termsForOptions(value, options));
    }
  }, [stale, reconcile, disabled, readOnly, value, options, onChange]);

  return (
    <div
      className={className}
      {...(ariaDescribedBy === undefined
        ? {}
        : { 'aria-describedby': ariaDescribedBy })}
    >
      <Table aria-label={tableLabel} className="text-sm">
        <TableHeader>
          <TableRow className="h-auto">
            <TableHead scope="col" className="w-1/3 py-2">
              {intl.formatMessage(messages.genderWordsSummaryOptionHeader)}
            </TableHead>
            <TableHead scope="col" className="py-2">
              {intl.formatMessage(messages.genderWordsSummaryWordsHeader)}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => {
            const label = localize(option.label);
            return (
              <TableRow key={String(option.value)} className="h-auto">
                {/* Wrapped rather than kept on one line: an option's label and
                  the longest words both run past a narrow panel. The option
                  column is given a third of the width, because a cell that
                  may wrap is otherwise squeezed to its longest word. */}
                <TableCell
                  className="w-1/3 py-2 whitespace-normal"
                  lang={label.lang}
                  dir={label.dir}
                >
                  {getMarkdownLabelText(label.text)}
                </TableCell>
                <TableCell className="py-2 whitespace-normal">
                  {intl.formatMessage(
                    GENDER_WORDS_LABELS[wordsFor(value, option.value)],
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
