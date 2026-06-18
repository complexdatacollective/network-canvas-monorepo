import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { getUsesTestingMapboxToken } from '~/selectors/issues';

const MAPBOX_TOKEN_HELP_URL =
  'https://docs.mapbox.com/help/getting-started/access-tokens/';

/**
 * Timeline reminder shown when the protocol carries Network Canvas's shared
 * Mapbox testing token (embedded in geospatial templates so the map works out
 * of the box). Renders nothing for protocols that don't use it.
 */
const TestingMapboxTokenAlert = () => {
  const usesTestingToken = useSelector(getUsesTestingMapboxToken);

  if (!usesTestingToken) {
    return null;
  }

  return (
    <Alert variant="warning" className="w-2xl">
      <AlertTitle>Using a testing Mapbox token</AlertTitle>
      <AlertDescription>
        This protocol uses Network Canvas&apos;s shared Mapbox testing token so
        the map renders out of the box. It is rate-limited and for evaluation
        only. Before you deploy this study, replace it with your own token in
        the Resource Library.{' '}
        <a
          href={MAPBOX_TOKEN_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          How to get a Mapbox token
        </a>
        .
      </AlertDescription>
    </Alert>
  );
};

export default TestingMapboxTokenAlert;
