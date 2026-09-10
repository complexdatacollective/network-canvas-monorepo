import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import type { SortableProperty } from '../../../fields/sortOrderOptions.ts';
import type { RowValues } from '../../../form/rowDialog.tsx';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import SortOrderRows from '../../../sections/prompts/SortOrderRows.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from '../../dyad-census/sections/censusMessages.ts';
import { binMessages } from './binMessages.ts';

export type BinSortOrdersProps = Readonly<{
  subject: CodebookSubject | undefined;
  /** The prompt as the dialog opened on it, for the rules each group holds. */
  item: RowValues;
  /**
   * Until the attribute is chosen there are no bins, so there is nothing for
   * either order to be an order OF.
   */
  disabled: boolean;
}>;

/**
 * The two orders a bin prompt holds: the people still to be sorted, and the
 * people already dropped into a bin.
 *
 * Shared by the two bins because both draw bins and both order them the same
 * way; ported from Architect's `BucketSortOrderSection` and
 * `BinSortOrderSection`, which the two interfaces mounted identically.
 *
 * Both sort by the STAGE subject's attributes. A sort rule READS an attribute
 * rather than writing it, so it sits outside the writer-exclusivity rule
 * entirely — every attribute of the type is offered, including ones a form
 * elsewhere collects and the one this prompt's bins are.
 */
export default function BinSortOrders({
  subject,
  item,
  disabled,
}: BinSortOrdersProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();

  /**
   * `undefined` says the family does not know yet — a stage that has not been
   * told which people it works with — and nothing is judged against it. An
   * EMPTY list is the other answer: a type whose attributes have all been
   * deleted, where every rule the prompt holds is certainly dangling and has
   * to be shown and refused as such. See `SortOrderRows.properties`.
   */
  const properties = useMemo<readonly SortableProperty[] | undefined>(
    () =>
      subject === undefined
        ? undefined
        : Object.entries(variablesForSubject(protocolContext, subject)).map(
            ([value, variable]) => ({
              value,
              label: variable.name,
              type: variable.type,
            }),
          ),
    [protocolContext, subject],
  );

  return (
    <>
      <SortOrderRows
        name="bucketSortOrder"
        title={intl.formatMessage(binMessages.bucketOrderTitle)}
        description={intl.formatMessage(binMessages.bucketOrderDescription)}
        label={intl.formatMessage(binMessages.bucketOrderLabel)}
        hint={intl.formatMessage(censusMessages.sortRulesAddedHint)}
        addButtonLabel={intl.formatMessage(binMessages.bucketOrderAddLabel)}
        emptyStateMessage={intl.formatMessage(
          binMessages.bucketOrderEmptyState,
        )}
        properties={properties}
        disabled={disabled}
        committedRules={item.bucketSortOrder}
      />
      <SortOrderRows
        name="binSortOrder"
        title={intl.formatMessage(binMessages.binOrderTitle)}
        description={intl.formatMessage(binMessages.binOrderDescription)}
        label={intl.formatMessage(binMessages.binOrderLabel)}
        hint={intl.formatMessage(binMessages.sortRulesDroppedHint)}
        addButtonLabel={intl.formatMessage(binMessages.binOrderAddLabel)}
        emptyStateMessage={intl.formatMessage(binMessages.binOrderEmptyState)}
        properties={properties}
        disabled={disabled}
        committedRules={item.binSortOrder}
      />
    </>
  );
}
