import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { controlLabel } from '@codaco/protocol-builder/sections/collectableTypes';

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
    // A stored value is whatever the researcher wrote: it reads in its own
    // direction.
    <bdi>{String(value)}</bdi>
  );
};

/**
 * What a form field's input control is called, in the interface's words, as
 * the stage editor names it. A control the schema does not know (a protocol
 * authored against a later schema) is shown by its stored name, as code.
 */
export const ControlName = ({
  component,
}: Readonly<{ component: string | undefined }>) => {
  const intl = useAppIntl();
  const label = controlLabel(component);
  if (label !== undefined) return intl.formatMessage(label);
  return component === undefined ? null : <code>{component}</code>;
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
