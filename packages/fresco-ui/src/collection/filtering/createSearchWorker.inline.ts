// Library-build-only counterpart to createSearchWorker.ts — see that file for
// why the two forms exist. Never imported from source; the library build
// aliases `createSearchWorker.ts` to this module so `dist` ships a
// self-contained worker rather than a URL reference consumers cannot resolve.
import SearchWorker from './search.worker.ts?worker&inline';

export function createSearchWorker(): Worker {
  return new SearchWorker();
}
