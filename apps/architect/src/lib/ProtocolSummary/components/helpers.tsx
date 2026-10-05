import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import type { IndexEntry } from './SummaryContext';
const messages = defineMessages({
  boolean: {
    id: 'architect.summary.boolean',
    defaultMessage: '{value, select, true {TRUE} other {FALSE}}',
    description:
      'Display of a boolean value in the printable summary. Stored values are unchanged.',
  },
});

export const SummaryValue = ({ value }: { value: unknown }) => {
  const intl = useAppIntl();
  return typeof value === 'boolean' ? (
    <em>{intl.formatMessage(messages.boolean, { value: String(value) })}</em>
  ) : typeof value === 'number' ? (
    intl.formatNumber(value)
  ) : (
    String(value)
  );
};

export const getVariableName = (
  index: IndexEntry[],
  variableId: string,
): string => {
  const entry = index.find(({ id }) => id === variableId);

  return entry?.name ?? '';
};

export const getVariableMeta = (
  index: IndexEntry[],
  variable: string,
): Pick<IndexEntry, 'id' | 'name' | 'type' | 'component'> => {
  const entry = index.find(({ id }) => id === variable);
  return (
    entry ?? {
      id: '',
      name: '',
      type: '',
      component: undefined,
    }
  );
};
