import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { getUnusedVariables } from '~/selectors/issues';
const messages = defineMessages({
  unused: {
    id: 'architect.codebook.unusedVariablesAlert.unused',
    defaultMessage:
      '{count, plural, one {# unused attribute} other {# unused attributes}}',
    description:
      'Visible text in components / Codebook / UnusedVariablesAlert.',
  },
  notReferencedAnywhereInYour: {
    id: 'architect.codebook.unusedVariablesAlert.notReferencedAnywhereInYour',
    defaultMessage:
      '{count, plural, one {This attribute is not referenced anywhere in your protocol and is tagged <strong>not in use</strong> below. Use the <strong2>Show unused only</strong2> filter to find it, then reference it in a stage or delete it.} other {These attributes are not referenced anywhere in your protocol and are tagged <strong>not in use</strong> below. Use the <strong2>Show unused only</strong2> filter to find them, then reference them in a stage or delete them.}}',
    description:
      'Visible text in components / Codebook / UnusedVariablesAlert.',
  },
});

/**
 * Page-level warning shown in the Codebook when the protocol contains
 * variables that aren't referenced anywhere. Renders nothing when every
 * variable is in use.
 */
const UnusedVariablesAlert = () => {
  const intl = useAppIntl();
  const { count } = useSelector(getUnusedVariables);

  if (count === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <AlertTitle>
        {intl.formatMessage(messages.unused, {
          count: count,
        })}
      </AlertTitle>
      <AlertDescription>
        {intl.formatMessage(messages.notReferencedAnywhereInYour, {
          count,
          strong: (chunks) => <strong>{chunks}</strong>,
          strong2: (chunks) => <strong>{chunks}</strong>,
        })}
      </AlertDescription>
    </Alert>
  );
};

export default UnusedVariablesAlert;
