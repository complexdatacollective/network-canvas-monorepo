// Portable worker construction; see `canvas/createAutoLayoutWorker.ts` for why
// this form is used in source and swapped for `createNodeLabelWorker.inline.ts`
// in the library build.
export function createNodeLabelWorker(): Worker {
  return new Worker(new URL('./nodeLabel.worker.ts', import.meta.url), {
    type: 'module',
  });
}
