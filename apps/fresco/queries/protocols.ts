import { cacheLife } from 'next/cache';

import { safeCacheTag } from '~/lib/cache';
import { getProtocols as getProtocolsUncached } from '~/lib/queries/protocols';

/** The `'use cache'` layer over `lib/queries/protocols.ts`. */

export type { GetProtocolsQuery } from '~/lib/queries/protocols';

export async function getProtocols() {
  'use cache';
  cacheLife('max');
  safeCacheTag('getProtocols');

  return getProtocolsUncached();
}

export type GetProtocolsReturnType = ReturnType<typeof getProtocols>;
