import type { ReactNode } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { getUnusedVariables } from '~/selectors/issues';

// Rich-text tag renderers live at module scope so they keep one identity across
// renders (an inline arrow returning JSX is a component defined during render).
const renderStrong = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

const messages = defineMessages({
  unused: {
    id: 'architect.codebook.unusedVariablesAlert.unused',
    defaultMessage:
      '{count, plural, one {# unused attribute} other {# unused attributes}}',
    description:
      'Title of the warning at the top of the Codebook page when some codebook variables (attributes) are not used anywhere. count is the number of unused variables.',
  },
  notReferencedAnywhereInYour: {
    id: 'architect.codebook.unusedVariablesAlert.notReferencedAnywhereInYour',
    defaultMessage:
      '{count, plural, one {This attribute is not referenced anywhere in your protocol and is tagged <strong>not in use</strong> below. Use the <strong2>Show unused only</strong2> filter to find it, then reference it in a stage or delete it.} other {These attributes are not referenced anywhere in your protocol and are tagged <strong>not in use</strong> below. Use the <strong2>Show unused only</strong2> filter to find them, then reference them in a stage or delete them.}}',
    description:
      'Body of the warning at the top of the Codebook page about unused variables (attributes). count is the number of unused variables; strong marks the badge text not in use and strong2 marks the name of the Show unused only checkbox, so both must match those labels.',
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
          strong: renderStrong,
          strong2: renderStrong,
        })}
      </AlertDescription>
    </Alert>
  );
};

export default UnusedVariablesAlert;
