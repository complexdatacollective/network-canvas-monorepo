import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { getUnusedVariables } from '~/selectors/issues';

/**
 * Page-level warning shown in the Codebook when the protocol contains
 * variables that aren't referenced anywhere. Renders nothing when every
 * variable is in use.
 */
const UnusedVariablesAlert = () => {
  const { count } = useSelector(getUnusedVariables);

  if (count === 0) {
    return null;
  }

  const isSingular = count === 1;

  return (
    <Alert variant="warning">
      <AlertTitle>
        {count} unused {isSingular ? 'variable' : 'variables'}
      </AlertTitle>
      <AlertDescription>
        {isSingular ? 'This variable is' : 'These variables are'} not referenced
        anywhere in your protocol and {isSingular ? 'is' : 'are'} tagged{' '}
        <strong>not in use</strong> below. Use the{' '}
        <strong>Show unused only</strong> filter to find{' '}
        {isSingular ? 'it' : 'them'}, then reference{' '}
        {isSingular ? 'it' : 'them'} in a stage or delete{' '}
        {isSingular ? 'it' : 'them'}.
      </AlertDescription>
    </Alert>
  );
};

export default UnusedVariablesAlert;
