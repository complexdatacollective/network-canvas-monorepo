import type { Publication } from '~/lib/siteContent';

import { buildAuthorshipGraph } from './publicationNetworkLayout';
import { PublicationsNetwork } from './PublicationsNetwork';

export function Publications({
  publications,
}: {
  publications: readonly Publication[];
}) {
  // The network is laid out here, while the page is prerendered, so the
  // browser receives a finished layout (and the network is in the HTML)
  // instead of spending tens of milliseconds computing it after load.
  const graph = buildAuthorshipGraph(publications);
  return <PublicationsNetwork graph={graph} publications={publications} />;
}
