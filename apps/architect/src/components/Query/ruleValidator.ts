import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
const defaultIntl = createAppIntl({ locale: 'en' });

import { get } from 'es-toolkit/compat';
const localeMessages = defineMessages({
  join: {
    id: 'architect.query.validation.join',
    defaultMessage: 'Please select a join type',
    description:
      'Validation error for a network filter or skip logic rule set.',
  },
  rule: {
    id: 'architect.query.validation.rule',
    defaultMessage: 'Please create at least one rule',
    description:
      'Validation error for a network filter or skip logic rule set.',
  },
});

const validateRules = (
  value: unknown,
  intl: IntlShape = defaultIntl,
): string | undefined => {
  // BUGFIX: If the section containing the filter is not expanded, we set
  // the filter value to null. In this case, we don't want to
  // validate the filter, because it will be invisible and will simply
  // prevent the form from being submitted without an error.
  if (!value) {
    return undefined;
  }
  const rules = get(value, 'rules') as unknown[] | undefined;
  const join = get(value, 'join');

  if (rules && rules.length > 1 && !join) {
    return intl.formatMessage(localeMessages.join);
  }

  if (rules && rules.length === 0) {
    return intl.formatMessage(localeMessages.rule);
  }

  return undefined;
};

export default validateRules;
