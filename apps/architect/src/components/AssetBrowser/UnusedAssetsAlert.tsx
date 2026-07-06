import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { getUnusedAssets } from '~/selectors/issues';

/**
 * Page-level warning shown in the Resource Library when the protocol contains
 * resources that aren't referenced by any stage. Renders nothing when every
 * resource is in use.
 */
const UnusedAssetsAlert = () => {
  const { count } = useSelector(getUnusedAssets);

  if (count === 0) {
    return null;
  }

  const isSingular = count === 1;

  return (
    <Alert variant="warning">
      <AlertTitle>
        {count} unused {isSingular ? 'resource' : 'resources'}
      </AlertTitle>
      <AlertDescription>
        {isSingular ? 'This resource is' : 'These resources are'} not used by
        any stage in your protocol and {isSingular ? 'is' : 'are'} marked{' '}
        <strong>Unused</strong> below. Reference {isSingular ? 'it' : 'them'} in
        a stage, or remove {isSingular ? 'it' : 'them'} to keep your protocol
        tidy.
      </AlertDescription>
    </Alert>
  );
};

export default UnusedAssetsAlert;
