import { useMemo, useState } from 'react';

import type { Schema8CardActions } from '~/components/ProtocolCarousel/DeckSlotCard';
import { getBundledLegacyInterviewer } from '~/lib/legacyInterviewer';

// What Home needs for schema 8 protocols beyond what it needs for any
// protocol: whether this build bundles the Interviewer 8 that runs their
// interviews. A schema 8 protocol is never upgraded, at import or later.
// Starting, resuming, showing details and deleting are the same as for any
// protocol.
export function useLegacyProtocolActions() {
  // Read once: the define is an object literal, new on every read.
  const [interviewer] = useState(getBundledLegacyInterviewer);

  const schema8 = useMemo<Schema8CardActions>(
    () => ({ interviewer }),
    [interviewer],
  );

  return { schema8 };
}
