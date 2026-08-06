// Library-build-only counterpart to createAutoLayoutWorker.ts — see that file
// for why the two forms exist. Never imported from source; the library build
// aliases `createAutoLayoutWorker.ts` to this module so `dist` ships
// self-contained workers rather than URL references consumers cannot resolve.
import AutoLayoutMockWorker from './autoLayout.worker.mock.ts?worker&inline';
import AutoLayoutWorker from './autoLayout.worker.ts?worker&inline';

export function createAutoLayoutWorker(): Worker {
  return new AutoLayoutWorker();
}

export function createAutoLayoutMockWorker(): Worker {
  return new AutoLayoutMockWorker();
}
