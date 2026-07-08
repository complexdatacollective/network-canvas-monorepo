import { TriangleAlert } from 'lucide-react';
import { useSelector } from 'react-redux';

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
    <div
      role="status"
      className="bg-mustard border-mustard-dark mx-auto mb-10 w-full max-w-3xl rounded border p-7 text-white shadow-xl"
    >
      <h2 className="font-heading mt-0 flex items-center gap-2 text-xl font-bold">
        <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
        Using a testing Mapbox token
      </h2>
      <p className="text-sm leading-relaxed text-white/90">
        This protocol uses Network Canvas&apos;s shared Mapbox testing token so
        the map renders out of the box. It is rate-limited and for evaluation
        only. Before you deploy this study, replace it with your own token in
        the Resource Library.
      </p>
      <a
        href={MAPBOX_TOKEN_HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-charcoal border-platinum-dark hover:bg-platinum inline-flex h-10 w-auto shrink-0 cursor-pointer items-center justify-center rounded-full border bg-white px-6 text-sm font-medium tracking-wide transition-colors duration-200"
      >
        How to get a Mapbox token
      </a>
    </div>
  );
};

export default TestingMapboxTokenAlert;
