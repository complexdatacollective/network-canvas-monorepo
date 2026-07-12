import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
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
    <Alert variant="warning" className="mx-auto mb-10 max-w-3xl">
      <AlertTitle>Using a testing Mapbox token</AlertTitle>
      <AlertDescription className="space-y-4 text-sm">
        <span className="block">
          This protocol uses Network Canvas&apos;s shared Mapbox testing token
          so the map renders out of the box. It is rate-limited and for
          evaluation only. Before you deploy this study, replace it with your
          own token in the Resource Library.
        </span>
        <Button
          color="warning"
          size="sm"
          className="[--component-bg:var(--warning)] [--component-text:oklch(var(--white))]"
          onClick={() => {
            window.open(MAPBOX_TOKEN_HELP_URL, '_blank', 'noopener,noreferrer');
          }}
        >
          How to get a Mapbox token
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default TestingMapboxTokenAlert;
